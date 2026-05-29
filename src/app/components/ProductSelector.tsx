"use client";

import { useEffect, useState } from "react";
import { BrandProduct } from "@/lib/types";

interface ProductSelectorProps {
  selectedProductId?: string;
  onSelect: (productId: string | undefined) => void;
}

export default function ProductSelector({ selectedProductId, onSelect }: ProductSelectorProps) {
  const [products, setProducts] = useState<BrandProduct[]>([]);

  useEffect(() => {
    fetch("/api/brand")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products || []);
        // Auto-select if only one product and nothing selected yet
        if (!selectedProductId && data.products?.length === 1) {
          onSelect(data.products[0].id);
        }
      })
      .catch(() => {});
  }, []);

  if (products.length <= 1) return null; // Don't show selector if only one or no products

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-gray-700">Product Context</h3>
      <p className="mb-3 text-xs text-gray-500">
        Select which product the ads should reference
      </p>
      <div className="flex flex-wrap gap-2">
        {products.map((product) => (
          <button
            key={product.id}
            onClick={() => onSelect(product.id)}
            className={`rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all ${
              selectedProductId === product.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-gray-600 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <div>{product.name}</div>
            {product.description && (
              <div className="mt-0.5 text-xs font-normal text-gray-400">
                {product.description.substring(0, 60)}...
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
