"use client";

import { useState, useEffect, useRef } from "react";
import { ProductImage } from "@/lib/types";

interface ProductLibraryProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export default function ProductLibrary({
  selectedIds,
  onSelectionChange,
}: ProductLibraryProps) {
  const [products, setProducts] = useState<ProductImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        const prods = data.products || [];
        setProducts(prods);
        // Auto-select all product images if none are selected yet
        if (selectedIds.length === 0 && prods.length > 0) {
          onSelectionChange(prods.map((p: ProductImage) => p.id));
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/products", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.product) {
          setProducts((prev) => [...prev, data.product]);
        }
      } catch {
        // silently skip failed uploads
      }
    }
    setUploading(false);
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/products?id=${id}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((p) => p.id !== id));
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    } catch {
      // silently skip
    }
  }

  function toggleSelection(id: string) {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Bugo Product Images</h3>
          <p className="text-xs text-gray-500">
            Select which product images to use in generated ads
          </p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "+ Add Product Image"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleUpload(e.target.files)}
          className="hidden"
        />
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border py-8 text-center">
          <p className="text-sm text-gray-400">
            No product images yet. Add Bugo product photos to use in your ads.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
          {products.map((product) => {
            const isSelected = selectedIds.includes(product.id);
            return (
              <div
                key={product.id}
                className="group relative"
              >
                <button
                  onClick={() => toggleSelection(product.id)}
                  className={`relative w-full overflow-hidden rounded-xl border-2 transition-all ${
                    isSelected
                      ? "border-primary shadow-md ring-2 ring-primary/20"
                      : "border-transparent hover:border-gray-200"
                  }`}
                >
                  <div className="aspect-square overflow-hidden bg-gray-100">
                    <img
                      src={product.url}
                      alt={product.label || product.filename}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  {isSelected && (
                    <div className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
                <button
                  onClick={() => handleDelete(product.id)}
                  className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
