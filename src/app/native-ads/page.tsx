"use client";

/**
 * Native Ads — main page with two modes:
 *   Mode 1 ("Free description"): user types description → N variations × 2 sizes
 *   Mode 2 ("Pest + vibe"):       pick pest → pick vibe → 5 ideas → approve → generate
 *
 * All generated images auto-save to the Native Ads gallery
 * (POST /api/native-ads/gallery action=add-image) on completion.
 *
 * Pure text-to-image — no reference image, no product image, no upload step.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_VARIATION_COUNT,
  NATIVE_PEST_OPTIONS,
  NATIVE_VIBES,
  SIZES,
  VARIATION_COUNTS,
  type NativePestId,
  type NativeVibeId,
} from "@/lib/native-ads-defaults";

/* ───────── Types ───────── */

type Mode = "describe" | "pest";

interface GenerationJob {
  jobId: string;
  prompt: string;
  size: string;
  variationIndex: number;
  status: "pending" | "processing" | "completed" | "failed";
  resultUrl?: string;
  error?: string;
  savedToGallery?: boolean;
}

interface ActiveBatch {
  batchId: string;
  jobs: GenerationJob[];
  meta: { description: string; pestId: NativePestId | null; vibe: NativeVibeId | null };
  variationCount: number;
}

interface Idea {
  idea: string;
}

/* ───────── Helpers ───────── */

function downloadImage(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ───────── Component ───────── */

export default function NativeAdsPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("describe");

  /* ── Mode 1: free description ── */
  const [description, setDescription] = useState("");
  const [variationCount, setVariationCount] = useState<number>(DEFAULT_VARIATION_COUNT);

  /* ── Mode 2: pest + vibe + ideas ── */
  const [selectedPest, setSelectedPest] = useState<NativePestId | null>(null);
  const [selectedVibe, setSelectedVibe] = useState<NativeVibeId | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [selectedIdeaIndices, setSelectedIdeaIndices] = useState<Set<number>>(new Set());
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);

  /* ── Generation (shared between modes) ── */
  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasActiveJobs = useMemo(
    () =>
      batches.some((b) =>
        b.jobs.some((j) => j.status === "pending" || j.status === "processing")
      ),
    [batches]
  );

  /* ── Polling: every 5s, check jobs that are still pending/processing.
       When a job completes, auto-save it to the gallery (once). ── */
  useEffect(() => {
    if (!hasActiveJobs) return;
    let cancelled = false;

    const tick = async () => {
      for (const batch of batches) {
        for (const job of batch.jobs) {
          if (job.status !== "pending" && job.status !== "processing") continue;

          try {
            const res = await fetch(`/api/image-status?jobId=${job.jobId}`);
            if (!res.ok) continue;
            const data = await res.json();
            if (cancelled) return;

            if (data.status === job.status && !data.resultUrl) continue;

            setBatches((prev) =>
              prev.map((b) =>
                b.batchId !== batch.batchId
                  ? b
                  : {
                      ...b,
                      jobs: b.jobs.map((j) =>
                        j.jobId === job.jobId
                          ? {
                              ...j,
                              status: data.status,
                              resultUrl: data.resultUrl,
                              error: data.error,
                            }
                          : j
                      ),
                    }
              )
            );

            // Auto-save to gallery on first completion.
            if (data.status === "completed" && data.resultUrl && !job.savedToGallery) {
              try {
                await fetch("/api/native-ads/gallery", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "add-image",
                    sourceUrl: data.resultUrl,
                    prompt: job.prompt,
                    size: job.size,
                    description: batch.meta.description,
                    pestId: batch.meta.pestId || undefined,
                    vibe: batch.meta.vibe || undefined,
                    batchId: batch.batchId,
                  }),
                });
                if (!cancelled) {
                  setBatches((prev) =>
                    prev.map((b) =>
                      b.batchId !== batch.batchId
                        ? b
                        : {
                            ...b,
                            jobs: b.jobs.map((j) =>
                              j.jobId === job.jobId ? { ...j, savedToGallery: true } : j
                            ),
                          }
                    )
                  );
                }
              } catch (saveErr) {
                console.warn("Auto-save to gallery failed:", saveErr);
                // Non-fatal — image is still visible in the results panel.
              }
            }
          } catch {
            // Network blip — try again next tick.
          }
        }
      }
    };

    const interval = setInterval(tick, 5000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasActiveJobs, batches]);

  /* ── Submit handler (both modes funnel through this) ── */
  const submitGeneration = useCallback(
    async (
      desc: string,
      count: number,
      pestId: NativePestId | null,
      vibe: NativeVibeId | null
    ) => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const res = await fetch("/api/native-ads/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: desc,
            variationCount: count,
            pestId: pestId || undefined,
            vibe: vibe || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Generation request failed");
        }
        const newBatch: ActiveBatch = {
          batchId: data.batchId,
          variationCount: data.variationCount,
          meta: { description: desc, pestId, vibe },
          jobs: (data.jobs as Array<Omit<GenerationJob, "status">>).map((j) => ({
            ...j,
            status: "pending",
          })),
        };
        setBatches((prev) => [newBatch, ...prev]);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  /* ── Mode 1 submit ── */
  const handleMode1Submit = useCallback(() => {
    if (!description.trim()) return;
    submitGeneration(description.trim(), variationCount, null, null);
  }, [description, variationCount, submitGeneration]);

  /* ── Mode 2: fetch ideas ── */
  const fetchIdeas = useCallback(async () => {
    if (!selectedPest || !selectedVibe) return;
    setIdeasLoading(true);
    setIdeasError(null);
    setIdeas(null);
    setSelectedIdeaIndices(new Set());
    try {
      const res = await fetch("/api/native-ads/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pestId: selectedPest, vibe: selectedVibe }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to fetch ideas");
      setIdeas(data.ideas || []);
    } catch (err) {
      setIdeasError(err instanceof Error ? err.message : String(err));
    } finally {
      setIdeasLoading(false);
    }
  }, [selectedPest, selectedVibe]);

  /* ── Mode 2: generate from approved ideas ── */
  const handleMode2Submit = useCallback(async () => {
    if (!ideas || !selectedPest || !selectedVibe) return;
    if (selectedIdeaIndices.size === 0) return;
    for (const idx of Array.from(selectedIdeaIndices)) {
      const idea = ideas[idx];
      if (!idea) continue;
      await submitGeneration(idea.idea, DEFAULT_VARIATION_COUNT, selectedPest, selectedVibe);
    }
    // Clear selection so user can pick more / different ideas if they want.
    setSelectedIdeaIndices(new Set());
  }, [ideas, selectedIdeaIndices, selectedPest, selectedVibe, submitGeneration]);

  /* ──────────── UI ──────────── */

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-rose-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-rose-100 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← דף הבית
          </button>
          <h1 className="text-lg font-bold text-rose-700">Native Ads — תמונות UGC ריאליסטיות</h1>
          <button
            onClick={() => router.push("/native-ads/gallery")}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100 transition-colors"
          >
            📁 גלריה
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Mode tabs */}
        <div className="flex gap-2 mb-6 border-b border-rose-100">
          <button
            type="button"
            onClick={() => setMode("describe")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === "describe"
                ? "border-rose-600 text-rose-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            ✍️ תיאור חופשי
          </button>
          <button
            type="button"
            onClick={() => setMode("pest")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === "pest"
                ? "border-rose-600 text-rose-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            🐛 בחירת מזיק
          </button>
        </div>

        {/* ─── Mode 1: free description ─── */}
        {mode === "describe" && (
          <section className="bg-white rounded-xl border border-rose-100 p-5 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              מה אתה רוצה לראות בתמונה?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              dir="rtl"
              placeholder="לדוגמה: ג'וקים בארונות במטבח עם פסטה על הצלחת, צילום מהסמארטפון בלילה"
              className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none"
            />

            <div className="mt-4">
              <span className="block text-sm font-medium text-gray-700 mb-2">כמה גרסאות?</span>
              <div className="inline-flex gap-2">
                {VARIATION_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setVariationCount(n)}
                    className={`min-w-[56px] py-2 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      variationCount === n
                        ? "border-rose-500 bg-rose-50 text-rose-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                כל גרסה תיווצר ב-2 גדלים (1:1 + 9:16). 3 גרסאות = 6 תמונות סה"כ.
              </p>
            </div>

            <button
              type="button"
              onClick={handleMode1Submit}
              disabled={!description.trim() || submitting}
              className="mt-5 w-full rounded-lg bg-rose-600 text-white font-bold py-3 hover:bg-rose-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "שולח..." : "ייצר תמונות"}
            </button>
            {submitError && <p className="text-sm text-red-600 mt-2">{submitError}</p>}
          </section>
        )}

        {/* ─── Mode 2: pest + vibe + ideas ─── */}
        {mode === "pest" && (
          <section className="bg-white rounded-xl border border-rose-100 p-5 shadow-sm">
            {/* Step 1: pest grid */}
            <h3 className="text-sm font-semibold text-gray-700 mb-3">1. איזה מזיק?</h3>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-6">
              {NATIVE_PEST_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedPest(p.id);
                    setIdeas(null);
                    setSelectedIdeaIndices(new Set());
                  }}
                  className={`flex flex-col items-center justify-center min-h-[80px] rounded-lg border-2 p-2 transition-colors ${
                    selectedPest === p.id
                      ? "border-rose-500 bg-rose-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className="text-2xl">{p.icon}</span>
                  <span className="text-xs font-medium text-gray-700 mt-1">{p.labelHe}</span>
                </button>
              ))}
            </div>

            {/* Step 2: vibe selector */}
            {selectedPest && (
              <>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">2. איזה סגנון?</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6">
                  {NATIVE_VIBES.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSelectedVibe(v.id);
                        setIdeas(null);
                        setSelectedIdeaIndices(new Set());
                      }}
                      className={`flex flex-col items-start text-right rounded-lg border-2 p-3 transition-colors ${
                        selectedVibe === v.id
                          ? "border-rose-500 bg-rose-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span className="text-xl mb-1">
                        {v.emoji} <span className="font-bold text-gray-900">{v.labelHe}</span>
                      </span>
                      <span className="text-xs text-gray-600">{v.descriptionHe}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step 3: fetch ideas button */}
            {selectedPest && selectedVibe && (
              <button
                type="button"
                onClick={fetchIdeas}
                disabled={ideasLoading}
                className="mb-4 w-full rounded-lg bg-rose-600 text-white font-bold py-3 hover:bg-rose-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {ideasLoading ? "חושב על רעיונות..." : ideas ? "🔄 5 רעיונות חדשים" : "💡 צור 5 רעיונות"}
              </button>
            )}
            {ideasError && <p className="text-sm text-red-600 mb-3">{ideasError}</p>}

            {/* Step 4: ideas with checkboxes */}
            {ideas && ideas.length > 0 && (
              <>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  3. בחר אילו רעיונות להפוך לתמונות:
                </h3>
                <div className="space-y-2 mb-4">
                  {ideas.map((idea, idx) => {
                    const checked = selectedIdeaIndices.has(idx);
                    return (
                      <label
                        key={idx}
                        className={`flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-colors ${
                          checked ? "border-rose-500 bg-rose-50" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedIdeaIndices((prev) => {
                              const next = new Set(prev);
                              if (next.has(idx)) next.delete(idx);
                              else next.add(idx);
                              return next;
                            });
                          }}
                          className="mt-1 w-5 h-5 accent-rose-600"
                        />
                        <span className="text-sm text-gray-800 flex-1">{idea.idea}</span>
                      </label>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleMode2Submit}
                  disabled={selectedIdeaIndices.size === 0 || submitting}
                  className="w-full rounded-lg bg-rose-600 text-white font-bold py-3 hover:bg-rose-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting
                    ? "שולח..."
                    : `🎨 ייצר תמונות מ-${selectedIdeaIndices.size} רעיונות (${selectedIdeaIndices.size * DEFAULT_VARIATION_COUNT * 2} תמונות סה"כ)`}
                </button>
                {submitError && <p className="text-sm text-red-600 mt-2">{submitError}</p>}
              </>
            )}
          </section>
        )}

        {/* ─── Results: batches with images ─── */}
        {batches.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              תוצאות ({batches.length} {batches.length === 1 ? "בקשה" : "בקשות"})
            </h2>
            <div className="space-y-6">
              {batches.map((batch) => {
                const totalJobs = batch.jobs.length;
                const completed = batch.jobs.filter((j) => j.status === "completed").length;
                const failed = batch.jobs.filter((j) => j.status === "failed").length;
                return (
                  <div key={batch.batchId} className="bg-white border border-rose-100 rounded-xl p-4">
                    <div className="flex justify-between items-start mb-3 gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {batch.meta.description}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {batch.variationCount} גרסאות × 2 גדלים = {totalJobs} תמונות
                          {batch.meta.pestId && ` · ${batch.meta.pestId} · ${batch.meta.vibe}`}
                        </p>
                      </div>
                      <span className="text-xs whitespace-nowrap shrink-0 rounded-full bg-gray-100 px-2 py-1">
                        {completed}/{totalJobs} מוכן {failed > 0 && `· ${failed} נכשלו`}
                      </span>
                    </div>

                    {/* Group jobs by variationIndex; each group shows 1:1 + 9:16 side by side */}
                    {Array.from({ length: batch.variationCount }).map((_, varIdx) => {
                      const jobsForVar = batch.jobs.filter((j) => j.variationIndex === varIdx);
                      return (
                        <div key={varIdx} className="grid grid-cols-2 gap-3 mb-3 last:mb-0">
                          {SIZES.map((size) => {
                            const job = jobsForVar.find((j) => j.size === size);
                            return (
                              <div
                                key={size}
                                className="bg-gray-50 rounded-lg overflow-hidden aspect-square relative"
                                style={size === "9:16" ? { aspectRatio: "9 / 16" } : {}}
                              >
                                {!job ? (
                                  <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
                                    לא הוגש
                                  </div>
                                ) : job.status === "completed" && job.resultUrl ? (
                                  <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={job.resultUrl}
                                      alt={`גרסה ${varIdx + 1} ${size}`}
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 flex justify-between items-end">
                                      <span className="text-white text-xs font-medium">{size}</span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          downloadImage(
                                            job.resultUrl!,
                                            `native-${batch.batchId}-v${varIdx + 1}-${size.replace(":", "x")}.png`
                                          )
                                        }
                                        className="text-white text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded backdrop-blur-sm"
                                      >
                                        ⬇ הורד
                                      </button>
                                    </div>
                                    {job.savedToGallery && (
                                      <div className="absolute top-1 left-1 bg-green-500/90 text-white text-xs px-2 py-0.5 rounded-full">
                                        ✓ נשמר בגלריה
                                      </div>
                                    )}
                                  </>
                                ) : job.status === "failed" ? (
                                  <div className="absolute inset-0 flex items-center justify-center text-xs text-red-600 text-center p-2">
                                    נכשל: {job.error || "—"}
                                  </div>
                                ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                    <div className="w-8 h-8 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin" />
                                    <span className="text-xs text-gray-500">{size} · מייצר...</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
