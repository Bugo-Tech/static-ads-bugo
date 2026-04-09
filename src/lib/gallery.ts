import { readFile, writeFile, mkdir, unlink, copyFile } from "fs/promises";
import path from "path";

const GALLERY_DIR = path.join(process.cwd(), "uploads", "gallery");
const INDEX_FILE = path.join(GALLERY_DIR, "index.json");

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
  try {
    const data = await readFile(INDEX_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { images: [], folders: [] };
  }
}

async function writeIndex(index: GalleryIndex) {
  await ensureDir();
  await writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
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
