"use client";

import { ReferenceAd } from "@/lib/types";

interface ReferenceCardProps {
  reference: ReferenceAd;
  onRemove: (id: string) => void;
  onClick?: (id: string) => void;
}

const statusLabels: Record<ReferenceAd["status"], { label: string; color: string }> = {
  idle: { label: "Ready", color: "bg-gray-100 text-gray-600" },
  uploading: { label: "Uploading...", color: "bg-blue-100 text-blue-700" },
  analyzing: { label: "Analyzing...", color: "bg-yellow-100 text-yellow-700" },
  analyzed: { label: "Analyzed", color: "bg-green-100 text-green-700" },
  generating: { label: "Generating...", color: "bg-purple-100 text-purple-700" },
  done: { label: "Done", color: "bg-green-100 text-green-700" },
  error: { label: "Error", color: "bg-red-100 text-red-700" },
};

export default function ReferenceCard({
  reference,
  onRemove,
  onClick,
}: ReferenceCardProps) {
  const status = statusLabels[reference.status];
  const isLoading = reference.status === "uploading" || reference.status === "analyzing" || reference.status === "generating";

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-all hover:shadow-md ${
        onClick ? "cursor-pointer" : ""
      }`}
      onClick={() => onClick?.(reference.id)}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        <img
          src={reference.previewUrl}
          alt="Reference ad"
          className="h-full w-full object-cover"
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-white border-t-transparent" />
          </div>
        )}
      </div>

      {/* Status badge */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}>
            {status.label}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(reference.id);
            }}
            className="rounded-lg p-1 text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {reference.error && (
          <p className="mt-1 text-xs text-red-500 truncate">{reference.error}</p>
        )}
        {reference.analysis && (
          <p className="mt-1 text-xs text-gray-500 truncate">
            {reference.analysis.niche === "pest-control" ? "Same niche" : "Cross-niche"} — {reference.analysis.angle}
          </p>
        )}
      </div>
    </div>
  );
}
