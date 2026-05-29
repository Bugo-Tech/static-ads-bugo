#!/usr/bin/env node
/**
 * Fix the "size" field in gallery index.json by reading actual image dimensions.
 * The rebuild script defaulted everything to "1:1" which was wrong for 9:16 images.
 *
 * Only touches the `size` field. Leaves all other metadata intact.
 *
 * Usage: node scripts/fix-gallery-sizes.mjs
 */

import { readFile, writeFile, readdir, rename } from "fs/promises";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_DIR = path.join(__dirname, "..", "uploads", "gallery");
const INDEX_FILE = path.join(GALLERY_DIR, "index.json");
const BACKUP_FILE = path.join(GALLERY_DIR, "index.json.backup-before-size-fix");

/**
 * Read width/height from a PNG file header (bytes 16-23).
 * For JPEG we fallback to a simple marker search.
 */
function getImageDimensions(filepath) {
  const buf = readFileSync(filepath);

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    // IHDR chunk starts at byte 16; width at 16-19, height at 20-23 (big-endian uint32)
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }

  // JPEG: scan for SOF markers (FFC0, FFC1, FFC2, etc.)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      // SOF0-SOF15 (except SOF4=DHT, SOF8=reserved, SOF12=reserved)
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height };
      }
      // Skip this segment
      const segmentLength = buf.readUInt16BE(i + 2);
      i += 2 + segmentLength;
    }
  }

  return null;
}

function classifySize(width, height) {
  if (!width || !height) return null;
  const ratio = width / height;
  // Square
  if (Math.abs(ratio - 1) < 0.05) return "1:1";
  // Portrait 9:16 is 0.5625
  if (ratio < 0.7) return "9:16";
  // Landscape 16:9 is 1.777
  if (ratio > 1.4) return "16:9";
  // 4:5 portrait is 0.8
  if (ratio < 0.95) return "4:5";
  return "1:1";
}

async function main() {
  console.log("=== Gallery Size Fix ===\n");

  // Read current index
  const data = await readFile(INDEX_FILE, "utf-8");
  const index = JSON.parse(data);
  const images = index.images || [];
  console.log(`Loaded ${images.length} images from index`);

  // Backup
  await writeFile(BACKUP_FILE, data);
  console.log(`Backed up current index to: ${path.basename(BACKUP_FILE)}\n`);

  let fixed = 0;
  let unchanged = 0;
  let failed = 0;
  const sizeCounts = {};

  for (const img of images) {
    const filepath = path.join(GALLERY_DIR, img.filename);
    try {
      const dims = getImageDimensions(filepath);
      if (!dims) {
        failed++;
        continue;
      }
      const correctSize = classifySize(dims.width, dims.height);
      if (!correctSize) {
        failed++;
        continue;
      }
      sizeCounts[correctSize] = (sizeCounts[correctSize] || 0) + 1;
      if (img.size !== correctSize) {
        img.size = correctSize;
        fixed++;
      } else {
        unchanged++;
      }
    } catch (err) {
      failed++;
    }
  }

  // Atomic write
  const tempFile = `${INDEX_FILE}.tmp-${Date.now()}`;
  await writeFile(tempFile, JSON.stringify(index, null, 2));
  await rename(tempFile, INDEX_FILE);

  console.log("=== Result ===");
  console.log(`Updated:   ${fixed}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Failed:    ${failed}`);
  console.log(`\nSize distribution:`);
  for (const [size, count] of Object.entries(sizeCounts)) {
    console.log(`  ${size}: ${count}`);
  }
  console.log(`\nDone. Refresh the gallery to see correct sizes.`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
