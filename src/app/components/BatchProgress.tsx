"use client";

import { ReferenceAd } from "@/lib/types";

interface BatchProgressProps {
  references: ReferenceAd[];
}

export default function BatchProgress({ references }: BatchProgressProps) {
  const totalJobs = references.flatMap((r) => r.generations || []);
  const completed = totalJobs.filter((g) => g.status === "completed").length;
  const failed = totalJobs.filter((g) => g.status === "failed").length;
  const total = totalJobs.length;
  const progress = total > 0 ? ((completed + failed) / total) * 100 : 0;

  // Collect unique error messages from failed jobs and reference errors
  const errors = new Set<string>();
  references.forEach((r) => {
    if (r.error) errors.add(r.error);
    (r.generations || []).forEach((g) => {
      if (g.error) errors.add(g.error);
    });
  });
  const errorList = Array.from(errors);

  // If no jobs and we have references in "generating" status, show submitting state
  const submitting = total === 0 && references.some((r) => r.status === "generating");

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">
          {submitting
            ? "Submitting to Nano Banana..."
            : `${completed} of ${total} images generated`}
          {failed > 0 && <span className="text-red-500 ml-1">({failed} failed)</span>}
        </span>
        <span className="text-gray-500">{Math.round(progress)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      {errorList.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
          <div className="text-xs font-bold text-red-700 mb-1">Errors:</div>
          {errorList.map((err, i) => (
            <div key={i} className="text-xs text-red-600">
              {err.includes("Credits insufficient") ? (
                <>
                  💳 <strong>kie.ai credits insufficient.</strong> Top up your balance at{" "}
                  <a href="https://kie.ai/dashboard" target="_blank" rel="noopener" className="underline">
                    kie.ai/dashboard
                  </a>
                </>
              ) : (
                err
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
