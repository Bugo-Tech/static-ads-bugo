/**
 * Bugo Guard gallery types.
 *
 * Types only, by design. The other verticals each ship a ~230-line sibling of
 * this file left over from the filesystem era, but every runtime function in
 * those files is dead: the gallery moved to Supabase, and the pages import
 * nothing from them but these two interfaces (`import type` in
 * src/app/<scope>/gallery/page.tsx). Reads and writes go through
 * src/lib/supabase-db.ts via src/app/api/guard/gallery/route.ts.
 *
 * Shapes match what mapGalleryRow() in src/lib/supabase-db.ts returns.
 */

export interface GuardGalleryImage {
  id: string;
  filename: string;
  /** Signed URL for display; expires, so never persist it. */
  url: string;
  /** Stored URL as written at creation time. */
  sourceUrl: string;
  prompt: string;
  size: string;
  angle: string;
  referencePreview?: string;
  folderId: string;
  createdAt: string;
  originalPrompt?: string;
  referenceImageUrl?: string;
  productImageIds?: string[];
  copyVariation?: { angle: string; sections: { label: string; adaptedText: string }[] };
  /** Links a cross-size or QC-fix image back to the original it came from. */
  sourceImageId?: string;
  isQcFix?: boolean;
}

export interface GuardGalleryFolder {
  id: string;
  name: string;
  createdAt: string;
}
