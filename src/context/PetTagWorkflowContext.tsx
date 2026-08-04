"use client";

import { createContext, useContext, useCallback, ReactNode } from "react";
import { usePetTagWorkflow, type PetTagWorkflowState } from "@/hooks/usePetTagWorkflow";
import { usePolling } from "@/hooks/usePolling";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import type {
  ReferenceAd,
  GenerationJob,
  Language,
  WorkflowStep,
  CopyVariation,
} from "@/lib/types";

/**
 * Pet Tag workflow context — parallel to WorkflowContext.tsx.
 * Polls /api/image-status (shared, generic kie.ai job poller — no brand context).
 * Auto-saves completed generations to /api/pet-tag/gallery (NOT the main gallery).
 *
 * Reuses the shared `usePolling` and `useNavigationGuard` hooks — both are
 * stateless and brand-agnostic.
 */

interface PetTagWorkflowContextType {
  state: PetTagWorkflowState;
  addReferences: (files: File[]) => void;
  removeReference: (id: string) => void;
  updateReference: (id: string, updates: Partial<ReferenceAd>) => void;
  setStep: (step: WorkflowStep) => void;
  setLanguage: (language: Language) => void;
  setProductImageForRef: (refId: string, productImageId: string) => void;
  updateCopySection: (refId: string, variationId: string, sectionId: string, text: string) => void;
  updateCopySectionHebrew: (refId: string, variationId: string, sectionId: string, text: string) => void;
  replaceCopyVariations: (refId: string, variations: CopyVariation[]) => void;
  selectVariation: (refId: string, variationId: string) => void;
  toggleVariationForGeneration: (refId: string, variationId: string) => void;
  updateGeneration: (refId: string, jobId: string, updates: Partial<GenerationJob>) => void;
  addGeneration: (refId: string, job: GenerationJob) => void;
  setEnhancedVariationMatching: (enabled: boolean) => void;
  reset: () => void;
  confirmNavigation: (callback: () => void) => void;
  activeJobs: GenerationJob[];
  isGenerating: boolean;
  isAnalyzing: boolean;
}

const PetTagWorkflowContext = createContext<PetTagWorkflowContextType | null>(null);

export function usePetTagWorkflowContext() {
  const ctx = useContext(PetTagWorkflowContext);
  if (!ctx) throw new Error("usePetTagWorkflowContext must be used within PetTagWorkflowProvider");
  return ctx;
}

export function PetTagWorkflowProvider({ children }: { children: ReactNode }) {
  const workflow = usePetTagWorkflow();
  const { state, updateGeneration } = workflow;

  const activeJobs = state.references.flatMap((r) =>
    (r.generations || []).filter((g) => g.status === "queued" || g.status === "processing")
  );
  const isGenerating = state.step === "generate" && activeJobs.length > 0;
  const isAnalyzing = state.references.some(
    (r) => r.status === "uploading" || r.status === "analyzing"
  );

  const { confirmNavigation } = useNavigationGuard(isGenerating || isAnalyzing);

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

            // Auto-save to pet-tag gallery (NOT the main gallery) when completed
            if (data.status === "completed" && data.resultUrl) {
              const variation = ref.copyVariations?.find((v) => v.id === gen.variationId);
              const productImageId = state.selectedProductImageByRefId[ref.id];

              // Fetch label of the chosen product image for the gallery entry
              let productImageLabel: string | undefined;
              if (productImageId) {
                try {
                  const prodRes = await fetch("/api/pet-tag/products");
                  const prodData = await prodRes.json();
                  const prod = prodData.products?.find(
                    (p: { id: string; label: string }) => p.id === productImageId
                  );
                  productImageLabel = prod?.label;
                } catch {}
              }

              const saveBody = JSON.stringify({
                action: "add-image",
                sourceUrl: data.resultUrl,
                prompt: ref.prompt?.substring(0, 200) || "",
                size: gen.size,
                angle: variation?.angle || "",
                folderId: "root",
                originalPrompt: ref.prompt || "",
                referenceImageUrl: ref.uploadedUrl || "",
                productImageId,
                productImageLabel,
                productImageIds: productImageId ? [productImageId] : [],
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

              // Retry up to 5 times with exponential backoff. Logs each failure
              // reason so the user can diagnose recurring saves that fail
              // (typically: kie.ai URL expired, disk space low, body validation).
              (async () => {
                let lastError = "";
                for (let attempt = 0; attempt < 5; attempt++) {
                  try {
                    const saveRes = await fetch("/api/pet-tag/gallery", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: saveBody,
                    });
                    if (saveRes.ok) return;
                    // Got a response but it's not OK — read the error body.
                    let errBody = "";
                    try {
                      const data = await saveRes.json();
                      errBody = data?.error || JSON.stringify(data);
                    } catch {
                      errBody = await saveRes.text().catch(() => "(no body)");
                    }
                    lastError = `HTTP ${saveRes.status}: ${errBody}`;
                    console.warn(
                      `[pet-tag save] attempt ${attempt + 1}/5 failed — ${lastError}`,
                      gen.jobId
                    );
                    // 4xx errors are not transient — stop retrying.
                    if (saveRes.status >= 400 && saveRes.status < 500) {
                      break;
                    }
                  } catch (err) {
                    lastError = err instanceof Error ? err.message : String(err);
                    console.warn(
                      `[pet-tag save] attempt ${attempt + 1}/5 exception — ${lastError}`,
                      gen.jobId
                    );
                  }
                  // Exponential backoff: 1s, 2s, 4s, 8s, 16s
                  await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
                }
                console.error(
                  "Failed to save pet-tag image after 5 attempts. Last error:",
                  lastError,
                  "JobId:",
                  gen.jobId
                );
              })();
            }
          }
        } catch {
          // silently retry on next poll
        }
      }
    }
  }, [state.references, state.selectedProductImageByRefId, updateGeneration]);

  usePolling(pollGenerations, {
    enabled: activeJobs.length > 0,
    interval: 5000,
  });

  return (
    <PetTagWorkflowContext.Provider
      value={{
        ...workflow,
        confirmNavigation,
        activeJobs,
        isGenerating,
        isAnalyzing,
      }}
    >
      {children}
    </PetTagWorkflowContext.Provider>
  );
}
