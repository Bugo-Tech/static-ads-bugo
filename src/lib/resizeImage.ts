import sharp from "sharp";

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Claude's image limit is 5MB — resize anything over 4MB (margin) down to a
 * 1024px JPEG. Replaces the old macOS-only `sips` shell-out, which does not
 * exist on Vercel's Linux runtime and blocked the event loop locally.
 */
export async function resizeForClaudeIfNeeded(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (buffer.length <= MAX_BYTES) return { buffer, mimeType };

  const resized = await sharp(buffer)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  return { buffer: resized, mimeType: "image/jpeg" };
}
