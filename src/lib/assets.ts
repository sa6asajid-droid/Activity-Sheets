/**
 * Reviewed images uploaded by the editor to replace a drawn figure.
 * Only PNG and JPEG are accepted, identified by their bytes (never by the
 * file name or the browser's claimed type). SVG uploads are refused because
 * they can carry script.
 */
import { randomUUID } from "node:crypto";
import type { Store, AssetRow } from "./db/store";
import type { WorksheetDocument } from "./schema/document";
import { getStorage } from "./storage";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export class AssetInputError extends Error {}

export interface ImageInfo {
  mime: "image/png" | "image/jpeg";
  width: number;
  height: number;
}

export function detectImage(b: Buffer): ImageInfo | null {
  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
  if (b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && b.subarray(12, 16).toString("latin1") === "IHDR") {
    return { mime: "image/png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  // JPEG: SOI marker, then walk segments to a start-of-frame marker.
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xd9 || marker === 0xda) return null;
      const len = b.readUInt16BE(i + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { mime: "image/jpeg", height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

export async function addImageAsset(store: Store, projectId: string, file: { name: string; bytes: Buffer }, rights: AssetRow["rights"]): Promise<AssetRow & ImageInfo> {
  if (file.bytes.length > MAX_IMAGE_BYTES) throw new AssetInputError("Images must be smaller than 5 MB.");
  const info = detectImage(file.bytes);
  if (!info) throw new AssetInputError("Only PNG and JPEG images can be uploaded.");
  if (info.width < 50 || info.height < 50 || info.width > 20000 || info.height > 20000) throw new AssetInputError("The image dimensions are outside the supported range.");
  const key = `assets/${projectId}/${randomUUID()}.${info.mime === "image/png" ? "png" : "jpg"}`;
  await getStorage().put(key, file.bytes);
  const row = store.createAsset({ projectId, kind: "image", filename: file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120), mime: info.mime, size: file.bytes.length, storageKey: key, rights });
  return { ...row, ...info };
}

/** Data URIs for every image the document uses, restricted to this project's assets. */
export async function loadDocAssets(store: Store, projectId: string, doc: WorksheetDocument): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const d of doc.diagrams) {
    if (!d.image) continue;
    const a = store.getAsset(d.image.assetId);
    if (!a || a.projectId !== projectId) continue;
    try {
      out[a.id] = `data:${a.mime};base64,${(await getStorage().get(a.storageKey)).toString("base64")}`;
    } catch {
      /* missing file: rendered as a labelled placeholder and reported */
    }
  }
  return out;
}
