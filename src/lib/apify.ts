/**
 * Apify wrapper — Facebook Ads Library scraper.
 *
 * Server-only. Uses async pattern (start run → poll status → fetch dataset)
 * because the FB ads scraper can take 5-7 minutes to finish, exceeding
 * the run-sync 300s timeout. Returns NormalizedAd shape the UI can consume.
 */

const APIFY_ACTOR_ID = "apify~facebook-ads-scraper";
const APIFY_BASE = "https://api.apify.com/v2";

export type AdActiveStatus = "active" | "inactive" | "";

export interface NormalizedAd {
  adId: string;
  pageName: string;
  pageId: string;
  text: string;
  title: string;
  ctaText: string;
  linkUrl: string;
  imageUrls: string[];
  videoUrls: string[];
  startDate: string;
  endDate: string;
  isActive: boolean;
  snapshotUrl: string;
  raw: Record<string, unknown>;
}

export interface StartRunOptions {
  url: string;
  limit?: number;
  activeStatus?: AdActiveStatus;
}

export interface StartRunResult {
  runId: string;
  datasetId: string;
}

export type ApifyRunStatus =
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "TIMING-OUT"
  | "TIMED-OUT"
  | "ABORTING"
  | "ABORTED";

function getToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN not set in environment");
  return token;
}

export async function startAdsRun({
  url,
  limit = 10,
  activeStatus = "active",
}: StartRunOptions): Promise<StartRunResult> {
  const token = getToken();
  const apiUrl = `${APIFY_BASE}/acts/${APIFY_ACTOR_ID}/runs?token=${encodeURIComponent(token)}`;
  const body = {
    startUrls: [{ url }],
    resultsLimit: Math.max(1, Math.min(limit, 200)),
    activeStatus,
    onlyTotal: false,
    includeAboutPage: false,
    isDetailsPerAd: false,
  };

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Apify start error (${res.status}): ${errText.slice(0, 500)}`);
  }
  const data = (await res.json()) as { data?: { id?: string; defaultDatasetId?: string } };
  const runId = data.data?.id;
  const datasetId = data.data?.defaultDatasetId;
  if (!runId || !datasetId) {
    throw new Error("Apify start: missing runId/datasetId in response");
  }
  return { runId, datasetId };
}

export async function getRunStatus(runId: string): Promise<ApifyRunStatus> {
  const token = getToken();
  const apiUrl = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
  const res = await fetch(apiUrl, { cache: "no-store" });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Apify status error (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: { status?: ApifyRunStatus } };
  return (data.data?.status || "RUNNING") as ApifyRunStatus;
}

export async function getDatasetAds(datasetId: string): Promise<NormalizedAd[]> {
  const token = getToken();
  const apiUrl = `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(
    token
  )}&format=json&clean=true`;
  const res = await fetch(apiUrl, { cache: "no-store" });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Apify dataset error (${res.status}): ${errText.slice(0, 200)}`);
  }
  const items = (await res.json()) as unknown;
  if (!Array.isArray(items)) return [];
  return items.map(normalize).filter((ad): ad is NormalizedAd => ad !== null);
}

export async function abortRun(runId: string): Promise<void> {
  const token = getToken();
  const apiUrl = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}/abort?token=${encodeURIComponent(token)}`;
  await fetch(apiUrl, { method: "POST" }).catch(() => {});
}

function normalize(raw: unknown): NormalizedAd | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const snapshot = (r.snapshot ?? {}) as Record<string, unknown>;
  const body = (snapshot.body ?? {}) as Record<string, unknown>;
  const cards = Array.isArray(snapshot.cards) ? (snapshot.cards as Record<string, unknown>[]) : [];
  const images = Array.isArray(snapshot.images) ? (snapshot.images as Record<string, unknown>[]) : [];
  const videos = Array.isArray(snapshot.videos) ? (snapshot.videos as Record<string, unknown>[]) : [];

  const imageUrls = collectImageUrls(snapshot, cards, images);
  const videoUrls = collectVideoUrls(videos, cards);

  const adId = pickString(r, ["adArchiveID", "adArchiveId", "ad_archive_id", "adId", "id"]);
  if (!adId) return null;

  const text =
    pickString(body, ["text", "markup_text"]) ||
    pickString(cards[0] ?? {}, ["body"]) ||
    pickString(r, ["adText", "text"]) ||
    "";

  const title =
    pickString(snapshot, ["title", "link_description"]) ||
    pickString(cards[0] ?? {}, ["title"]) ||
    "";

  const ctaText =
    pickString(snapshot, ["ctaText", "cta_text"]) ||
    pickString(cards[0] ?? {}, ["ctaText", "cta_text"]) ||
    "";

  const linkUrl =
    pickString(snapshot, ["linkUrl", "link_url"]) ||
    pickString(cards[0] ?? {}, ["linkUrl", "link_url"]) ||
    "";

  const pageName =
    pickString(r, ["pageName", "page_name"]) ||
    pickString(snapshot, ["pageName", "page_name"]) ||
    "";

  const pageId =
    pickString(r, ["pageId", "page_id"]) ||
    pickString(snapshot, ["pageId", "page_id"]) ||
    "";

  const startDate =
    pickString(r, ["startDateFormatted", "start_date_formatted"]) ||
    pickTimestampString(r, ["startDate", "start_date"]) ||
    "";

  const endDate =
    pickString(r, ["endDateFormatted", "end_date_formatted"]) ||
    pickTimestampString(r, ["endDate", "end_date"]) ||
    "";

  const isActive = pickBool(r, ["isActive", "is_active"]) ?? true;
  const snapshotUrl = pickString(r, ["url", "adSnapshotUrl", "ad_snapshot_url"]) || "";

  return {
    adId,
    pageName,
    pageId,
    text,
    title,
    ctaText,
    linkUrl,
    imageUrls,
    videoUrls,
    startDate,
    endDate,
    isActive,
    snapshotUrl,
    raw: r,
  };
}

function collectImageUrls(
  snapshot: Record<string, unknown>,
  cards: Record<string, unknown>[],
  images: Record<string, unknown>[]
): string[] {
  const urls = new Set<string>();
  // Plain image ads
  for (const img of images) {
    const u = pickString(img, ["originalImageUrl", "original_image_url", "resizedImageUrl", "resized_image_url"]);
    if (u) urls.add(u);
  }
  // Cards (carousel) — may contain images OR video previews
  for (const card of cards) {
    const u =
      pickString(card, ["originalImageUrl", "original_image_url", "resizedImageUrl", "resized_image_url"]) ||
      pickString(card, ["videoPreviewImageUrl", "video_preview_image_url"]);
    if (u) urls.add(u);
  }
  // Video ads — the preview frame IS a usable static reference
  const videos = Array.isArray(snapshot.videos) ? (snapshot.videos as Record<string, unknown>[]) : [];
  for (const v of videos) {
    const u = pickString(v, ["videoPreviewImageUrl", "video_preview_image_url"]);
    if (u) urls.add(u);
  }
  // Extra media buckets some snapshots use
  const extraImages = Array.isArray(snapshot.extraImages) ? (snapshot.extraImages as Record<string, unknown>[]) : [];
  for (const img of extraImages) {
    const u = pickString(img, ["originalImageUrl", "original_image_url", "resizedImageUrl", "resized_image_url"]);
    if (u) urls.add(u);
  }
  const extraVideos = Array.isArray(snapshot.extraVideos) ? (snapshot.extraVideos as Record<string, unknown>[]) : [];
  for (const v of extraVideos) {
    const u = pickString(v, ["videoPreviewImageUrl", "video_preview_image_url"]);
    if (u) urls.add(u);
  }
  const single = pickString(snapshot, ["imageUrl", "image_url"]);
  if (single) urls.add(single);
  return Array.from(urls);
}

function collectVideoUrls(videos: Record<string, unknown>[], cards: Record<string, unknown>[]): string[] {
  const urls = new Set<string>();
  for (const v of videos) {
    const u = pickString(v, ["videoHdUrl", "video_hd_url", "videoSdUrl", "video_sd_url", "videoUrl", "video_url"]);
    if (u) urls.add(u);
  }
  for (const card of cards) {
    const u = pickString(card, ["videoHdUrl", "video_hd_url", "videoSdUrl", "video_sd_url", "videoUrl", "video_url"]);
    if (u) urls.add(u);
  }
  return Array.from(urls);
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return "";
}

function pickBool(obj: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "boolean") return v;
  }
  return undefined;
}

function pickTimestampString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && v > 0) {
      const ms = v < 1e12 ? v * 1000 : v;
      return new Date(ms).toISOString().slice(0, 10);
    }
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return "";
}
