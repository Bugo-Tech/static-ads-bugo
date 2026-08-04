import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { getBrandConfig, updateBrandConfig } from "@/lib/supabase-db";
import { uploadFile } from "@/lib/supabase-storage";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const market = (formData.get("market") as string) || "il";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
    const { text } = await extractText(pdf, { mergePages: true });

    // Upload PDF to Supabase Storage
    const storagePath = `brand/brand-book-${market === "us" ? "us" : "il"}.pdf`;
    await uploadFile("references", storagePath, buffer, "application/pdf");

    // Update brand config with extracted text
    const configKey = market === "us" ? "brandBookContentUS" : "brandBookContent";
    await updateBrandConfig({ [configKey]: text } as Record<string, string>, user.id);

    return NextResponse.json({
      success: true,
      pages: pdf.numPages,
      chars: text.length,
      preview: text.slice(0, 500),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
