const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Claude's image limit is 5MB — resize anything over 4MB (margin) down to a
 * 1024px JPEG. Replaces the old macOS-only `sips` shell-out, which does not
 * exist on Vercel's Linux runtime and blocked the event loop locally.
 *
 * sharp is imported lazily, on purpose. It is a native module: if its platform
 * binary is missing from the deployed bundle, a top-level `import sharp` throws
 * while the module is being loaded — before any route handler runs, and so
 * before any try/catch can turn it into a JSON error. Every analyze route
 * imports this file, so one missing binary took all six of them down at once
 * and the browser got Vercel's HTML crash page instead of an answer.
 *
 * Loading it here means the common path — images at or under 4MB, which is most
 * of them — never touches sharp at all, and a genuinely oversized image fails
 * with a message that says what happened.
 */
export async function resizeForClaudeIfNeeded(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (buffer.length <= MAX_BYTES) return { buffer, mimeType };

  let sharp: (typeof import("sharp"))["default"];
  try {
    sharp = (await import("sharp")).default;
  } catch (err) {
    const mb = (buffer.length / 1024 / 1024).toFixed(1);
    throw new Error(
      `This image is ${mb}MB and has to be resized before analysis, but the image library failed to load on the server (${
        err instanceof Error ? err.message : String(err)
      }). Upload a smaller image, or report this.`
    );
  }

  const resized = await sharp(buffer)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  return { buffer: resized, mimeType: "image/jpeg" };
}
