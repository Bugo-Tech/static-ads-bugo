import { NextRequest, NextResponse } from "next/server";
import { defaultBirdsBrandConfig, type BirdsBrandConfig } from "@/lib/birds-defaults";
import {
  readBrandConfigFile,
  readBrandConfigFileForUpdate,
  writeBrandConfigFile,
} from "@/lib/brand-config-store";

const SCOPE = "birds";

export async function GET() {
  const config = await readBrandConfigFile(SCOPE, defaultBirdsBrandConfig);
  return NextResponse.json({ config });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const current = await readBrandConfigFileForUpdate(SCOPE, defaultBirdsBrandConfig);
    const updated: BirdsBrandConfig = { ...current, ...body };
    await writeBrandConfigFile(SCOPE, updated);
    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error("Birds brand config update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
