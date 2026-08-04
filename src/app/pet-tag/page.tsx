"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePetTagWorkflowContext } from "@/context/PetTagWorkflowContext";
import { WorkflowStep, needsHebrewCompanion } from "@/lib/types";
import UploadZone from "../components/UploadZone";
import ReferenceCard from "../components/ReferenceCard";
import LanguageSelector from "../components/LanguageSelector";
import AnalysisPanel from "../components/AnalysisPanel";
import CopyEditor from "../components/CopyEditor";
import PromptEditor from "../components/PromptEditor";
import BatchProgress from "../components/BatchProgress";

interface PetTagProductImage {
  id: string;
  filename: string;
  url: string;
  label: string;
}

const steps: { key: WorkflowStep; label: string; number: number }[] = [
  { key: "upload", label: "Upload", number: 1 },
  { key: "analyze", label: "Analyze", number: 2 },
  { key: "review", label: "Review Copy", number: 3 },
  { key: "generate", label: "Generate", number: 4 },
];

export default function PetTagHome() {
  const router = useRouter();
  const {
    state,
    addReferences,
    removeReference,
    updateReference,
    setStep,
    setLanguage,
    setProductImageForRef,
    updateCopySection,
    updateCopySectionHebrew,
    replaceCopyVariations,
    selectVariation,
    toggleVariationForGeneration,
    setEnhancedVariationMatching,
    reset,
    confirmNavigation,
  } = usePetTagWorkflowContext();

  // Pet Tag product images (the 2 the user uploads: product + packaging)
  const [productImages, setProductImages] = useState<PetTagProductImage[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pet-tag/products")
      .then((r) => r.json())
      .then((data) => setProductImages(data.products || []))
      .catch(() => setProductImages([]))
      .finally(() => setProductsLoading(false));
  }, []);

  // Auto-translate to Hebrew when entering review step with foreign-language variations
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
          if (!tres.ok) return;
          const tdata = await tres.json();
          if (tdata?.variations) {
            replaceCopyVariations(ref.id, tdata.variations);
          }
        } catch {}
      })();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.language]);

  // --- Upload & Analyze ---
  async function handleAnalyze() {
    if (state.references.length === 0) return;
    setStep("analyze");

    const promises = state.references.map(async (ref) => {
      // Step 1: Upload reference image (reuses the shared /api/upload endpoint —
      // it writes to uploads/references/ which both flows can read from).
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

      // Step 2: Analyze with the pet-tag prompts
      updateReference(ref.id, { status: "analyzing" });
      try {
        const analyzeForm = new FormData();
        analyzeForm.append("file", ref.file);
        analyzeForm.append("language", state.language);

        const res = await fetch("/api/pet-tag/analyze", {
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

        // Auto-translate to Hebrew for foreign-language batches
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
              if (!tres.ok) return;
              const tdata = await tres.json();
              if (tdata?.variations) replaceCopyVariations(ref.id, tdata.variations);
            } catch {}
          })();
        }
      } catch (err) {
        updateReference(ref.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Analysis failed",
        });
      }
    });

    await Promise.all(promises);
    setStep("review");
  }

  // --- Generate ---
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
      const productImageId = state.selectedProductImageByRefId[ref.id];

      (async () => {
        try {
          const jobs = await Promise.all(
            selectedVariations.flatMap((variation) =>
              sizes.map(async (size) => {
                try {
                  const res = await fetch("/api/pet-tag/generate-image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      prompt: ref.prompt,
                      referenceImageUrl: ref.uploadedUrl,
                      productImageId,
                      size,
                      copyVariation: variation,
                      enhancedVariationMatching: state.enhancedVariationMatching,
                      enforceCleanLayout: true,
                      language: state.language,
                    }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok || !data.jobId) {
                    return {
                      jobId: `failed-${size}-${variation?.id}-${Date.now()}`,
                      size,
                      variationId: variation?.id || "",
                      status: "failed" as const,
                      error: data.error || `HTTP ${res.status}`,
                    };
                  }
                  return {
                    jobId: data.jobId,
                    size,
                    variationId: variation?.id || "",
                    status: "queued" as const,
                  };
                } catch (err) {
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
      {/* Header — pet-tag namespace */}
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold text-white">
              🐾
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Bugo Pet Tag Ad Generator</h1>
              <p className="text-xs text-gray-500">Bugo Pet Tag — dog flea/tick protection pendant</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ← Main App (Bugo)
            </button>
            <button
              onClick={() => router.push("/pet-tag/gallery")}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Bugo Pet Tag Gallery
            </button>
            <button
              onClick={() => router.push("/pet-tag/brand")}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Bugo Pet Tag Brand
            </button>
            <button
              onClick={() => confirmNavigation(reset)}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
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
                    <div className={`h-px w-8 ${isPast ? "bg-emerald-600" : "bg-border"}`} />
                  )}
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        isActive
                          ? "bg-emerald-600 text-white"
                          : isPast
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {isPast ? "✓" : s.number}
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        isActive ? "text-gray-900" : isPast ? "text-emerald-700" : "text-gray-400"
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
                  Upload competitor pet-care ads as references. For each reference, choose which Bugo Pet Tag product image to use.
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
                {/* Product images availability banner */}
                {!productsLoading && productImages.length === 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm text-amber-800">
                      ⚠️ No Bugo Pet Tag product images uploaded yet.{" "}
                      <button
                        onClick={() => router.push("/pet-tag/brand")}
                        className="underline font-medium"
                      >
                        Upload the product + packaging images on the brand page
                      </button>{" "}
                      before generating.
                    </p>
                  </div>
                )}

                {/* References with per-ref product image picker */}
                <div className="space-y-3">
                  {state.references.map((ref) => (
                    <div
                      key={ref.id}
                      className="flex gap-4 rounded-xl border border-border bg-white p-4"
                    >
                      <div className="w-32 flex-shrink-0">
                        <ReferenceCard reference={ref} onRemove={removeReference} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 mb-2">
                          Product image for this reference:
                        </p>
                        {productImages.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">
                            (none available — upload on brand page)
                          </p>
                        ) : (
                          <div className="flex gap-2 flex-wrap">
                            {productImages.map((prod) => {
                              const selected = state.selectedProductImageByRefId[ref.id] === prod.id;
                              return (
                                <button
                                  key={prod.id}
                                  onClick={() => setProductImageForRef(ref.id, prod.id)}
                                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-all ${
                                    selected
                                      ? "border-emerald-600 bg-emerald-50"
                                      : "border-border bg-white hover:border-emerald-300"
                                  }`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={prod.url}
                                    alt={prod.label}
                                    className="h-16 w-16 rounded object-contain"
                                  />
                                  <span className="text-xs font-medium text-gray-700">
                                    {prod.label}
                                  </span>
                                  {selected && (
                                    <span className="text-xs font-bold text-emerald-700">✓ chosen</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleAnalyze}
                    disabled={!canAnalyze}
                    className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Analyze {state.references.length} Reference{state.references.length !== 1 ? "s" : ""}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 3: Review */}
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
                  <div className="w-48 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ref.previewUrl}
                      alt="Reference"
                      className="w-full rounded-xl border border-border"
                    />
                    {ref.analysis && (
                      <div className="mt-2">
                        {/* niche comes from pet-tag-prompts which returns "pet-care" or "other",
                            but the shared AnalysisResult type still says "pest-control" | "other".
                            Compare as string to bridge the two prompt sets. */}
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          (ref.analysis.niche as string) === "pet-care"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {(ref.analysis.niche as string) === "pet-care" ? "Same Niche" : "Cross-Niche"}
                        </span>
                      </div>
                    )}
                    {/* Show chosen product image for this reference */}
                    {state.selectedProductImageByRefId[ref.id] && (
                      <div className="mt-2 text-xs text-gray-500">
                        Product:{" "}
                        <span className="font-medium text-gray-700">
                          {productImages.find((p) => p.id === state.selectedProductImageByRefId[ref.id])?.label || "—"}
                        </span>
                      </div>
                    )}
                  </div>

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
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          const tdata = await res.json();
                          if (tdata?.variations?.length && ref.copyVariations) {
                            const updated = ref.copyVariations.map((v) =>
                              v.id === vId ? tdata.variations[0] : v
                            );
                            replaceCopyVariations(ref.id, updated);
                          }
                        }}
                        onSyncForeignToHebrew={async (vId) => {
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
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          const tdata = await res.json();
                          if (tdata?.variations?.length && ref.copyVariations) {
                            const updated = ref.copyVariations.map((v) =>
                              v.id === vId ? tdata.variations[0] : v
                            );
                            replaceCopyVariations(ref.id, updated);
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
                    state.enhancedVariationMatching ? "bg-emerald-600" : "bg-gray-300"
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
              </label>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <h2 className="text-xl font-bold text-gray-900">Generating Bugo Pet Tag Ads</h2>
                <p className="text-sm text-gray-500">
                  Your ads are being generated via Nano Banana
                </p>
              </div>
              {allDone && (
                <button
                  onClick={reset}
                  className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
                >
                  Start New Batch
                </button>
              )}
            </div>

            <BatchProgress references={state.references} />

            <div className="space-y-4">
              {state.references.map((ref) => (
                <div key={ref.id} className="rounded-2xl border border-border bg-white p-4">
                  <div className="flex gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ref.previewUrl}
                      alt="Reference"
                      className="h-24 w-24 rounded-lg border border-border object-cover"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {(ref.generations || []).filter((g) => g.status === "completed").length} /{" "}
                        {(ref.generations || []).length} generations completed
                      </p>
                      {ref.error && (
                        <p className="mt-1 text-xs text-red-600">{ref.error}</p>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {(ref.generations || []).map((g) => (
                          <div
                            key={g.jobId}
                            className="rounded-lg border border-border bg-gray-50 p-2 text-center"
                          >
                            {g.resultUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={g.resultUrl}
                                alt={`${g.size}`}
                                className="aspect-square w-full rounded object-cover"
                              />
                            ) : (
                              <div className="aspect-square w-full flex items-center justify-center text-xs text-gray-400">
                                {g.status === "queued" && "Queued..."}
                                {g.status === "processing" && "Generating..."}
                                {g.status === "failed" && "✗ Failed"}
                              </div>
                            )}
                            <p className="mt-1 text-xs text-gray-500">{g.size}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
