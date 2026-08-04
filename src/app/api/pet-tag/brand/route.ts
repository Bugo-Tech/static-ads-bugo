import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import { defaultPetTagBrandConfig, type PetTagBrandConfig } from "@/lib/pet-tag-defaults";

const BRAND_DIR = path.join(process.cwd(), "uploads", "pet-tag");
const CONFIG_FILE = path.join(BRAND_DIR, "brand-config.json");

async function ensureDir() {
  await mkdir(BRAND_DIR, { recursive: true });
}

async function readConfig(): Promise<PetTagBrandConfig> {
  try {
    const data = await readFile(CONFIG_FILE, "utf-8");
    return { ...defaultPetTagBrandConfig, ...JSON.parse(data) };
  } catch {
    return defaultPetTagBrandConfig;
  }
}

async function writeConfig(config: PetTagBrandConfig) {
  await ensureDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function GET() {
  await ensureDir();
  const config = await readConfig();
  return NextResponse.json({ config });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const current = await readConfig();
    const updated = { ...current, ...body };
    await writeConfig(updated);
    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error("Pet Tag brand config update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
