import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import { BrandConfig } from "@/lib/types";
import { defaultBrandConfig } from "@/lib/brand-defaults";

const BRAND_DIR = path.join(process.cwd(), "uploads", "brand");
const CONFIG_FILE = path.join(BRAND_DIR, "brand-config.json");

async function ensureDir() {
  await mkdir(BRAND_DIR, { recursive: true });
}

async function readConfig(): Promise<BrandConfig> {
  try {
    const data = await readFile(CONFIG_FILE, "utf-8");
    return { ...defaultBrandConfig, ...JSON.parse(data) };
  } catch {
    return defaultBrandConfig;
  }
}

async function writeConfig(config: BrandConfig) {
  await ensureDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// GET — read brand config
export async function GET() {
  await ensureDir();
  const config = await readConfig();
  return NextResponse.json({ config });
}

// PUT — update brand config
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const current = await readConfig();
    const updated = { ...current, ...body };
    await writeConfig(updated);
    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error("Brand config update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
