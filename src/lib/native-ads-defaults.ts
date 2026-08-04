/**
 * Native Ads — defaults and shared constants.
 *
 * "Native ads" are ultra-realistic UGC-style images (look like a real
 * person's smartphone photo, organic to a Facebook/Instagram feed).
 * Completely isolated from the existing 5 sections (Bugo main / Fly /
 * Pet-Tag / Replicator / Birds) — own gallery, own routes, own libs.
 */

export const NATIVE_PEST_OPTIONS = [
  { id: "cockroaches", labelHe: "ג'וקים",       icon: "🪳" },
  { id: "bedbugs",     labelHe: "פשפשי מיטה",   icon: "🛏️" },
  { id: "mice",        labelHe: "עכברים",       icon: "🐭" },
  { id: "snakes",      labelHe: "נחשים",        icon: "🐍" },
  { id: "pigeons",     labelHe: "יונים",        icon: "🕊️" },
  { id: "flies",       labelHe: "זבובים",       icon: "🪰" },
  { id: "mosquitoes",  labelHe: "יתושים",       icon: "🦟" },
  { id: "ants",        labelHe: "נמלים",        icon: "🐜" },
] as const;

export type NativePestId = typeof NATIVE_PEST_OPTIONS[number]["id"];

export const NATIVE_VIBES = [
  {
    id: "everyday",
    labelHe: "יומיומי",
    descriptionHe: "סיטואציות רגילות אבל מציקות שכל אחד מכיר",
    emoji: "🏠",
  },
  {
    id: "extreme",
    labelHe: "קיצון",
    descriptionHe: "מוגזם אבל אמין — שיגרום לעצור את האגודל בגלילה",
    emoji: "🔥",
  },
  {
    id: "creative",
    labelHe: "יצירתי",
    descriptionHe: "זווית מקורית, רגע לא צפוי, מצחיק או מוזר",
    emoji: "🎨",
  },
] as const;

export type NativeVibeId = typeof NATIVE_VIBES[number]["id"];

export const VARIATION_COUNTS = [1, 3, 5] as const;
export const DEFAULT_VARIATION_COUNT = 3;
export const SIZES = ["1:1", "9:16"] as const;
export type NativeSize = typeof SIZES[number];

export function getPestLabel(id: NativePestId): string {
  return NATIVE_PEST_OPTIONS.find((p) => p.id === id)?.labelHe || id;
}

export function getVibeLabel(id: NativeVibeId): string {
  return NATIVE_VIBES.find((v) => v.id === id)?.labelHe || id;
}
