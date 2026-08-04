/**
 * One-time script to seed the product_images table with entries
 * for the default product images in public/product-images/.
 *
 * Run with: npx tsx scripts/seed-products.ts
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

interface SeedProduct {
  id: string;
  filename: string;
  url: string;
  label?: string;
  uploadedAt: string;
}

const SCOPES = [
  { scope: "main", dir: "products" },
  { scope: "ants", dir: "ants-products" },
  { scope: "birds", dir: "birds-products" },
  { scope: "fly", dir: "fly-products" },
  { scope: "pet-tag", dir: "pet-tag-products" },
] as const;

async function main() {
  for (const { scope, dir } of SCOPES) {
    const indexPath = path.join(
      process.cwd(),
      "public",
      "product-images",
      dir,
      "index.json"
    );

    if (!fs.existsSync(indexPath)) {
      console.log(`No index.json for ${scope}, skipping`);
      continue;
    }

    const products: SeedProduct[] = JSON.parse(
      fs.readFileSync(indexPath, "utf-8")
    );

    console.log(`Seeding ${products.length} products for scope: ${scope}`);

    for (const product of products) {
      const { error } = await supabase.from("product_images").upsert(
        {
          id: product.id,
          filename: product.filename,
          url: `/product-images/${dir}/${product.filename}`,
          label: product.label || product.filename,
          scope,
          is_seed: true,
          created_at: product.uploadedAt,
        },
        { onConflict: "id" }
      );

      if (error) {
        console.error(`Error seeding ${product.id}:`, error.message);
      } else {
        console.log(`  Seeded: ${product.filename}`);
      }
    }
  }

  console.log("Done!");
}

main().catch(console.error);
