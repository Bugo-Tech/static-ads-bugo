"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BrandConfig } from "@/lib/types";
import ProductLibrary from "../components/ProductLibrary";
import { useAuth } from "@/context/AuthContext";

export default function BrandSettingsPage() {
  const { isAdmin } = useAuth();
  const [config, setConfig] = useState<BrandConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/brand")
      .then((r) => r.json())
      .then((data) => setConfig(data.config))
      .catch(console.error);
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      await fetch("/api/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Save failed:", err);
    }
    setSaving(false);
  }

  function updateField<K extends keyof BrandConfig>(key: K, value: BrandConfig[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateSpec(key: keyof BrandConfig["productSpecs"], value: string) {
    setConfig((prev) =>
      prev
        ? { ...prev, productSpecs: { ...prev.productSpecs, [key]: value } }
        : prev
    );
  }

  function updatePricing(key: keyof BrandConfig["pricing"], value: string) {
    setConfig((prev) =>
      prev
        ? { ...prev, pricing: { ...prev.pricing, [key]: value } }
        : prev
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-bold text-gray-900">Brand Settings</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !isAdmin}
            className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-dark disabled:opacity-50 transition-all"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {/* Basic Info */}
        <Section title="Basic Info">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Product Name" value={config.productName} onChange={(v) => updateField("productName", v)} disabled={!isAdmin} />
            <Field label="Tagline" value={config.tagline} onChange={(v) => updateField("tagline", v)} disabled={!isAdmin} />
            <Field label="Website" value={config.website} onChange={(v) => updateField("website", v)} disabled={!isAdmin} />
          </div>
        </Section>

        {/* Product Specs */}
        <Section title="Product Specs">
          <div className="space-y-3">
            <TextArea label="Technology" value={config.productSpecs.technology} onChange={(v) => updateSpec("technology", v)} rows={2} disabled={!isAdmin} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Coverage" value={config.productSpecs.coverage} onChange={(v) => updateSpec("coverage", v)} disabled={!isAdmin} />
              <Field label="Lifespan" value={config.productSpecs.lifespan} onChange={(v) => updateSpec("lifespan", v)} disabled={!isAdmin} />
              <Field label="Plug Type" value={config.productSpecs.plug} onChange={(v) => updateSpec("plug", v)} disabled={!isAdmin} />
              <Field label="Noise Level" value={config.productSpecs.noise} onChange={(v) => updateSpec("noise", v)} disabled={!isAdmin} />
            </div>
            <TextArea label="Safety" value={config.productSpecs.safety} onChange={(v) => updateSpec("safety", v)} rows={2} disabled={!isAdmin} />
            <Field label="Maintenance" value={config.productSpecs.maintenance} onChange={(v) => updateSpec("maintenance", v)} disabled={!isAdmin} />
          </div>
        </Section>

        {/* Pricing */}
        <Section title="Pricing">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Single" value={config.pricing.single} onChange={(v) => updatePricing("single", v)} disabled={!isAdmin} />
            <Field label="2+1 Bundle" value={config.pricing.bundle2plus1} onChange={(v) => updatePricing("bundle2plus1", v)} disabled={!isAdmin} />
            <Field label="3+2 Bundle" value={config.pricing.bundle3plus2} onChange={(v) => updatePricing("bundle3plus2", v)} disabled={!isAdmin} />
          </div>
        </Section>

        {/* Pain Points */}
        <Section title="Pain Points">
          <ListEditor
            items={config.painPoints}
            onChange={(items) => updateField("painPoints", items)}
            placeholder="Add a pain point..."
            disabled={!isAdmin}
          />
        </Section>

        {/* Marketing Angles */}
        <Section title="Marketing Angles">
          <ListEditor
            items={config.marketingAngles}
            onChange={(items) => updateField("marketingAngles", items)}
            placeholder="Add a marketing angle..."
            disabled={!isAdmin}
          />
        </Section>

        {/* Voice & Tone */}
        <Section title="Voice & Tone">
          <TextArea
            value={config.voiceAndTone}
            onChange={(v) => updateField("voiceAndTone", v)}
            rows={6}
            disabled={!isAdmin}
          />
        </Section>

        {/* Pest Types */}
        <Section title="Pest Types">
          <ListEditor
            items={config.pestTypes}
            onChange={(items) => updateField("pestTypes", items)}
            placeholder="Add a pest type..."
            disabled={!isAdmin}
          />
        </Section>

        {/* Brand Book Content — Israel */}
        <Section title="Brand Book — Israel / Hebrew" description="Brand book for Hebrew and Arabic ads. Upload a PDF or paste text manually.">
          {isAdmin && <PdfUploader market="il" onUploaded={(text) => updateField("brandBookContent", text)} />}
          <TextArea
            value={config.brandBookContent}
            onChange={(v) => updateField("brandBookContent", v)}
            rows={12}
            placeholder="Paste your Israeli brand book content here, or upload a PDF above..."
            disabled={!isAdmin}
          />
        </Section>

        {/* Brand Book Content — US */}
        <Section title="Brand Book — US / English" description="Brand book for English and German ads. Upload a PDF or paste text manually.">
          {isAdmin && <PdfUploader market="us" onUploaded={(text) => updateField("brandBookContentUS", text)} />}
          <TextArea
            value={config.brandBookContentUS || ""}
            onChange={(v) => updateField("brandBookContentUS", v)}
            rows={12}
            placeholder="Paste your US brand book content here, or upload a PDF above..."
            disabled={!isAdmin}
          />
        </Section>

        {/* Custom Notes */}
        <Section title="Custom Notes" description="Any additional context Claude should know when generating ads.">
          <TextArea
            value={config.customNotes}
            onChange={(v) => updateField("customNotes", v)}
            rows={4}
            placeholder="Extra instructions or context..."
            disabled={!isAdmin}
          />
        </Section>

        {/* Product Images */}
        <Section title="Product Images Library" description="These images are available for use in all generated ads.">
          <ProductLibrary selectedIds={[]} onSelectionChange={() => {}} />
        </Section>

        {/* Save button at bottom */}
        <div className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            disabled={saving || !isAdmin}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-dark disabled:opacity-50 transition-all"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save All Changes"}
          </button>
        </div>
      </main>
    </div>
  );
}

// --- Reusable sub-components ---

function PdfUploader({ market, onUploaded }: { market: "il" | "us"; onUploaded: (text: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ pages: number; chars: number } | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("market", market);
    try {
      const res = await fetch("/api/brand/upload-pdf", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setResult({ pages: data.pages, chars: data.chars });
        // Reload the config to get the extracted text
        const configRes = await fetch("/api/brand");
        const configData = await configRes.json();
        const field = market === "us" ? "brandBookContentUS" : "brandBookContent";
        if (configData.config?.[field]) {
          onUploaded(configData.config[field]);
        }
      } else {
        alert(data.error || "Upload failed");
      }
    } catch {
      alert("Upload failed");
    }
    setUploading(false);
  }

  return (
    <div className="mb-3">
      <label className="flex items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
        <input
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span className="text-sm text-gray-600">
          {uploading ? "Uploading & extracting text..." : "Upload Brand Book PDF"}
        </span>
      </label>
      {result && (
        <p className="mt-1.5 text-xs text-green-600">
          Extracted {result.chars.toLocaleString()} characters from {result.pages} pages. Content loaded below — review and save.
        </p>
      )}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-6">
      <h2 className="mb-1 text-base font-bold text-gray-900">{title}</h2>
      {description && <p className="mb-4 text-sm text-gray-500">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </div>
  );
}

function Field({ label, value, onChange, disabled }: { label?: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      {label && <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  disabled,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      {label && <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function ListEditor({
  items,
  onChange,
  placeholder,
  disabled,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [newItem, setNewItem] = useState("");

  function addItem() {
    if (!newItem.trim()) return;
    onChange([...items, newItem.trim()]);
    setNewItem("");
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, value: string) {
    const updated = [...items];
    updated[index] = value;
    onChange(updated);
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            disabled={disabled}
            className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <button
            onClick={() => removeItem(i)}
            disabled={disabled}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-gray-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <button
          onClick={addItem}
          disabled={disabled}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  );
}
