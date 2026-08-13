import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { defaultFlyBrandConfig, type FlyBrandConfig } from "@/lib/fly-defaults";
import { readBrandConfigFileForUpdate, writeBrandConfigFile } from "@/lib/brand-config-store";
import { uploadFile } from "@/lib/supabase-storage";

const SCOPE = "fly";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const market = formData.get("market") as string | null;

    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (!file.name.endsWith(".pdf")) return NextResponse.json({ error: "Only PDF files" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(doc, { mergePages: true });
    const extractedText = result.text.trim();
    const numPages = result.totalPages;

    if (!extractedText) {
      return NextResponse.json({ error: "Could not extract text from PDF" }, { status: 400 });
    }

    const config: FlyBrandConfig = await readBrandConfigFileForUpdate(SCOPE, defaultFlyBrandConfig);

    if (market === "us") {
      config.brandBookContentUS = extractedText;
    } else {
      config.brandBookContent = extractedText;
    }

    await writeBrandConfigFile(SCOPE, config);

    const pdfFilename = market === "us" ? "brand-book-us.pdf" : "brand-book-il.pdf";
    await uploadFile("references", `brand-config/${SCOPE}-${pdfFilename}`, buffer, "application/pdf");

    return NextResponse.json({
      success: true,
      pages: numPages,
      chars: extractedText.length,
      preview: extractedText.substring(0, 500),
    });
  } catch (error) {
    console.error("Fly PDF upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF processing failed" },
      { status: 500 }
    );
  }
}
