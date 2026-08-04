/**
 * Native Ads — Claude integration.
 *
 * Two server-side helpers:
 *   - buildNativePromptVariations(description, count)
 *       Turns a short Hebrew description from the user into N distinct
 *       English nano-banana prompts, each baked with UGC realism rules
 *       (no text, smartphone-grain, candid, organic-to-feed).
 *   - generatePestIdeas(pest, vibe)
 *       Given a pest + vibe (everyday / extreme / creative), produces
 *       5 Hebrew idea descriptions of that vibe for the user to pick
 *       from before generating images.
 *
 * Reuses the existing `extractJsonFromClaudeText` helper for robust
 * Sonnet 4.6 JSON parsing.
 */

import Anthropic from "@anthropic-ai/sdk";
import { extractJsonFromClaudeText } from "./claude-json";
import { getPestLabel, getVibeLabel, type NativePestId, type NativeVibeId } from "./native-ads-defaults";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

function getClient(): Anthropic {
  return new Anthropic();
}

/* ─────────────────────────────────────────────────────────────────── */
/* Mode 1: description → N nano-banana prompts                         */
/* ─────────────────────────────────────────────────────────────────── */

export interface PromptVariation {
  prompt: string;
}

const PROMPT_BUILDER_SYSTEM = `אתה עוזר ליצירת תמונות UGC ריאליסטיות שייראו כתוכן אורגני בפיד של פייסבוק/אינסטגרם.

אתה מקבל תיאור קצר בעברית. המשימה: לייצר מספר פרומפטים שונים באנגלית
ל-nano-banana-pro, כולם על אותו קונספט אבל מזוויות / רגעים / סצנות
שונות זו מזו (לא חזרה זהה).

עקרונות קריטיים שחייבים להופיע בכל פרומפט (באנגלית, בתוך הפרומפט):
1. "Shot on smartphone, candid, documentary style, natural lighting"
2. "NO text overlay, NO captions, NO watermarks, NO logos, NO product labels visible"
3. "Slightly imperfect framing — like a real person's quick phone snap"
4. "Photorealistic, NOT a stock photo, NOT an advertisement aesthetic"
5. "Authentic, slice-of-life moment, the kind of image you'd see in a real Facebook post or Instagram story"
6. אם הקונספט מבעית/מגעיל (ג'וק על אוכל וכו') — להעצים את האותנטיות ולא לרכך. זו הקסמיות של נייטיב — שזה מרגיש "אמיתי" וזה תופס את העין.
7. כשרלוונטי — להוסיף קונטקסט ישראלי (ריצוף בלטות מטבח ישראלי, מרפסת עם רעפים, מזגן ישראלי, ספה אפורה סטנדרטית) כדי שהקהל המקומי יזדהה.

הימנע (לעולם אל תכלול בפרומפט):
- אנשים מצולמים מהחזית במלואם (לכל היותר יד / כתף / סילואטה רחוקה)
- חיוכים מתוקים / סצנות "מוכרות"
- מותגים אמיתיים חוץ ממה שמופיע במציאות ישראלית
- "high quality", "4k", "8k", "masterpiece" — אלו לא ריאליסטיים, הם מילים של AI

פלט: JSON array בלבד, ללא טקסט נוסף. כל פריט: {"prompt": "..."}.
הפרומפט באנגלית, 3-6 משפטים, מתאר את הסצנה במלואה: סובייקט, רקע,
תאורה, זווית מצלמה, ופרטים שמוסיפים אותנטיות (קמט בבד, לכלוך קטן,
חפץ אקראי ברקע, וכו').`;

export async function buildNativePromptVariations(
  description: string,
  count: number
): Promise<PromptVariation[]> {
  const trimmed = description.trim();
  if (!trimmed) throw new Error("Description is empty");
  if (count < 1 || count > 10) throw new Error(`Invalid variation count: ${count}`);

  const client = getClient();

  const userMessage = `תיאור הסצנה (בעברית):
"""
${trimmed}
"""

ייצר בדיוק ${count} פרומפטים שונים בסגנון UGC — אותו קונספט, זוויות / רגעים / רקעים שונים.
החזר JSON array בלבד עם ${count} פריטים, כל אחד {"prompt": "..."}.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: PROMPT_BUILDER_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = message.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const cleaned = extractJsonFromClaudeText(textBlock.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse prompt variations JSON: ${err instanceof Error ? err.message : "unknown"}. Raw: ${cleaned.slice(0, 200)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array, got ${typeof parsed}`);
  }

  const variations: PromptVariation[] = [];
  for (const item of parsed) {
    if (item && typeof item === "object" && "prompt" in item && typeof (item as { prompt: unknown }).prompt === "string") {
      const p = ((item as { prompt: string }).prompt).trim();
      if (p) variations.push({ prompt: p });
    }
  }

  if (variations.length === 0) {
    throw new Error("Claude returned no valid prompts");
  }

  // Trim or pad to exact count. If Claude returned fewer, repeat the
  // last one as a fallback (better than failing the whole request).
  while (variations.length < count) variations.push({ ...variations[variations.length - 1] });
  return variations.slice(0, count);
}

/* ─────────────────────────────────────────────────────────────────── */
/* Mode 2: pest + vibe → 5 Hebrew idea descriptions                    */
/* ─────────────────────────────────────────────────────────────────── */

export interface PestIdea {
  idea: string;
}

const VIBE_GUIDANCE_HE: Record<NativeVibeId, string> = {
  everyday:
    'סיטואציות רגילות אבל מציקות שכל אחד נתקל בהן ביום-יום. תן רעיונות שיעוררו "אני מכיר את זה!".',
  extreme:
    'סיטואציה מוגזמת אבל אמינה שתגרום למשתמש לעצור ולהגיד "וואו". לא מצויר ולא דמיוני — אמיתי אבל קיצוני.',
  creative:
    "רעיון לא צפוי, זווית מקורית, רגע מצחיק או מוזר. שובר ציפיות אבל עדיין נשאר ריאלי.",
};

function buildIdeasSystemPrompt(pest: NativePestId, vibe: NativeVibeId): string {
  const pestLabel = getPestLabel(pest);
  const vibeLabel = getVibeLabel(vibe);
  const guidance = VIBE_GUIDANCE_HE[vibe];

  return `המשתמש בחר מזיק: ${pestLabel}. סגנון: ${vibeLabel}.

מטרת השימוש: יצירת תמונה נייטיב שתופסת עין בפיד פייסבוק/אינסטגרם —
לפרסומת של מוצר Bugo להרחקת המזיק הזה. לכן הרעיונות צריכים להראות
את הבעיה / המזיק בצורה ויזואלית חזקה.

מהות הסגנון "${vibeLabel}": ${guidance}

תן בדיוק 5 רעיונות שונים, כולם מהסגנון הזה (לא לערב סגנונות אחרים).
כל רעיון: שורה אחת בעברית, ספציפית למזיק ולסגנון.

חוקים:
- אל תזכיר את המוצר Bugo או שום מוצר אחר.
- אל תכלול אנשים מצולמים מהחזית (לכל היותר יד / כתף / סילואטה).
- אל תזכיר טקסט שיופיע על התמונה (אנחנו רוצים תמונה נקייה).
- כל רעיון צריך להיות חזותי וקונקרטי — מה רואים בתמונה.

פלט: JSON array בלבד, בלי טקסט נוסף. בדיוק 5 פריטים. כל פריט {"idea": "..."}.`;
}

export async function generatePestIdeas(
  pest: NativePestId,
  vibe: NativeVibeId
): Promise<PestIdea[]> {
  const client = getClient();
  const systemPrompt = buildIdeasSystemPrompt(pest, vibe);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `תן 5 רעיונות בסגנון "${getVibeLabel(vibe)}" עבור "${getPestLabel(pest)}". החזר JSON array.`,
      },
    ],
  });

  const textBlock = message.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const cleaned = extractJsonFromClaudeText(textBlock.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse ideas JSON: ${err instanceof Error ? err.message : "unknown"}. Raw: ${cleaned.slice(0, 200)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array, got ${typeof parsed}`);
  }

  const ideas: PestIdea[] = [];
  for (const item of parsed) {
    if (item && typeof item === "object" && "idea" in item && typeof (item as { idea: unknown }).idea === "string") {
      const t = ((item as { idea: string }).idea).trim();
      if (t) ideas.push({ idea: t });
    }
  }

  if (ideas.length === 0) {
    throw new Error("Claude returned no valid ideas");
  }

  // Trim to 5 (Claude may return more or fewer; we standardize on 5).
  return ideas.slice(0, 5);
}
