/**
 * Fetch a user-supplied URL without letting it reach internal services.
 *
 * - http/https only, default ports only
 * - every hop (including redirects) is resolved and checked: loopback,
 *   private, link-local, CGNAT, multicast, unspecified and cloud-metadata
 *   addresses are refused
 * - the connection is pinned to the checked address (no DNS rebinding)
 * - bounded redirects, response size and time
 */
import dns from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";

export class FetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchBlockedError";
  }
}

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}
function inRange(ip: string, cidr: string) {
  const [base, bits] = cidr.split("/");
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16", // link-local, includes 169.254.169.254 cloud metadata
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return BLOCKED_V4.some((c) => inRange(ip, c));
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    if (/^f[cd]/.test(v)) return true; // unique local
    if (/^fe[89ab]/.test(v)) return true; // link-local
    if (/^ff/.test(v)) return true; // multicast
    if (v.startsWith("fd00:ec2")) return true; // AWS metadata v6
    return false;
  }
  return true;
}

const BLOCKED_HOSTNAMES = [/^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i, /^metadata(\.google\.internal)?$/i];

export async function checkUrl(raw: string): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError("Not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchBlockedError("Only http and https URLs are allowed.");
  if (url.username || url.password) throw new FetchBlockedError("URLs with credentials are not allowed.");
  if (url.port && !["80", "443"].includes(url.port)) throw new FetchBlockedError("Only standard ports are allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.some((r) => r.test(host))) throw new FetchBlockedError("That host is not allowed.");
  let address: string;
  let family: 4 | 6;
  if (net.isIP(host)) {
    address = host;
    family = net.isIPv4(host) ? 4 : 6;
  } else {
    const results = await dns.lookup(host, { all: true, verbatim: true });
    if (!results.length) throw new FetchBlockedError("Host did not resolve.");
    if (results.some((r) => isBlockedAddress(r.address))) throw new FetchBlockedError("That host resolves to a private or reserved address.");
    address = results[0].address;
    family = results[0].family === 6 ? 6 : 4;
  }
  if (isBlockedAddress(address)) throw new FetchBlockedError("That address is private or reserved.");
  return { url, address, family };
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

export async function safeFetch(raw: string, opts: { maxBytes: number; maxRedirects: number; timeoutMs: number }): Promise<SafeFetchResult> {
  let current = raw;
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    const { url, address, family } = await checkUrl(current);
    const res = await requestPinned(url, address, family, opts);
    if (res.status >= 300 && res.status < 400 && res.location) {
      current = new URL(res.location, url).toString();
      continue;
    }
    return { finalUrl: url.toString(), status: res.status, contentType: res.contentType, body: res.body, truncated: res.truncated };
  }
  throw new FetchBlockedError("Too many redirects.");
}

function requestPinned(url: URL, address: string, family: 4 | 6, opts: { maxBytes: number; timeoutMs: number }) {
  return new Promise<{ status: number; contentType: string; body: string; truncated: boolean; location?: string }>((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        // Pin the socket to the address we checked.
        lookup: (_h: string, _o: unknown, cb: (err: Error | null, addr: string, fam: number) => void) => cb(null, address, family),
        headers: { "user-agent": "CuriosityStudio/0.1 (source import)", accept: "text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.1" },
        timeout: opts.timeoutMs,
      } as http.RequestOptions,
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
          res.resume();
          resolve({ status, contentType: "", body: "", truncated: false, location });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            truncated = true;
            chunks.push(c.subarray(0, Math.max(0, c.length - (size - opts.maxBytes))));
            res.destroy();
            return;
          }
          chunks.push(c);
        });
        const done = () => resolve({ status, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks).toString("utf8"), truncated });
        res.on("end", done);
        res.on("close", done);
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    req.end();
  });
}

/** Reduce untrusted HTML to plain text. Scripts, styles and markup are discarded. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const text = html
    .replace(/<(script|style|noscript|template|svg|iframe|object)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return { title: decodeEntities(title), text };
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
