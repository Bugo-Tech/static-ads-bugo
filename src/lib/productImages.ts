/**
 * Single mapping between product images on disk and every place that uses them.
 *
 * Product images live in two stores:
 *
 *   seed     public/product-images/<dir>/  — committed to git, ships with a clone
 *   uploads  uploads/<dir>/                — gitignored, written at runtime
 *
 * Reads merge both (uploads wins on id collision) so a fresh clone has the
 * product catalog immediately while runtime uploads keep working. Writes only
 * ever touch `uploads/` — the seed store is read-only because it is in git.
 */

import { readFile, writeFile, mkdir, unlink, stat } from "fs/promises";
import path from "path";

/**
 * Fields every scope's product type shares. Each caller keeps its own type
 * (ProductImage, AntsProductImage, …) — they differ only in whether `label`
 * is optional, so the store stays generic over the shape.
 */
export interface StoredProduct {
  id: string;
  filename: string;
  url: string;
  label?: string;
  uploadedAt: string;
}

/** One per product catalog in the app. */
export type ProductScope = "main" | "ants" | "birds" | "fly" | "pet-tag" | "guard";

/** Directory name shared by the seed store and the uploads store. */
const SCOPE_DIRS: Record<ProductScope, string> = {
  main: "products",
  ants: "ants-products",
  birds: "birds-products",
  fly: "fly-products",
  "pet-tag": "pet-tag-products",
  guard: "guard-products",
};

/** API prefix that serves a scope's files, e.g. "/api/ants/products/file/". */
const SCOPE_ROUTES: Record<ProductScope, string> = {
  main: "/api/products/file/",
  ants: "/api/ants/products/file/",
  birds: "/api/birds/products/file/",
  fly: "/api/fly/products/file/",
  "pet-tag": "/api/pet-tag/products/file/",
  guard: "/api/guard/products/file/",
};

const INDEX_FILE = "index.json";
/** Ids of seed products the user deleted — seed files can't be unlinked. */
const TOMBSTONE_FILE = "deleted.json";

/** Writable store. User uploads land here. */
export function uploadsDir(scope: ProductScope): string {
  return path.join(process.cwd(), "uploads", SCOPE_DIRS[scope]);
}

/** Committed store. Read-only: it is tracked by git. */
export function seedDir(scope: ProductScope): string {
  return path.join(process.cwd(), "public", "product-images", SCOPE_DIRS[scope]);
}

/** Public URL the frontend uses to fetch a product file. */
export function productUrl(scope: ProductScope, filename: string): string {
  return `${SCOPE_ROUTES[scope]}${filename}`;
}

export async function ensureUploadsDir(scope: ProductScope): Promise<void> {
  await mkdir(uploadsDir(scope), { recursive: true });
}

async function exists(filepath: string): Promise<boolean> {
  try {
    await stat(filepath);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(filepath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filepath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function readTombstones(scope: ProductScope): Promise<string[]> {
  const ids = await readJson<string[]>(path.join(uploadsDir(scope), TOMBSTONE_FILE), []);
  return Array.isArray(ids) ? ids : [];
}

/** Products from the committed store. */
async function readSeedIndex<T extends StoredProduct>(scope: ProductScope): Promise<T[]> {
  const list = await readJson<T[]>(path.join(seedDir(scope), INDEX_FILE), []);
  return Array.isArray(list) ? list : [];
}

/** Products uploaded on this machine. */
async function readUploadsIndex<T extends StoredProduct>(scope: ProductScope): Promise<T[]> {
  const list = await readJson<T[]>(path.join(uploadsDir(scope), INDEX_FILE), []);
  return Array.isArray(list) ? list : [];
}

/**
 * The catalog every caller should use: seed products the user hasn't deleted,
 * plus everything uploaded locally. On id collision the local upload wins.
 */
export async function readProductIndex<T extends StoredProduct>(
  scope: ProductScope
): Promise<T[]> {
  const [seed, uploaded, tombstoned] = await Promise.all([
    readSeedIndex<T>(scope),
    readUploadsIndex<T>(scope),
    readTombstones(scope),
  ]);

  const deleted = new Set(tombstoned);
  const localIds = new Set(uploaded.map((p) => p.id));

  const fromSeed = seed.filter((p) => !deleted.has(p.id) && !localIds.has(p.id));
  return [...fromSeed, ...uploaded];
}

/**
 * Absolute path to a product file, preferring the uploads store.
 * Returns null when neither store has it.
 */
export async function resolveProductFile(
  scope: ProductScope,
  filename: string
): Promise<string | null> {
  // Never let a caller-supplied name escape the store directories.
  const safe = path.basename(filename);

  for (const dir of [uploadsDir(scope), seedDir(scope)]) {
    const candidate = path.join(dir, safe);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

/**
 * Reads a product file from whichever store holds it. Throws if missing.
 *
 * The return type is inferred: `readFile` yields `Buffer<ArrayBuffer>`, which
 * `NextResponse` accepts as a BodyInit — a bare `Buffer` annotation would widen
 * it to `Buffer<ArrayBufferLike>` and break the file routes.
 */
export async function readProductFile(scope: ProductScope, filename: string) {
  const filepath = await resolveProductFile(scope, filename);
  if (!filepath) throw new Error(`Product file not found: ${filename}`);
  return readFile(filepath);
}

/** Resolves a product by id, then returns the path to its file. */
export async function resolveProductFileById(
  scope: ProductScope,
  id: string
): Promise<string | null> {
  const product = (await readProductIndex<StoredProduct>(scope)).find((p) => p.id === id);
  return product ? resolveProductFile(scope, product.filename) : null;
}

/** Records a newly uploaded product. Only touches the uploads store. */
export async function addProduct<T extends StoredProduct>(
  scope: ProductScope,
  product: T
): Promise<void> {
  await ensureUploadsDir(scope);
  const uploaded = await readUploadsIndex<T>(scope);
  uploaded.push(product);
  await writeFile(
    path.join(uploadsDir(scope), INDEX_FILE),
    JSON.stringify(uploaded, null, 2)
  );
}

/**
 * Removes a product from the catalog.
 *
 * Locally uploaded products are deleted outright. Seed products live in git and
 * cannot be unlinked, so their id is tombstoned to keep them out of the catalog.
 */
export async function deleteProduct(scope: ProductScope, id: string): Promise<void> {
  await ensureUploadsDir(scope);

  const uploaded = await readUploadsIndex<StoredProduct>(scope);
  const local = uploaded.find((p) => p.id === id);

  if (local) {
    try {
      await unlink(path.join(uploadsDir(scope), local.filename));
    } catch {
      // Already gone — the index entry still needs removing.
    }
    await writeFile(
      path.join(uploadsDir(scope), INDEX_FILE),
      JSON.stringify(
        uploaded.filter((p) => p.id !== id),
        null,
        2
      )
    );
    return;
  }

  const seed = await readSeedIndex<StoredProduct>(scope);
  if (!seed.some((p) => p.id === id)) return;

  const tombstones = await readTombstones(scope);
  if (!tombstones.includes(id)) {
    await writeFile(
      path.join(uploadsDir(scope), TOMBSTONE_FILE),
      JSON.stringify([...tombstones, id], null, 2)
    );
  }
}
