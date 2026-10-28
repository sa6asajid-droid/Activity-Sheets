/**
 * Editor-supplied sources: pasted text, uploaded text files and fetched URLs.
 * All of it is treated as untrusted data. Only plain text is stored; HTML is
 * reduced to text and nothing from a source is ever rendered as markup.
 */
import { randomUUID } from "node:crypto";
import type { ProjectSettings, UserSourceRef } from "../db/store";
import type { Source } from "../schema/document";
import { getStorage } from "../storage";
import { getConfig } from "../config";
import { htmlToText, safeFetch } from "../security/safe-fetch";

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".htm": "text/html",
};

export class SourceInputError extends Error {}

const MAX_SOURCE_CHARS = 200_000;

function clean(text: string) {
  // Drop control characters except newlines and tabs.
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, MAX_SOURCE_CHARS);
}

async function store(projectId: string, text: string): Promise<string> {
  const key = `sources/${projectId}/${randomUUID()}.txt`;
  await getStorage().put(key, text);
  return key;
}

export async function addPastedSource(projectId: string, input: { title: string; author?: string; text: string; publicationDate?: string; licenceStatus?: UserSourceRef["licenceStatus"] }): Promise<UserSourceRef> {
  const text = clean(input.text).trim();
  if (text.length < 40) throw new SourceInputError("Paste at least a few sentences of source text.");
  if (!input.title.trim()) throw new SourceInputError("Give the source a title.");
  return {
    id: `usr-${randomUUID().slice(0, 8)}`,
    title: input.title.trim().slice(0, 300),
    authorOrOrganization: (input.author ?? "").trim().slice(0, 300),
    kind: "pasted",
    url: "",
    publicationDate: (input.publicationDate ?? "").slice(0, 40),
    storageKey: await store(projectId, text),
    addedAt: new Date().toISOString(),
    licenceStatus: input.licenceStatus ?? "unknown",
    chars: text.length,
  };
}

export async function addUploadedSource(projectId: string, file: { name: string; bytes: Buffer }, meta: { title?: string; author?: string }): Promise<UserSourceRef> {
  const cfg = getConfig();
  if (file.bytes.length > cfg.upload.maxBytes) throw new SourceInputError(`Files must be smaller than ${Math.round(cfg.upload.maxBytes / 1024)} KB.`);
  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
  if (!ALLOWED_UPLOAD_TYPES[ext]) throw new SourceInputError("Only .txt, .md and .html files can be imported as sources. PDF and Word import are not supported yet — paste the relevant text instead.");
  // Reject binary content masquerading as text.
  if (file.bytes.subarray(0, 4096).includes(0)) throw new SourceInputError("That file does not look like text.");
  let text = file.bytes.toString("utf8");
  let title = meta.title?.trim() || file.name.replace(/\.[a-z0-9]+$/i, "");
  if (ext === ".html" || ext === ".htm") {
    const h = htmlToText(text);
    text = h.text;
    if (!meta.title && h.title) title = h.title;
  }
  text = clean(text).trim();
  if (text.length < 40) throw new SourceInputError("The file has too little text to use as a source.");
  return {
    id: `usr-${randomUUID().slice(0, 8)}`,
    title: title.slice(0, 300),
    authorOrOrganization: (meta.author ?? "").slice(0, 300),
    kind: "upload",
    url: "",
    publicationDate: "",
    storageKey: await store(projectId, text),
    addedAt: new Date().toISOString(),
    licenceStatus: "unknown",
    chars: text.length,
  };
}

export async function addUrlSource(projectId: string, url: string, meta: { title?: string; author?: string }): Promise<UserSourceRef> {
  const cfg = getConfig();
  const res = await safeFetch(url, cfg.fetch);
  if (res.status < 200 || res.status >= 300) throw new SourceInputError(`The page returned HTTP ${res.status}.`);
  if (!/text\/(html|plain)|application\/xhtml/.test(res.contentType)) throw new SourceInputError("Only HTML or plain-text pages can be imported.");
  const { title, text } = /html/.test(res.contentType) ? htmlToText(res.body) : { title: "", text: res.body };
  const cleaned = clean(text).trim();
  if (cleaned.length < 100) throw new SourceInputError("Could not find readable text on that page.");
  let host = "";
  try {
    host = new URL(res.finalUrl).hostname.replace(/^www\./, "");
  } catch {
    /* ignore */
  }
  return {
    id: `usr-${randomUUID().slice(0, 8)}`,
    title: (meta.title || title || host).slice(0, 300),
    authorOrOrganization: (meta.author || host).slice(0, 300),
    kind: "url",
    url: res.finalUrl,
    publicationDate: "",
    storageKey: await store(projectId, cleaned),
    addedAt: new Date().toISOString(),
    licenceStatus: "unknown",
    chars: cleaned.length,
  };
}

export async function loadUserSourceTexts(settings: ProjectSettings): Promise<{ sources: Source[]; text: Record<string, string> }> {
  const sources: Source[] = [];
  const text: Record<string, string> = {};
  for (const ref of settings.userSources ?? []) {
    let body = "";
    try {
      body = (await getStorage().get(ref.storageKey)).toString("utf8");
    } catch {
      continue;
    }
    text[ref.id] = body;
    sources.push({
      id: ref.id,
      title: ref.title,
      authorOrOrganization: ref.authorOrOrganization || undefined,
      location: ref.kind === "url" ? { kind: "url", value: ref.url } : { kind: ref.kind === "upload" ? "upload" : "pasted", value: ref.title },
      publicationDate: ref.publicationDate || undefined,
      retrievedAt: ref.addedAt,
      excerpt: body.slice(0, 3900),
      sourceType: "user-supplied",
      licenceStatus: ref.licenceStatus,
    });
  }
  return { sources, text };
}
