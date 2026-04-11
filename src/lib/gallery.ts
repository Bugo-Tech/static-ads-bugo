import { readFile, writeFile, mkdir, unlink, copyFile, rename, statfs } from "fs/promises";
import path from "path";

const GALLERY_DIR = path.join(process.cwd(), "uploads", "gallery");
const INDEX_FILE = path.join(GALLERY_DIR, "index.json");
const INDEX_BACKUP_FILE = path.join(GALLERY_DIR, "index.json.backup");
const MIN_FREE_BYTES = 500 * 1024 * 1024; // 500MB

async function hasEnoughDiskSpace(): Promise<boolean> {
  try {
    // statfs is available in Node 18+
    const stats = await (statfs as unknown as (p: string) => Promise<{ bavail: bigint; bsize: bigint }>)(GALLERY_DIR);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return freeBytes >= MIN_FREE_BYTES;
  } catch {
    // If we can't check, assume OK
    return true;
  }
}

export interface GalleryImage {
  id: string;
  filename: string;
  url: string;
  sourceUrl: string; // original URL from kie.ai
  prompt: string;
  size: string;
  angle: string;
  referencePreview?: string;
  folderId: string; // "root" or folder id
  createdAt: string;
}

export interface GalleryFolder {
  id: string;
  name: string;
  createdAt: string;
}

interface GalleryIndex {
  images: GalleryImage[];
  folders: GalleryFolder[];
}

async function ensureDir() {
  await mkdir(GALLERY_DIR, { recursive: true });
}

async function readIndex(): Promise<GalleryIndex> {
  // Try main file first
  try {
    const data = await readFile(INDEX_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (parsed && Array.isArray(parsed.images)) return parsed;
  } catch {
    // fall through to backup
  }

  // If main file is missing/corrupted, try the backup
  try {
    const data = await readFile(INDEX_BACKUP_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (parsed && Array.isArray(parsed.images)) {
      console.warn("Gallery index was corrupted — restored from backup");
      return parsed;
    }
  } catch {
    // no backup either
  }

  return { images: [], folders: [] };
}

async function writeIndex(index: GalleryIndex) {
  await ensureDir();

  // Safety 1: check disk space
  if (!(await hasEnoughDiskSpace())) {
    throw new Error(
      "Disk space critically low — refusing to write gallery index to prevent data loss. Free up space and try again."
    );
  }

  // Safety 2: keep a backup of the current index before overwriting
  try {
    const existing = await readFile(INDEX_FILE, "utf-8");
    // Only backup if current file looks valid (parseable JSON with images array)
    const parsed = JSON.parse(existing);
    if (parsed && Array.isArray(parsed.images)) {
      await writeFile(INDEX_BACKUP_FILE, existing);
    }
  } catch {
    // No existing file or invalid — nothing to backup
  }

  // Safety 3: atomic write — write to temp file first, then rename
  const tempFile = `${INDEX_FILE}.tmp-${Date.now()}`;
  const payload = JSON.stringify(index, null, 2);
  await writeFile(tempFile, payload);
  await rename(tempFile, INDEX_FILE);
}

export async function getGallery(): Promise<GalleryIndex> {
  await ensureDir();
  return readIndex();
}

export async function addImageToGallery(image: Omit<GalleryImage, "id" | "filename" | "url" | "createdAt">): Promise<GalleryImage> {
  await ensureDir();

  const id = `gal-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Download the image from sourceUrl and save locally
  let filename = `${id}.png`;
  try {
    const res = await fetch(image.sourceUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/png";
    const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? ".jpg" : ".png";
    filename = `${id}${ext}`;
    await writeFile(path.join(GALLERY_DIR, filename), buffer);
  } catch (err) {
    console.error("Failed to download gallery image:", err);
    // Store the sourceUrl as fallback
  }

  const galleryImage: GalleryImage = {
    ...image,
    id,
    filename,
    url: `/api/gallery/file/${filename}`,
    createdAt: new Date().toISOString(),
  };

  const index = await readIndex();
  index.images.push(galleryImage);
  await writeIndex(index);

  return galleryImage;
}

export async function deleteGalleryImage(id: string): Promise<void> {
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

export async function moveImageToFolder(imageId: string, folderId: string): Promise<void> {
  const index = await readIndex();
  index.images = index.images.map((img) =>
    img.id === imageId ? { ...img, folderId } : img
  );
  await writeIndex(index);
}

export async function createFolder(name: string): Promise<GalleryFolder> {
  const index = await readIndex();
  const folder: GalleryFolder = {
    id: `folder-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name,
    createdAt: new Date().toISOString(),
  };
  index.folders.push(folder);
  await writeIndex(index);
  return folder;
}

export async function deleteFolder(id: string): Promise<void> {
  const index = await readIndex();
  // Move all images in this folder back to root
  index.images = index.images.map((img) =>
    img.folderId === id ? { ...img, folderId: "root" } : img
  );
  index.folders = index.folders.filter((f) => f.id !== id);
  await writeIndex(index);
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const index = await readIndex();
  index.folders = index.folders.map((f) =>
    f.id === id ? { ...f, name } : f
  );
  await writeIndex(index);
}
