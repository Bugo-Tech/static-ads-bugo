"use client";

import { useState } from "react";
import { ReferenceAd, GenerationJob } from "@/lib/types";
import RegenerateModal from "./RegenerateModal";

interface GenerationCardProps {
  reference: ReferenceAd;
  onAddGeneration?: (refId: string, job: GenerationJob) => void;
  selectedProductImageIds?: string[];
}

export default function GenerationCard({ reference, onAddGeneration, selectedProductImageIds }: GenerationCardProps) {
  const generations = reference.generations || [];
  const [regenerateModal, setRegenerateModal] = useState<{ gen: (typeof generations)[number]; mode: "fix" | "cross-size" } | null>(null);

  async function handleRegenerate(gen: (typeof generations)[number], params: { fixInstruction?: string; targetSize: string }) {
    const variation = reference.copyVariations?.find((v) => v.id === gen.variationId);
    const basePrompt = reference.prompt || "";
    const isCrossSize = !params.fixInstruction;

    let prompt: string;
    let referenceImageUrl: string | undefined;

    if (params.fixInstruction) {
      // Fix mode: use generated image as reference + prepend fix instruction
      prompt = `CRITICAL OVERRIDE — APPLY BEFORE ANYTHING ELSE:\n${params.fixInstruction}\n\nThe above fix MUST be applied. If it contradicts any instruction below, the fix takes priority.\n\n---\n\n${basePrompt}`;
      referenceImageUrl = gen.resultUrl;
    } else {
      // Cross-size mode: use the GENERATED image (not original reference) + resize-only prompt
      referenceImageUrl = gen.resultUrl;
      prompt = `RESIZE ONLY — You are converting an existing ad from ${gen.size} to ${params.targetSize}.
The ad content (text, layout, visual elements, colors) must be IDENTICAL to the reference image — same copy WORD-FOR-WORD, same visual elements, same product placement, same colors.
Only adjust the canvas proportions and element positioning to fit the new ${params.targetSize} aspect ratio.
Do NOT change, add, or remove any text. Do NOT change any visual element. Do NOT reinterpret or redesign.
This is a pure resize/reformat operation.

${basePrompt}`;
    }

    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        referenceImageUrl,
        // Cross-size: don't pass copy or product — they're baked into the generated image already
        productImageIds: isCrossSize ? [] : (selectedProductImageIds || []),
        size: params.targetSize,
        copyVariation: isCrossSize ? undefined : variation,
        isCrossSize,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.jobId) throw new Error(data.error || "Failed to submit");

    if (onAddGeneration) {
      onAddGeneration(reference.id, {
        jobId: data.jobId,
        size: params.targetSize as "1:1" | "9:16",
        variationId: gen.variationId,
        status: "queued",
      });
    }
  }

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
                  <div className="space-y-1.5 p-2">
                    {/* QC Status */}
                    {gen.qcStatus === "pending" && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600">
                        <div className="h-2.5 w-2.5 animate-spin rounded-full border border-amber-500 border-t-transparent" />
                        QC checking...
                      </div>
                    )}
                    {gen.qcStatus === "fixing" && (
                      <div className="flex items-center gap-1.5 text-xs text-blue-600">
                        <div className="h-2.5 w-2.5 animate-spin rounded-full border border-blue-500 border-t-transparent" />
                        Issues found — auto-fixing...
                      </div>
                    )}
                    {gen.qcStatus === "passed" && (
                      <div className="text-xs text-green-600">✓ QC passed</div>
                    )}
                    {gen.qcStatus === "failed" && gen.qcIssues && gen.qcIssues.length > 0 && (
                      <div className="text-xs text-red-600">
                        ⚠ {gen.qcIssues[0]}
                        {gen.qcIssues.length > 1 && ` (+${gen.qcIssues.length - 1} more)`}
                      </div>
                    )}

                    <div className="flex gap-2">
                    <a
                      href={gen.resultUrl}
                      download
                      className="flex-1 rounded-lg bg-primary/10 py-1.5 text-center text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                    >
                      Download
                    </a>
                    <button
                      onClick={() => setRegenerateModal({ gen, mode: "fix" })}
                      className="flex-1 rounded-lg bg-amber-50 py-1.5 text-center text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      Fix Text
                    </button>
                    <button
                      onClick={() => setRegenerateModal({ gen, mode: "cross-size" })}
                      className="flex-1 rounded-lg bg-blue-50 py-1.5 text-center text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      {gen.size === "1:1" ? "9:16" : "1:1"}
                    </button>
                  </div>
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

      {regenerateModal && (
        <RegenerateModal
          mode={regenerateModal.mode}
          currentSize={regenerateModal.gen.size}
          onSubmit={(params) => handleRegenerate(regenerateModal.gen, params)}
          onClose={() => setRegenerateModal(null)}
        />
      )}
    </div>
  );
}
