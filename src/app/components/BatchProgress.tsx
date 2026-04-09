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

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">
          {completed} of {total} images generated
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
    </div>
  );
}
