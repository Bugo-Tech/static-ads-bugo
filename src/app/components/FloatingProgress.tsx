"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkflow } from "@/context/WorkflowContext";

export default function FloatingProgress() {
  const router = useRouter();
  const { state, activeJobs, isGenerating, isAnalyzing } = useWorkflow();
  const [minimized, setMinimized] = useState(false);

  // Nothing active — don't render
  if (!isGenerating && !isAnalyzing) return null;

  // If we're on the main page, don't show floating indicator (the page itself shows progress)
  // We detect this by checking if the URL is "/"
  // But since this is SSR-safe, we always render and let users click through
  const totalGenerations = state.references.reduce(
    (sum, r) => sum + (r.generations?.length || 0),
    0
  );
  const completedGenerations = state.references.reduce(
    (sum, r) =>
      sum +
      (r.generations?.filter((g) => g.status === "completed" || g.status === "failed").length || 0),
    0
  );

  const analyzingCount = state.references.filter(
    (r) => r.status === "uploading" || r.status === "analyzing"
  ).length;
  const analyzedCount = state.references.filter((r) => r.status === "analyzed").length;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary-dark transition-all animate-pulse"
        title="Show progress"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl border border-border bg-white p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-gray-900">
          {isAnalyzing ? "Analyzing..." : "Generating..."}
        </h4>
        <div className="flex gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Minimize"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
            </svg>
          </button>
        </div>
      </div>

      {isAnalyzing && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Analysis</span>
            <span>{analyzedCount} / {state.references.length}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{
                width: `${state.references.length > 0 ? (analyzedCount / state.references.length) * 100 : 0}%`,
              }}
            />
          </div>
          {analyzingCount > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              {analyzingCount} reference{analyzingCount !== 1 ? "s" : ""} being analyzed...
            </p>
          )}
        </div>
      )}

      {isGenerating && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Generation</span>
            <span>{completedGenerations} / {totalGenerations}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{
                width: `${totalGenerations > 0 ? (completedGenerations / totalGenerations) * 100 : 0}%`,
              }}
            />
          </div>
          {activeJobs.length > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              {activeJobs.length} ad{activeJobs.length !== 1 ? "s" : ""} in progress...
            </p>
          )}
        </div>
      )}

      <button
        onClick={() => router.push("/")}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary/10 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to workflow
      </button>
    </div>
  );
}
