import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "references");
const MAX_BYTES = 25 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { imageUrl?: unknown };
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";

    if (!imageUrl) {
      return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(imageUrl)) {
      return NextResponse.json({ error: "imageUrl must be http(s)" }, { status: 400 });
    }

    const fetchRes = await fetch(imageUrl);
    if (!fetchRes.ok) {
      return NextResponse.json(
        { error: `Failed to download (${fetchRes.status})` },
        { status: 502 }
      );
    }

    const contentType = (fetchRes.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: `Not an image (content-type: ${contentType || "unknown"})` },
        { status: 415 }
      );
    }

    const arrayBuffer = await fetchRes.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large (>25MB)" }, { status: 413 });
    }
    const buffer = Buffer.from(arrayBuffer);

    await mkdir(UPLOADS_DIR, { recursive: true });

    const ext = EXT_BY_MIME[contentType] || extFromUrl(imageUrl) || ".jpg";
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    await writeFile(filepath, buffer);

    return NextResponse.json({
      url: `/api/upload/file/${filename}`,
      filename,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    console.error("Auto-pull import error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function extFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp" || ext === ".gif") {
      return ext === ".jpeg" ? ".jpg" : ext;
    }
  } catch {
    // ignore
  }
  return "";
}
