"use client";

import { useCallback } from "react";
import { useAdWorkflow } from "@/hooks/useAdWorkflow";
import { usePolling } from "@/hooks/usePolling";
import { WorkflowStep } from "@/lib/types";
import UploadZone from "./components/UploadZone";
import ReferenceCard from "./components/ReferenceCard";
import LanguageSelector from "./components/LanguageSelector";
import ProductLibrary from "./components/ProductLibrary";
import AnalysisPanel from "./components/AnalysisPanel";
import CopyEditor from "./components/CopyEditor";
import PromptEditor from "./components/PromptEditor";
import GenerationCard from "./components/GenerationCard";
import BatchProgress from "./components/BatchProgress";

const steps: { key: WorkflowStep; label: string; number: number }[] = [
  { key: "upload", label: "Upload", number: 1 },
  { key: "analyze", label: "Analyze", number: 2 },
  { key: "review", label: "Review Copy", number: 3 },
  { key: "generate", label: "Generate", number: 4 },
];

export default function Home() {
  const {
    state,
    addReferences,
    removeReference,
    updateReference,
    setStep,
    setLanguage,
    setSelectedProducts,
    updateCopySection,
    selectVariation,
    toggleVariationForGeneration,
    updateGeneration,
    reset,
  } = useAdWorkflow();

  // Poll for generation status
  const activeJobs = state.references.flatMap((r) =>
    (r.generations || []).filter((g) => g.status === "queued" || g.status === "processing")
  );

  const pollGenerations = useCallback(async () => {
    for (const ref of state.references) {
      for (const gen of ref.generations || []) {
        if (gen.status !== "queued" && gen.status !== "processing") continue;
        try {
          const res = await fetch(`/api/image-status?jobId=${gen.jobId}`);
          const data = await res.json();
          if (data.status !== gen.status || data.resultUrl) {
            updateGeneration(ref.id, gen.jobId, {
              status: data.status,
              resultUrl: data.resultUrl,
              error: data.error,
            });
            // Auto-save to gallery when completed
            if (data.status === "completed" && data.resultUrl) {
              fetch("/api/gallery", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "add-image",
                  sourceUrl: data.resultUrl,
                  prompt: ref.prompt?.substring(0, 200) || "",
                  size: gen.size,
                  angle: ref.copyVariations?.find((v) => v.id === gen.variationId)?.angle || "",
                  folderId: "root",
                }),
              }).catch(() => {}); // silently save
            }
          }
        } catch {
          // silently retry on next poll
        }
      }
    }
  }, [state.references, updateGeneration]);

  usePolling(pollGenerations, {
    enabled: activeJobs.length > 0,
    interval: 5000,
  });

  // --- Upload & Analyze ---
  async function handleAnalyze() {
    if (state.references.length === 0) return;
    setStep("analyze");

    // Upload + Analyze each reference (upload first, then analyze with the uploaded URL)
    const promises = state.references.map(async (ref) => {
      // Step 1: Upload
      let uploadedUrl = ref.uploadedUrl;
      if (!uploadedUrl) {
        updateReference(ref.id, { status: "uploading" });
        try {
          const uploadForm = new FormData();
          uploadForm.append("file", ref.file);
          const uploadRes = await fetch("/api/upload", { method: "POST", body: uploadForm });
          const uploadData = await uploadRes.json();
          uploadedUrl = uploadData.url;
          updateReference(ref.id, { uploadedUrl });
        } catch {
          updateReference(ref.id, { status: "error", error: "Upload failed" });
          return;
        }
      }

      // Step 2: Analyze — send the file directly to avoid stale state issues
      updateReference(ref.id, { status: "analyzing" });
      try {
        const analyzeForm = new FormData();
        analyzeForm.append("file", ref.file);
        analyzeForm.append("language", state.language);

        const res = await fetch("/api/analyze", {
          method: "POST",
          body: analyzeForm,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Analysis failed");
        updateReference(ref.id, {
          status: "analyzed",
          analysis: data.analysis,
          prompt: data.analysis.suggestedPrompt,
          copyVariations: data.copyVariations,
          selectedVariationId: data.copyVariations?.[0]?.id,
        });
      } catch (err) {
        updateReference(ref.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Analysis failed",
        });
      }
    });

    await Promise.all(promises);
    // Only move to review if at least one reference was analyzed successfully
    // (state is async, so re-check isn't reliable — just move forward, the UI handles errors)
    setStep("review");
  }

  // --- Generate (runs in background, doesn't block UI) ---
  async function handleGenerate() {
    setStep("generate");

    // Fire off all generations without awaiting — they run in background
    for (const ref of state.references) {
      if (ref.status === "error" || !ref.analysis) continue;
      updateReference(ref.id, { status: "generating" });

      // Get all selected variations (multi-select)
      const variationIds = ref.selectedVariationIds?.length
        ? ref.selectedVariationIds
        : [ref.selectedVariationId || ref.copyVariations?.[0]?.id || ""];

      const selectedVariations = variationIds
        .map((vId) => ref.copyVariations?.find((v) => v.id === vId))
        .filter(Boolean);

      const sizes: ("1:1" | "9:16")[] = ["1:1", "9:16"];

      // Generate for each selected variation x each size
      (async () => {
        try {
          const jobs = await Promise.all(
            selectedVariations.flatMap((variation) =>
              sizes.map(async (size) => {
                const res = await fetch("/api/generate-image", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    prompt: ref.prompt,
                    referenceImageUrl: ref.uploadedUrl,
                    productImageIds: state.selectedProductImageIds,
                    size,
                    copyVariation: variation,
                  }),
                });
                const data = await res.json();
                if (!res.ok || !data.jobId) {
                  return {
                    jobId: `failed-${size}-${variation?.id}-${Date.now()}`,
                    size,
                    variationId: variation?.id || "",
                    status: "failed" as const,
                    error: data.error || "Failed to submit generation",
                  };
                }
                return {
                  jobId: data.jobId,
                  size,
                  variationId: variation?.id || "",
                  status: "queued" as const,
                };
              })
            )
          );
          updateReference(ref.id, { generations: jobs });
        } catch {
          updateReference(ref.id, { status: "error", error: "Generation failed" });
        }
      })();
    }
  }

  const canAnalyze = state.references.length > 0 && state.references.some((r) => r.status === "idle");
  const canGenerate = state.references.some((r) => r.status === "analyzed");

  // Count total images that will be generated
  const totalToGenerate = state.references.reduce((sum, ref) => {
    if (ref.status !== "analyzed") return sum;
    const varCount = ref.selectedVariationIds?.length || 1;
    return sum + varCount * 2; // 2 sizes per variation
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
            <a
              href="/gallery"
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Gallery
            </a>
            <a
              href="/brand"
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Brand Settings
            </a>
            <button
              onClick={reset}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              New Batch
            </button>
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
                        language={state.language}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex justify-end">
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
                <GenerationCard key={ref.id} reference={ref} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
