"use client";

import { createContext, useContext, useCallback, useMemo, ReactNode } from "react";
import { useBirdsWorkflow, type BirdsWorkflowState } from "@/hooks/useBirdsWorkflow";
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
 * Bugo Birds workflow context — parallel to WorkflowContext.tsx (main Bugo).
 * Polls shared /api/image-status (generic kie.ai job poller).
 * Auto-saves completed generations to /api/birds/gallery (NOT the main gallery).
 *
 * Reuses the shared usePolling and useNavigationGuard hooks — both are
 * stateless and brand-agnostic.
 */

interface BirdsWorkflowContextType {
  state: BirdsWorkflowState;
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
  setEnhancedVariationMatching: (enabled: boolean) => void;
  reset: () => void;
  confirmNavigation: (callback: () => void) => void;
  activeJobs: GenerationJob[];
  isGenerating: boolean;
  isAnalyzing: boolean;
}

const BirdsWorkflowContext = createContext<BirdsWorkflowContextType | null>(null);

interface JobStatus {
  status: GenerationJob["status"];
  resultUrl?: string;
  error?: string;
}

export function useBirdsWorkflowContext() {
  const ctx = useContext(BirdsWorkflowContext);
  if (!ctx) throw new Error("useBirdsWorkflowContext must be used within BirdsWorkflowProvider");
  return ctx;
}

export function BirdsWorkflowProvider({ children }: { children: ReactNode }) {
  const workflow = useBirdsWorkflow();
  const { state, updateGeneration } = workflow;

  const activeJobs = useMemo(
    () =>
      state.references.flatMap((r) =>
        (r.generations || []).filter((g) => g.status === "queued" || g.status === "processing")
      ),
    [state.references]
  );
  const isGenerating = state.step === "generate" && activeJobs.length > 0;
  const isAnalyzing = state.references.some(
    (r) => r.status === "uploading" || r.status === "analyzing"
  );

  const { confirmNavigation } = useNavigationGuard(isGenerating || isAnalyzing);

  // Polling — all active jobs are checked with a single batched request per tick.
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

        // Auto-save to birds gallery (NOT the main gallery) when completed.
        if (data.status === "completed" && data.resultUrl) {
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

          // Retry up to 5 times with exponential backoff + structured logging.
          (async () => {
            let lastError = "";
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                const saveRes = await fetch("/api/birds/gallery", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: saveBody,
                });
                if (saveRes.ok) return;
                let errBody = "";
                try {
                  const dataErr = await saveRes.json();
                  errBody = dataErr?.error || JSON.stringify(dataErr);
                } catch {
                  errBody = await saveRes.text().catch(() => "(no body)");
                }
                lastError = `HTTP ${saveRes.status}: ${errBody}`;
                console.warn(
                  `[birds save] attempt ${attempt + 1}/5 failed — ${lastError}`,
                  gen.jobId
                );
                if (saveRes.status >= 400 && saveRes.status < 500) break;
              } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                console.warn(
                  `[birds save] attempt ${attempt + 1}/5 exception — ${lastError}`,
                  gen.jobId
                );
              }
              await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
            }
            console.error(
              "Failed to save birds image after 5 attempts. Last error:",
              lastError,
              "JobId:",
              gen.jobId
            );
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
    <BirdsWorkflowContext.Provider value={value}>
      {children}
    </BirdsWorkflowContext.Provider>
  );
}
