import { uploadFile, downloadFile } from "@/lib/supabase-storage";

/**
 * Brand-vertical configs (pet-tag, ants, birds, fly) stored as JSON files in
 * Supabase Storage. The previous filesystem store silently lost every save on
 * Vercel (read-only, ephemeral). Cached in memory briefly so analyze/generate
 * requests don't re-download the config on every call.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { raw: Record<string, unknown>; at: number }>();

function pathFor(scope: string) {
  return `brand-config/${scope}.json`;
}

function isNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not.?found|does not exist|404/i.test(msg);
}

export async function readBrandConfigFile<T extends object>(
  scope: string,
  defaults: T
): Promise<T> {
  const hit = cache.get(scope);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...defaults, ...hit.raw };
  }
  try {
    const buf = await downloadFile("references", pathFor(scope));
    const raw = JSON.parse(buf.toString("utf-8")) as Record<string, unknown>;
    cache.set(scope, { raw, at: Date.now() });
    return { ...defaults, ...raw };
  } catch (err) {
    if (isNotFound(err)) {
      // No config saved yet — defaults ARE the real state; safe to cache.
      cache.set(scope, { raw: {}, at: Date.now() });
      return { ...defaults };
    }
    // Transient storage error: serve defaults for this read but never cache
    // them, so a failed read can't masquerade as "empty config" for 60s.
    return { ...defaults };
  }
}

/**
 * Read for read-modify-write flows (PUT / upload-pdf). Unlike the plain read,
 * a transient storage error THROWS instead of returning defaults — otherwise
 * the caller would merge onto defaults and overwrite the stored config.
 * Always reads fresh (no cache) so the merge base is current.
 */
export async function readBrandConfigFileForUpdate<T extends object>(
  scope: string,
  defaults: T
): Promise<T> {
  try {
    const buf = await downloadFile("references", pathFor(scope));
    const raw = JSON.parse(buf.toString("utf-8")) as Record<string, unknown>;
    cache.set(scope, { raw, at: Date.now() });
    return { ...defaults, ...raw };
  } catch (err) {
    if (isNotFound(err)) return { ...defaults };
    throw err;
  }
}

export async function writeBrandConfigFile(
  scope: string,
  config: object
): Promise<void> {
  await uploadFile(
    "references",
    pathFor(scope),
    Buffer.from(JSON.stringify(config, null, 2)),
    "application/json"
  );
  cache.set(scope, { raw: config as Record<string, unknown>, at: Date.now() });
}
