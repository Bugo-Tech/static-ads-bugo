"use client";

import { useState, useEffect } from "react";
import { BrandConfig } from "@/lib/types";
import ProductLibrary from "../components/ProductLibrary";

export default function BrandSettingsPage() {
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
            <a href="/" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <h1 className="text-lg font-bold text-gray-900">Brand Settings</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
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
            <Field label="Product Name" value={config.productName} onChange={(v) => updateField("productName", v)} />
            <Field label="Tagline" value={config.tagline} onChange={(v) => updateField("tagline", v)} />
            <Field label="Website" value={config.website} onChange={(v) => updateField("website", v)} />
          </div>
        </Section>

        {/* Product Specs */}
        <Section title="Product Specs">
          <div className="space-y-3">
            <TextArea label="Technology" value={config.productSpecs.technology} onChange={(v) => updateSpec("technology", v)} rows={2} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Coverage" value={config.productSpecs.coverage} onChange={(v) => updateSpec("coverage", v)} />
              <Field label="Lifespan" value={config.productSpecs.lifespan} onChange={(v) => updateSpec("lifespan", v)} />
              <Field label="Plug Type" value={config.productSpecs.plug} onChange={(v) => updateSpec("plug", v)} />
              <Field label="Noise Level" value={config.productSpecs.noise} onChange={(v) => updateSpec("noise", v)} />
            </div>
            <TextArea label="Safety" value={config.productSpecs.safety} onChange={(v) => updateSpec("safety", v)} rows={2} />
            <Field label="Maintenance" value={config.productSpecs.maintenance} onChange={(v) => updateSpec("maintenance", v)} />
          </div>
        </Section>

        {/* Pricing */}
        <Section title="Pricing">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Single" value={config.pricing.single} onChange={(v) => updatePricing("single", v)} />
            <Field label="2+1 Bundle" value={config.pricing.bundle2plus1} onChange={(v) => updatePricing("bundle2plus1", v)} />
            <Field label="3+2 Bundle" value={config.pricing.bundle3plus2} onChange={(v) => updatePricing("bundle3plus2", v)} />
          </div>
        </Section>

        {/* Pain Points */}
        <Section title="Pain Points">
          <ListEditor
            items={config.painPoints}
            onChange={(items) => updateField("painPoints", items)}
            placeholder="Add a pain point..."
          />
        </Section>

        {/* Marketing Angles */}
        <Section title="Marketing Angles">
          <ListEditor
            items={config.marketingAngles}
            onChange={(items) => updateField("marketingAngles", items)}
            placeholder="Add a marketing angle..."
          />
        </Section>

        {/* Voice & Tone */}
        <Section title="Voice & Tone">
          <TextArea
            value={config.voiceAndTone}
            onChange={(v) => updateField("voiceAndTone", v)}
            rows={6}
          />
        </Section>

        {/* Pest Types */}
        <Section title="Pest Types">
          <ListEditor
            items={config.pestTypes}
            onChange={(items) => updateField("pestTypes", items)}
            placeholder="Add a pest type..."
          />
        </Section>

        {/* Brand Book Content */}
        <Section title="Brand Book Content" description="Paste the full brand book text here. This will be used as context for Claude.">
          <TextArea
            value={config.brandBookContent}
            onChange={(v) => updateField("brandBookContent", v)}
            rows={12}
            placeholder="Paste your brand book content here..."
          />
        </Section>

        {/* Custom Notes */}
        <Section title="Custom Notes" description="Any additional context Claude should know when generating ads.">
          <TextArea
            value={config.customNotes}
            onChange={(v) => updateField("customNotes", v)}
            rows={4}
            placeholder="Extra instructions or context..."
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
            disabled={saving}
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

function Field({ label, value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      {label && <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      {label && <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

function ListEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
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
            className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={() => removeItem(i)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
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
          className="flex-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-gray-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={addItem}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}
