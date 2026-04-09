"use client";

import { useState, useRef, DragEvent } from "react";

interface UploadZoneProps {
  onFilesAdded: (files: File[]) => void;
  currentCount: number;
  maxFiles?: number;
}

export default function UploadZone({
  onFilesAdded,
  currentCount,
  maxFiles = 10,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = maxFiles - currentCount;

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, remaining);
    if (files.length > 0) {
      onFilesAdded(files);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  if (remaining <= 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-white p-8 text-center">
        <p className="text-sm text-gray-500">
          Maximum {maxFiles} reference images reached
        </p>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
        isDragging
          ? "border-primary bg-primary-bg scale-[1.01]"
          : "border-border bg-white hover:border-primary-light hover:bg-primary-bg/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-bg">
        <svg
          className="h-8 w-8 text-primary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
          />
        </svg>
      </div>
      <p className="text-lg font-semibold text-gray-800">
        Drop reference ads here
      </p>
      <p className="mt-1 text-sm text-gray-500">
        or click to browse — up to {remaining} more image{remaining !== 1 ? "s" : ""}
      </p>
      <p className="mt-3 text-xs text-gray-400">
        PNG, JPG, WebP supported
      </p>
    </div>
  );
}
