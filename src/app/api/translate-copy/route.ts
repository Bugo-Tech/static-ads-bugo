import { NextRequest, NextResponse } from "next/server";
import { translateVariations } from "@/lib/claude";
import { CopyVariation, Language, needsHebrewCompanion } from "@/lib/types";

// A Claude vision call with max_tokens 8192 takes 20-60s. Without this, Vercel
// uses its default function limit (10s on Hobby) and kills the request, handing
// the browser an HTML error page instead of JSON. 60 is the Hobby ceiling and is
// valid on Pro too; raise to 300 on Pro if analyses still get cut off.
export const maxDuration = 60;


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
