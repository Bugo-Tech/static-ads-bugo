"use client";

import { CopyVariation, Language } from "@/lib/types";

interface CopyEditorProps {
  variations: CopyVariation[];
  selectedVariationId?: string;
  onSelectVariation: (id: string) => void;
  onUpdateSection: (variationId: string, sectionId: string, text: string) => void;
  language: Language;
}

const rtlLanguages: Language[] = ["he", "ar"];

export default function CopyEditor({
  variations,
  selectedVariationId,
  onSelectVariation,
  onUpdateSection,
  language,
}: CopyEditorProps) {
  const isRtl = rtlLanguages.includes(language);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-bold text-gray-700">Copy Variations</h4>

      {/* Variation tabs */}
      <div className="flex gap-2">
        {variations.map((v, i) => (
          <button
            key={v.id}
            onClick={() => onSelectVariation(v.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              v.id === selectedVariationId
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Variation {i + 1}
            <span className="ml-1 text-xs opacity-70">({v.angle})</span>
          </button>
        ))}
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
