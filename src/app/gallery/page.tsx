"use client";

import { useState, useEffect, DragEvent } from "react";
import { GalleryImage, GalleryFolder } from "@/lib/gallery";

export default function GalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>("root");
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadGallery();
  }, []);

  async function loadGallery() {
    const res = await fetch("/api/gallery");
    const data = await res.json();
    setImages(data.images || []);
    setFolders(data.folders || []);
  }

  const filteredImages = images.filter((img) => img.folderId === activeFolder);

  async function handleDelete(id: string) {
    await fetch(`/api/gallery?imageId=${id}`, { method: "DELETE" });
    setImages((prev) => prev.filter((img) => img.id !== id));
    setSelectedImages((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    for (const id of selectedImages) {
      await fetch(`/api/gallery?imageId=${id}`, { method: "DELETE" });
    }
    setImages((prev) => prev.filter((img) => !selectedImages.has(img.id)));
    setSelectedImages(new Set());
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const res = await fetch("/api/gallery", {
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
    await fetch(`/api/gallery?folderId=${id}`, { method: "DELETE" });
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setImages((prev) =>
      prev.map((img) => (img.folderId === id ? { ...img, folderId: "root" } : img))
    );
    if (activeFolder === id) setActiveFolder("root");
  }

  async function handleMoveImage(imageId: string, folderId: string) {
    await fetch("/api/gallery", {
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
            <a href="/" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <h1 className="text-lg font-bold text-gray-900">Gallery</h1>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {images.length} images
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedImages.size > 0 && (
              <>
                <span className="text-sm text-gray-500">{selectedImages.size} selected</span>
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
                <p className="mt-1 text-xs text-gray-400">Generated ads will appear here automatically</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {filteredImages.map((img) => {
                  const isSelected = selectedImages.has(img.id);
                  return (
                    <div
                      key={img.id}
                      draggable
                      onDragStart={() => handleDragStart(img.id)}
                      className={`group relative overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all hover:shadow-md cursor-grab active:cursor-grabbing ${
                        isSelected ? "border-primary ring-2 ring-primary/20" : "border-transparent"
                      }`}
                    >
                      {/* Select checkbox */}
                      <button
                        onClick={() => toggleSelectImage(img.id)}
                        className={`absolute top-2 left-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all ${
                          isSelected
                            ? "border-primary bg-primary text-white"
                            : "border-white/70 bg-white/70 text-transparent hover:border-gray-300 hover:bg-white"
                        }`}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>

                      {/* Image */}
                      <div className="aspect-square overflow-hidden bg-gray-100">
                        <img
                          src={img.url}
                          alt={img.prompt?.substring(0, 50) || "Generated ad"}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>

                      {/* Info bar */}
                      <div className="p-2">
                        <div className="flex items-center justify-between">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                            {img.size}
                          </span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDownload(img.url, img.filename)}
                              className="rounded p-1 text-gray-400 hover:bg-primary/10 hover:text-primary transition-colors"
                              title="Download"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(img.id)}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        {img.angle && (
                          <p className="mt-1 truncate text-xs text-gray-400">{img.angle}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
