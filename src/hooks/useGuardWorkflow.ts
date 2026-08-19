"use client";

import { useReducer, useCallback, useEffect, useRef } from "react";
import type {
  ReferenceAd,
  CopyVariation,
  GenerationJob,
  Language,
  WorkflowStep,
} from "@/lib/types";

/**
 * Bugo Guard workflow state — parallel to useAdWorkflow.ts (the main Bugo flow),
 * NOT to usePetTagWorkflow.ts. Like main Bugo, the product image selection
 * is GLOBAL across all references in the batch (selectedProductImageIds: string[]),
 * because Bugo Guard has a single product (or short list of variants) used
 * consistently — same pattern as the main Bugo flow.
 *
 * Separate localStorage key (bugo-guard-state-v1) for full state isolation.
 */

export interface GuardWorkflowState {
  step: WorkflowStep;
  references: ReferenceAd[];
  /** Global selection — applies to all references in the batch (matches main Bugo). */
  selectedProductImageIds: string[];
  language: Language;
  enhancedVariationMatching: boolean;
}

export type GuardWorkflowAction =
  | { type: "SET_STEP"; step: WorkflowStep }
  | { type: "ADD_REFERENCES"; files: File[] }
  | { type: "REMOVE_REFERENCE"; id: string }
  | { type: "UPDATE_REFERENCE"; id: string; updates: Partial<ReferenceAd> }
  | { type: "SET_LANGUAGE"; language: Language }
  | { type: "SET_SELECTED_PRODUCTS"; ids: string[] }
  | { type: "UPDATE_COPY_SECTION"; refId: string; variationId: string; sectionId: string; text: string }
  | { type: "UPDATE_COPY_SECTION_HEBREW"; refId: string; variationId: string; sectionId: string; text: string }
  | { type: "REPLACE_COPY_VARIATIONS"; refId: string; variations: CopyVariation[] }
  | { type: "SELECT_VARIATION"; refId: string; variationId: string }
  | { type: "TOGGLE_VARIATION_FOR_GENERATION"; refId: string; variationId: string }
  | { type: "UPDATE_GENERATION"; refId: string; jobId: string; updates: Partial<GenerationJob> }
  | { type: "ADD_GENERATION"; refId: string; job: GenerationJob }
  | { type: "SET_ENHANCED_VARIATION_MATCHING"; enabled: boolean }
  | { type: "RESET" }
  | { type: "HYDRATE"; state: Partial<GuardWorkflowState> };

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

const initialState: GuardWorkflowState = {
  step: "upload",
  references: [],
  selectedProductImageIds: [],
  language: "he",
  enhancedVariationMatching: true,
};

const STORAGE_KEY = "bugo-guard-state-v1";

function loadPersistedState(): Partial<GuardWorkflowState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (Array.isArray(parsed.references)) {
      parsed.references = parsed.references
        .filter((r: ReferenceAd) => r && r.uploadedUrl)
        .map((r: ReferenceAd) => ({
          ...r,
          previewUrl: r.uploadedUrl || r.previewUrl,
          generations: undefined,
          status: r.status === "generating" || r.status === "uploading" || r.status === "analyzing"
            ? "analyzed"
            : r.status,
        }));
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistState(state: GuardWorkflowState): void {
  if (typeof window === "undefined") return;
  try {
    const toSave = {
      ...state,
      references: state.references.map((r) => ({
        ...r,
        file: undefined,
        previewUrl: r.uploadedUrl || r.previewUrl,
      })),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // quota exceeded or storage disabled — silently skip
  }
}

function workflowReducer(state: GuardWorkflowState, action: GuardWorkflowAction): GuardWorkflowState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };

    case "ADD_REFERENCES": {
      const newRefs: ReferenceAd[] = action.files.map((file) => ({
        id: generateId(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "idle",
        promptMode: "auto",
      }));
      return {
        ...state,
        references: [...state.references, ...newRefs].slice(0, 10),
      };
    }

    case "REMOVE_REFERENCE":
      return {
        ...state,
        references: state.references.filter((r) => r.id !== action.id),
      };

    case "UPDATE_REFERENCE":
      return {
        ...state,
        references: state.references.map((r) =>
          r.id === action.id ? { ...r, ...action.updates } : r
        ),
      };

    case "SET_LANGUAGE":
      return { ...state, language: action.language };

    case "SET_SELECTED_PRODUCTS":
      return { ...state, selectedProductImageIds: action.ids };

    case "UPDATE_COPY_SECTION":
      return {
        ...state,
        references: state.references.map((r) => {
          if (r.id !== action.refId) return r;
          return {
            ...r,
            copyVariations: r.copyVariations?.map((v) => {
              if (v.id !== action.variationId) return v;
              return {
                ...v,
                sections: v.sections.map((s) =>
                  s.id === action.sectionId ? { ...s, adaptedText: action.text } : s
                ),
              };
            }),
          };
        }),
      };

    case "UPDATE_COPY_SECTION_HEBREW":
      return {
        ...state,
        references: state.references.map((r) => {
          if (r.id !== action.refId) return r;
          return {
            ...r,
            copyVariations: r.copyVariations?.map((v) => {
              if (v.id !== action.variationId) return v;
              return {
                ...v,
                sections: v.sections.map((s) =>
                  s.id === action.sectionId ? { ...s, hebrewText: action.text } : s
                ),
              };
            }),
          };
        }),
      };

    case "REPLACE_COPY_VARIATIONS":
      return {
        ...state,
        references: state.references.map((r) =>
          r.id === action.refId ? { ...r, copyVariations: action.variations } : r
        ),
      };

    case "SELECT_VARIATION":
      return {
        ...state,
        references: state.references.map((r) =>
          r.id === action.refId ? { ...r, selectedVariationId: action.variationId } : r
        ),
      };

    case "TOGGLE_VARIATION_FOR_GENERATION":
      return {
        ...state,
        references: state.references.map((r) => {
          if (r.id !== action.refId) return r;
          const current = r.selectedVariationIds || [r.selectedVariationId || ""];
          const has = current.includes(action.variationId);
          const updated = has
            ? current.filter((id) => id !== action.variationId)
            : [...current, action.variationId];
          return { ...r, selectedVariationIds: updated.length > 0 ? updated : current };
        }),
      };

    case "UPDATE_GENERATION":
      return {
        ...state,
        references: state.references.map((r) => {
          if (r.id !== action.refId) return r;
          return {
            ...r,
            generations: r.generations?.map((g) =>
              g.jobId === action.jobId ? { ...g, ...action.updates } : g
            ),
          };
        }),
      };

    case "ADD_GENERATION":
      return {
        ...state,
        references: state.references.map((r) => {
          if (r.id !== action.refId) return r;
          return {
            ...r,
            generations: [...(r.generations || []), action.job],
          };
        }),
      };

    case "SET_ENHANCED_VARIATION_MATCHING":
      return { ...state, enhancedVariationMatching: action.enabled };

    case "RESET":
      return initialState;

    case "HYDRATE":
      return { ...state, ...action.state };

    default:
      return state;
  }
}

export function useGuardWorkflow() {
  const [state, dispatch] = useReducer(workflowReducer, initialState);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const persisted = loadPersistedState();
    if (persisted) {
      dispatch({ type: "HYDRATE", state: persisted });
    }
    hydratedRef.current = true;
  }, []);

  // Persist on state change, but only after the initial hydration step
  // (otherwise the empty initial state would overwrite any saved state).
  // Debounced: stringifying the whole workflow synchronously on every
  // keystroke/poll update blocks the main thread.
  const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestStateRef = useRef(state);
  useEffect(() => {
    latestStateRef.current = state;
    if (!hydratedRef.current) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      persistState(latestStateRef.current);
    }, 500);
  }, [state]);

  // Flush any pending write when the page is left or the hook unmounts.
  useEffect(() => {
    const flush = () => {
      if (persistTimerRef.current && hydratedRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
        persistState(latestStateRef.current);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const addReferences = useCallback(
    (files: File[]) => dispatch({ type: "ADD_REFERENCES", files }),
    []
  );

  const removeReference = useCallback(
    (id: string) => dispatch({ type: "REMOVE_REFERENCE", id }),
    []
  );

  const updateReference = useCallback(
    (id: string, updates: Partial<ReferenceAd>) =>
      dispatch({ type: "UPDATE_REFERENCE", id, updates }),
    []
  );

  const setStep = useCallback(
    (step: WorkflowStep) => dispatch({ type: "SET_STEP", step }),
    []
  );

  const setLanguage = useCallback(
    (language: Language) => dispatch({ type: "SET_LANGUAGE", language }),
    []
  );

  const setSelectedProducts = useCallback(
    (ids: string[]) => dispatch({ type: "SET_SELECTED_PRODUCTS", ids }),
    []
  );

  const updateCopySection = useCallback(
    (refId: string, variationId: string, sectionId: string, text: string) =>
      dispatch({ type: "UPDATE_COPY_SECTION", refId, variationId, sectionId, text }),
    []
  );

  const updateCopySectionHebrew = useCallback(
    (refId: string, variationId: string, sectionId: string, text: string) =>
      dispatch({ type: "UPDATE_COPY_SECTION_HEBREW", refId, variationId, sectionId, text }),
    []
  );

  const replaceCopyVariations = useCallback(
    (refId: string, variations: CopyVariation[]) =>
      dispatch({ type: "REPLACE_COPY_VARIATIONS", refId, variations }),
    []
  );

  const selectVariation = useCallback(
    (refId: string, variationId: string) =>
      dispatch({ type: "SELECT_VARIATION", refId, variationId }),
    []
  );

  const toggleVariationForGeneration = useCallback(
    (refId: string, variationId: string) =>
      dispatch({ type: "TOGGLE_VARIATION_FOR_GENERATION", refId, variationId }),
    []
  );

  const updateGeneration = useCallback(
    (refId: string, jobId: string, updates: Partial<GenerationJob>) =>
      dispatch({ type: "UPDATE_GENERATION", refId, jobId, updates }),
    []
  );

  const addGeneration = useCallback(
    (refId: string, job: GenerationJob) =>
      dispatch({ type: "ADD_GENERATION", refId, job }),
    []
  );

  const setEnhancedVariationMatching = useCallback(
    (enabled: boolean) => dispatch({ type: "SET_ENHANCED_VARIATION_MATCHING", enabled }),
    []
  );

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  return {
    state,
    dispatch,
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
    updateGeneration,
    addGeneration,
    setEnhancedVariationMatching,
    reset,
  };
}
