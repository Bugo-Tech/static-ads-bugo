"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { NormalizedAd, AdActiveStatus } from "@/lib/apify";

type ImportState =
  | { status: "idle" }
  | { status: "importing" }
  | { status: "imported"; filename: string; url: string }
  | { status: "error"; message: string };

type SearchState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "polling"; runId: string; datasetId: string; startedAt: number }
  | { phase: "done" }
  | { phase: "error"; message: string };

export default function AutoPullPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [limit, setLimit] = useState(10);
  const [activeStatus, setActiveStatus] = useState<AdActiveStatus>("active");
  const [search, setSearch] = useState<SearchState>({ phase: "idle" });
  const [elapsedSec, setElapsedSec] = useState(0);
  const [ads, setAds] = useState<NormalizedAd[]>([]);
  const [imports, setImports] = useState<Record<string, ImportState>>({});
  const pollAbortRef = useRef<AbortController | null>(null);

  // Tick the elapsed counter every second while polling.
  useEffect(() => {
    if (search.phase !== "polling") return;
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - search.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [search]);

  // Poll Apify status every 5s while running.
  useEffect(() => {
    if (search.phase !== "polling") return;
    let cancelled = false;
    const ctrl = new AbortController();
    pollAbortRef.current = ctrl;

    async function tick() {
      try {
        const res = await fetch(
          `/api/auto-pull/status?runId=${encodeURIComponent(search.phase === "polling" ? search.runId : "")}&datasetId=${encodeURIComponent(
            search.phase === "polling" ? search.datasetId : ""
          )}`,
          { signal: ctrl.signal, cache: "no-store" }
        );
        if (cancelled) return;
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Status check failed");

        if (data.status === "SUCCEEDED") {
          setAds(data.ads || []);
          setSearch({ phase: "done" });
          if (!data.ads || data.ads.length === 0) {
            setSearch({ phase: "error", message: "לא נמצאו מודעות. ייתכן שהדף לא מפרסם כעת או שה-URL שגוי." });
          }
          return;
        }
        if (data.status === "FAILED" || data.status === "ABORTED" || data.status === "TIMED-OUT") {
          setSearch({ phase: "error", message: `Apify run ${data.status}` });
          return;
        }
      } catch (err) {
        if (cancelled || (err as Error)?.name === "AbortError") return;
        setSearch({
          phase: "error",
          message: err instanceof Error ? err.message : "Polling failed",
        });
      }
    }

    const interval = setInterval(tick, 5000);
    // First tick after a short delay so we see the spinner first
    const first = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(first);
      ctrl.abort();
    };
  }, [search]);

  async function handleSearch() {
    if (!url.trim()) {
      setSearch({ phase: "error", message: "הכנס URL של דף פייסבוק או של חיפוש Ad Library" });
      return;
    }
    setAds([]);
    setImports({});
    setElapsedSec(0);
    setSearch({ phase: "starting" });
    try {
      const res = await fetch("/api/auto-pull/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), limit, activeStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start run");
      setSearch({
        phase: "polling",
        runId: data.runId,
        datasetId: data.datasetId,
        startedAt: Date.now(),
      });
    } catch (err) {
      setSearch({ phase: "error", message: err instanceof Error ? err.message : "Search failed" });
    }
  }

  function handleCancel() {
    pollAbortRef.current?.abort();
    setSearch({ phase: "idle" });
  }

  const isBusy = search.phase === "starting" || search.phase === "polling";

  async function handleImport(ad: NormalizedAd, imageUrl: string) {
    setImports((prev) => ({ ...prev, [ad.adId]: { status: "importing" } }));
    try {
      const res = await fetch("/api/auto-pull/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setImports((prev) => ({
        ...prev,
        [ad.adId]: { status: "imported", filename: data.filename, url: data.url },
      }));
    } catch (err) {
      setImports((prev) => ({
        ...prev,
        [ad.adId]: {
          status: "error",
          message: err instanceof Error ? err.message : "Import failed",
        },
      }));
    }
  }

  function openInReplicator(filename: string) {
    router.push(`/replicator?ref=${encodeURIComponent(filename)}`);
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">
              B
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Auto Pull</h1>
              <p className="text-xs text-gray-500">משיכת מודעות מתחרים אוטומטית מ-Meta Ad Library</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ← Main
            </button>
            <button
              onClick={() => router.push("/replicator")}
              className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
            >
              Replicator
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">חיפוש מודעות מתחרה</h2>
          <p className="mt-1 text-sm text-gray-500">
            הדבק URL של דף פייסבוק (כמו{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">https://www.facebook.com/Hemios</code>) או URL של תוצאות חיפוש מ-
            <a
              href="https://www.facebook.com/ads/library/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Meta Ad Library
            </a>
            .
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_180px_auto]">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isBusy) handleSearch();
              }}
              placeholder="https://www.facebook.com/PageName"
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              dir="ltr"
            />
            <input
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 10)))}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              dir="ltr"
            />
            <select
              value={activeStatus}
              onChange={(e) => setActiveStatus(e.target.value as AdActiveStatus)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="active">רק פעילות</option>
              <option value="inactive">רק לא פעילות</option>
              <option value="">פעילות + לא פעילות</option>
            </select>
            <button
              onClick={handleSearch}
              disabled={isBusy}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isBusy ? "שולף..." : "שלוף מודעות"}
            </button>
          </div>

          {search.phase === "error" && (
            <p className="mt-3 text-sm text-red-600">{search.message}</p>
          )}
          {search.phase === "starting" && (
            <p className="mt-3 text-sm text-gray-500">⏳ מתחיל ריצה ב-Apify...</p>
          )}
          {search.phase === "polling" && (
            <div className="mt-3 flex items-center gap-3">
              <p className="text-sm text-gray-600">
                ⏳ ה-actor רץ ב-Apify... <span className="font-mono">{elapsedSec}s</span>
              </p>
              <button
                onClick={handleCancel}
                className="rounded-md border border-border px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
              >
                בטל
              </button>
            </div>
          )}
          {search.phase === "polling" && elapsedSec > 60 && (
            <p className="mt-1 text-xs text-gray-400">
              ה-actor הרשמי איטי - בד"כ לוקח 1-7 דקות. עדיין עובד.
            </p>
          )}
        </section>

        {ads.length > 0 && (
          <section className="mt-6">
            <h2 className="text-base font-semibold text-gray-900">
              {ads.length} מודעות נמצאו
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ads.map((ad) => (
                <AdCard
                  key={ad.adId}
                  ad={ad}
                  importState={imports[ad.adId] || { status: "idle" }}
                  onImport={(imageUrl) => handleImport(ad, imageUrl)}
                  onOpenReplicator={openInReplicator}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function AdCard({
  ad,
  importState,
  onImport,
  onOpenReplicator,
}: {
  ad: NormalizedAd;
  importState: ImportState;
  onImport: (imageUrl: string) => void;
  onOpenReplicator: (filename: string) => void;
}) {
  const primaryImage = ad.imageUrls[0];
  const hasVideo = ad.videoUrls.length > 0;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-white shadow-sm overflow-hidden">
      <div className="relative aspect-square bg-gray-100">
        {primaryImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryImage}
            alt={ad.text.slice(0, 80) || "Ad"}
            className="h-full w-full object-cover"
          />
        ) : hasVideo ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
            🎬 וידאו (לא נתמך לייבוא תמונה)
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
            (אין מדיה)
          </div>
        )}
        {ad.isActive && (
          <span className="absolute top-2 right-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            פעיל
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        {ad.pageName && (
          <p className="text-xs font-semibold text-gray-700">{ad.pageName}</p>
        )}
        {ad.text && (
          <p className="line-clamp-3 text-xs text-gray-600">{ad.text}</p>
        )}
        {(ad.startDate || ad.endDate) && (
          <p className="text-[11px] text-gray-400">
            {ad.startDate || "?"} → {ad.endDate || "פעיל"}
          </p>
        )}

        <div className="mt-2 flex flex-col gap-2">
          {importState.status === "idle" && primaryImage && (
            <button
              onClick={() => onImport(primaryImage)}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
            >
              ייבא
            </button>
          )}
          {importState.status === "idle" && !primaryImage && (
            <button
              disabled
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-400 cursor-not-allowed"
            >
              ללא תמונה
            </button>
          )}
          {importState.status === "importing" && (
            <button
              disabled
              className="rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-500"
            >
              מייבא...
            </button>
          )}
          {importState.status === "imported" && (
            <>
              <span className="rounded-lg bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 text-center">
                ✓ יובא
              </span>
              <button
                onClick={() => onOpenReplicator(importState.filename)}
                className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100"
              >
                פתח ב-Replicator →
              </button>
            </>
          )}
          {importState.status === "error" && (
            <p className="text-xs text-red-600">{importState.message}</p>
          )}
          {ad.snapshotUrl && (
            <a
              href={ad.snapshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-xs text-gray-500 hover:text-gray-700 hover:underline"
            >
              הצג מקור ב-Ad Library ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
