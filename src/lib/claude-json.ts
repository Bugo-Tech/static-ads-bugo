/**
 * Extracts a parseable JSON object/array from Claude's response text.
 *
 * Handles Sonnet 4.6 quirks that broke the older naive parsers:
 *   1. Markdown code fences ("```json\n{...}\n```" or "```\n{...}\n```")
 *   2. Prose preamble ("Here is the analysis:\n{...}")
 *   3. Prose postamble ("{...}\n\nLet me know if you need clarification.")
 *   4. Trailing commas inside objects/arrays
 *   5. Asymmetric or missing closing fences
 *
 * Mirrors the proven parser in src/app/api/replicator/analyze/route.ts.
 * Use anywhere a Claude response is expected to be JSON.
 */
export function extractJsonFromClaudeText(rawText: string): string {
  let jsonStr = rawText.trim();

  // 1. Strip markdown code fences if present.
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonStr = fence[1].trim();

  // 2. Find the first `{` or `[` — skip any prose preamble Claude added.
  //    (Also covers the case where the fence regex above didn't match because
  //    the closing ``` was missing — we still recover by finding the JSON
  //    start directly.)
  const startObj = jsonStr.indexOf("{");
  const startArr = jsonStr.indexOf("[");
  let start = -1;
  if (startObj >= 0 && startArr >= 0) start = Math.min(startObj, startArr);
  else if (startObj >= 0) start = startObj;
  else if (startArr >= 0) start = startArr;
  if (start > 0) jsonStr = jsonStr.slice(start);

  // 3. Walk to the balanced closing brace/bracket using depth counting —
  //    truncates any postamble Claude added after the JSON.
  if (jsonStr.length > 0) {
    const opener = jsonStr[0];
    const closer = opener === "[" ? "]" : "}";
    let depth = 0;
    let end = -1;
    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === opener) depth++;
      if (jsonStr[i] === closer) depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end > 0) jsonStr = jsonStr.slice(0, end);
  }

  // 4. Tolerate trailing commas inside objects/arrays (4.6 quirk).
  return jsonStr.replace(/,\s*([}\]])/g, "$1");
}
