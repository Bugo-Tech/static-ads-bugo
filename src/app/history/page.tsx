"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { HistoryEntry } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import CopyEditor from "../components/CopyEditor";
import PromptEditor from "../components/PromptEditor";
import { CopyVariation, Language } from "@/lib/types";

export default function HistoryPage() {
  const { isAdmin } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [genProgress, setGenProgress] = useState<Record<string, { total: number; done: number; failed: number }>>({});
  // Per-entry: which variation is being viewed, and which are selected for generation
  const [viewingVariation, setViewingVariation] = useState<Record<string, string>>({});
  const [selectedForGen, setSelectedForGen] = useState<Record<string, string[]>>({});
  const [productImageIds, setProductImageIds] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => {});
    // Load product library for re-generation
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        const prods = data.products || [];
        setProductImageIds(prods.map((p: { id: string }) => p.id));
      })
      .catch(() => {});
  }, []);

  async function handleDelete(id: string) {
    await fetch(`/api/history?id=${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function getViewingVariation(entryId: string, entry: HistoryEntry): string {
    return viewingVariation[entryId] || entry.copyVariations[0]?.id || "";
  }

  function getSelectedForGen(entryId: string, entry: HistoryEntry): string[] {
    return selectedForGen[entryId] || [entry.copyVariations[0]?.id || ""];
  }

  function toggleVariationForGen(entryId: string, variationId: string, entry: HistoryEntry) {
    setSelectedForGen((prev) => {
      const current = prev[entryId] || [entry.copyVariations[0]?.id || ""];
      const has = current.includes(variationId);
      const updated = has ? current.filter((id) => id !== variationId) : [...current, variationId];
      return { ...prev, [entryId]: updated.length > 0 ? updated : current };
    });
  }

  function updateEntryCopy(entryId: string, variationId: string, sectionId: string, text: string) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        return {
          ...e,
          copyVariations: e.copyVariations.map((v) => {
            if (v.id !== variationId) return v;
            return {
              ...v,
              sections: v.sections.map((s) =>
                s.id === sectionId ? { ...s, adaptedText: text } : s
              ),
            };
          }),
        };
      })
    );
  }

  function updateEntryPrompt(entryId: string, prompt: string) {
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, prompt } : e))
    );
  }

  async function handleRegenerate(entry: HistoryEntry, variationIds: string[]) {
    setGenerating((prev) => new Set([...prev, entry.id]));

    const variations = variationIds
      .map((vId) => entry.copyVariations.find((v) => v.id === vId))
      .filter(Boolean) as CopyVariation[];

    if (variations.length === 0 && entry.copyVariations.length > 0) {
      variations.push(entry.copyVariations[0]);
    }

    const sizes: ("1:1" | "9:16")[] = ["1:1", "9:16"];

    // Save updated copy before generating
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: entry.id,
        updates: { prompt: entry.prompt, copyVariations: entry.copyVariations },
      }),
    });

    // Generate for each variation x size
    const totalImages = variations.length * sizes.length;
    setGenProgress((prev) => ({ ...prev, [entry.id]: { total: totalImages, done: 0, failed: 0 } }));

    let successCount = 0;
    for (const variation of variations) {
      for (const size of sizes) {
        try {
          const res = await fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: entry.prompt,
              referenceImageUrl: entry.uploadedUrl,
              productImageIds,
              size,
              copyVariation: variation,
            }),
          });
          const data = await res.json();
          if (data.jobId) {
            successCount++;
            pollAndSave(entry.id, data.jobId, size, variation.angle || "");
          }
        } catch {
          // continue with other generations
        }
      }
    }

    // Don't clear generating here — it clears when progress shows all done
    // The progress bar handles the visual state
  }

  async function pollAndSave(entryId: string, jobId: string, size: string, angle: string) {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/image-status?jobId=${jobId}`);
        const data = await res.json();
        if (data.status === "completed" && data.resultUrl) {
          await fetch("/api/gallery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "add-image",
              sourceUrl: data.resultUrl,
              prompt: "",
              size,
              angle,
              folderId: "root",
            }),
          });
          setGenProgress((prev) => {
            const p = prev[entryId] || { total: 0, done: 0, failed: 0 };
            const updated = { ...p, done: p.done + 1 };
            // Clear generating when all done
            if (updated.done + updated.failed >= updated.total) {
              setGenerating((g) => { const n = new Set(g); n.delete(entryId); return n; });
            }
            return { ...prev, [entryId]: updated };
          });
          return;
        }
        if (data.status === "failed") {
          setGenProgress((prev) => {
            const p = prev[entryId] || { total: 0, done: 0, failed: 0 };
            const updated = { ...p, failed: p.failed + 1 };
            if (updated.done + updated.failed >= updated.total) {
              setGenerating((g) => { const n = new Set(g); n.delete(entryId); return n; });
            }
            return { ...prev, [entryId]: updated };
          });
          return;
        }
      } catch {
        // retry
      }
    }
  }

  const expanded = entries.find((e) => e.id === expandedId);

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-bold text-gray-900">Previous Ads</h1>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {entries.length} analyzed
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {entries.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border py-16 text-center">
            <p className="text-sm text-gray-400">No previous ads yet</p>
            <p className="mt-1 text-xs text-gray-400">Analyzed ads will appear here automatically</p>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const isGenerating = generating.has(entry.id);

              return (
                <div key={entry.id} className="rounded-2xl border border-border bg-white overflow-hidden">
                  {/* Collapsed header */}
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <img
                      src={entry.uploadedUrl || entry.referencePreviewUrl}
                      alt="Reference"
                      className="h-20 w-20 rounded-lg border border-border object-contain bg-gray-50 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          entry.analysis.niche === "pest-control"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {entry.analysis.niche === "pest-control" ? "Same Niche" : "Cross-Niche"}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(entry.createdAt).toLocaleDateString("he-IL")} {new Date(entry.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-700 truncate">{entry.analysis.angle}</p>
                      <p className="text-xs text-gray-400">{entry.copyVariations.length} variations</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(entry.id);
                          }}
                          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                      <svg className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-border p-6 space-y-4">
                      {/* Reference image full view */}
                      <div className="flex gap-4">
                        <div className="w-48 flex-shrink-0">
                          <img
                            src={entry.uploadedUrl || entry.referencePreviewUrl}
                            alt="Reference"
                            className="w-full rounded-xl border border-border object-contain bg-gray-50"
                          />
                          <p className="mt-1 text-xs text-gray-400 text-center">Reference</p>
                        </div>
                        <div className="flex-1 space-y-4">

                      {/* Progress indicator */}
                      {(isGenerating || genProgress[entry.id]) && (() => {
                        const p = genProgress[entry.id] || { total: 0, done: 0, failed: 0 };
                        const finished = p.done + p.failed;
                        const pct = p.total > 0 ? Math.round((finished / p.total) * 100) : 0;
                        const allDone = finished >= p.total && p.total > 0;
                        return (
                          <div className="rounded-xl border border-border bg-gray-50 p-3">
                            <div className="flex items-center justify-between text-sm mb-2">
                              <span className="font-medium text-gray-700">
                                {allDone
                                  ? `Done! ${p.done} image${p.done !== 1 ? "s" : ""} saved to Gallery`
                                  : `Generating: ${p.done}/${p.total} completed`}
                                {p.failed > 0 && <span className="text-red-500 ml-1">({p.failed} failed)</span>}
                              </span>
                              {allDone && (
                                <a href="/gallery" className="text-sm text-primary font-medium hover:underline">
                                  Open Gallery
                                </a>
                              )}
                            </div>
                            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${allDone ? "bg-accent" : "bg-primary"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      <PromptEditor
                        prompt={entry.prompt}
                        promptMode="manual"
                        onPromptChange={(p) => updateEntryPrompt(entry.id, p)}
                        onModeChange={() => {}}
                      />

                      <CopyEditor
                        variations={entry.copyVariations}
                        selectedVariationId={getViewingVariation(entry.id, entry)}
                        selectedVariationIds={getSelectedForGen(entry.id, entry)}
                        onSelectVariation={(vId) =>
                          setViewingVariation((prev) => ({ ...prev, [entry.id]: vId }))
                        }
                        onToggleForGeneration={(vId) =>
                          toggleVariationForGen(entry.id, vId, entry)
                        }
                        onUpdateSection={(vId, sId, text) =>
                          updateEntryCopy(entry.id, vId, sId, text)
                        }
                        language={(entry.language || "he") as Language}
                      />

                      {(() => {
                        const selected = getSelectedForGen(entry.id, entry);
                        const imageCount = selected.length * 2;
                        return (
                          <div className="flex justify-end gap-3">
                            <button
                              onClick={() => handleRegenerate(entry, selected)}
                              disabled={isGenerating}
                              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-dark disabled:opacity-50 transition-all"
                            >
                              {isGenerating
                                ? "Generating..."
                                : `Generate ${imageCount} image${imageCount !== 1 ? "s" : ""} (${selected.length} variation${selected.length !== 1 ? "s" : ""})`}
                            </button>
                          </div>
                        );
                      })()}

                        </div>{/* end flex-1 */}
                      </div>{/* end flex row */}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
