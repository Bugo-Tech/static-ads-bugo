"use client";

import { createContext, useContext, useCallback, useMemo, ReactNode } from "react";
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

// The product list rarely changes and here it is only needed to look up a
// product URL for QC comparison — cache it briefly instead of refetching per
// completed job. Failed fetches are never cached.
type ProductInfo = { id: string; publicUrl?: string; url?: string };
const PRODUCTS_TTL_MS = 60_000;
let productsCache: { at: number; promise: Promise<ProductInfo[]> } | null = null;
function fetchProductsCached(): Promise<ProductInfo[]> {
  if (!productsCache || Date.now() - productsCache.at > PRODUCTS_TTL_MS) {
    const promise = fetch("/api/products")
      .then((r) => {
        if (!r.ok) throw new Error(`products fetch failed: ${r.status}`);
        return r.json();
      })
      .then((d) => d.products || []);
    promise.catch(() => {
      if (productsCache?.promise === promise) productsCache = null;
    });
    productsCache = { at: Date.now(), promise };
  }
  return productsCache.promise;
}

interface JobStatus {
  status: GenerationJob["status"];
  resultUrl?: string;
  error?: string;
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const workflow = useAdWorkflow();
  const { state, updateGeneration } = workflow;

  // Compute active state
  const activeJobs = useMemo(
    () =>
      state.references.flatMap((r) =>
        (r.generations || []).filter((g) => g.status === "queued" || g.status === "processing")
      ),
    [state.references]
  );
  const isGenerating = state.step === "generate" && activeJobs.length > 0;
  const isAnalyzing = state.references.some((r) => r.status === "uploading" || r.status === "analyzing");

  // Navigation guard — active during generation OR analysis
  const { confirmNavigation } = useNavigationGuard(isGenerating || isAnalyzing);

  // Polling — runs at provider level, survives page navigation.
  // All active jobs are checked with a single batched request per tick.
  const pollGenerations = useCallback(async () => {
    const active: { ref: ReferenceAd; gen: GenerationJob }[] = [];
    for (const ref of state.references) {
      for (const gen of ref.generations || []) {
        if (gen.status === "queued" || gen.status === "processing") {
          active.push({ ref, gen });
        }
      }
    }
    if (active.length === 0) return;

    let statuses: Record<string, JobStatus> = {};
    try {
      const jobIds = active.map(({ gen }) => gen.jobId).join(",");
      const res = await fetch(`/api/image-status?jobIds=${encodeURIComponent(jobIds)}`);
      const batch = await res.json();
      statuses = batch.statuses || {};
    } catch {
      // silently retry on next poll
      return;
    }

    for (const { ref, gen } of active) {
      const data = statuses[gen.jobId];
      if (!data) continue;
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
                  const products = await fetchProductsCached();
                  const prod = products.find((p) => p.id === state.selectedProductImageIds[0]);
                  productUrl = prod?.publicUrl || prod?.url || undefined;
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
                  // Report the failure and stop. Fixing is the user's call —
                  // the Fix button on each gallery card runs the same flow.
                  //
                  // This used to auto-submit a regeneration here. That made the
                  // poller a producer of jobs, not just a reader of them: each
                  // fix was polled, QC'd, and could spawn another, with no depth
                  // limit. It also passed the generated image back as its own
                  // reference, so every round drifted further from the original
                  // — which is exactly what QC grades — making the next failure
                  // more likely. One request could snowball into 30-40 images.
                  updateGeneration(ref.id, gen.jobId, {
                    qcStatus: "failed",
                    qcIssues: qc.issues || [],
                  });
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
    }
  }, [state.references, state.selectedProductImageIds, updateGeneration]);

  usePolling(pollGenerations, {
    enabled: activeJobs.length > 0,
    interval: 5000,
  });

  const value = useMemo(
    () => ({
      ...workflow,
      confirmNavigation,
      activeJobs,
      isGenerating,
      isAnalyzing,
    }),
    // All workflow callbacks are stable (useCallback with empty deps), so
    // `state` captures every change from the workflow hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, confirmNavigation, activeJobs, isGenerating, isAnalyzing]
  );

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}
