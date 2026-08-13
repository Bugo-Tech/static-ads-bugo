import { NextRequest, NextResponse } from "next/server";
import { defaultFlyBrandConfig, type FlyBrandConfig } from "@/lib/fly-defaults";
import {
  readBrandConfigFile,
  readBrandConfigFileForUpdate,
  writeBrandConfigFile,
} from "@/lib/brand-config-store";

const SCOPE = "fly";

export async function GET() {
  const config = await readBrandConfigFile(SCOPE, defaultFlyBrandConfig);
  return NextResponse.json({ config });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const current = await readBrandConfigFileForUpdate(SCOPE, defaultFlyBrandConfig);
    const updated: FlyBrandConfig = { ...current, ...body };
    await writeBrandConfigFile(SCOPE, updated);
    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error("Fly brand config update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
