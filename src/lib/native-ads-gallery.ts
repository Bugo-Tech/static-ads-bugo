/**
 * Native Ads gallery — modeled on birds-gallery.ts. Writes to
 * uploads/native-ads-gallery/. Independent atomic-write + backup safety.
 * No shared file paths or write lock with any other gallery.
 *
 * Simpler than birds-gallery: no folders, no copy variations, no product
 * image associations. Just: image file + the prompt that made it +
 * (optionally) the description / pestId / ideaText that originated it.
 */

import { readFile, writeFile, mkdir, unlink, rename, statfs, readdir } from "fs/promises";
import path from "path";

const GALLERY_DIR = path.join(process.cwd(), "uploads", "native-ads-gallery");
const BACKUPS_DIR = path.join(GALLERY_DIR, "backups");
const INDEX_FILE = path.join(GALLERY_DIR, "index.json");
const INDEX_BACKUP_FILE = path.join(GALLERY_DIR, "index.json.backup");
const MIN_FREE_BYTES = 50 * 1024 * 1024;

let writeLock: Promise<void> = Promise.resolve();
let writeCount = 0;

async function hasEnoughDiskSpace(): Promise<boolean> {
  try {
    const stats = await (statfs as unknown as (p: string) => Promise<{ bavail: bigint; bsize: bigint }>)(GALLERY_DIR);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return freeBytes >= MIN_FREE_BYTES;
  } catch {
    return true;
  }
}

export interface NativeAdsGalleryImage {
  id: string;
  filename: string;
  url: string;          // /api/native-ads/gallery/file/{filename}
  sourceUrl: string;    // kie.ai's CDN URL (may expire — we keep the local copy)
  prompt: string;       // full English prompt sent to nano-banana
  size: string;         // "1:1" or "9:16"
  createdAt: string;    // ISO timestamp
  /** Mode 1: the user-typed Hebrew description; Mode 2: the approved idea. */
  description?: string;
  /** Mode 2 only: which pest seeded the ideas. */
  pestId?: string;
  /** Mode 2 only: the vibe of the idea. */
  vibe?: string;
  /** Group ID — all images from a single "generate" click share this so
   *  the UI/gallery can keep them clustered. */
  batchId?: string;
}

interface NativeAdsGalleryIndex {
  images: NativeAdsGalleryImage[];
}

async function ensureDir() {
  await mkdir(GALLERY_DIR, { recursive: true });
}

async function readIndex(): Promise<NativeAdsGalleryIndex> {
  try {
    const data = await readFile(INDEX_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (parsed && Array.isArray(parsed.images)) return parsed;
  } catch { /* fall through */ }
  try {
    const data = await readFile(INDEX_BACKUP_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (parsed && Array.isArray(parsed.images)) {
      console.warn("Native ads gallery index was corrupted — restored from backup");
      return parsed;
    }
  } catch { /* no backup either */ }
  return { images: [] };
}

async function writeIndexUnsafe(index: NativeAdsGalleryIndex) {
  await ensureDir();
  if (!(await hasEnoughDiskSpace())) {
    throw new Error(
      "Disk space critically low — refusing to write native ads gallery index. Free up space and try again."
    );
  }
  try {
    const existing = await readFile(INDEX_FILE, "utf-8");
    const parsed = JSON.parse(existing);
    if (parsed && Array.isArray(parsed.images)) {
      await writeFile(INDEX_BACKUP_FILE, existing);
    }
  } catch { /* no existing — nothing to back up */ }

  // Atomic write: temp file → rename. Note: in tests Date.now() may be
  // mocked; we accept that and rely on the rename being atomic.
  const tempFile = `${INDEX_FILE}.tmp-${Date.now()}`;
  const payload = JSON.stringify(index, null, 2);
  await writeFile(tempFile, payload);
  await rename(tempFile, INDEX_FILE);

  writeCount++;
  if (writeCount % 10 === 0) {
    try {
      await mkdir(BACKUPS_DIR, { recursive: true });
      const backupFile = path.join(BACKUPS_DIR, `index-${Date.now()}.json`);
      await writeFile(backupFile, payload);
      const files = (await readdir(BACKUPS_DIR)).filter((f) => f.startsWith("index-")).sort().reverse();
      for (const old of files.slice(5)) {
        try { await unlink(path.join(BACKUPS_DIR, old)); } catch {}
      }
    } catch {}
  }
}

async function writeIndex(index: NativeAdsGalleryIndex) {
  const prev = writeLock;
  let resolve: () => void;
  writeLock = new Promise<void>((r) => { resolve = r; });
  await prev;
  try {
    await writeIndexUnsafe(index);
  } finally {
    resolve!();
  }
}

export async function getNativeAdsGallery(): Promise<NativeAdsGalleryIndex> {
  await ensureDir();
  return readIndex();
}

export async function addImageToNativeAdsGallery(
  image: Omit<NativeAdsGalleryImage, "id" | "filename" | "url" | "createdAt">
): Promise<NativeAdsGalleryImage> {
  await ensureDir();
  const id = `native-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Download the kie.ai result and store locally — its CDN URL eventually
  // expires, so the gallery must own its own copies.
  let filename = `${id}.png`;
  try {
    const res = await fetch(image.sourceUrl);
    if (!res.ok) {
      throw new Error(`Failed to download from sourceUrl (HTTP ${res.status}): ${image.sourceUrl}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error(`Downloaded empty buffer from sourceUrl: ${image.sourceUrl}`);
    }
    const contentType = res.headers.get("content-type") || "image/png";
    const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? ".jpg" : ".png";
    filename = `${id}${ext}`;
    await writeFile(path.join(GALLERY_DIR, filename), buffer);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`addImageToNativeAdsGallery: download/write failed — ${detail}`);
  }

  const galleryImage: NativeAdsGalleryImage = {
    ...image,
    id,
    filename,
    url: `/api/native-ads/gallery/file/${filename}`,
    createdAt: new Date().toISOString(),
  };

  const prev = writeLock;
  let resolve: () => void;
  writeLock = new Promise<void>((r) => { resolve = r; });
  await prev;
  try {
    const index = await readIndex();
    index.images.push(galleryImage);
    await writeIndexUnsafe(index);
  } finally {
    resolve!();
  }

  return galleryImage;
}

export async function deleteNativeAdsGalleryImage(id: string): Promise<void> {
  const index = await readIndex();
  const image = index.images.find((img) => img.id === id);
  if (image) {
    try {
      await unlink(path.join(GALLERY_DIR, image.filename));
    } catch { /* file might not exist */ }
  }
  index.images = index.images.filter((img) => img.id !== id);
  await writeIndex(index);
}
