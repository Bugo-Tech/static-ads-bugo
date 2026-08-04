/**
 * POST /api/native-ads/ideas
 *
 * Body: { pestId: NativePestId, vibe: "everyday" | "extreme" | "creative" }
 *
 * Returns 5 Hebrew idea descriptions for the chosen pest + vibe, ready to
 * be shown to the user for approval before generating images.
 */

import { NextRequest, NextResponse } from "next/server";
import { generatePestIdeas } from "@/lib/native-ads-claude";
import {
  NATIVE_PEST_OPTIONS,
  NATIVE_VIBES,
  type NativePestId,
  type NativeVibeId,
} from "@/lib/native-ads-defaults";

const VALID_PESTS = new Set(NATIVE_PEST_OPTIONS.map((p) => p.id));
const VALID_VIBES = new Set(NATIVE_VIBES.map((v) => v.id));

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pestId, vibe } = body as { pestId?: string; vibe?: string };

    if (!pestId || !VALID_PESTS.has(pestId as NativePestId)) {
      return NextResponse.json(
        { error: `pestId must be one of: ${Array.from(VALID_PESTS).join(", ")}` },
        { status: 400 }
      );
    }
    if (!vibe || !VALID_VIBES.has(vibe as NativeVibeId)) {
      return NextResponse.json(
        { error: `vibe must be one of: ${Array.from(VALID_VIBES).join(", ")}` },
        { status: 400 }
      );
    }

    const ideas = await generatePestIdeas(pestId as NativePestId, vibe as NativeVibeId);
    return NextResponse.json({ ideas, pestId, vibe });
  } catch (error) {
    console.error("Native ads ideas error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate ideas";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
