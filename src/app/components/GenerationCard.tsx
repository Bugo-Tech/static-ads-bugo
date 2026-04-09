"use client";

import { ReferenceAd } from "@/lib/types";

interface GenerationCardProps {
  reference: ReferenceAd;
}

export default function GenerationCard({ reference }: GenerationCardProps) {
  const generations = reference.generations || [];

  return (
    <div className="rounded-2xl border border-border bg-white p-6">
      <div className="flex gap-6">
        {/* Reference thumbnail */}
        <div className="w-32 flex-shrink-0">
          <img
            src={reference.previewUrl}
            alt="Reference"
            className="w-full rounded-xl border border-border"
          />
        </div>

        {/* Generated images */}
        <div className="flex-1">
          <div className="mb-3 flex items-center gap-2">
            <h4 className="text-sm font-bold text-gray-900">Generated Ads</h4>
            {reference.error && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                {reference.error}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {generations.map((gen, i) => (
              <div
                key={gen.jobId || `gen-${i}`}
                className="overflow-hidden rounded-xl border border-border"
              >
                <div className="bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">
                  {gen.size}
                </div>
                <div
                  className={`relative ${
                    gen.size === "9:16" ? "aspect-[9/16]" : "aspect-square"
                  } max-h-80 overflow-hidden bg-gray-100`}
                >
                  {gen.status === "completed" && gen.resultUrl ? (
                    <img
                      src={gen.resultUrl}
                      alt={`Generated ${gen.size}`}
                      className="h-full w-full object-contain"
                    />
                  ) : gen.status === "failed" ? (
                    <div className="flex h-full items-center justify-center">
                      <span className="text-sm text-red-500">
                        {gen.error || "Generation failed"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2">
                      <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
                      <span className="text-xs text-gray-500">
                        {gen.status === "queued" ? "In queue..." : "Generating..."}
                      </span>
                    </div>
                  )}
                </div>
                {gen.status === "completed" && gen.resultUrl && (
                  <div className="flex gap-2 p-2">
                    <a
                      href={gen.resultUrl}
                      download
                      className="flex-1 rounded-lg bg-primary/10 py-1.5 text-center text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                    >
                      Download
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>

          {generations.length === 0 && reference.status === "generating" && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Submitting to Nano Banana...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
