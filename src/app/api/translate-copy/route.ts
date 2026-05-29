import { NextRequest, NextResponse } from "next/server";
import { translateVariations } from "@/lib/claude";
import { CopyVariation, Language, needsHebrewCompanion } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { variations, language, direction } = body as {
      variations: CopyVariation[];
      language: Language;
      direction: "foreign-to-hebrew" | "hebrew-to-foreign";
    };

    if (!Array.isArray(variations) || variations.length === 0) {
      return NextResponse.json({ error: "No variations provided" }, { status: 400 });
    }
    if (!language || !needsHebrewCompanion(language)) {
      return NextResponse.json(
        { error: "Translation is only supported for foreign languages (ar, de, ru, fr)" },
        { status: 400 }
      );
    }
    if (direction !== "foreign-to-hebrew" && direction !== "hebrew-to-foreign") {
      return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
    }

    const translated = await translateVariations(variations, language, direction);
    return NextResponse.json({ variations: translated });
  } catch (error) {
    console.error("Translate-copy error:", error);
    const message = error instanceof Error ? error.message : "Translation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
