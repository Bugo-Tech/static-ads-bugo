"use client";

import { useState, DragEvent, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import LanguageSelector from "../components/LanguageSelector";
import { Language } from "@/lib/types";
import { ReplicatorAnalysis, getDefaultPestVariants } from "@/lib/replicator-prompts";

interface AlternateVariant {
  /** The replacement pest in target language (what the user typed). */
  pestPhrase: string;
  /** Same in English (used to drive Nano Banana's pest imagery swap). */
  pestEnglish: string;
  /** Whether the user wants this variant generated. */
  enabled: boolean;
}

interface ReplicatorReference {
  id: string;
  file: File;
  previewUrl: string;
  uploadedUrl?: string;
  status: "idle" | "uploading" | "analyzing" | "ready" | "generating" | "done" | "error";
  error?: string;
  analysis?: ReplicatorAnalysis;
  /** Editable copy sections (user can tweak before generating). */
  editedSections?: { id: string; label: string; adaptedText: string }[];
  /** Whether to generate the faithful variant (variant 1). */
  generateFaithful: boolean;
  /** Variants 2-4: each has its own pest + enabled flag. */
  alternateVariants: [AlternateVariant, AlternateVariant, AlternateVariant];
  /** Sizes to generate. At least one must be true. */
  sizes: { "1:1": boolean; "9:16": boolean };
  /** Generation jobs (any combination of variants × sizes). */
  generations: ReplicatorGeneration[];
}

interface ReplicatorGeneration {
  jobId: string;
  variantIndex: 1 | 2 | 3 | 4;
  variantLabel: string; // "Faithful" or pest name
  size: "1:1" | "9:16";
  status: "queued" | "processing" | "completed" | "failed";
  resultUrl?: string;
  error?: string;
}

export default function ReplicatorPage() {
  return (
    <Suspense fallback={null}>
      <ReplicatorPageInner />
    </Suspense>
  );
}

function ReplicatorPageInner() {
  const [refs, setRefs] = useState<ReplicatorReference[]>([]);
  const [language, setLanguage] = useState<Language>("he");

  // Auto-load a reference when arriving with ?ref=<filename> (used by /auto-pull
  // to hand off an imported ad). Runs at most once per filename; existing
  // drag-drop / picker flows are untouched.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const autoLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    const filename = searchParams.get("ref");
    if (!filename) return;
    if (autoLoadedRef.current === filename) return;
    autoLoadedRef.current = filename;

    (async () => {
      try {
        const res = await fetch(`/api/upload/file/${encodeURIComponent(filename)}`);
        if (!res.ok) return;
        const blob = await res.blob();
        if (!blob.type.startsWith("image/")) return;
        const file = new File([blob], filename, { type: blob.type });
        await handleFiles([file]);
      } catch {
        // Best-effort: silently ignore if the file is gone or fetch fails.
      } finally {
        // Clean the query param so refresh / back-button won't re-trigger.
        router.replace(pathname);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Polling for job statuses
  useEffect(() => {
    const activeJobs = refs.flatMap((r) =>
      r.generations.filter((g) => g.status === "queued" || g.status === "processing")
    );
    if (activeJobs.length === 0) return;

    const interval = setInterval(async () => {
      for (const ref of refs) {
        for (const gen of ref.generations) {
          if (gen.status !== "queued" && gen.status !== "processing") continue;
          try {
            const res = await fetch(`/api/image-status?jobId=${gen.jobId}`);
            const data = await res.json();
            if (data.status !== gen.status || data.resultUrl) {
              setRefs((prev) =>
                prev.map((r) => {
                  if (r.id !== ref.id) return r;
                  return {
                    ...r,
                    generations: r.generations.map((g) =>
                      g.jobId === gen.jobId
                        ? { ...g, status: data.status, resultUrl: data.resultUrl, error: data.error }
                        : g
                    ),
                  };
                })
              );

              // Auto-save to gallery on completion
              if (data.status === "completed" && data.resultUrl) {
                fetch("/api/gallery", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "add-image",
                    sourceUrl: data.resultUrl,
                    prompt: `Replicator (${ref.analysis?.productVariant || "?"}) — ${gen.variantLabel}`,
                    size: gen.size,
                    angle: `replicator-${gen.variantLabel.toLowerCase().replace(/\s+/g, "-")}`,
                    folderId: "root",
                    referenceImageUrl: ref.uploadedUrl || "",
                  }),
                }).catch(() => {});
              }
            }
          } catch {
            // ignore, retry next tick
          }
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [refs]);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const newRefs: ReplicatorReference[] = arr.map((file) => ({
      id: `ref-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "idle",
      generateFaithful: true,
      alternateVariants: [
        { pestPhrase: "", pestEnglish: "", enabled: false },
        { pestPhrase: "", pestEnglish: "", enabled: false },
        { pestPhrase: "", pestEnglish: "", enabled: false },
      ],
      sizes: { "1:1": true, "9:16": true },
      generations: [],
    }));
    setRefs((prev) => [...prev, ...newRefs]);
  }

  async function analyzeAll() {
    for (const ref of refs.filter((r) => r.status === "idle")) {
      analyzeOne(ref);
    }
  }

  async function analyzeOne(ref: ReplicatorReference) {
    setRefs((prev) => prev.map((r) => (r.id === ref.id ? { ...r, status: "uploading" } : r)));
    try {
      // Upload file
      const fd = new FormData();
      fd.append("file", ref.file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.url) throw new Error(uploadData.error || "Upload failed");

      setRefs((prev) =>
        prev.map((r) => (r.id === ref.id ? { ...r, uploadedUrl: uploadData.url, status: "analyzing" } : r))
      );

      // Read base64 for Claude + detect ACTUAL mime type from magic bytes (filename/file.type lie sometimes)
      const [base64, actualMime] = await Promise.all([fileToBase64(ref.file), detectImageMimeType(ref.file)]);

      const analyzeRes = await fetch("/api/replicator/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: actualMime,
          language,
        }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error || "Analysis failed");

      const analysis: ReplicatorAnalysis = analyzeData.analysis;
      const editedSections = analysis.copySections.map((s) => ({
        id: s.id,
        label: s.label,
        adaptedText: s.adaptedText,
      }));
      const defaultPestsTarget = getDefaultPestVariants(analysis.productVariant, language);
      const defaultPestsEnglish = getDefaultPestVariants(analysis.productVariant, "en");

      setRefs((prev) =>
        prev.map((r) =>
          r.id === ref.id
            ? {
                ...r,
                status: "ready",
                analysis,
                editedSections,
                alternateVariants: [
                  { pestPhrase: defaultPestsTarget[0] || "", pestEnglish: defaultPestsEnglish[0] || "", enabled: false },
                  { pestPhrase: defaultPestsTarget[1] || "", pestEnglish: defaultPestsEnglish[1] || "", enabled: false },
                  { pestPhrase: defaultPestsTarget[2] || "", pestEnglish: defaultPestsEnglish[2] || "", enabled: false },
                ] as [AlternateVariant, AlternateVariant, AlternateVariant],
              }
            : r
        )
      );
    } catch (err) {
      setRefs((prev) =>
        prev.map((r) =>
          r.id === ref.id
            ? { ...r, status: "error", error: err instanceof Error ? err.message : "Failed" }
            : r
        )
      );
    }
  }

  async function generateAll(ref: ReplicatorReference) {
    if (!ref.analysis || !ref.editedSections || !ref.uploadedUrl) return;
    setRefs((prev) => prev.map((r) => (r.id === ref.id ? { ...r, status: "generating" } : r)));

    const headlineEnglish = ref.analysis.headlineSection?.pestMentioned || ref.analysis.detectedPestType;
    const headlinePhrase = ref.analysis.headlineSection?.pestPhraseInTarget || "";

    type VariantSpec = {
      idx: 1 | 2 | 3 | 4;
      label: string;
      pestSwap?: {
        originalPestPhrase: string;
        originalPestEnglish: string;
        newPest: string;
        newPestEnglish: string;
      };
    };

    const variants: VariantSpec[] = [];
    if (ref.generateFaithful) variants.push({ idx: 1, label: "Faithful" });
    ref.alternateVariants.forEach((v, i) => {
      if (!v.enabled || !v.pestPhrase.trim()) return;
      variants.push({
        idx: (i + 2) as 2 | 3 | 4,
        label: v.pestPhrase,
        pestSwap: headlinePhrase
          ? {
              originalPestPhrase: headlinePhrase,
              originalPestEnglish: headlineEnglish,
              newPest: v.pestPhrase,
              newPestEnglish: v.pestEnglish || v.pestPhrase,
            }
          : undefined,
      });
    });

    const sizes: ("1:1" | "9:16")[] = [];
    if (ref.sizes["1:1"]) sizes.push("1:1");
    if (ref.sizes["9:16"]) sizes.push("9:16");

    const newGenerations: ReplicatorGeneration[] = [];
    for (const v of variants) {
      for (const size of sizes) {
        try {
          const res = await fetch("/api/replicator/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              referenceImageUrl: ref.uploadedUrl,
              language,
              productVariant: ref.analysis.productVariant,
              copySections: ref.editedSections,
              headlineSectionId: ref.analysis.headlineSection?.id || null,
              headlinePestSwap: v.pestSwap,
              visualLayoutDescription: ref.analysis.visualLayoutDescription,
              aspectRatio: size,
              size,
            }),
          });
          const data = await res.json();
          if (res.ok && data.jobId) {
            newGenerations.push({
              jobId: data.jobId,
              variantIndex: v.idx,
              variantLabel: v.label,
              size,
              status: "queued",
            });
          }
        } catch {
          // skip failed variant
        }
      }
    }

    setRefs((prev) =>
      prev.map((r) =>
        r.id === ref.id ? { ...r, status: "done", generations: [...r.generations, ...newGenerations] } : r
      )
    );
  }

  function updateSectionText(refId: string, sectionId: string, newText: string) {
    setRefs((prev) =>
      prev.map((r) =>
        r.id === refId
          ? {
              ...r,
              editedSections: (r.editedSections || []).map((s) =>
                s.id === sectionId ? { ...s, adaptedText: newText } : s
              ),
            }
          : r
      )
    );
  }

  function updateAlternateVariant(refId: string, idx: 0 | 1 | 2, patch: Partial<AlternateVariant>) {
    setRefs((prev) =>
      prev.map((r) => {
        if (r.id !== refId) return r;
        const next = [...r.alternateVariants] as [AlternateVariant, AlternateVariant, AlternateVariant];
        next[idx] = { ...next[idx], ...patch };
        return { ...r, alternateVariants: next };
      })
    );
  }

  function removeRef(id: string) {
    setRefs((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-bold text-gray-900">Pest Lab Replicator</h1>
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
              1:1 copy mode
            </span>
          </div>
          <Link href="/gallery" className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20">
            Gallery
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {/* Info banner */}
        <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800">
          <strong>Replicator mode:</strong> upload Pest Lab competitor ads. The system copies them PIXEL-IDENTICALLY, only swapping the &ldquo;PestLab&rdquo; logo on the device with &ldquo;bugo&rdquo; and translating all text to your selected language. Auto-detects Indoor vs Outdoor. Generates 4 variants per reference (1 faithful + 3 with different headline pest).
        </div>

        {/* Language picker */}
        <div className="mb-6 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Output language:</span>
          <LanguageSelector value={language} onChange={setLanguage} />
        </div>

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-8 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/50 transition-colors"
          onClick={() => document.getElementById("repl-file-input")?.click()}
        >
          <input
            id="repl-file-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
            <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <p className="text-base font-medium text-gray-900">Drop Pest Lab references here, or click to browse</p>
          <p className="mt-1 text-xs text-gray-500">Multiple files OK</p>
        </div>

        {/* Analyze button */}
        {refs.some((r) => r.status === "idle") && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={analyzeAll}
              className="rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-purple-700"
            >
              Analyze {refs.filter((r) => r.status === "idle").length} reference{refs.filter((r) => r.status === "idle").length !== 1 ? "s" : ""} →
            </button>
          </div>
        )}

        {/* References */}
        <div className="mt-6 space-y-6">
          {refs.map((ref) => (
            <ReplicatorReferenceCard
              key={ref.id}
              ref_={ref}
              onSectionChange={(sid, text) => updateSectionText(ref.id, sid, text)}
              onAlternateVariantChange={(idx, patch) => updateAlternateVariant(ref.id, idx, patch)}
              onToggleFaithful={(enabled) => setRefs((prev) => prev.map((r) => (r.id === ref.id ? { ...r, generateFaithful: enabled } : r)))}
              onToggleSize={(size, enabled) => setRefs((prev) => prev.map((r) => (r.id === ref.id ? { ...r, sizes: { ...r.sizes, [size]: enabled } } : r)))}
              onGenerate={() => generateAll(ref)}
              onRemove={() => removeRef(ref.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function ReplicatorReferenceCard({
  ref_,
  onSectionChange,
  onAlternateVariantChange,
  onToggleFaithful,
  onToggleSize,
  onGenerate,
  onRemove,
}: {
  ref_: ReplicatorReference;
  onSectionChange: (sid: string, text: string) => void;
  onAlternateVariantChange: (idx: 0 | 1 | 2, patch: Partial<AlternateVariant>) => void;
  onToggleFaithful: (enabled: boolean) => void;
  onToggleSize: (size: "1:1" | "9:16", enabled: boolean) => void;
  onGenerate: () => void;
  onRemove: () => void;
}) {
  const headlinePhrase = ref_.analysis?.headlineSection?.pestPhraseInTarget || "";
  const headlineSectionId = ref_.analysis?.headlineSection?.id || null;
  const headlineOriginal =
    headlineSectionId
      ? ref_.editedSections?.find((s) => s.id === headlineSectionId)?.adaptedText || ""
      : ref_.editedSections?.[0]?.adaptedText || "";
  const enabledVariantCount =
    (ref_.generateFaithful ? 1 : 0) +
    ref_.alternateVariants.filter((v) => v.enabled && v.pestPhrase.trim()).length;
  const enabledSizeCount = (ref_.sizes["1:1"] ? 1 : 0) + (ref_.sizes["9:16"] ? 1 : 0);
  const totalImages = enabledVariantCount * enabledSizeCount;

  // Build a preview of the resulting headline after pest swap
  function previewSwap(newPest: string): string {
    if (!headlinePhrase || !headlineOriginal) return headlineOriginal;
    const escaped = headlinePhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return headlineOriginal.replace(new RegExp(escaped, "g"), newPest);
  }
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-start gap-4">
        <img src={ref_.previewUrl} alt="" className="w-32 rounded-lg border border-border" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 truncate">{ref_.file.name}</h3>
            <button onClick={onRemove} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" title="Remove">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {ref_.status === "uploading" && <p className="mt-2 text-xs text-gray-500">Uploading…</p>}
          {ref_.status === "analyzing" && <p className="mt-2 text-xs text-gray-500">Analyzing reference…</p>}
          {ref_.status === "error" && <p className="mt-2 text-xs text-red-600">{ref_.error}</p>}

          {ref_.analysis && (
            <div className="mt-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ref_.analysis.productVariant === "indoor" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                {ref_.analysis.productVariant === "indoor" ? "🏠 Indoor" : "🌳 Outdoor"}
              </span>
              <span className="ml-2 text-xs text-gray-500">
                {ref_.analysis.productVariantConfidence} confidence — {ref_.analysis.productVariantReasoning}
              </span>
            </div>
          )}
        </div>
      </div>

      {ref_.status === "ready" && ref_.editedSections && ref_.analysis && (
        <div className="mt-4 space-y-3">
          {/* Editable copy sections */}
          <div className="rounded-lg border border-border bg-gray-50 p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Variant 1 — Faithful copy (editable)</h4>
            <div className="space-y-2">
              {ref_.editedSections.map((s) => (
                <div key={s.id} className="flex items-start gap-2">
                  <span className="mt-1.5 w-24 shrink-0 text-[10px] font-medium uppercase text-gray-400">{s.label}</span>
                  <textarea
                    value={s.adaptedText}
                    onChange={(e) => onSectionChange(s.id, e.target.value)}
                    rows={Math.max(1, Math.ceil(s.adaptedText.length / 60))}
                    dir="auto"
                    className="flex-1 rounded-md border border-gray-200 bg-white p-2 text-sm focus:border-purple-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Detected headline pest — make it visible */}
          {headlinePhrase && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
              <div className="mb-1 font-bold uppercase tracking-wider text-amber-700">Detected headline pest</div>
              <div className="text-amber-900">
                The system found the word{" "}
                <span className="rounded bg-white px-1.5 py-0.5 font-mono text-sm font-bold text-amber-700" dir="auto">
                  {headlinePhrase}
                </span>{" "}
                in the headline. This is the EXACT word that will be replaced in alternate variants.
                {headlineOriginal && (
                  <div className="mt-1.5 text-amber-700/80" dir="auto">
                    Headline as detected: &ldquo;{headlineOriginal}&rdquo;
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Variant selection — faithful + alternates */}
          <div className="rounded-lg border border-border bg-gray-50 p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
              Variants to generate (check what you want)
            </h4>

            {/* Variant 1 — Faithful */}
            <label className="mb-2 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ref_.generateFaithful}
                onChange={(e) => onToggleFaithful(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm font-medium text-gray-900">Variant 1 — Faithful</span>
              <span className="ml-auto text-[11px] text-gray-400">No swap, exact copy</span>
            </label>

            {/* Variants 2-4 — alternate pest swap */}
            {[0, 1, 2].map((i) => {
              const idx = i as 0 | 1 | 2;
              const v = ref_.alternateVariants[idx];
              const preview = v.pestPhrase.trim() ? previewSwap(v.pestPhrase) : "";
              return (
                <div key={i} className={`mb-1.5 rounded-md border px-3 py-2 ${v.enabled ? "border-purple-200 bg-purple-50" : "border-gray-200 bg-white"}`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={v.enabled}
                      onChange={(e) => onAlternateVariantChange(idx, { enabled: e.target.checked })}
                      disabled={!headlinePhrase}
                      title={!headlinePhrase ? "No pest detected in headline — swap not possible" : ""}
                      className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-40"
                    />
                    <span className="text-sm font-medium text-gray-900 shrink-0">V{i + 2}</span>
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600" dir="auto">
                      {headlinePhrase || "—"}
                    </span>
                    <span className="shrink-0 text-gray-400">→</span>
                    <input
                      value={v.pestPhrase}
                      onChange={(e) => onAlternateVariantChange(idx, { pestPhrase: e.target.value })}
                      dir="auto"
                      placeholder="replacement pest"
                      className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm focus:border-purple-500 focus:outline-none"
                    />
                    <input
                      value={v.pestEnglish}
                      onChange={(e) => onAlternateVariantChange(idx, { pestEnglish: e.target.value })}
                      placeholder="english"
                      title="English name (drives the pest IMAGE swap)"
                      className="w-24 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  {/* Live preview of the resulting headline */}
                  {v.enabled && headlinePhrase && (
                    <div className="mt-2 rounded bg-white px-2 py-1.5 text-xs">
                      <span className="text-gray-400">Preview headline: </span>
                      {preview === headlineOriginal ? (
                        <span className="text-amber-600">⚠ No change — type a replacement pest above</span>
                      ) : (
                        <span className="font-medium text-gray-900" dir="auto">{preview}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!headlinePhrase && (
              <p className="mt-2 text-[11px] text-amber-700">
                ⚠ The reference&apos;s headline doesn&apos;t name a specific pest, so swap variants are disabled. You can still generate the faithful variant.
              </p>
            )}
          </div>

          {/* Size selector */}
          <div className="rounded-lg border border-border bg-gray-50 p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Sizes to generate</h4>
            <div className="flex gap-2">
              {(["1:1", "9:16"] as const).map((s) => (
                <label key={s} className={`flex items-center gap-2 rounded-md border px-3 py-1.5 cursor-pointer ${ref_.sizes[s] ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white"}`}>
                  <input
                    type="checkbox"
                    checked={ref_.sizes[s]}
                    onChange={(e) => onToggleSize(s, e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm font-medium text-gray-700">{s}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={onGenerate}
            disabled={totalImages === 0}
            className="w-full rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {totalImages === 0
              ? "Pick at least one variant + size"
              : `Generate ${totalImages} image${totalImages !== 1 ? "s" : ""} (${enabledVariantCount} variant${enabledVariantCount !== 1 ? "s" : ""} × ${enabledSizeCount} size${enabledSizeCount !== 1 ? "s" : ""}) →`}
          </button>
        </div>
      )}

      {/* Generated variants */}
      {ref_.generations.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {ref_.generations.map((gen) => (
            <div key={gen.jobId} className="overflow-hidden rounded-lg border border-border">
              <div className="bg-gray-50 px-2 py-1 text-[10px] font-bold uppercase text-gray-500">
                Variant {gen.variantIndex} — {gen.variantLabel}
              </div>
              <div className={`bg-gray-100 ${gen.size === "9:16" ? "aspect-[9/16]" : "aspect-square"}`}>
                {gen.status === "completed" && gen.resultUrl ? (
                  <img src={gen.resultUrl} alt="" className="h-full w-full object-contain" />
                ) : gen.status === "failed" ? (
                  <div className="flex h-full items-center justify-center text-xs text-red-500">Failed</div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
                    <span className="text-[10px] text-gray-500">{gen.status}</span>
                  </div>
                )}
              </div>
              {gen.status === "completed" && gen.resultUrl && (
                <a href={gen.resultUrl} download className="block bg-purple-50 py-1 text-center text-[11px] font-medium text-purple-700 hover:bg-purple-100">
                  Download
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Detect the ACTUAL image MIME type from the file's magic bytes,
 * not from the filename extension or browser-reported type (which can be wrong).
 */
async function detectImageMimeType(file: File): Promise<string> {
  const buf = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(buf);
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  // WebP: RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  // Fallback to browser-reported type
  return file.type || "image/png";
}
