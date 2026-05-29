"use client";

import { useState } from "react";
import {
  CopyVariation,
  Language,
  needsHebrewCompanion,
  HEBREW_COMPANION_LANGUAGE_LABELS,
} from "@/lib/types";

interface CopyEditorProps {
  variations: CopyVariation[];
  selectedVariationId?: string;
  selectedVariationIds?: string[];
  onSelectVariation: (id: string) => void;
  onToggleForGeneration: (id: string) => void;
  onUpdateSection: (variationId: string, sectionId: string, text: string) => void;
  onUpdateSectionHebrew?: (variationId: string, sectionId: string, text: string) => void;
  onSyncHebrewToForeign?: (variationId: string) => Promise<void>;
  onSyncForeignToHebrew?: (variationId: string) => Promise<void>;
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
  onUpdateSectionHebrew,
  onSyncHebrewToForeign,
  onSyncForeignToHebrew,
  language,
}: CopyEditorProps) {
  const isRtl = rtlLanguages.includes(language);
  const showHebrewCompanion = needsHebrewCompanion(language);
  const foreignLabel = HEBREW_COMPANION_LANGUAGE_LABELS[language] ?? "";

  const [syncingHeToForeign, setSyncingHeToForeign] = useState<string | null>(null);
  const [syncingForeignToHe, setSyncingForeignToHe] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleSyncHeToForeign(vId: string) {
    console.log("[CopyEditor] handleSyncHeToForeign clicked", vId, "handler?", !!onSyncHebrewToForeign);
    if (!onSyncHebrewToForeign) {
      setSyncError("חסר handler — handler לא הועבר ל-CopyEditor");
      return;
    }
    setSyncError(null);
    setSyncingHeToForeign(vId);
    try {
      await onSyncHebrewToForeign(vId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[CopyEditor] sync he→foreign failed:", err);
      setSyncError(`שגיאה: ${msg}`);
    } finally {
      setSyncingHeToForeign(null);
    }
  }

  async function handleSyncForeignToHe(vId: string) {
    console.log("[CopyEditor] handleSyncForeignToHe clicked", vId, "handler?", !!onSyncForeignToHebrew);
    if (!onSyncForeignToHebrew) {
      setSyncError("חסר handler — handler לא הועבר ל-CopyEditor");
      return;
    }
    setSyncError(null);
    setSyncingForeignToHe(vId);
    try {
      await onSyncForeignToHebrew(vId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[CopyEditor] sync foreign→he failed:", err);
      setSyncError(`שגיאה: ${msg}`);
    } finally {
      setSyncingForeignToHe(null);
    }
  }

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
            {/* Sync buttons — only for ar/de/ru/fr */}
            {showHebrewCompanion && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2">
                <span className="text-xs font-bold text-indigo-700">סנכרון תרגום:</span>
                <button
                  onClick={() => handleSyncHeToForeign(variation.id)}
                  disabled={syncingHeToForeign === variation.id || syncingForeignToHe === variation.id}
                  className="rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  dir="rtl"
                  title={`תרגם את הטקסט בעברית ל${foreignLabel} ועדכן את הקופי שיופיע בפועל במודעה`}
                >
                  {syncingHeToForeign === variation.id
                    ? "מתרגם…"
                    : `עברית → ${foreignLabel}`}
                </button>
                <button
                  onClick={() => handleSyncForeignToHe(variation.id)}
                  disabled={syncingHeToForeign === variation.id || syncingForeignToHe === variation.id}
                  className="rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  dir="rtl"
                  title={`רענן את התרגום לעברית לפי הטקסט הנוכחי ב${foreignLabel}`}
                >
                  {syncingForeignToHe === variation.id
                    ? "מתרגם…"
                    : `${foreignLabel} → עברית`}
                </button>
                {syncError && (
                  <span className="text-xs text-red-600" dir="rtl">
                    {syncError}
                  </span>
                )}
              </div>
            )}

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

                {/* Editable Hebrew companion (ar/de/ru/fr only) */}
                {showHebrewCompanion && (
                  <div className="mb-1.5">
                    <div className="mb-0.5 flex items-center justify-end">
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                        עברית
                      </span>
                    </div>
                    <textarea
                      value={section.hebrewText ?? ""}
                      onChange={(e) =>
                        onUpdateSectionHebrew?.(variation.id, section.id, e.target.value)
                      }
                      placeholder="מתרגם לעברית…"
                      dir="rtl"
                      className="w-full rounded-lg border border-indigo-200 bg-indigo-50/30 px-3 py-2 text-sm text-gray-800 text-right transition-colors focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      rows={(section.hebrewText ?? "").split("\n").length > 1 ? 3 : 1}
                    />
                  </div>
                )}

                {/* Existing foreign-language (or Hebrew/English) textarea — UNCHANGED */}
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
