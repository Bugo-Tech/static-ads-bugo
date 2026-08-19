-- Indexes for the columns the app filters and sorts by.
--
-- 001_initial_schema.sql created no indexes beyond the primary keys, so every
-- gallery page load was a sequential scan plus an in-memory sort. These are
-- purely additive: an index cannot change a query's results, only how fast the
-- planner reaches them.
--
-- Safe to re-run — every statement is `if not exists`.
--
-- To roll back: drop index public.<name>;

-- getGalleryImages(): .eq("product_scope", …).order("created_at", desc)
-- The composite order matters — equality column first, then the sort column.
create index if not exists gallery_images_scope_created_idx
  on public.gallery_images (product_scope, created_at desc);

-- Gallery folder filtering, and deleteGalleryFolder()'s bulk reassign.
create index if not exists gallery_images_folder_idx
  on public.gallery_images (folder);

-- Parent lookup for cross-size / QC-fix images grouped under their original.
create index if not exists gallery_images_source_idx
  on public.gallery_images (source_image_id);

-- getProductImages(): .eq("scope", …).order("created_at", desc)
create index if not exists product_images_scope_created_idx
  on public.product_images (scope, created_at desc);

-- getNativeAdsGallery(): .order("created_at", desc)
create index if not exists native_ads_gallery_created_idx
  on public.native_ads_gallery (created_at desc);

-- getHistory(): .order("created_at", desc).limit(100)
create index if not exists ad_history_created_idx
  on public.ad_history (created_at desc);

-- getGalleryFolders(): .order("created_at", asc)
create index if not exists gallery_folders_created_idx
  on public.gallery_folders (created_at);
