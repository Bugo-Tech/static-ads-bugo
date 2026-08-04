import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import { extractText, getDocumentProxy } from "unpdf";
import { defaultFlyBrandConfig, type FlyBrandConfig } from "@/lib/fly-defaults";

const BRAND_DIR = path.join(process.cwd(), "uploads", "fly");
const CONFIG_FILE = path.join(BRAND_DIR, "brand-config.json");

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const market = formData.get("market") as string | null;

    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (!file.name.endsWith(".pdf")) return NextResponse.json({ error: "Only PDF files" }, { status: 400 });

    await mkdir(BRAND_DIR, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(doc, { mergePages: true });
    const extractedText = result.text.trim();
    const numPages = result.totalPages;

    if (!extractedText) {
      return NextResponse.json({ error: "Could not extract text from PDF" }, { status: 400 });
    }

    let config: FlyBrandConfig;
    try {
      const data = await readFile(CONFIG_FILE, "utf-8");
      config = { ...defaultFlyBrandConfig, ...JSON.parse(data) };
    } catch {
      config = { ...defaultFlyBrandConfig };
    }

    if (market === "us") {
      config.brandBookContentUS = extractedText;
    } else {
      config.brandBookContent = extractedText;
    }

    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));

    const pdfFilename = market === "us" ? "brand-book-us.pdf" : "brand-book-il.pdf";
    await writeFile(path.join(BRAND_DIR, pdfFilename), buffer);

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
