"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkflow } from "@/context/WorkflowContext";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/fetchJson";
import type { AnalysisResult, CopyVariation } from "@/lib/types";
import { WorkflowStep, needsHebrewCompanion } from "@/lib/types";
import UploadZone from "./components/UploadZone";
import ReferenceCard from "./components/ReferenceCard";
import LanguageSelector from "./components/LanguageSelector";
import ProductLibrary from "./components/ProductLibrary";
import AnalysisPanel from "./components/AnalysisPanel";
import CopyEditor from "./components/CopyEditor";
import PromptEditor from "./components/PromptEditor";
import GenerationCard from "./components/GenerationCard";
import BatchProgress from "./components/BatchProgress";
import ProductSelector from "./components/ProductSelector";

const steps: { key: WorkflowStep; label: string; number: number }[] = [
  { key: "upload", label: "Upload", number: 1 },
  { key: "analyze", label: "Analyze", number: 2 },
  { key: "review", label: "Review Copy", number: 3 },
  { key: "generate", label: "Generate", number: 4 },
];

export default function Home() {
  const router = useRouter();
  const { isAdmin, profile, signOut } = useAuth();
  const {
    state,
    addReferences,
    removeReference,
    updateReference,
    setStep,
    setLanguage,
    setSelectedProducts,
    updateCopySection,
    updateCopySectionHebrew,
    replaceCopyVariations,
    selectVariation,
    toggleVariationForGeneration,
    addGeneration,
    setSelectedProductId,
    setEnhancedVariationMatching,
    reset,
    confirmNavigation,
  } = useWorkflow();

  // Auto-translate to Hebrew when entering the review step with foreign-language
  // variations that are missing hebrewText (handles restored localStorage state
  // and any case where the fresh-analyze auto-translate failed silently).
  useEffect(() => {
    if (state.step !== "review") return;
    if (!needsHebrewCompanion(state.language)) return;
    const refsNeedingTranslation = state.references.filter((r) => {
      if (!r.copyVariations || r.copyVariations.length === 0) return false;
      return r.copyVariations.some((v) =>
        v.sections.some((s) => !s.hebrewText || s.hebrewText.length === 0)
      );
    });
    if (refsNeedingTranslation.length === 0) return;

    refsNeedingTranslation.forEach((ref) => {
      if (!ref.copyVariations) return;
      (async () => {
        try {
          const tres = await fetch("/api/translate-copy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              variations: ref.copyVariations,
              language: state.language,
              direction: "foreign-to-hebrew",
            }),
          });
          if (!tres.ok) {
            console.error("[translate-copy] backfill HTTP", tres.status, await tres.text());
            return;
          }
          const tdata = await tres.json();
          if (tdata?.variations) {
            replaceCopyVariations(ref.id, tdata.variations);
          }
        } catch (err) {
          console.error("[translate-copy] backfill failed:", err);
        }
      })();
    });
    // We intentionally only depend on step + language; running once per step-entry
    // is enough. The check above prevents re-runs for already-translated refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.language]);

  // Auto-sync copy edits back to history (debounced 1.5s after last change).
  // Only refs that already have a server-side historyId get synced.
  useEffect(() => {
    if (state.references.length === 0) return;
    const refsWithHistory = state.references.filter(
      (r) => r.historyId && r.copyVariations,
    );
    if (refsWithHistory.length === 0) return;

    const timeoutId = setTimeout(() => {
      refsWithHistory.forEach((ref) => {
        fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: ref.historyId,
            updates: { copyVariations: ref.copyVariations },
          }),
        }).catch(() => {});
      });
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [state.references]);

  // --- Upload & Analyze ---
  async function handleAnalyze() {
    if (state.references.length === 0) return;
    setStep("analyze");

    // Upload + Analyze each reference (upload first, then analyze with the uploaded URL)
    const promises = state.references.map(async (ref) => {
      // Step 1: Upload to Supabase Storage
      let uploadedUrl = ref.uploadedUrl;
      // Reuse the stored path on re-analysis. It used to be a local that was
      // only assigned inside the upload branch, so any reference restored from
      // localStorage (which keeps only ones that already uploaded) sent an
      // empty path and the server answered 400 "No image provided" forever.
      let storagePath = ref.storagePath || "";
      if (!uploadedUrl) {
        updateReference(ref.id, { status: "uploading" });
        try {
          const supabase = createClient();
          const ext = ref.file.name.split(".").pop() || "png";
          storagePath = `${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("references")
            .upload(storagePath, ref.file);
          if (uploadError) throw new Error(uploadError.message);
          const { data: urlData } = await supabase.storage
            .from("references")
            .createSignedUrl(storagePath, 3600);
          uploadedUrl = urlData?.signedUrl || "";
          updateReference(ref.id, { uploadedUrl, storagePath });
        } catch (err) {
          console.error("[analyze] upload failed:", err);
          updateReference(ref.id, { status: "error", error: err instanceof Error ? err.message : "Upload failed" });
          return false;
        }
      }

      // Step 2: Analyze — send storagePath/storageBucket so the server fetches from Supabase
      updateReference(ref.id, { status: "analyzing" });
      try {
        if (!storagePath && !uploadedUrl) {
          throw new Error("This reference has no uploaded image — please re-upload it.");
        }
        const data = await fetchJson<{
          analysis?: AnalysisResult;
          copyVariations?: CopyVariation[];
        }>("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Prefer the storage path: the server re-signs it, so it works even
          // after the reference's own signed URL has expired.
          body: JSON.stringify(
            storagePath
              ? {
                  storagePath,
                  storageBucket: "references",
                  language: state.language,
                  productId: state.selectedProductId,
                }
              : {
                  imageUrl: uploadedUrl,
                  language: state.language,
                  productId: state.selectedProductId,
                }
          ),
        });
        if (!data.analysis) {
          throw new Error("The analysis came back empty. Please try again.");
        }
        updateReference(ref.id, {
          status: "analyzed",
          analysis: data.analysis,
          prompt: data.analysis.suggestedPrompt,
          copyVariations: data.copyVariations,
          selectedVariationId: data.copyVariations?.[0]?.id,
        });

        // Auto-translate to Hebrew for foreign-language batches (ar/de/ru/fr only).
        // Fire-and-forget — never blocks the review step; never affects adaptedText
        // (image-generation source of truth) or the Hebrew/English flows.
        if (needsHebrewCompanion(state.language) && data.copyVariations?.length) {
          (async () => {
            try {
              const tres = await fetch("/api/translate-copy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  variations: data.copyVariations,
                  language: state.language,
                  direction: "foreign-to-hebrew",
                }),
              });
              if (!tres.ok) {
                const errText = await tres.text();
                console.error("[translate-copy] HTTP", tres.status, errText);
                return;
              }
              const tdata = await tres.json();
              if (tdata?.variations) {
                console.log("[translate-copy] auto-translation applied for ref", ref.id);
                replaceCopyVariations(ref.id, tdata.variations);
              } else {
                console.error("[translate-copy] unexpected response shape", tdata);
              }
            } catch (err) {
              console.error("[translate-copy] auto-translate failed:", err);
            }
          })();
        }

        // Auto-save to history; capture the entry id so subsequent edits can sync.
        fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add",
            referencePreviewUrl: ref.previewUrl,
            uploadedUrl: uploadedUrl || "",
            analysis: data.analysis,
            prompt: data.analysis.suggestedPrompt,
            copyVariations: data.copyVariations,
            language: state.language,
          }),
        })
          .then((r) => r.json())
          .then((histData) => {
            if (histData?.entry?.id) {
              updateReference(ref.id, { historyId: histData.entry.id });
            }
          })
          .catch(() => {}); // silently save
      } catch (err) {
        console.error("[analyze] failed for reference", ref.id, err);
        updateReference(ref.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Analysis failed",
        });
        return false;
      }
      return true;
    });

    const results = await Promise.all(promises);

    // Only move on if something actually succeeded. Advancing unconditionally
    // is what made every failure look identical and silent: the review step
    // renders nothing without an analysis, and the reference cards that do show
    // the error unmount the moment the step changes.
    if (results.some(Boolean)) {
      setStep("review");
    } else {
      setStep("upload");
    }
  }

  // --- Generate (runs in background, doesn't block UI) ---
  async function handleGenerate() {
    setStep("generate");

    for (const ref of state.references) {
      if (ref.status === "error" || !ref.analysis) continue;
      updateReference(ref.id, { status: "generating" });

      const variationIds = ref.selectedVariationIds?.length
        ? ref.selectedVariationIds
        : [ref.selectedVariationId || ref.copyVariations?.[0]?.id || ""];

      const selectedVariations = variationIds
        .map((vId) => ref.copyVariations?.find((v) => v.id === vId))
        .filter(Boolean);

      const sizes: ("1:1" | "9:16")[] = ["1:1", "9:16"];

      (async () => {
        try {
          const jobs = await Promise.all(
            selectedVariations.flatMap((variation) =>
              sizes.map(async (size) => {
                try {
                  const res = await fetch("/api/generate-image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      prompt: ref.prompt,
                      referenceImageUrl: ref.uploadedUrl,
                      productImageIds: state.selectedProductImageIds,
                      size,
                      copyVariation: variation,
                      enhancedVariationMatching: state.enhancedVariationMatching,
                      enforceCleanLayout: true,
                    }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok || !data.jobId) {
                    return {
                      jobId: `failed-${size}-${variation?.id}-${Date.now()}`,
                      size,
                      variationId: variation?.id || "",
                      status: "failed" as const,
                      error: data.error || `HTTP ${res.status}: failed to submit`,
                    };
                  }
                  return {
                    jobId: data.jobId,
                    size,
                    variationId: variation?.id || "",
                    status: "queued" as const,
                  };
                } catch (err) {
                  // Per-job catch — keeps Promise.all from rejecting and losing
                  // sibling jobs that succeeded.
                  return {
                    jobId: `error-${size}-${variation?.id}-${Date.now()}`,
                    size,
                    variationId: variation?.id || "",
                    status: "failed" as const,
                    error: err instanceof Error ? err.message : "Network error",
                  };
                }
              })
            )
          );
          updateReference(ref.id, { generations: jobs });
        } catch (err) {
          updateReference(ref.id, {
            status: "error",
            error: err instanceof Error ? err.message : "Generation failed",
          });
        }
      })();
    }
  }

  const canAnalyze = state.references.length > 0 && state.references.some((r) => r.status === "idle");
  const canGenerate = state.references.some((r) => r.status === "analyzed");

  const totalToGenerate = state.references.reduce((sum, ref) => {
    if (ref.status !== "analyzed") return sum;
    const varCount = ref.selectedVariationIds?.length || 1;
    return sum + varCount * 2;
  }, 0);
  const allDone = state.step === "generate" && state.references.every(
    (r) => r.status === "done" || r.status === "error" ||
    (r.generations || []).every((g) => g.status === "completed" || g.status === "failed")
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">
              B
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Bugo Ad Generator</h1>
              <p className="text-xs text-gray-500">Batch static ad creation</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/history")}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Previous Ads
            </button>
            <button
              onClick={() => router.push("/auto-pull")}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              Auto Pull
            </button>
            <button
              onClick={() => router.push("/replicator")}
              className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
            >
              Replicator
            </button>
            <button
              onClick={() => router.push("/pet-tag")}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              Pet Tag
            </button>
            <button
              onClick={() => router.push("/fly")}
              className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-sm font-medium text-cyan-700 hover:bg-cyan-100 transition-colors"
            >
              Bugo Fly
            </button>
            <button
              onClick={() => router.push("/birds")}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
            >
              Bugo Birds
            </button>
            <button
              onClick={() => router.push("/ants")}
              className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-100 transition-colors"
            >
              Bugo Ants
            </button>
            <button
              onClick={() => router.push("/guard")}
              className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 transition-colors"
            >
              Bugo Guard
            </button>
            <button
              onClick={() => router.push("/native-ads")}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100 transition-colors"
            >
              Native Ads
            </button>
            <button
              onClick={() => router.push("/gallery")}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Gallery
            </button>
            <button
              onClick={() => router.push("/brand")}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Brand Settings
            </button>
            <button
              onClick={() => confirmNavigation(reset)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              New Batch
            </button>
            {isAdmin && (
              <button
                onClick={() => router.push("/settings")}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Settings
              </button>
            )}
            {profile && (
              <span className="text-sm text-gray-500 hidden lg:inline">
                {profile.email}
              </span>
            )}
            {signOut && (
              <button
                onClick={() => signOut()}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Step indicator */}
      <div className="border-b border-border bg-white">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <div className="flex items-center gap-2">
            {steps.map((s, i) => {
              const isActive = s.key === state.step;
              const isPast = steps.findIndex((st) => st.key === state.step) > i;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  {i > 0 && (
                    <div className={`h-px w-8 ${isPast ? "bg-primary" : "bg-border"}`} />
                  )}
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        isActive
                          ? "bg-primary text-white"
                          : isPast
                          ? "bg-primary/20 text-primary"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {isPast ? (
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        s.number
                      )}
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        isActive ? "text-gray-900" : isPast ? "text-primary" : "text-gray-400"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Step 1: Upload */}
        {(state.step === "upload" || state.step === "analyze") && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Upload Reference Ads</h2>
                <p className="text-sm text-gray-500">
                  Upload competitor ads or ads from other niches as references
                </p>
              </div>
              <LanguageSelector value={state.language} onChange={setLanguage} />
            </div>

            <UploadZone
              onFilesAdded={addReferences}
              currentCount={state.references.length}
            />

            {state.references.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {state.references.map((ref) => (
                    <ReferenceCard
                      key={ref.id}
                      reference={ref}
                      onRemove={removeReference}
                    />
                  ))}
                </div>

                <ProductSelector
                  selectedProductId={state.selectedProductId}
                  onSelect={setSelectedProductId}
                />

                <ProductLibrary
                  selectedIds={state.selectedProductImageIds}
                  onSelectionChange={setSelectedProducts}
                />

                <div className="flex justify-end">
                  <button
                    onClick={handleAnalyze}
                    disabled={!canAnalyze}
                    className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Analyze {state.references.length} Reference{state.references.length !== 1 ? "s" : ""}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 3: Review Copy */}
        {state.step === "review" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Review & Edit Copy</h2>
                <p className="text-sm text-gray-500">
                  Review the generated copy variations and edit as needed
                </p>
              </div>
              <div className="flex items-center gap-3">
                <LanguageSelector value={state.language} onChange={setLanguage} />
                <button
                  onClick={() => setStep("upload")}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Back
                </button>
              </div>
            </div>

            {state.references.map((ref) => (
              <div key={ref.id} className="space-y-4 rounded-2xl border border-border bg-white p-6">
                {/* A failed reference used to render as an empty card with a
                    placeholder prompt and no explanation. Show what happened. */}
                {ref.status === "error" && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-800">Analysis failed</p>
                    <p className="mt-1 break-words text-xs text-red-700">
                      {ref.error || "Unknown error"}
                    </p>
                    <p className="mt-2 text-xs text-red-600">
                      Try again. If it keeps failing, send this message to Elad.
                    </p>
                  </div>
                )}
                <div className="flex gap-6">
                  {/* Reference image thumbnail */}
                  <div className="w-48 flex-shrink-0">
                    <img
                      src={ref.previewUrl}
                      alt="Reference"
                      className="w-full rounded-xl border border-border"
                    />
                    {ref.analysis && (
                      <div className="mt-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          ref.analysis.niche === "pest-control"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {ref.analysis.niche === "pest-control" ? "Same Niche" : "Cross-Niche"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Analysis + Prompt + Copy */}
                  <div className="flex-1 space-y-4">
                    {ref.analysis && <AnalysisPanel analysis={ref.analysis} />}

                    <PromptEditor
                      prompt={ref.prompt || ""}
                      promptMode={ref.promptMode}
                      onPromptChange={(prompt) => updateReference(ref.id, { prompt })}
                      onModeChange={(promptMode) => updateReference(ref.id, { promptMode })}
                    />

                    {ref.copyVariations && (
                      <CopyEditor
                        variations={ref.copyVariations}
                        selectedVariationId={ref.selectedVariationId}
                        selectedVariationIds={ref.selectedVariationIds || [ref.selectedVariationId || ref.copyVariations[0]?.id || ""]}
                        onSelectVariation={(vId) => selectVariation(ref.id, vId)}
                        onToggleForGeneration={(vId) => toggleVariationForGeneration(ref.id, vId)}
                        onUpdateSection={(vId, sId, text) =>
                          updateCopySection(ref.id, vId, sId, text)
                        }
                        onUpdateSectionHebrew={(vId, sId, text) =>
                          updateCopySectionHebrew(ref.id, vId, sId, text)
                        }
                        onSyncHebrewToForeign={async (vId) => {
                          console.log("[page] onSyncHebrewToForeign called for variation", vId);
                          if (!needsHebrewCompanion(state.language)) throw new Error(`Language ${state.language} not supported`);
                          const variation = ref.copyVariations?.find((v) => v.id === vId);
                          if (!variation) throw new Error(`Variation ${vId} not found`);
                          const res = await fetch("/api/translate-copy", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              variations: [variation],
                              language: state.language,
                              direction: "hebrew-to-foreign",
                            }),
                          });
                          console.log("[page] translate-copy response status:", res.status);
                          if (!res.ok) {
                            const errText = await res.text();
                            throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
                          }
                          const tdata = await res.json();
                          if (tdata?.variations?.length && ref.copyVariations) {
                            const updated = ref.copyVariations.map((v) =>
                              v.id === vId ? tdata.variations[0] : v
                            );
                            replaceCopyVariations(ref.id, updated);
                          } else {
                            throw new Error("Unexpected response shape");
                          }
                        }}
                        onSyncForeignToHebrew={async (vId) => {
                          console.log("[page] onSyncForeignToHebrew called for variation", vId);
                          if (!needsHebrewCompanion(state.language)) throw new Error(`Language ${state.language} not supported`);
                          const variation = ref.copyVariations?.find((v) => v.id === vId);
                          if (!variation) throw new Error(`Variation ${vId} not found`);
                          const res = await fetch("/api/translate-copy", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              variations: [variation],
                              language: state.language,
                              direction: "foreign-to-hebrew",
                            }),
                          });
                          console.log("[page] translate-copy response status:", res.status);
                          if (!res.ok) {
                            const errText = await res.text();
                            throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
                          }
                          const tdata = await res.json();
                          if (tdata?.variations?.length && ref.copyVariations) {
                            const updated = ref.copyVariations.map((v) =>
                              v.id === vId ? tdata.variations[0] : v
                            );
                            replaceCopyVariations(ref.id, updated);
                          } else {
                            throw new Error("Unexpected response shape");
                          }
                        }}
                        language={state.language}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    state.enhancedVariationMatching ? "bg-primary" : "bg-gray-300"
                  }`}
                  onClick={() => setEnhancedVariationMatching(!state.enhancedVariationMatching)}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      state.enhancedVariationMatching ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </div>
                <span className="text-sm text-gray-600">Enhanced variation matching</span>
                <span className="text-xs text-gray-400">(match visuals to each variation&apos;s text)</span>
              </label>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate {totalToGenerate} Ad{totalToGenerate !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Generate */}
        {state.step === "generate" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Generating Ads</h2>
                <p className="text-sm text-gray-500">
                  Your ads are being generated via Nano Banana
                </p>
              </div>
              {allDone && (
                <button
                  onClick={reset}
                  className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-dark"
                >
                  Start New Batch
                </button>
              )}
            </div>

            <BatchProgress references={state.references} />

            <div className="space-y-4">
              {state.references.map((ref) => (
                <GenerationCard
                  key={ref.id}
                  reference={ref}
                  onAddGeneration={addGeneration}
                  selectedProductImageIds={state.selectedProductImageIds}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
