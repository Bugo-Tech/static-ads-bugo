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

  const snippet = trimmed.slice(0, SNIPPET_LENGTH).replace(/\s+/g, " ");
  const looksLikeHtml = /^<(!doctype|html)/i.test(trimmed);

  return looksLikeHtml
    ? `server returned an HTML page instead of JSON: ${snippet}`
    : snippet;
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
