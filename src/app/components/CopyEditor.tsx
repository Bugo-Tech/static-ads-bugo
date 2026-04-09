"use client";

import { CopyVariation, Language } from "@/lib/types";

interface CopyEditorProps {
  variations: CopyVariation[];
  selectedVariationId?: string;
  selectedVariationIds?: string[];
  onSelectVariation: (id: string) => void;
  onToggleForGeneration: (id: string) => void;
  onUpdateSection: (variationId: string, sectionId: string, text: string) => void;
  language: Language;
}

const rtlLanguages: Language[] = ["he", "ar"];

export default function CopyEditor({
  variations,
  selectedVariationId,
  selectedVariationIds = [],
  onSelectVariation,
  onToggleForGeneration,
  onUpdateSection,
  language,
}: CopyEditorProps) {
  const isRtl = rtlLanguages.includes(language);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-700">Copy Variations</h4>
        <span className="text-xs text-gray-400">
          {selectedVariationIds.length} selected for generation
        </span>
      </div>

      {/* Variation tabs with checkboxes */}
      <div className="flex flex-wrap gap-2">
        {variations.map((v, i) => {
          const isViewing = v.id === selectedVariationId;
          const isSelectedForGen = selectedVariationIds.includes(v.id);

          return (
            <div key={v.id} className="flex items-center gap-1">
              {/* Checkbox for generation selection */}
              <button
                onClick={() => onToggleForGeneration(v.id)}
                className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all ${
                  isSelectedForGen
                    ? "border-accent bg-accent text-white"
                    : "border-gray-300 bg-white hover:border-gray-400"
                }`}
                title={isSelectedForGen ? "Remove from generation" : "Add to generation"}
              >
                {isSelectedForGen && (
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>

              {/* Tab button to view/edit */}
              <button
                onClick={() => onSelectVariation(v.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  isViewing
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Variation {i + 1}
                <span className="ml-1 text-xs opacity-70">({v.angle})</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Active variation sections */}
      {variations
        .filter((v) => v.id === selectedVariationId)
        .map((variation) => (
          <div key={variation.id} className="space-y-3">
            {variation.sections.map((section) => (
              <div key={section.id}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-bold text-gray-600 uppercase">
                    {section.label}
                  </span>
                  {section.originalText && (
                    <span className="text-xs text-gray-400 truncate max-w-xs">
                      Original: {section.originalText}
                    </span>
                  )}
                </div>
                <textarea
                  value={section.adaptedText}
                  onChange={(e) =>
                    onUpdateSection(variation.id, section.id, e.target.value)
                  }
                  dir={isRtl ? "rtl" : "ltr"}
                  className={`w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-gray-800 transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                    isRtl ? "text-right" : "text-left"
                  }`}
                  rows={section.adaptedText.split("\n").length > 1 ? 3 : 1}
                />
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
