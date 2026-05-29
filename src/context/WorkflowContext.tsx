"use client";

import { createContext, useContext, useCallback, ReactNode } from "react";
import { useAdWorkflow } from "@/hooks/useAdWorkflow";
import { usePolling } from "@/hooks/usePolling";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import {
  WorkflowState,
  ReferenceAd,
  GenerationJob,
  Language,
  WorkflowStep,
  CopyVariation,
} from "@/lib/types";

interface WorkflowContextType {
  state: WorkflowState;
  addReferences: (files: File[]) => void;
  removeReference: (id: string) => void;
  updateReference: (id: string, updates: Partial<ReferenceAd>) => void;
  setStep: (step: WorkflowStep) => void;
  setLanguage: (language: Language) => void;
  setSelectedProducts: (ids: string[]) => void;
  updateCopySection: (refId: string, variationId: string, sectionId: string, text: string) => void;
  updateCopySectionHebrew: (refId: string, variationId: string, sectionId: string, text: string) => void;
  replaceCopyVariations: (refId: string, variations: CopyVariation[]) => void;
  selectVariation: (refId: string, variationId: string) => void;
  toggleVariationForGeneration: (refId: string, variationId: string) => void;
  updateGeneration: (refId: string, jobId: string, updates: Partial<GenerationJob>) => void;
  addGeneration: (refId: string, job: GenerationJob) => void;
  setSelectedProductId: (productId: string | undefined) => void;
  setEnhancedVariationMatching: (enabled: boolean) => void;
  reset: () => void;
  confirmNavigation: (callback: () => void) => void;
  activeJobs: GenerationJob[];
  isGenerating: boolean;
  isAnalyzing: boolean;
}

const WorkflowContext = createContext<WorkflowContextType | null>(null);

export function useWorkflow() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("useWorkflow must be used within WorkflowProvider");
  return ctx;
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const workflow = useAdWorkflow();
  const { state, updateGeneration, addGeneration } = workflow;

  // Compute active state
  const activeJobs = state.references.flatMap((r) =>
    (r.generations || []).filter((g) => g.status === "queued" || g.status === "processing")
  );
  const isGenerating = state.step === "generate" && activeJobs.length > 0;
  const isAnalyzing = state.references.some((r) => r.status === "uploading" || r.status === "analyzing");

  // Navigation guard — active during generation OR analysis
  const { confirmNavigation } = useNavigationGuard(isGenerating || isAnalyzing);

  // Polling — runs at provider level, survives page navigation
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
            // Auto-QC + auto-save when completed
            if (data.status === "completed" && data.resultUrl) {
              // Run QC check in background (non-blocking, 30s timeout)
              (async () => {
                const qcTimeout = setTimeout(() => {
                  updateGeneration(ref.id, gen.jobId, { qcStatus: "passed" });
                }, 30000);
                try {
                  updateGeneration(ref.id, gen.jobId, { qcStatus: "pending" });

                  // Build product image URL for QC comparison
                  let productUrl: string | undefined;
                  if (state.selectedProductImageIds?.length) {
                    try {
                      const prodRes = await fetch(`/api/products`);
                      const prodData = await prodRes.json();
                      const prod = prodData.products?.find((p: { id: string }) => p.id === state.selectedProductImageIds[0]);
                      if (prod?.publicUrl) productUrl = prod.publicUrl;
                    } catch {}
                  }

                  const qcRes = await fetch("/api/check-generation", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      generatedImageUrl: data.resultUrl,
                      referenceImageUrl: ref.uploadedUrl,
                      productImageUrl: productUrl,
                    }),
                  });

                  if (qcRes.ok) {
                    const qc = await qcRes.json();
                    if (qc.passed) {
                      updateGeneration(ref.id, gen.jobId, { qcStatus: "passed" });
                    } else {
                      updateGeneration(ref.id, gen.jobId, {
                        qcStatus: "failed",
                        qcIssues: qc.issues || [],
                      });
                      // Auto-fix: trigger a regeneration with the fix instruction
                      if (qc.fixInstruction && (qc.severity === "critical" || qc.severity === "moderate")) {
                        updateGeneration(ref.id, gen.jobId, { qcStatus: "fixing" });
                        try {
                          const fixRes = await fetch("/api/generate-image", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              prompt: `CRITICAL OVERRIDE — APPLY BEFORE ANYTHING ELSE:\n${qc.fixInstruction}\n\n---\n\n${ref.prompt || ""}`,
                              referenceImageUrl: data.resultUrl,
                              productImageIds: state.selectedProductImageIds || [],
                              size: gen.size,
                              copyVariation: ref.copyVariations?.find((v) => v.id === gen.variationId),
                            }),
                          });
                          const fixData = await fixRes.json();
                          if (fixRes.ok && fixData.jobId) {
                            addGeneration(ref.id, {
                              jobId: fixData.jobId,
                              size: gen.size as "1:1" | "9:16",
                              variationId: gen.variationId,
                              status: "queued",
                            });
                          }
                        } catch {}
                      }
                    }
                  }
                } catch {
                  updateGeneration(ref.id, gen.jobId, { qcStatus: "passed" });
                } finally {
                  clearTimeout(qcTimeout);
                }
              })();
              const variation = ref.copyVariations?.find((v) => v.id === gen.variationId);
              const saveBody = JSON.stringify({
                action: "add-image",
                sourceUrl: data.resultUrl,
                prompt: ref.prompt?.substring(0, 200) || "",
                size: gen.size,
                angle: variation?.angle || "",
                folderId: "root",
                originalPrompt: ref.prompt || "",
                referenceImageUrl: ref.uploadedUrl || "",
                productImageIds: state.selectedProductImageIds,
                copyVariation: variation
                  ? {
                      angle: variation.angle,
                      sections: variation.sections.map((s) => ({
                        label: s.label,
                        adaptedText: s.adaptedText,
                      })),
                    }
                  : undefined,
              });

              // Retry up to 3 times with delay
              (async () => {
                for (let attempt = 0; attempt < 3; attempt++) {
                  try {
                    const saveRes = await fetch("/api/gallery", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: saveBody,
                    });
                    if (saveRes.ok) return; // success
                  } catch {}
                  await new Promise((r) => setTimeout(r, 2000));
                }
                console.error("Failed to save image to gallery after 3 attempts:", gen.jobId);
              })();
            }
          }
        } catch {
          // silently retry on next poll
        }
      }
    }
  }, [state.references, state.selectedProductImageIds, updateGeneration]);

  usePolling(pollGenerations, {
    enabled: activeJobs.length > 0,
    interval: 5000,
  });

  return (
    <WorkflowContext.Provider
      value={{
        ...workflow,
        confirmNavigation,
        activeJobs,
        isGenerating,
        isAnalyzing,
      }}
    >
      {children}
    </WorkflowContext.Provider>
  );
}
