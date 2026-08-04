import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readProductFile } from "@/lib/productImages";

const SCOPE = "pet-tag" as const;

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const sanitized = path.basename(filename);
    // Resolves against local uploads first, then the committed seed store.
    const buffer = await readProductFile(SCOPE, sanitized);
    const ext = path.extname(sanitized).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
