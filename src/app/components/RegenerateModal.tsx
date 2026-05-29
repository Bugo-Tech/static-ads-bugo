"use client";

import { useState } from "react";

interface RegenerateModalProps {
  mode: "fix" | "cross-size";
  currentSize: string;
  batchCount?: number;
  onSubmit: (params: { fixInstruction?: string; targetSize: string }) => Promise<void>;
  onClose: () => void;
}

export default function RegenerateModal({ mode, currentSize, batchCount, onSubmit, onClose }: RegenerateModalProps) {
  const [fixInstruction, setFixInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const targetSize = currentSize === "1:1" ? "9:16" : "1:1";

  async function handleSubmit() {
    setLoading(true);
    try {
      await onSubmit({
        fixInstruction: mode === "fix" ? fixInstruction : undefined,
        targetSize: mode === "cross-size" ? targetSize : currentSize,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit. This image may be missing metadata — try generating from a new reference.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-900">
          {mode === "fix"
            ? batchCount ? `Fix Text in ${batchCount} Ads` : "Fix Text in Ad"
            : `Generate ${targetSize} Version`}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {mode === "fix"
            ? batchCount
              ? `The same fix will be applied to all ${batchCount} selected images.`
              : "Describe what to fix. The current image will be used as reference."
            : `Re-generate this ad in ${targetSize} format using the same prompt and style.`}
        </p>

        {mode === "fix" && (
          <textarea
            value={fixInstruction}
            onChange={(e) => setFixInstruction(e.target.value)}
            placeholder='e.g., Replace "ג׳ווקים" with "ג׳וקים"'
            className="mt-4 w-full rounded-xl border border-border p-3 text-sm focus:border-primary focus:outline-none"
            rows={3}
            dir="auto"
            autoFocus
          />
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || (mode === "fix" && !fixInstruction.trim())}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? batchCount ? `Submitting ${batchCount}...` : "Submitting..."
              : mode === "fix"
              ? batchCount ? `Fix ${batchCount} Ads` : "Fix & Regenerate"
              : `Generate ${targetSize}`}
          </button>
        </div>
      </div>
    </div>
  );
}
