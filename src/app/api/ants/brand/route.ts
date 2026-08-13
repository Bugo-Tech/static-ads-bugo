import { NextRequest, NextResponse } from "next/server";
import { defaultAntsBrandConfig, type AntsBrandConfig } from "@/lib/ants-defaults";
import {
  readBrandConfigFile,
  readBrandConfigFileForUpdate,
  writeBrandConfigFile,
} from "@/lib/brand-config-store";

const SCOPE = "ants";

export async function GET() {
  const config = await readBrandConfigFile(SCOPE, defaultAntsBrandConfig);
  return NextResponse.json({ config });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const current = await readBrandConfigFileForUpdate(SCOPE, defaultAntsBrandConfig);
    const updated: AntsBrandConfig = { ...current, ...body };
    await writeBrandConfigFile(SCOPE, updated);
    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error("Ants brand config update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
