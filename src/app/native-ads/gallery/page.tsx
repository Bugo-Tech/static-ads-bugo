"use client";

/**
 * Native Ads gallery viewer.
 * Flat list (no folders), filter by size (all / 1:1 / 9:16).
 * Actions per image: download, delete.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { NativeAdsGalleryImage } from "@/lib/types";
import { SIZES } from "@/lib/native-ads-defaults";

type SizeFilter = "all" | "1:1" | "9:16";

function downloadImage(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function NativeAdsGalleryPage() {
  const router = useRouter();
  const [images, setImages] = useState<NativeAdsGalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>("all");
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const loadGallery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/native-ads/gallery");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr: NativeAdsGalleryImage[] = Array.isArray(data?.images) ? data.images : [];
      // Newest first.
      arr.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      setImages(arr);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("למחוק את התמונה הזו לצמיתות?")) return;
      setDeleting((prev) => new Set(prev).add(id));
      try {
        const res = await fetch(`/api/native-ads/gallery?imageId=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status}`);
        setImages((prev) => prev.filter((img) => img.id !== id));
      } catch (err) {
        alert(`מחיקה נכשלה: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setDeleting((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    []
  );

  const filtered = sizeFilter === "all" ? images : images.filter((img) => img.size === sizeFilter);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-rose-50 to-white">
      <header className="bg-white border-b border-rose-100 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={() => router.push("/native-ads")}
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← חזרה ל-Native Ads
          </button>
          <h1 className="text-lg font-bold text-rose-700">📁 גלריית Native Ads</h1>
          <button
            onClick={loadGallery}
            className="text-sm rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-medium text-rose-700 hover:bg-rose-100 transition-colors"
          >
            🔄 רענן
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-sm text-gray-700">סנן לפי גודל:</span>
          {(["all", ...SIZES] as SizeFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSizeFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                sizeFilter === s
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
              }`}
            >
              {s === "all" ? "הכל" : s}
            </button>
          ))}
          <span className="ms-auto text-sm text-gray-500">
            {filtered.length} {filtered.length === 1 ? "תמונה" : "תמונות"}
          </span>
        </div>

        {loading && <p className="text-center text-gray-500 py-12">טוען גלריה...</p>}
        {error && (
          <p className="text-center text-red-600 py-12">
            שגיאה בטעינה: {error}
          </p>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg mb-3">הגלריה ריקה</p>
            <button
              onClick={() => router.push("/native-ads")}
              className="rounded-lg bg-rose-600 text-white px-5 py-2 font-medium hover:bg-rose-700 transition-colors"
            >
              ייצר את התמונה הראשונה
            </button>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((img) => {
              const isDeleting = deleting.has(img.id);
              return (
                <div
                  key={img.id}
                  className="bg-white border border-rose-100 rounded-xl overflow-hidden shadow-sm"
                >
                  <div
                    className="relative bg-gray-50"
                    style={img.size === "9:16" ? { aspectRatio: "9 / 16" } : { aspectRatio: "1 / 1" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.description || img.prompt.slice(0, 60)}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                      {img.size}
                    </span>
                  </div>

                  <div className="p-3 text-xs space-y-2">
                    <p className="text-gray-700 line-clamp-2" title={img.description || img.prompt}>
                      {img.description || img.prompt.slice(0, 100) + "..."}
                    </p>
                    {(img.pestId || img.vibe) && (
                      <p className="text-gray-500">
                        {img.pestId && <span className="me-2">🐛 {img.pestId}</span>}
                        {img.vibe && <span>🎭 {img.vibe}</span>}
                      </p>
                    )}
                    <p className="text-gray-400">
                      {new Date(img.createdAt).toLocaleString("he-IL", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => downloadImage(img.url, img.filename)}
                        className="flex-1 rounded-lg bg-rose-600 text-white px-2 py-1.5 font-medium hover:bg-rose-700 transition-colors"
                      >
                        ⬇ הורד
                      </button>
                      <button
                        onClick={() => handleDelete(img.id)}
                        disabled={isDeleting}
                        className="rounded-lg border border-red-300 text-red-700 px-2 py-1.5 font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {isDeleting ? "..." : "🗑"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
