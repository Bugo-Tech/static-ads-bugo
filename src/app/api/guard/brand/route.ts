import { NextRequest, NextResponse } from "next/server";
import { defaultGuardBrandConfig, type GuardBrandConfig } from "@/lib/guard-defaults";
import {
  readBrandConfigFile,
  readBrandConfigFileForUpdate,
  writeBrandConfigFile,
} from "@/lib/brand-config-store";

const SCOPE = "guard";

export async function GET() {
  const config = await readBrandConfigFile(SCOPE, defaultGuardBrandConfig);
  return NextResponse.json({ config });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const current = await readBrandConfigFileForUpdate(SCOPE, defaultGuardBrandConfig);
    const updated: GuardBrandConfig = { ...current, ...body };
    await writeBrandConfigFile(SCOPE, updated);
    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error("Guard brand config update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
