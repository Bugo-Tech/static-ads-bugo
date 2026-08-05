import { NextRequest, NextResponse } from "next/server";
import { uploadFile, getSignedUrl } from "@/lib/supabase-storage";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "png";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const storagePath = filename;

    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadFile("references", storagePath, buffer, file.type || "image/png");
    const signedUrl = await getSignedUrl("references", storagePath);

    return NextResponse.json({
      url: signedUrl,
      filename,
      storagePath,
      storageBucket: "references",
    });
  } catch (e) {
    console.error("Upload error:", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
