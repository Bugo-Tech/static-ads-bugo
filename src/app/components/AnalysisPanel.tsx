"use client";

import { AnalysisResult } from "@/lib/types";

interface AnalysisPanelProps {
  analysis: AnalysisResult;
}

export default function AnalysisPanel({ analysis }: AnalysisPanelProps) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <h4 className="mb-3 text-sm font-bold text-gray-700">Analysis</h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-xs font-medium text-gray-500">Layout</span>
          <p className="text-gray-800">{analysis.layout}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500">Angle</span>
          <p className="text-gray-800">{analysis.angle}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500">Product Placement</span>
          <p className="text-gray-800">{analysis.productPlacement}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500">Colors</span>
          <div className="flex gap-1 mt-1">
            {analysis.colorScheme.map((color, i) => (
              <div
                key={i}
                className="h-5 w-5 rounded border border-gray-200"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
        {analysis.niche === "other" && analysis.nicheMapping && (
          <div className="col-span-2">
            <span className="text-xs font-medium text-gray-500">Niche Adaptation</span>
            <p className="text-gray-800">{analysis.nicheMapping}</p>
          </div>
        )}
        {analysis.copySections.length > 0 && (
          <div className="col-span-2">
            <span className="text-xs font-medium text-gray-500">Original Copy Sections</span>
            <div className="mt-1 space-y-1">
              {analysis.copySections.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                    {s.label}
                  </span>
                  <span className="text-gray-700">{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
