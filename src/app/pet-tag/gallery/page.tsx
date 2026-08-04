"use client";

/**
 * Bugo Pet Tag Gallery — TRUE 1:1 clone of src/app/gallery/page.tsx.
 * Only diffs: types swapped (GalleryImage → PetTagGalleryImage), endpoints
 * swapped (/api/gallery → /api/pet-tag/gallery, /api/generate-image →
 * /api/pet-tag/generate-image), header text, and one small additive badge
 * showing which product image was used (📦 product / packaging) — does not
 * affect layout.
 *
 * Same colors (primary blue, not emerald), same buttons, same language
 * detection, same parent-child grouping, same RegenerateModal.
 */

import { useState, useEffect, DragEvent } from "react";
import Link from "next/link";
import type { PetTagGalleryImage, PetTagGalleryFolder } from "@/lib/pet-tag-gallery";
import RegenerateModal from "../../components/RegenerateModal";

interface PendingJob {
  jobId: string;
  size: string;
  sourceImageId: string;
}

export default function PetTagGalleryPage() {
  const [images, setImages] = useState<PetTagGalleryImage[]>([]);
  const [folders, setFolders] = useState<PetTagGalleryFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>("root");
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<PetTagGalleryImage | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [regenerateModal, setRegenerateModal] = useState<{ image: PetTagGalleryImage; mode: "fix" | "cross-size" } | null>(null);
  const [batchFixModal, setBatchFixModal] = useState(false);
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);

  useEffect(() => {
    loadGallery();
  }, []);

  async function loadGallery() {
    const res = await fetch("/api/pet-tag/gallery");
    const data = await res.json();
    setImages(
      (data.images || []).sort(
        (a: PetTagGalleryImage, b: PetTagGalleryImage) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
    setFolders(data.folders || []);
  }

  const filteredImages = images.filter((img) => img.folderId === activeFolder);

  async function handleDelete(id: string) {
    await fetch(`/api/pet-tag/gallery?imageId=${id}`, { method: "DELETE" });
    setImages((prev) => prev.filter((img) => img.id !== id));
    setSelectedImages((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    for (const id of selectedImages) {
      await fetch(`/api/pet-tag/gallery?imageId=${id}`, { method: "DELETE" });
    }
    setImages((prev) => prev.filter((img) => !selectedImages.has(img.id)));
    setSelectedImages(new Set());
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const res = await fetch("/api/pet-tag/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-folder", name: newFolderName.trim() }),
    });
    const data = await res.json();
    if (data.folder) {
      setFolders((prev) => [...prev, data.folder]);
    }
    setNewFolderName("");
    setShowNewFolder(false);
  }

  async function handleDeleteFolder(id: string) {
    await fetch(`/api/pet-tag/gallery?folderId=${id}`, { method: "DELETE" });
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setImages((prev) =>
      prev.map((img) => (img.folderId === id ? { ...img, folderId: "root" } : img))
    );
    if (activeFolder === id) setActiveFolder("root");
  }

  async function handleMoveImage(imageId: string, folderId: string) {
    await fetch("/api/pet-tag/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move-image", imageId, folderId }),
    });
    setImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, folderId } : img))
    );
  }

  function handleDragStart(imageId: string) {
    setDraggedImageId(imageId);
  }

  function handleDragOverFolder(e: DragEvent, folderId: string) {
    e.preventDefault();
    setDragOverFolderId(folderId);
  }

  function handleDragLeaveFolder() {
    setDragOverFolderId(null);
  }

  function handleDropOnFolder(folderId: string) {
    if (draggedImageId) {
      handleMoveImage(draggedImageId, folderId);
    }
    setDraggedImageId(null);
    setDragOverFolderId(null);
  }

  function toggleSelectImage(id: string) {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const ids = filteredImages.map((img) => img.id);
    setSelectedImages(new Set(ids));
  }

  function deselectAll() {
    setSelectedImages(new Set());
  }

  async function handleDownload(url: string, filename: string) {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleBatchFix(params: { fixInstruction?: string }) {
    const selectedImgs = images.filter((img) => selectedImages.has(img.id));
    for (const img of selectedImgs) {
      await handleRegenerate(img, { fixInstruction: params.fixInstruction, targetSize: img.size });
    }
  }

  function imageHasMetadata(img: PetTagGalleryImage) {
    return !!(img.originalPrompt || (img.prompt && img.prompt.length > 10));
  }

  // --- Regeneration (fix text / cross-size) — routes through /api/pet-tag/generate-image ---
  async function handleRegenerate(image: PetTagGalleryImage, params: { fixInstruction?: string; targetSize: string }) {
    const basePrompt = image.originalPrompt || image.prompt;
    if (!basePrompt) throw new Error("This image is missing prompt data and cannot be regenerated.");
    const isCrossSize = !params.fixInstruction;

    let prompt: string;
    let referenceImageUrl: string;

    if (params.fixInstruction) {
      prompt = `CRITICAL OVERRIDE — APPLY BEFORE ANYTHING ELSE:\n${params.fixInstruction}\n\nThe above fix MUST be applied. If it contradicts any instruction below, the fix takes priority.\n\n---\n\n${basePrompt}`;
      referenceImageUrl = image.sourceUrl;
    } else {
      referenceImageUrl = image.sourceUrl;
      prompt = `RESIZE ONLY — You are converting an existing ad from ${image.size} to ${params.targetSize}.
The ad content (text, layout, visual elements, colors) must be IDENTICAL to the reference image — same copy WORD-FOR-WORD, same visual elements, same product placement, same colors.
Only adjust the canvas proportions and element positioning to fit the new ${params.targetSize} aspect ratio.
Do NOT change, add, or remove any text. Do NOT change any visual element. Do NOT reinterpret or redesign.

${basePrompt}`;
    }

    const res = await fetch("/api/pet-tag/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        referenceImageUrl,
        productImageId: isCrossSize ? undefined : (image.productImageId || image.productImageIds?.[0]),
        size: params.targetSize,
        copyVariation: isCrossSize ? undefined : image.copyVariation,
        isCrossSize,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.jobId) throw new Error(data.error || "Failed to submit");

    setPendingJobs((prev) => [...prev, { jobId: data.jobId, size: params.targetSize, sourceImageId: image.id }]);
  }

  // Poll pending jobs
  useEffect(() => {
    if (pendingJobs.length === 0) return;
    const interval = setInterval(async () => {
      const stillPending: PendingJob[] = [];
      for (const job of pendingJobs) {
        try {
          const res = await fetch(`/api/image-status?jobId=${job.jobId}`);
          const data = await res.json();
          if (data.status === "completed" && data.resultUrl) {
            const source = images.find((img) => img.id === job.sourceImageId);
            await fetch("/api/pet-tag/gallery", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "add-image",
                sourceUrl: data.resultUrl,
                prompt: source?.prompt || "",
                size: job.size,
                angle: source?.angle || "",
                folderId: source?.folderId || "root",
                originalPrompt: source?.originalPrompt || source?.prompt || "",
                referenceImageUrl: source?.referenceImageUrl || "",
                productImageId: source?.productImageId,
                productImageLabel: source?.productImageLabel,
                productImageIds: source?.productImageIds || (source?.productImageId ? [source.productImageId] : []),
                copyVariation: source?.copyVariation,
                sourceImageId: job.sourceImageId,
              }),
            });
            await loadGallery();
          } else if (data.status === "failed") {
            // Drop failed jobs silently
          } else {
            stillPending.push(job);
          }
        } catch {
          stillPending.push(job);
        }
      }
      setPendingJobs(stillPending);
    }, 5000);
    return () => clearInterval(interval);
  }, [pendingJobs, images]);

  async function handleDownloadSelected() {
    for (const id of selectedImages) {
      const img = images.find((i) => i.id === id);
      if (img) {
        await handleDownload(img.url, img.filename);
      }
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/pet-tag" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-bold text-gray-900">Bugo Pet Tag — Gallery</h1>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {images.length} images
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedImages.size > 0 && (
              <>
                <span className="text-sm text-gray-500">{selectedImages.size} selected</span>
                <button onClick={() => setBatchFixModal(true)} className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100">
                  Fix Selected
                </button>
                <button onClick={handleDownloadSelected} className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20">
                  Download Selected
                </button>
                <button onClick={handleDeleteSelected} className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100">
                  Delete Selected
                </button>
                <button onClick={deselectAll} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Deselect
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="flex gap-6">
          {/* Sidebar — Folders */}
          <div className="w-56 flex-shrink-0">
            <div className="rounded-2xl border border-border bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-700">Folders</h3>
                <button
                  onClick={() => setShowNewFolder(true)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="New folder"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {showNewFolder && (
                <div className="mb-2 flex gap-1">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                    placeholder="Folder name..."
                    className="flex-1 rounded-lg border border-border px-2 py-1 text-sm focus:border-primary focus:outline-none"
                    autoFocus
                  />
                  <button onClick={handleCreateFolder} className="rounded-lg bg-primary px-2 py-1 text-xs text-white">
                    Add
                  </button>
                </div>
              )}

              {/* All images */}
              <button
                onClick={() => setActiveFolder("root")}
                onDragOver={(e) => handleDragOverFolder(e, "root")}
                onDragLeave={handleDragLeaveFolder}
                onDrop={() => handleDropOnFolder("root")}
                className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all ${
                  activeFolder === "root"
                    ? "bg-primary/10 font-medium text-primary"
                    : dragOverFolderId === "root"
                    ? "bg-blue-50 border-2 border-dashed border-primary"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                All Images
                <span className="ml-auto text-xs text-gray-400">
                  {images.filter((i) => i.folderId === "root").length}
                </span>
              </button>

              {/* Folders */}
              {folders.map((folder) => (
                <div key={folder.id} className="group relative mb-1">
                  <button
                    onClick={() => setActiveFolder(folder.id)}
                    onDragOver={(e) => handleDragOverFolder(e, folder.id)}
                    onDragLeave={handleDragLeaveFolder}
                    onDrop={() => handleDropOnFolder(folder.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all ${
                      activeFolder === folder.id
                        ? "bg-primary/10 font-medium text-primary"
                        : dragOverFolderId === folder.id
                        ? "bg-blue-50 border-2 border-dashed border-primary"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    {folder.name}
                    <span className="ml-auto text-xs text-gray-400">
                      {images.filter((i) => i.folderId === folder.id).length}
                    </span>
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Main — Image Grid */}
          <div className="flex-1">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">
                {activeFolder === "root"
                  ? "All Images"
                  : folders.find((f) => f.id === activeFolder)?.name || ""}
              </h2>
              {filteredImages.length > 0 && (
                <button
                  onClick={selectedImages.size === filteredImages.length ? deselectAll : selectAll}
                  className="text-sm text-primary hover:underline"
                >
                  {selectedImages.size === filteredImages.length ? "Deselect All" : "Select All"}
                </button>
              )}
            </div>

            {filteredImages.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-border py-16 text-center">
                <svg className="mx-auto mb-3 h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-400">No images here yet</p>
                <p className="mt-1 text-xs text-gray-400">Generated Bugo Pet Tag ads will appear here automatically</p>
              </div>
            ) : (
              <GroupedGalleryGrid
                images={filteredImages}
                selectedImages={selectedImages}
                pendingJobs={pendingJobs}
                onToggleSelect={toggleSelectImage}
                onLightbox={setLightboxImage}
                onDelete={handleDelete}
                onDownload={handleDownload}
                onDragStart={handleDragStart}
                onFix={(img: PetTagGalleryImage) => setRegenerateModal({ image: img, mode: "fix" })}
                onCrossSize={(img: PetTagGalleryImage) => setRegenerateModal({ image: img, mode: "cross-size" })}
                imageHasMetadata={imageHasMetadata}
              />
            )}
          </div>
        </div>
      </div>

      {/* Regenerate Modal (Fix Text / Cross-Size) */}
      {regenerateModal && (
        <RegenerateModal
          mode={regenerateModal.mode}
          currentSize={regenerateModal.image.size}
          onSubmit={(params) => handleRegenerate(regenerateModal.image, params)}
          onClose={() => setRegenerateModal(null)}
        />
      )}

      {/* Batch Fix Modal */}
      {batchFixModal && (
        <RegenerateModal
          mode="fix"
          currentSize="batch"
          batchCount={selectedImages.size}
          onSubmit={(params) => handleBatchFix(params)}
          onClose={() => setBatchFixModal(false)}
        />
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxImage.url}
              alt="Full view"
              className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
            />
            <div className="mt-3 flex items-center justify-center gap-3">
              {imageHasMetadata(lightboxImage) && (
                <>
                  <button
                    onClick={() => { setRegenerateModal({ image: lightboxImage, mode: "fix" }); setLightboxImage(null); }}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors"
                  >
                    Fix Text
                  </button>
                  <button
                    onClick={() => { setRegenerateModal({ image: lightboxImage, mode: "cross-size" }); setLightboxImage(null); }}
                    className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
                  >
                    Generate {lightboxImage.size === "1:1" ? "9:16" : "1:1"}
                  </button>
                </>
              )}
              <button
                onClick={() => handleDownload(lightboxImage.url, lightboxImage.filename)}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 transition-colors"
              >
                Download
              </button>
              <button
                onClick={() => setLightboxImage(null)}
                className="rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/30 transition-colors"
              >
                Close
              </button>
            </div>
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-600 shadow-lg hover:bg-gray-100"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Grouped Gallery Grid ---

interface GroupedGridProps {
  images: PetTagGalleryImage[];
  selectedImages: Set<string>;
  pendingJobs: PendingJob[];
  onToggleSelect: (id: string) => void;
  onLightbox: (img: PetTagGalleryImage) => void;
  onDelete: (id: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDragStart: (id: string) => void;
  onFix: (img: PetTagGalleryImage) => void;
  onCrossSize: (img: PetTagGalleryImage) => void;
  imageHasMetadata: (img: PetTagGalleryImage) => boolean;
}

function GroupedGalleryGrid(props: GroupedGridProps) {
  const { images } = props;

  // Step 1: Group by referenceImageUrl
  const groups = new Map<string, PetTagGalleryImage[]>();
  for (const img of images) {
    const key = img.referenceImageUrl || "ungrouped";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(img);
  }

  // Sort groups: newest first
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
    const newestA = Math.max(...a[1].map((i) => new Date(i.createdAt).getTime()));
    const newestB = Math.max(...b[1].map((i) => new Date(i.createdAt).getTime()));
    return newestB - newestA;
  });

  return (
    <div className="space-y-6">
      {sortedGroups.map(([refUrl, groupImages]) => (
        <ReferenceGroup key={refUrl} refUrl={refUrl} {...props} images={groupImages} />
      ))}
    </div>
  );
}

function ReferenceGroup(props: GroupedGridProps & { refUrl: string; images: PetTagGalleryImage[] }) {
  const { refUrl, images, selectedImages, pendingJobs, onToggleSelect, onLightbox, onDelete, onDownload, onDragStart, onFix, onCrossSize, imageHasMetadata } = props;
  const cardProps = { selectedImages, pendingJobs, onToggleSelect, onLightbox, onDelete, onDownload, onDragStart, onFix, onCrossSize, imageHasMetadata };

  // Step 2: Within each group, pair by angle — children (sourceImageId set) inherit parent's angle
  const byAngle = new Map<string, PetTagGalleryImage[]>();
  for (const img of images) {
    const parentImg = img.sourceImageId ? images.find((p) => p.id === img.sourceImageId) : null;
    const key = parentImg?.angle || img.angle || "no-angle";
    if (!byAngle.has(key)) byAngle.set(key, []);
    byAngle.get(key)!.push(img);
  }

  const sortedAngles = Array.from(byAngle.entries()).sort((a, b) => {
    const newestA = Math.max(...a[1].map((i) => new Date(i.createdAt).getTime()));
    const newestB = Math.max(...b[1].map((i) => new Date(i.createdAt).getTime()));
    return newestB - newestA;
  });

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      {/* Reference header */}
      <div className="flex items-center gap-3 border-b border-border bg-gray-50 px-4 py-2.5">
        {refUrl !== "ungrouped" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={refUrl} alt="" className="h-10 w-10 rounded-lg border border-border object-cover" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
            {refUrl === "ungrouped" ? "Other" : "Reference"}
          </span>
          <span className="ml-2 text-xs text-gray-400">{images.length} image{images.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Variations within this reference */}
      <div className="divide-y divide-border">
        {sortedAngles.map(([angle, angleImages]) => {
          const originals = angleImages.filter((i) => !i.sourceImageId);
          const children = angleImages.filter((i) => !!i.sourceImageId);

          // Sort originals: 1:1 first, then 9:16
          originals.sort((a, b) => (a.size === "1:1" ? -1 : 1) - (b.size === "1:1" ? -1 : 1));

          return (
            <div key={angle} className="px-4 py-3">
              {angle !== "no-angle" && (
                <p className="mb-2 text-xs font-medium text-gray-500 truncate">{angle}</p>
              )}
              <div className="flex flex-wrap gap-3">
                {originals.map((img) => {
                  const imgChildren = children.filter((c) => c.sourceImageId === img.id);
                  return (
                    <div key={img.id} className="flex gap-2">
                      <GalleryImageCard img={img} {...cardProps} />
                      {imgChildren.map((child) => (
                        <div key={child.id} className="relative">
                          {child.isQcFix && (
                            <span className="absolute -top-1.5 -left-1.5 z-10 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">🔧 QC</span>
                          )}
                          <GalleryImageCard img={child} {...cardProps} />
                        </div>
                      ))}
                    </div>
                  );
                })}
                {/* Orphan children (parent deleted) */}
                {children.filter((c) => !originals.some((o) => o.id === c.sourceImageId)).map((img) => (
                  <GalleryImageCard key={img.id} img={img} {...cardProps} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Language detection — mirror of main gallery's detectImageLanguage.
 * Scans copyVariation, prompt, originalPrompt, angle.
 */
function detectImageLanguage(img: PetTagGalleryImage): { flag: string; code: string } | null {
  const text = [
    ...(img.copyVariation?.sections || []).map((s) => s.adaptedText || ""),
    img.prompt || "",
    img.originalPrompt || "",
    img.angle || "",
  ].join(" ");
  if (!text.trim()) return null;

  if (/[֐-׿]/.test(text)) return { flag: "🇮🇱", code: "HE" };
  if (/[؀-ۿ]/.test(text)) return { flag: "🇸🇦", code: "AR" };
  if (/[Ѐ-ӿ]/.test(text)) return { flag: "🇷🇺", code: "RU" };

  if (/[äöüßÄÖÜ]/.test(text)) return { flag: "🇩🇪", code: "DE" };
  if (/[éèêëàâçîïôûùœÉÈÊËÀÂÇÎÏÔÛÙŒ]/.test(text)) return { flag: "🇫🇷", code: "FR" };

  if (/[A-Za-z]/.test(text)) return { flag: "🇺🇸", code: "EN" };

  return null;
}

function GalleryImageCard({ img, selectedImages, pendingJobs, onToggleSelect, onLightbox, onDelete, onDownload, onDragStart, onFix, onCrossSize, imageHasMetadata }: Omit<GroupedGridProps, "images"> & { img: PetTagGalleryImage }) {
  const isSelected = selectedImages.has(img.id);
  return (
    <div
      draggable
      onDragStart={() => onDragStart(img.id)}
      className={`group relative w-40 overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all hover:shadow-md cursor-grab active:cursor-grabbing ${
        isSelected ? "border-primary ring-2 ring-primary/20" : "border-transparent"
      }`}
    >
      <button
        onClick={() => onToggleSelect(img.id)}
        className={`absolute top-1.5 left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded border-2 transition-all ${
          isSelected ? "border-primary bg-primary text-white" : "border-white/70 bg-white/70 text-transparent hover:border-gray-300"
        }`}
      >
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </button>
      <div className={`overflow-hidden bg-gray-100 cursor-pointer ${img.size === "9:16" ? "aspect-[9/16] max-h-56" : "aspect-square"}`} onClick={() => onLightbox(img)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.url} alt="" className="h-full w-full object-contain" loading="lazy" />
      </div>
      <div className="p-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">{img.size}</span>
            {(() => {
              const lang = detectImageLanguage(img);
              return lang ? (
                <span
                  className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500"
                  title={`Language: ${lang.code}`}
                >
                  {lang.flag} {lang.code}
                </span>
              ) : null;
            })()}
            {img.productImageLabel && (
              <span
                className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500"
                title={`Product image: ${img.productImageLabel}`}
              >
                📦
              </span>
            )}
          </div>
          <div className="flex gap-0.5">
            {imageHasMetadata(img) && (
              <>
                <button onClick={() => onFix(img)} className="rounded p-0.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600" title="Fix">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => onCrossSize(img)} className="rounded p-0.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title={`→ ${img.size === "1:1" ? "9:16" : "1:1"}`}>
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                </button>
              </>
            )}
            <button onClick={() => onDownload(img.url, img.filename)} className="rounded p-0.5 text-gray-400 hover:bg-primary/10 hover:text-primary" title="Download">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </button>
            <button onClick={() => onDelete(img.id)} className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500" title="Delete">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>
        {pendingJobs.some((j) => j.sourceImageId === img.id) && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-primary">
            <div className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Generating...
          </div>
        )}
      </div>
    </div>
  );
}
