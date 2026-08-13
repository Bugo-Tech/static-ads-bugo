import { NextRequest, NextResponse } from "next/server";
import { defaultPetTagBrandConfig, type PetTagBrandConfig } from "@/lib/pet-tag-defaults";
import {
  readBrandConfigFile,
  readBrandConfigFileForUpdate,
  writeBrandConfigFile,
} from "@/lib/brand-config-store";

const SCOPE = "pet-tag";

export async function GET() {
  const config = await readBrandConfigFile(SCOPE, defaultPetTagBrandConfig);
  return NextResponse.json({ config });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const current = await readBrandConfigFileForUpdate(SCOPE, defaultPetTagBrandConfig);
    const updated: PetTagBrandConfig = { ...current, ...body };
    await writeBrandConfigFile(SCOPE, updated);
    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error("Pet Tag brand config update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
