#!/usr/bin/env node
/**
 * Rebuild gallery index.json from files on disk.
 * Use this when the index got corrupted or truncated but the image files still exist.
 *
 * Usage: node scripts/rebuild-gallery-index.mjs
 */

import { readdir, readFile, writeFile, stat } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_DIR = path.join(__dirname, "..", "uploads", "gallery");
const INDEX_FILE = path.join(GALLERY_DIR, "index.json");
const BACKUP_FILE = path.join(GALLERY_DIR, "index.json.backup-before-rebuild");

const VALID_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function guessSize(filename) {
  // We can't know the actual size without reading each PNG header.
  // Default to 1:1 — user can manually move to a 9:16 folder later if needed.
  return "1:1";
}

async function main() {
  console.log("=== Gallery Index Rebuild ===\n");
  console.log(`Gallery directory: ${GALLERY_DIR}`);

  // Read existing index (if any) to preserve known metadata
  let existingImages = [];
  let existingFolders = [];
  try {
    const existing = JSON.parse(await readFile(INDEX_FILE, "utf-8"));
    existingImages = existing.images || [];
    existingFolders = existing.folders || [];
    console.log(`Existing index: ${existingImages.length} images, ${existingFolders.length} folders`);
  } catch {
    console.log("No existing index found");
  }

  // Backup existing index before overwriting
  if (existingImages.length > 0) {
    try {
      await writeFile(BACKUP_FILE, JSON.stringify({ images: existingImages, folders: existingFolders }, null, 2));
      console.log(`Backed up existing index to: ${path.basename(BACKUP_FILE)}\n`);
    } catch (err) {
      console.error("Failed to backup existing index:", err.message);
      process.exit(1);
    }
  }

  // Build lookup of known metadata by filename
  const knownByFilename = new Map();
  for (const img of existingImages) {
    if (img.filename) knownByFilename.set(img.filename, img);
  }

  // Scan the gallery directory
  const allFiles = await readdir(GALLERY_DIR);
  const imageFiles = allFiles.filter((f) => VALID_EXT.has(path.extname(f).toLowerCase()));
  console.log(`Found ${imageFiles.length} image files on disk\n`);

  // Build new index
  const newImages = [];
  let restoredCount = 0;
  let preservedCount = 0;

  for (const filename of imageFiles) {
    const known = knownByFilename.get(filename);
    if (known) {
      // Keep the existing metadata as-is
      newImages.push(known);
      preservedCount++;
    } else {
      // Rebuild a minimal entry
      const filepath = path.join(GALLERY_DIR, filename);
      const stats = await stat(filepath);
      const id = filename.replace(/\.[^.]+$/, "");
      newImages.push({
        id,
        filename,
        url: `/api/gallery/file/${filename}`,
        sourceUrl: "",
        prompt: "",
        size: guessSize(filename),
        angle: "",
        folderId: "root",
        createdAt: stats.birthtime?.toISOString() || stats.mtime.toISOString(),
      });
      restoredCount++;
    }
  }

  // Sort by createdAt descending (newest first)
  newImages.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  // Write the rebuilt index
  const newIndex = { images: newImages, folders: existingFolders };
  await writeFile(INDEX_FILE, JSON.stringify(newIndex, null, 2));

  console.log("=== Result ===");
  console.log(`Total images in rebuilt index: ${newImages.length}`);
  console.log(`- Preserved with metadata: ${preservedCount}`);
  console.log(`- Restored (no metadata):  ${restoredCount}`);
  console.log(`- Folders: ${existingFolders.length}`);
  console.log(`\nIndex written to: ${INDEX_FILE}`);
  if (existingImages.length > 0) {
    console.log(`Backup saved at:  ${BACKUP_FILE}`);
  }
  console.log("\nDone. Refresh the gallery page to see all images.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
