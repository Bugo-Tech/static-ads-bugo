import { createServiceClient } from "@/lib/supabase/server";

type Bucket = "references" | "gallery" | "products";

/**
 * Upload a file buffer to Supabase Storage using service role (server-side).
 * Returns the storage path (not a URL).
 */
export async function uploadFile(
  bucket: Bucket,
  path: string,
  file: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

/**
 * Download a file from Supabase Storage. Returns the file as a Buffer.
 */
export async function downloadFile(
  bucket: Bucket,
  path: string
): Promise<Buffer> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error) throw new Error(`Storage download failed: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

// Signed URLs are cached per warm server instance and reused until close to
// expiry. Reuse matters beyond saving the storage round-trip: minting a fresh
// token on every request gives the browser a different URL each time, which
// defeats its image cache entirely.
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600;
const SIGNED_URL_REUSE_MARGIN_MS = 24 * 3600 * 1000;
const signedUrlCache = new Map<string, { url: string; expiresAtMs: number }>();

function getCachedSignedUrl(key: string): string | null {
  const hit = signedUrlCache.get(key);
  if (hit && hit.expiresAtMs - Date.now() > SIGNED_URL_REUSE_MARGIN_MS) {
    return hit.url;
  }
  if (hit) signedUrlCache.delete(key);
  return null;
}

/**
 * Get a signed URL for a storage file (7 days validity, cached).
 */
export async function getSignedUrl(
  bucket: Bucket,
  path: string,
  expiresIn = SIGNED_URL_TTL_SECONDS
): Promise<string> {
  const cacheKey = `${bucket}/${path}`;
  const cached = getCachedSignedUrl(cacheKey);
  if (cached) return cached;

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  signedUrlCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAtMs: Date.now() + expiresIn * 1000,
  });
  return data.signedUrl;
}

/**
 * Get signed URLs for many storage files in one API call (7 days validity,
 * cached). Returns a map of storage path → signed URL; paths that failed to
 * sign are absent from the map.
 */
export async function getSignedUrls(
  bucket: Bucket,
  paths: string[],
  expiresIn = SIGNED_URL_TTL_SECONDS
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const missing: string[] = [];

  for (const path of paths) {
    const cached = getCachedSignedUrl(`${bucket}/${path}`);
    if (cached) {
      result.set(path, cached);
    } else {
      missing.push(path);
    }
  }

  if (missing.length > 0) {
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(missing, expiresIn);

    if (error) throw new Error(`Signed URLs failed: ${error.message}`);

    const expiresAtMs = Date.now() + expiresIn * 1000;
    for (const item of data ?? []) {
      if (item.path && item.signedUrl && !item.error) {
        result.set(item.path, item.signedUrl);
        signedUrlCache.set(`${bucket}/${item.path}`, {
          url: item.signedUrl,
          expiresAtMs,
        });
      }
    }
  }

  return result;
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFile(
  bucket: Bucket,
  path: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}

/**
 * Download an image from an external URL and upload it to Supabase Storage.
 * Used when Nano Banana returns a generated image URL.
 * Returns the storage path.
 */
export async function downloadAndStore(
  sourceUrl: string,
  bucket: Bucket,
  storagePath: string
): Promise<string> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download from ${sourceUrl}: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());

  return uploadFile(bucket, storagePath, buffer, contentType);
}
