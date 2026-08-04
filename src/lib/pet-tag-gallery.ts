/**
 * Pet Tag gallery — parallel to `gallery.ts` but writes to `uploads/pet-tag-gallery/`.
 * Same atomic-write + backup safety as the main gallery. Completely isolated:
 * no shared file paths, no shared lock, no shared index.
 */

import { readFile, writeFile, mkdir, unlink, rename, statfs, readdir } from "fs/promises";
import path from "path";

const GALLERY_DIR = path.join(process.cwd(), "uploads", "pet-tag-gallery");
const BACKUPS_DIR = path.join(GALLERY_DIR, "backups");
const INDEX_FILE = path.join(GALLERY_DIR, "index.json");
const INDEX_BACKUP_FILE = path.join(GALLERY_DIR, "index.json.backup");
// 50MB — leaves enough headroom for a handful of new images (kie.ai output is
// typically 1-4MB per PNG) while still bailing out before the disk truly fills.
// The main `gallery.ts` keeps its 500MB threshold intentionally — not touched.
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

export interface PetTagGalleryImage {
  id: string;
  filename: string;
  url: string;
  sourceUrl: string;
  prompt: string;
  size: string;
  angle: string;
  referencePreview?: string;
  folderId: string;
  createdAt: string;
  // Extended metadata for regeneration (fix text, cross-size) — full parity with GalleryImage
  originalPrompt?: string;
  referenceImageUrl?: string;
  copyVariation?: { angle: string; sections: { label: string; adaptedText: string }[] };
  sourceImageId?: string; // links cross-size / QC-fix to the original gallery image
  isQcFix?: boolean;
  // Pet-tag specific additions
  /** Which of the 2 product images (product / packaging) was used for this generation. */
  productImageId?: string;
  productImageLabel?: string;
  /** Mirror of main gallery's `productImageIds` shape — wraps productImageId for regen compatibility. */
  productImageIds?: string[];
}

export interface PetTagGalleryFolder {
  id: string;
  name: string;
  createdAt: string;
}

interface PetTagGalleryIndex {
  images: PetTagGalleryImage[];
  folders: PetTagGalleryFolder[];
}

async function ensureDir() {
  await mkdir(GALLERY_DIR, { recursive: true });
}

async function readIndex(): Promise<PetTagGalleryIndex> {
  try {
    const data = await readFile(INDEX_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (parsed && Array.isArray(parsed.images)) return parsed;
  } catch { /* fall through */ }
  try {
    const data = await readFile(INDEX_BACKUP_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (parsed && Array.isArray(parsed.images)) {
      console.warn("Pet Tag gallery index was corrupted — restored from backup");
      return parsed;
    }
  } catch { /* no backup either */ }
  return { images: [], folders: [] };
}

async function writeIndexUnsafe(index: PetTagGalleryIndex) {
  await ensureDir();
  if (!(await hasEnoughDiskSpace())) {
    throw new Error(
      "Disk space critically low — refusing to write pet-tag gallery index. Free up space and try again."
    );
  }
  try {
    const existing = await readFile(INDEX_FILE, "utf-8");
    const parsed = JSON.parse(existing);
    if (parsed && Array.isArray(parsed.images)) {
      await writeFile(INDEX_BACKUP_FILE, existing);
    }
  } catch { /* no existing — nothing to back up */ }

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

async function writeIndex(index: PetTagGalleryIndex) {
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

export async function getPetTagGallery(): Promise<PetTagGalleryIndex> {
  await ensureDir();
  return readIndex();
}

export async function addImageToPetTagGallery(
  image: Omit<PetTagGalleryImage, "id" | "filename" | "url" | "createdAt">
): Promise<PetTagGalleryImage> {
  await ensureDir();

  const id = `pettag-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  let filename = `${id}.png`;
  try {
    const res = await fetch(image.sourceUrl);
    if (!res.ok) {
      throw new Error(
        `Failed to download from sourceUrl (HTTP ${res.status}): ${image.sourceUrl}`
      );
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
    // Bubble up — caller (the route) will surface the real message instead
    // of saving a broken entry with no image file on disk.
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`addImageToPetTagGallery: download/write failed — ${detail}`);
  }

  const galleryImage: PetTagGalleryImage = {
    ...image,
    id,
    filename,
    url: `/api/pet-tag/gallery/file/${filename}`,
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

export async function deletePetTagGalleryImage(id: string): Promise<void> {
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

export async function moveImageToPetTagFolder(imageId: string, folderId: string): Promise<void> {
  const index = await readIndex();
  index.images = index.images.map((img) =>
    img.id === imageId ? { ...img, folderId } : img
  );
  await writeIndex(index);
}

export async function createPetTagFolder(name: string): Promise<PetTagGalleryFolder> {
  const index = await readIndex();
  const folder: PetTagGalleryFolder = {
    id: `folder-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name,
    createdAt: new Date().toISOString(),
  };
  index.folders.push(folder);
  await writeIndex(index);
  return folder;
}

export async function deletePetTagFolder(id: string): Promise<void> {
  const index = await readIndex();
  index.images = index.images.map((img) =>
    img.folderId === id ? { ...img, folderId: "root" } : img
  );
  index.folders = index.folders.filter((f) => f.id !== id);
  await writeIndex(index);
}

export async function renamePetTagFolder(id: string, name: string): Promise<void> {
  const index = await readIndex();
  index.folders = index.folders.map((f) =>
    f.id === id ? { ...f, name } : f
  );
  await writeIndex(index);
}
