"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { BirdsBrandConfig, BirdsProductImage } from "@/lib/birds-defaults";

export default function BirdsBrandSettingsPage() {
  const [config, setConfig] = useState<BirdsBrandConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/birds/brand")
      .then((r) => r.json())
      .then((data) => setConfig(data.config))
      .catch(console.error);
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      await fetch("/api/birds/brand", {
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

  function updateField<K extends keyof BirdsBrandConfig>(key: K, value: BirdsBrandConfig[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateSpec(key: keyof BirdsBrandConfig["productSpecs"], value: string) {
    setConfig((prev) =>
      prev ? { ...prev, productSpecs: { ...prev.productSpecs, [key]: value } } : prev
    );
  }

  function updatePricing(key: keyof BirdsBrandConfig["pricing"], value: string) {
    setConfig((prev) =>
      prev ? { ...prev, pricing: { ...prev.pricing, [key]: value } } : prev
    );
  }

  function updatePricingUS(key: keyof BirdsBrandConfig["pricingUS"], value: string) {
    setConfig((prev) =>
      prev ? { ...prev, pricingUS: { ...prev.pricingUS, [key]: value } } : prev
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/birds" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-bold text-gray-900">Bugo Birds — Brand Settings</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50 transition-all"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {/* Product Images — single image expected for Bugo Birds. */}
        <Section
          title="Product Image"
          description="Upload the Bugo Birds device image. For best results upload ONE clean product photo; you can upload multiple if you want variants."
        >
          <BirdsProductImageManager />
        </Section>

        <Section title="Basic Info">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Product Name" value={config.productName} onChange={(v) => updateField("productName", v)} />
            <Field label="Tagline" value={config.tagline} onChange={(v) => updateField("tagline", v)} />
            <Field label="Website" value={config.website} onChange={(v) => updateField("website", v)} />
          </div>
        </Section>

        <Section title="Product Specs">
          <div className="space-y-3">
            <TextArea label="Technology" value={config.productSpecs.technology} onChange={(v) => updateSpec("technology", v)} rows={2} />
            <TextArea label="Mechanism" value={config.productSpecs.mechanism} onChange={(v) => updateSpec("mechanism", v)} rows={2} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Coverage" value={config.productSpecs.coverage} onChange={(v) => updateSpec("coverage", v)} />
              <Field label="Lifespan" value={config.productSpecs.lifespan} onChange={(v) => updateSpec("lifespan", v)} />
            </div>
            <TextArea label="Safety" value={config.productSpecs.safety} onChange={(v) => updateSpec("safety", v)} rows={2} />
            <Field label="Application" value={config.productSpecs.application} onChange={(v) => updateSpec("application", v)} />
          </div>
        </Section>

        <Section title="Pricing — Israel">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Single" value={config.pricing.single} onChange={(v) => updatePricing("single", v)} />
            <Field label="Bundle" value={config.pricing.bundle} onChange={(v) => updatePricing("bundle", v)} />
          </div>
        </Section>

        <Section title="Pricing — US">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Single (USD)" value={config.pricingUS.single} onChange={(v) => updatePricingUS("single", v)} />
            <Field label="Bundle (USD)" value={config.pricingUS.bundle} onChange={(v) => updatePricingUS("bundle", v)} />
          </div>
        </Section>

        <Section title="Pain Points">
          <ListEditor
            items={config.painPoints}
            onChange={(items) => updateField("painPoints", items)}
            placeholder="Add a pain point..."
          />
        </Section>

        <Section title="Marketing Angles">
          <ListEditor
            items={config.marketingAngles}
            onChange={(items) => updateField("marketingAngles", items)}
            placeholder="Add a marketing angle..."
          />
        </Section>

        <Section title="Voice & Tone">
          <TextArea value={config.voiceAndTone} onChange={(v) => updateField("voiceAndTone", v)} rows={6} />
        </Section>

        <Section title="Pest Types">
          <ListEditor
            items={config.pestTypes}
            onChange={(items) => updateField("pestTypes", items)}
            placeholder="Add a pest type..."
          />
        </Section>

        <Section title="Brand Book — Israel / Hebrew" description="Upload a PDF — text will be used as context for ad copy generation.">
          <PdfUploader market="il" onUploaded={(text) => updateField("brandBookContent", text)} />
          <TextArea
            value={config.brandBookContent}
            onChange={(v) => updateField("brandBookContent", v)}
            rows={12}
            placeholder="Paste brand book content here, or upload a PDF above..."
          />
        </Section>

        <Section title="Brand Book — US / English" description="Upload a PDF for English/foreign-market ads.">
          <PdfUploader market="us" onUploaded={(text) => updateField("brandBookContentUS", text)} />
          <TextArea
            value={config.brandBookContentUS || ""}
            onChange={(v) => updateField("brandBookContentUS", v)}
            rows={12}
            placeholder="Paste US brand book content, or upload a PDF above..."
          />
        </Section>

        <Section title="Custom Notes" description="Any extra context Claude should know.">
          <TextArea
            value={config.customNotes}
            onChange={(v) => updateField("customNotes", v)}
            rows={4}
            placeholder="Extra instructions..."
          />
        </Section>

        <div className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-amber-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50 transition-all"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save All Changes"}
          </button>
        </div>
      </main>
    </div>
  );
}

function BirdsProductImageManager() {
  const [products, setProducts] = useState<BirdsProductImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [labelInput, setLabelInput] = useState("");

  useEffect(() => {
    fetch("/api/birds/products")
      .then((r) => r.json())
      .then((data) => setProducts(data.products || []))
      .catch(console.error);
  }, []);

  async function handleUpload(file: File, label: string) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    if (label.trim()) fd.append("label", label.trim());
    try {
      const res = await fetch("/api/birds/products", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.product) {
        setProducts((prev) => [...prev, data.product]);
        setLabelInput("");
      } else {
        alert(data.error || "Upload failed");
      }
    } catch {
      alert("Upload failed");
    }
    setUploading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this product image?")) return;
    try {
      await fetch(`/api/birds/products?id=${id}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert("Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-dashed border-amber-200 bg-amber-50/30 p-4">
        <div className="mb-2">
          <label className="block text-xs font-medium text-gray-600">
            Label (e.g., &quot;device&quot;, &quot;packaging&quot;)
          </label>
          <input
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder='Example: "device"'
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-white px-4 py-3 ring-1 ring-amber-300 hover:bg-amber-50">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f, labelInput);
            }}
            disabled={uploading}
          />
          <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="text-sm font-medium text-amber-700">
            {uploading ? "Uploading..." : "Upload a Bugo Birds product image"}
          </span>
        </label>
      </div>

      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {products.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.label} className="aspect-square w-full rounded object-contain bg-gray-50" />
              <p className="mt-2 truncate text-xs font-medium text-gray-700">{p.label}</p>
              <button
                onClick={() => handleDelete(p.id)}
                className="mt-2 w-full rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {products.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No product image yet. Upload one to enable product replacement in generated ads.
        </p>
      )}
    </div>
  );
}

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
      const res = await fetch("/api/birds/brand/upload-pdf", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setResult({ pages: data.pages, chars: data.chars });
        const configRes = await fetch("/api/birds/brand");
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
      <label className="flex items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-3 cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-colors">
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
          Extracted {result.chars.toLocaleString()} characters from {result.pages} pages.
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

function Field({ label, value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      {label && <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm text-gray-800 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
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
        className="w-full rounded-lg border border-border px-3 py-2 text-sm text-gray-800 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
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
            className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm text-gray-800 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
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
          className="flex-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-gray-600 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
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
