import { readFile } from "fs/promises";
import path from "path";

const FREEIMAGE_API = "https://freeimage.host/api/1/upload";
const FREEIMAGE_KEY = "6d207e02198a847aa98d0a2a901485a5";
const UGUU_API = "https://uguu.se/upload.php";

const UPLOAD_TIMEOUT_MS = 30_000;

/**
 * Upload a local file to a public image host and return its URL.
 * kie.ai's nano-banana model requires public URLs for image_input
 * (base64 causes server errors).
 *
 * Strategy: try freeimage.host first (historical primary), fall back to
 * uguu.se if freeimage is unreachable. uguu.se URLs expire after ~24h,
 * which is more than enough for a kie.ai generation cycle (~3 minutes).
 *
 * If both fail, throws a clear error naming both hosts and the underlying
 * causes — so the UI can show exactly which external service is the
 * problem, instead of a generic "fetch failed".
 */
export async function uploadToPublicHost(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const sizeKb = Math.round(buffer.length / 1024);

  // 1. Try freeimage.host (primary) — preserves prior behavior when it works.
  try {
    return await uploadToFreeimage(buffer);
  } catch (freeimageErr) {
    const freeimageMsg = formatErr(freeimageErr);
    console.warn(`[imageHost] freeimage.host failed (${sizeKb}KB): ${freeimageMsg} — falling back to uguu.se`);

    // 2. Fall back to uguu.se.
    try {
      return await uploadToUguu(buffer, path.basename(filePath));
    } catch (uguuErr) {
      const uguuMsg = formatErr(uguuErr);
      throw new Error(
        `Image host upload failed (file ${sizeKb}KB). ` +
        `freeimage.host: ${freeimageMsg}. ` +
        `uguu.se fallback: ${uguuMsg}. ` +
        `Both upload providers are unreachable from this machine — check network/DNS or add a working IMAGE_HOST env var.`
      );
    }
  }
}

async function uploadToFreeimage(buffer: Buffer): Promise<string> {
  const base64 = buffer.toString("base64");

  const formData = new FormData();
  formData.append("key", FREEIMAGE_KEY);
  formData.append("source", base64);
  formData.append("format", "json");

  const res = await fetch(FREEIMAGE_API, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  const url = data?.image?.url;
  if (!url) {
    throw new Error(`no URL in response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return url;
}

async function uploadToUguu(buffer: Buffer, filename: string): Promise<string> {
  // Detect MIME type by file extension; fall back to image/png.
  const ext = filename.split(".").pop()?.toLowerCase() || "png";
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  const mime = mimeMap[ext] || "image/png";

  const blob = new Blob([new Uint8Array(buffer)], { type: mime });
  const formData = new FormData();
  formData.append("files[]", blob, filename);

  const res = await fetch(UGUU_API, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  const url = data?.files?.[0]?.url;
  if (!url) {
    throw new Error(`no URL in response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return url;
}

function formatErr(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause;
    if (cause instanceof Error && cause.message) return cause.message;
    if (typeof cause === "string") return cause;
    return err.message;
  }
  return String(err);
}
