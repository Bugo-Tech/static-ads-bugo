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

/**
 * Get a signed URL for a storage file (1 hour validity).
 */
export async function getSignedUrl(
  bucket: Bucket,
  path: string,
  expiresIn = 3600
): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  return data.signedUrl;
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
