# Supabase Integration Design — Static Ads Bugo

**Date:** 2026-08-04
**Status:** Approved
**Scope:** Auth, Database, Storage — full migration from local filesystem to Supabase

## Overview

Migrate the static-ads-bugo app from file-based storage (JSON indexes in `/uploads/`, local image files) to Supabase (Auth + Postgres + Storage). The app is team-based: a shared workspace protected by login, with admin/member roles.

## Decisions

- **Auth method:** Email + password (no OAuth, no magic link)
- **Access model:** Team-based shared workspace (no per-user data isolation)
- **Roles:** Admin (full control) and Member (generate + view)
- **Storage:** All images to Supabase Storage buckets (references, gallery, products)
- **Database:** All metadata to Postgres tables (history, gallery index, brand config, product records)
- **Seed images:** Stay in `public/product-images/` as defaults; new uploads go to Supabase Storage
- **Signup:** Invite-only via admin (no public registration)

---

## 1. Auth & User Management

### Supabase Auth
- Email + password sign-in via `signInWithPassword()`
- No public signup — admin invites users via `inviteUserByEmail()`
- Session managed via Supabase cookie-based auth (SSR-compatible)

### Profiles Table

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- Auto-created via database trigger on `auth.users` insert
- First user manually set to `admin` in Supabase dashboard
- RLS: all authenticated users can read profiles; only admins can update roles

### Frontend Auth Flow
- `/login` — email + password form, redirect to `/` on success
- Next.js middleware protects all routes except `/login`
- Header shows user email + logout button; admins see "Settings" link
- `/settings` (admin only) — list team members, invite by email, remove, change roles

---

## 2. Database Schema

### brand_config

Single-row table storing the full BrandConfig object as JSONB.

```sql
create table brand_config (
  id uuid primary key default gen_random_uuid(),
  config jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
```

- RLS: all authenticated can read; only admins can update
- One row, upserted on save

### ad_history

```sql
create table ad_history (
  id uuid primary key default gen_random_uuid(),
  reference_filename text,
  reference_url text,
  language text not null default 'he',
  product_id text,
  analysis jsonb,
  prompt text,
  copy_variations jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
```

- RLS: all authenticated can read and insert; only admins can delete

### gallery_images

```sql
create table gallery_images (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  url text not null,
  size text not null,
  angle text,
  prompt text,
  reference_url text,
  product_scope text,
  folder text not null default 'root',
  source_image_id uuid references gallery_images(id),
  history_id uuid references ad_history(id),
  metadata jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
```

- RLS: all authenticated can read and insert; only admins can delete

### product_images

```sql
create table product_images (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text,
  url text not null,
  label text,
  scope text not null default 'main',
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
```

- `is_seed = true` for default images from `public/`; these have no `storage_path`
- RLS: all authenticated can read and insert; only admins can delete

### native_ads_gallery

```sql
create table native_ads_gallery (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  url text not null,
  size text not null,
  prompt text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
```

- RLS: all authenticated can read and insert; only admins can delete

---

## 3. Storage Buckets

### Bucket Structure

```
references/              — uploaded reference ad images
├── {uuid}.{ext}
├── brand/               — brand book PDFs
│   └── {uuid}.pdf

gallery/                 — generated ad images (from Nano Banana)
├── {uuid}.{ext}

products/                — uploaded product photos
├── {scope}/{uuid}.{ext}
```

### Access Policies
- All buckets are **private**
- Authenticated users can **read** from all buckets
- Authenticated users can **upload** to `references/` and `products/`
- Only service role can **write** to `gallery/` (server downloads from Nano Banana)
- Admins can **delete** from any bucket; members can delete from `references/` only

### Image Flow
1. **Reference upload:** Frontend uploads directly to Supabase Storage via JS client
2. **Analysis:** API route reads from Storage, sends base64 to Claude
3. **Generation:** API route uploads reference to freeimage.host (Nano Banana needs public URLs). On completion, downloads result and uploads to `gallery/` bucket via service role
4. **Gallery viewing:** Frontend requests signed URLs (1-hour validity)
5. **Product images:** Seed images served from `public/`. Uploads go to `products/` bucket

---

## 4. API Route Changes

### New Supabase Clients (`src/lib/supabase.ts`)

Two client factories:
- `createClient()` — per-request, uses user's cookie session, respects RLS
- `createServiceClient()` — service role key, for server-only operations

### Route Migration

| Current Route | Change |
|---|---|
| `/api/upload` | Removed — frontend uploads directly to Storage |
| `/api/upload/file/[filename]` | Removed — replaced by signed URLs |
| `/api/analyze` | Reads from Storage, saves to `ad_history` table |
| `/api/generate-image` | Saves completed images to Storage + `gallery_images` table |
| `/api/image-status` | No change (polls Nano Banana) |
| `/api/check-generation` | Reads from Storage URL |
| `/api/generate-copy` | No change (stateless) |
| `/api/translate-copy` | No change (stateless) |
| `/api/history` | CRUD against `ad_history` table |
| `/api/gallery` | CRUD against `gallery_images` table + Storage |
| `/api/gallery/file/[filename]` | Removed — replaced by signed URLs |
| `/api/brand` | CRUD against `brand_config` table |
| `/api/brand/upload-pdf` | Upload to Storage `references/brand/` |
| `/api/products` | CRUD against `product_images` table, merge with seed data |
| `/api/products/file/[filename]` | Seed: serve from `public/`. Uploaded: signed URL |
| `/api/native-ads/gallery` | CRUD against `native_ads_gallery` table + Storage |
| `/api/native-ads/gallery/file/[filename]` | Removed — replaced by signed URLs |
| `/api/native-ads/generate` | Saves to Storage + `native_ads_gallery` table |
| `/api/native-ads/ideas` | No change (stateless Claude call) |
| `/api/callback` | No change |
| Product-variant routes (`/api/birds/*`, etc.) | Same changes, scoped by `product_scope` |

### Files Deleted
- `src/lib/gallery.ts` — replaced by Supabase queries
- `src/lib/adHistory.ts` — replaced by Supabase queries
- All `file/[filename]/route.ts` routes — no longer needed
- `/uploads/` directory — no longer used

### Files Created
- `src/lib/supabase.ts` — client setup
- `src/lib/supabase-storage.ts` — upload/download/signedUrl helpers
- `src/lib/supabase-db.ts` — table CRUD helpers (gallery, history, brand, products)
- `src/middleware.ts` — auth session refresh + route protection
- `src/app/login/page.tsx` — login page
- `src/app/settings/page.tsx` — team management (admin only)

### Files Modified (partially)
- `src/lib/productImages.ts` — seed image logic stays, upload logic uses Supabase

---

## 5. Frontend Changes

### Upload Flow
- `UploadZone` uploads via `supabase.storage.from('references').upload(...)` instead of `/api/upload`

### Image Display
- All `<img src="/api/.../file/...">` replaced with Supabase signed URLs
- Seed product images still use `/product-images/...` from `public/`

### State Management
- `WorkflowContext` and all product variant contexts unchanged structurally
- `useAdWorkflow` reducer unchanged — manages in-session state
- localStorage caching stays for in-progress workflow state
- Data save/load calls hit Supabase instead of local API routes

### New Hooks
- `useSupabase()` — provides authenticated Supabase client
- `useUser()` — provides current user profile + role

### Admin Guards
- Brand page: read-only for members, editable for admins
- Gallery/history delete: admin only
- Settings page: admin only (middleware redirect for members)

---

## 6. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Added to `.env` alongside existing keys (ANTHROPIC_API_KEY, NANO_BANANA_API_KEY, APIFY_TOKEN).

---

## 7. Migration Strategy

1. Create Supabase project
2. Run SQL migrations (tables, RLS policies, triggers)
3. Create storage buckets with access policies
4. Install `@supabase/supabase-js` and `@supabase/ssr`
5. Add auth middleware + login page
6. Migrate API routes one group at a time (brand → products → history → gallery)
7. Update frontend components to use signed URLs
8. Delete unused files and `/uploads/` directory
9. Seed `product_images` table with `is_seed` entries pointing to `public/` paths
10. Set first user as admin, test invite flow
