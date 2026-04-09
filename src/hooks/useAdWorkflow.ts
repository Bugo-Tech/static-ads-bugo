"use client";

import { useReducer, useCallback } from "react";
import {
  WorkflowState,
  WorkflowAction,
  ReferenceAd,
} from "@/lib/types";

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

const initialState: WorkflowState = {
  step: "upload",
  references: [],
  selectedProductImageIds: [],
  language: "he",
};

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
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
                  s.id === action.sectionId
                    ? { ...s, adaptedText: action.text }
                    : s
                ),
              };
            }),
          };
        }),
      };

    case "SELECT_VARIATION":
      return {
        ...state,
        references: state.references.map((r) =>
          r.id === action.refId
            ? { ...r, selectedVariationId: action.variationId }
            : r
        ),
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

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

export function useAdWorkflow() {
  const [state, dispatch] = useReducer(workflowReducer, initialState);

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
    (step: WorkflowState["step"]) => dispatch({ type: "SET_STEP", step }),
    []
  );

  const setLanguage = useCallback(
    (language: WorkflowState["language"]) =>
      dispatch({ type: "SET_LANGUAGE", language }),
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

  const selectVariation = useCallback(
    (refId: string, variationId: string) =>
      dispatch({ type: "SELECT_VARIATION", refId, variationId }),
    []
  );

  const updateGeneration = useCallback(
    (refId: string, jobId: string, updates: Partial<import("@/lib/types").GenerationJob>) =>
      dispatch({ type: "UPDATE_GENERATION", refId, jobId, updates }),
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
    selectVariation,
    updateGeneration,
    reset,
  };
}
