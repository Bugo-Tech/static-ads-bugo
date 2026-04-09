"use client";

import { PromptMode } from "@/lib/types";

interface PromptEditorProps {
  prompt: string;
  promptMode: PromptMode;
  onPromptChange: (prompt: string) => void;
  onModeChange: (mode: PromptMode) => void;
}

export default function PromptEditor({
  prompt,
  promptMode,
  onPromptChange,
  onModeChange,
}: PromptEditorProps) {
  function handleCopy() {
    navigator.clipboard.writeText(prompt);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-700">Nano Banana Prompt</h4>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            <button
              onClick={() => onModeChange("auto")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                promptMode === "auto"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => onModeChange("manual")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                promptMode === "manual"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Manual
            </button>
          </div>
          <button
            onClick={handleCopy}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="Copy prompt"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        readOnly={promptMode === "auto"}
        className={`w-full rounded-lg border border-border px-3 py-2 text-xs font-mono text-gray-700 transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
          promptMode === "auto" ? "bg-gray-50" : "bg-white"
        }`}
        rows={6}
        placeholder={
          promptMode === "manual"
            ? "Paste your custom Nano Banana prompt here..."
            : "Prompt will be auto-generated after analysis"
        }
      />
    </div>
  );
}
