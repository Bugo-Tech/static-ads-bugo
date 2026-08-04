import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { analyzePetTagReference } from "@/lib/pet-tag-claude";
import type { Language } from "@/lib/types";
import { readProductFile, type ProductScope } from "@/lib/productImages";

const PRODUCT_SCOPE: ProductScope = "pet-tag";

function detectMimeType(buffer: Buffer): string | null {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return "image/webp";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
  return null;
}

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let imageBase64: string;
    let mimeType: string;
    let language: Language = "he";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      language = (formData.get("language") as Language) || "he";

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      let buffer = Buffer.from(bytes);
      mimeType = detectMimeType(buffer) || file.type || "image/png";

      // Resize if over 4MB (Claude limit is 5MB, leave margin)
      if (buffer.length > 4 * 1024 * 1024) {
        const { execSync } = await import("child_process");
        const tmpIn = `/tmp/pettag-analyze-in-${Date.now()}.${mimeType.includes("png") ? "png" : "jpg"}`;
        const tmpOut = `/tmp/pettag-analyze-out-${Date.now()}.jpg`;
        const { writeFileSync, readFileSync } = await import("fs");
        writeFileSync(tmpIn, buffer);
        execSync(
          `sips -Z 1024 --setProperty format jpeg --setProperty formatOptions 80 "${tmpIn}" --out "${tmpOut}"`,
          { stdio: "ignore" }
        );
        buffer = readFileSync(tmpOut);
        mimeType = "image/jpeg";
        try { execSync(`rm "${tmpIn}" "${tmpOut}"`, { stdio: "ignore" }); } catch {}
      }

      imageBase64 = buffer.toString("base64");
    } else {
      const body = await request.json();
      const { imageUrl, language: lang = "he" } = body as {
        imageUrl: string;
        language?: Language;
      };
      language = lang;

      if (!imageUrl) {
        return NextResponse.json({ error: "No image provided" }, { status: 400 });
      }

      // Pet-tag-aware: route through pet-tag namespace folders only.
      if (imageUrl.startsWith("/api/pet-tag/products/file/")) {
        const filename = imageUrl.split("/").pop()!;
        const buffer = await readProductFile(PRODUCT_SCOPE, filename);
        imageBase64 = buffer.toString("base64");
        const ext = path.extname(filename).toLowerCase();
        mimeType = MIME_MAP[ext] || "image/png";
      } else if (imageUrl.startsWith("/api/upload/file/")) {
        // Reference uploads still share the main `uploads/references/` folder
        // (no risk — that folder is read-only for the existing flow too).
        const filename = imageUrl.split("/").pop()!;
        const filepath = path.join(process.cwd(), "uploads", "references", filename);
        const buffer = await readFile(filepath);
        imageBase64 = buffer.toString("base64");
        const ext = path.extname(filename).toLowerCase();
        mimeType = MIME_MAP[ext] || "image/png";
      } else if (imageUrl.startsWith("http")) {
        const res = await fetch(imageUrl);
        const buffer = Buffer.from(await res.arrayBuffer());
        imageBase64 = buffer.toString("base64");
        mimeType = res.headers.get("content-type") || "image/png";
      } else {
        return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
      }
    }

    const result = await analyzePetTagReference(imageBase64, mimeType, language);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Pet Tag analyze error:", error);
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
