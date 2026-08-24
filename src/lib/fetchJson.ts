/**
 * Reads a fetch Response without destroying the real error.
 *
 * The pattern this replaces was, in every workflow page:
 *
 *     const data = await res.json();
 *     if (!res.ok) throw new Error(data.error || "…");
 *
 * `res.json()` runs first, so any non-JSON body throws a SyntaxError before the
 * status is ever consulted — and the actual failure is replaced by
 * "Unexpected token '<'". That mattered because the three failures most likely
 * in production all return HTML:
 *
 *   - a Vercel function timeout  → HTML error page, status 504
 *   - the auth middleware        → 307 to /login, which fetch follows, giving
 *                                  the login page as HTML with status 200
 *   - a request body over 4.5MB  → HTML 413 from the edge
 *
 * Note the middleware case has `res.ok === true`, so merely reordering the
 * status check would not have caught it either. Hence: parse, and if the body
 * is not JSON, say so loudly with the status and a snippet of what came back.
 */

/** How much of a non-JSON body to include in the error message. */
const SNIPPET_LENGTH = 200;

function describeBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "(empty response body)";

  if (!/^<(!doctype|html)/i.test(trimmed)) {
    return trimmed.slice(0, SNIPPET_LENGTH).replace(/\s+/g, " ");
  }

  // An HTML body is a platform error page. Raw markup is useless in a UI
  // message, and the part that names the failure ("FUNCTION_INVOCATION_FAILED",
  // "FUNCTION_INVOCATION_TIMEOUT") sits in the <title> or the visible text —
  // past where a raw snippet would have been cut off. Pull those out instead.
  const title = trimmed.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  let text = trimmed
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // The <title> is normally repeated in the visible text. Dropping the repeat
  // keeps the character budget for the part that actually names the failure —
  // "Code: FUNCTION_INVOCATION_FAILED" sits at the end of these pages.
  if (title && text.startsWith(title)) {
    text = text.slice(title.length).trim();
  }

  const detail = [title, text].filter(Boolean).join(" — ").slice(0, SNIPPET_LENGTH);
  return `server returned an HTML page instead of JSON: ${detail || "(no readable text)"}`;
}

/**
 * Parses a Response, throwing an Error whose message always identifies what
 * actually happened — including the HTTP status — so a failure is diagnosable
 * from the UI alone.
 */
export async function readJsonResponse<T = unknown>(res: Response): Promise<T> {
  // Read the body exactly once, as text — a stream can only be consumed once,
  // and we need the raw text to report on it when it is not JSON.
  const raw = await res.text();

  let parsed: unknown;
  let isJson = true;
  try {
    parsed = raw ? JSON.parse(raw) : undefined;
  } catch {
    isJson = false;
  }

  if (!res.ok) {
    const fromBody =
      isJson && parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : describeBody(raw);
    throw new Error(`HTTP ${res.status} — ${fromBody}`);
  }

  // A 2xx that is not JSON means something intercepted the request — most
  // often the auth middleware handing back the login page.
  if (!isJson) {
    throw new Error(`HTTP ${res.status} but ${describeBody(raw)}`);
  }

  // Every caller here expects an object. Saying so beats handing back
  // undefined and letting a property access throw somewhere less obvious.
  if (parsed === undefined || parsed === null) {
    throw new Error(`HTTP ${res.status} with an empty response body`);
  }

  return parsed as T;
}

/** Convenience wrapper: fetch, then readJsonResponse. */
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  return readJsonResponse<T>(await fetch(input, init));
}
