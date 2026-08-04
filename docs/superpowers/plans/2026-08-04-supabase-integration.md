# Supabase Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate static-ads-bugo from local filesystem storage to Supabase (Auth + Postgres + Storage) with team-based access and admin/member roles.

**Architecture:** Supabase Auth handles email/password login with invite-only signup. All metadata moves from JSON files to Postgres tables. All uploaded/generated images move to Supabase Storage buckets. Seed product images remain in `public/product-images/`. A Next.js middleware protects all routes except `/login`.

**Tech Stack:** Next.js 16.2.3, React 19, Supabase JS v2, @supabase/ssr, TypeScript, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-08-04-supabase-integration-design.md`

---

## File Structure

### New Files
- `src/lib/supabase/server.ts` — Server-side Supabase client factories (cookie-based + service role)
- `src/lib/supabase/client.ts` — Browser-side Supabase client factory
- `src/lib/supabase/middleware.ts` — Middleware helper for session refresh
- `src/lib/supabase-db.ts` — Database CRUD helpers (gallery, history, brand, products, native-ads)
- `src/lib/supabase-storage.ts` — Storage helpers (upload, download, signedUrl, delete)
- `src/middleware.ts` — Next.js middleware for auth + route protection
- `src/app/login/page.tsx` — Login page
- `src/app/settings/page.tsx` — Admin team management page
- `src/context/AuthContext.tsx` — Auth context provider (user profile + role)
- `supabase/migrations/001_initial_schema.sql` — All tables, RLS, triggers

### Files to Delete (after migration)
- `src/lib/gallery.ts`
- `src/lib/adHistory.ts`
- `src/lib/native-ads-gallery.ts`
- `src/app/api/upload/route.ts`
- `src/app/api/upload/file/[filename]/route.ts`
- `src/app/api/gallery/file/[filename]/route.ts`
- `src/app/api/native-ads/gallery/file/[filename]/route.ts`
- All product-variant `file/[filename]/route.ts` files
- `uploads/` directory

### Files to Modify
- `package.json` — Add @supabase/supabase-js, @supabase/ssr
- `.env` — Add Supabase env vars
- `src/app/components/ClientLayout.tsx` — Wrap with AuthProvider
- `src/app/layout.tsx` — No change needed (ClientLayout handles providers)
- `src/app/components/UploadZone.tsx` — Upload to Supabase Storage instead of /api/upload
- `src/app/components/ProductLibrary.tsx` — Use Supabase Storage for uploads, signed URLs for display
- `src/app/components/GenerationCard.tsx` — Use signed URLs for image display
- `src/app/api/brand/route.ts` — Supabase DB instead of filesystem
- `src/app/api/brand/upload-pdf/route.ts` — Supabase Storage + DB
- `src/app/api/history/route.ts` — Supabase DB instead of adHistory.ts
- `src/app/api/gallery/route.ts` — Supabase DB + Storage instead of gallery.ts
- `src/app/api/analyze/route.ts` — Read from Storage, save history to DB
- `src/app/api/generate-image/route.ts` — Save to Storage + DB on completion
- `src/app/api/products/route.ts` — Supabase DB + Storage, merge seed data
- `src/app/api/native-ads/gallery/route.ts` — Supabase DB + Storage
- `src/app/api/native-ads/generate/route.ts` — No change (stateless)
- `src/app/page.tsx` — Use AuthContext for role checks, Storage for uploads
- `src/app/gallery/page.tsx` — Signed URLs, role-based delete
- `src/app/history/page.tsx` — Role-based delete
- `src/app/brand/page.tsx` — Role-based editing
- `src/lib/productImages.ts` — Add Supabase fallback for non-seed products
- `src/lib/types.ts` — Add Profile type
- All product-variant API routes (birds, fly, ants, pet-tag) — Same pattern as main routes

---

## Task 1: Create Supabase Project & SQL Migration

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create Supabase project**

Go to https://supabase.com/dashboard → New Project. Name it `static-ads-bugo`. Choose a region close to you. Save the project URL and anon key.

- [ ] **Step 2: Write the SQL migration file**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- ============================================
-- PROFILES
-- ============================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Authenticated users can read all profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Admins can update any profile"
  on public.profiles for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can delete profiles"
  on public.profiles for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- BRAND CONFIG
-- ============================================
create table public.brand_config (
  id uuid primary key default gen_random_uuid(),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.brand_config enable row level security;

create policy "Authenticated users can read brand config"
  on public.brand_config for select
  to authenticated
  using (true);

create policy "Admins can insert brand config"
  on public.brand_config for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can update brand config"
  on public.brand_config for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- AD HISTORY
-- ============================================
create table public.ad_history (
  id uuid primary key default gen_random_uuid(),
  reference_filename text,
  reference_url text,
  language text not null default 'he',
  product_id text,
  analysis jsonb,
  prompt text,
  copy_variations jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.ad_history enable row level security;

create policy "Authenticated users can read history"
  on public.ad_history for select
  to authenticated
  using (true);

create policy "Authenticated users can insert history"
  on public.ad_history for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update history"
  on public.ad_history for update
  to authenticated
  using (true);

create policy "Admins can delete history"
  on public.ad_history for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- GALLERY IMAGES
-- ============================================
create table public.gallery_images (
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
  source_image_id uuid references public.gallery_images(id),
  history_id uuid references public.ad_history(id),
  metadata jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.gallery_images enable row level security;

create policy "Authenticated users can read gallery"
  on public.gallery_images for select
  to authenticated
  using (true);

create policy "Authenticated users can insert gallery"
  on public.gallery_images for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update gallery"
  on public.gallery_images for update
  to authenticated
  using (true);

create policy "Admins can delete gallery images"
  on public.gallery_images for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- PRODUCT IMAGES
-- ============================================
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text,
  url text not null,
  label text,
  scope text not null default 'main',
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.product_images enable row level security;

create policy "Authenticated users can read products"
  on public.product_images for select
  to authenticated
  using (true);

create policy "Authenticated users can insert products"
  on public.product_images for insert
  to authenticated
  with check (true);

create policy "Admins can delete products"
  on public.product_images for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- NATIVE ADS GALLERY
-- ============================================
create table public.native_ads_gallery (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  url text not null,
  size text not null,
  prompt text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.native_ads_gallery enable row level security;

create policy "Authenticated users can read native ads"
  on public.native_ads_gallery for select
  to authenticated
  using (true);

create policy "Authenticated users can insert native ads"
  on public.native_ads_gallery for insert
  to authenticated
  with check (true);

create policy "Admins can delete native ads"
  on public.native_ads_gallery for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- GALLERY FOLDERS (separate table for cleaner queries)
-- ============================================
create table public.gallery_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.gallery_folders enable row level security;

create policy "Authenticated users can read folders"
  on public.gallery_folders for select
  to authenticated
  using (true);

create policy "Authenticated users can insert folders"
  on public.gallery_folders for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update folders"
  on public.gallery_folders for update
  to authenticated
  using (true);

create policy "Admins can delete folders"
  on public.gallery_folders for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
```

- [ ] **Step 3: Run the migration**

Go to Supabase Dashboard → SQL Editor → paste the contents of `001_initial_schema.sql` → Run.

- [ ] **Step 4: Create Storage buckets**

In Supabase Dashboard → Storage → Create bucket:
1. `references` — Private, 50MB file size limit
2. `gallery` — Private, 50MB file size limit
3. `products` — Private, 50MB file size limit

- [ ] **Step 5: Add Storage policies**

In Supabase Dashboard → Storage → Policies, add for each bucket:

**references bucket:**
```sql
-- Read: authenticated users
create policy "Auth users can read references"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'references');

-- Upload: authenticated users
create policy "Auth users can upload references"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'references');

-- Delete: admins only
create policy "Admins can delete references"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'references' and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
```

**gallery bucket:**
```sql
-- Read: authenticated users
create policy "Auth users can read gallery"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'gallery');

-- Upload: service role only (no RLS policy needed, service role bypasses)
-- No insert policy for regular users

-- Delete: admins only
create policy "Admins can delete gallery files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'gallery' and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
```

**products bucket:**
```sql
-- Read: authenticated users
create policy "Auth users can read products"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'products');

-- Upload: authenticated users
create policy "Auth users can upload products"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'products');

-- Delete: admins only
create policy "Admins can delete products"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'products' and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
```

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase SQL migration with tables, RLS, triggers, and storage policies"
```

---

## Task 2: Install Dependencies & Environment Setup

**Files:**
- Modify: `package.json`
- Modify: `.env`

- [ ] **Step 1: Install Supabase packages**

```bash
cd /Users/benmargalit/Documents/GitHub/Bugo/static-ads-bugo
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Add Supabase env vars to `.env`**

Append to the existing `.env` file:

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
```

Get these values from Supabase Dashboard → Settings → API.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env
git commit -m "feat: install @supabase/supabase-js and @supabase/ssr, add env vars"
```

---

## Task 3: Supabase Client Setup

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Create browser client**

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create server client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createJsClient } from "@supabase/supabase-js";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}

export function createServiceClient() {
  return createJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

- [ ] **Step 3: Create middleware helper**

Create `src/lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/api/callback")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/
git commit -m "feat: add Supabase client factories (browser, server, middleware)"
```

---

## Task 4: Auth Middleware & Login Page

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Create Next.js middleware**

Create `src/middleware.ts`:

```typescript
import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|product-images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Add Profile type to types.ts**

Add to the end of `src/lib/types.ts`:

```typescript
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "member";
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Create login page**

Create `src/app/login/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm p-8 bg-gray-900 rounded-2xl border border-gray-800">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Bugo Ad Generator</h1>
          <p className="text-gray-400 mt-1 text-sm">Sign in to continue</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="Your password"
              required
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify login page renders**

```bash
npm run dev
```

Open http://localhost:3000/login — should show the login form. All other routes should redirect to `/login` since no user is authenticated yet.

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/app/login/page.tsx src/lib/types.ts
git commit -m "feat: add auth middleware and login page"
```

---

## Task 5: Auth Context & Header Integration

**Files:**
- Create: `src/context/AuthContext.tsx`
- Modify: `src/app/components/ClientLayout.tsx`
- Modify: `src/app/page.tsx` (header section only)

- [ ] **Step 1: Create AuthContext**

Create `src/context/AuthContext.tsx`:

```typescript
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfile(data);
      }

      setLoading(false);
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", currentUser.id)
          .single();
        setProfile(data);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    window.location.href = "/login";
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin: profile?.role === "admin",
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 2: Wrap ClientLayout with AuthProvider**

Modify `src/app/components/ClientLayout.tsx`:

```typescript
"use client";

import { ReactNode } from "react";
import { WorkflowProvider } from "@/context/WorkflowContext";
import { AuthProvider } from "@/context/AuthContext";
import FloatingProgress from "./FloatingProgress";

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WorkflowProvider>
        {children}
        <FloatingProgress />
      </WorkflowProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 3: Add user info + logout to the page header**

In `src/app/page.tsx`, find the header section (the `<header>` or top navigation bar). Add a user display and logout button. Import `useAuth` from `@/context/AuthContext` and add to the header:

```typescript
import { useAuth } from "@/context/AuthContext";

// Inside the component:
const { profile, isAdmin, signOut } = useAuth();

// In the header JSX, add alongside existing nav links:
<div className="flex items-center gap-3">
  {isAdmin && (
    <button
      onClick={() => router.push("/settings")}
      className="text-sm text-gray-400 hover:text-white"
    >
      Settings
    </button>
  )}
  <span className="text-sm text-gray-500">{profile?.email}</span>
  <button
    onClick={signOut}
    className="text-sm text-gray-400 hover:text-red-400"
  >
    Logout
  </button>
</div>
```

Note: The exact placement depends on the header structure in `page.tsx`. Add these elements next to the existing navigation links (History, Gallery, Brand, etc.).

- [ ] **Step 4: Verify auth flow works**

1. Create a user in Supabase Dashboard → Authentication → Users → Add User (email + password)
2. Set their role to admin: SQL Editor → `update profiles set role = 'admin' where email = 'your@email.com';`
3. Run `npm run dev`, go to http://localhost:3000 → should redirect to `/login`
4. Log in with your credentials → should redirect to `/` with your email in the header

- [ ] **Step 5: Commit**

```bash
git add src/context/AuthContext.tsx src/app/components/ClientLayout.tsx src/app/page.tsx
git commit -m "feat: add AuthContext with user profile, logout, and header integration"
```

---

## Task 6: Supabase Storage Helpers

**Files:**
- Create: `src/lib/supabase-storage.ts`

- [ ] **Step 1: Create storage helper module**

Create `src/lib/supabase-storage.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/server";

type Bucket = "references" | "gallery" | "products";

/**
 * Upload a file buffer to Supabase Storage using service role (server-side).
 * Returns the storage path (not a URL).
 */
export async function uploadFile(
  bucket: Bucket,
  path: string,
  file: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

/**
 * Download a file from Supabase Storage. Returns the file as a Buffer.
 */
export async function downloadFile(
  bucket: Bucket,
  path: string
): Promise<Buffer> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error) throw new Error(`Storage download failed: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Get a signed URL for a storage file (1 hour validity).
 */
export async function getSignedUrl(
  bucket: Bucket,
  path: string,
  expiresIn = 3600
): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  return data.signedUrl;
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFile(
  bucket: Bucket,
  path: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}

/**
 * Download an image from an external URL and upload it to Supabase Storage.
 * Used when Nano Banana returns a generated image URL.
 * Returns the storage path.
 */
export async function downloadAndStore(
  sourceUrl: string,
  bucket: Bucket,
  storagePath: string
): Promise<string> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download from ${sourceUrl}: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());

  return uploadFile(bucket, storagePath, buffer, contentType);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase-storage.ts
git commit -m "feat: add Supabase Storage helper functions"
```

---

## Task 7: Supabase DB Helpers

**Files:**
- Create: `src/lib/supabase-db.ts`

- [ ] **Step 1: Create database helper module**

Create `src/lib/supabase-db.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/server";
import type { BrandConfig } from "@/lib/types";
import { defaultBrandConfig } from "@/lib/brand-defaults";

// ============================================
// BRAND CONFIG
// ============================================

export async function getBrandConfig(): Promise<BrandConfig> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("brand_config")
    .select("config")
    .limit(1)
    .single();

  if (!data) return defaultBrandConfig;
  return { ...defaultBrandConfig, ...data.config };
}

export async function updateBrandConfig(
  config: Partial<BrandConfig>,
  userId: string
): Promise<BrandConfig> {
  const supabase = createServiceClient();
  const current = await getBrandConfig();
  const merged = { ...current, ...config };

  // Upsert: try update first, insert if no row exists
  const { data: existing } = await supabase
    .from("brand_config")
    .select("id")
    .limit(1)
    .single();

  if (existing) {
    await supabase
      .from("brand_config")
      .update({ config: merged, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("brand_config")
      .insert({ config: merged, updated_by: userId });
  }

  return merged;
}

// ============================================
// AD HISTORY
// ============================================

export async function getHistory() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ad_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Failed to get history: ${error.message}`);
  return data ?? [];
}

export async function addToHistory(entry: {
  reference_filename?: string;
  reference_url?: string;
  language: string;
  product_id?: string;
  analysis: unknown;
  prompt: string;
  copy_variations: unknown;
  created_by?: string;
}) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ad_history")
    .insert(entry)
    .select()
    .single();

  if (error) throw new Error(`Failed to add history: ${error.message}`);
  return data;
}

export async function updateHistoryEntry(
  id: string,
  updates: Record<string, unknown>
) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("ad_history")
    .update(updates)
    .eq("id", id);

  if (error) throw new Error(`Failed to update history: ${error.message}`);
}

export async function deleteHistoryEntry(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("ad_history").delete().eq("id", id);

  if (error) throw new Error(`Failed to delete history: ${error.message}`);
}

// ============================================
// GALLERY IMAGES
// ============================================

export async function getGalleryImages(productScope?: string) {
  const supabase = createServiceClient();
  let query = supabase
    .from("gallery_images")
    .select("*")
    .order("created_at", { ascending: false });

  if (productScope) {
    query = query.eq("product_scope", productScope);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to get gallery: ${error.message}`);
  return data ?? [];
}

export async function addGalleryImage(image: {
  filename: string;
  storage_path: string;
  url: string;
  size: string;
  angle?: string;
  prompt?: string;
  reference_url?: string;
  product_scope?: string;
  folder?: string;
  source_image_id?: string;
  history_id?: string;
  metadata?: unknown;
  created_by?: string;
}) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("gallery_images")
    .insert(image)
    .select()
    .single();

  if (error) throw new Error(`Failed to add gallery image: ${error.message}`);
  return data;
}

export async function updateGalleryImage(
  id: string,
  updates: Record<string, unknown>
) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("gallery_images")
    .update(updates)
    .eq("id", id);

  if (error) throw new Error(`Failed to update gallery image: ${error.message}`);
}

export async function deleteGalleryImage(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("gallery_images")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete gallery image: ${error.message}`);
}

// ============================================
// GALLERY FOLDERS
// ============================================

export async function getGalleryFolders() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("gallery_folders")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to get folders: ${error.message}`);
  return data ?? [];
}

export async function createGalleryFolder(name: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("gallery_folders")
    .insert({ name })
    .select()
    .single();

  if (error) throw new Error(`Failed to create folder: ${error.message}`);
  return data;
}

export async function renameGalleryFolder(id: string, name: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("gallery_folders")
    .update({ name })
    .eq("id", id);

  if (error) throw new Error(`Failed to rename folder: ${error.message}`);
}

export async function deleteGalleryFolder(id: string) {
  const supabase = createServiceClient();

  // Move folder's images back to root
  await supabase
    .from("gallery_images")
    .update({ folder: "root" })
    .eq("folder", id);

  const { error } = await supabase
    .from("gallery_folders")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete folder: ${error.message}`);
}

// ============================================
// PRODUCT IMAGES
// ============================================

export async function getProductImages(scope: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("product_images")
    .select("*")
    .eq("scope", scope)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to get products: ${error.message}`);
  return data ?? [];
}

export async function addProductImage(product: {
  filename: string;
  storage_path?: string;
  url: string;
  label?: string;
  scope: string;
  is_seed?: boolean;
  created_by?: string;
}) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("product_images")
    .insert(product)
    .select()
    .single();

  if (error) throw new Error(`Failed to add product: ${error.message}`);
  return data;
}

export async function deleteProductImage(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("product_images")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete product: ${error.message}`);
}

// ============================================
// NATIVE ADS GALLERY
// ============================================

export async function getNativeAdsGallery() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("native_ads_gallery")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to get native ads: ${error.message}`);
  return data ?? [];
}

export async function addNativeAdsImage(image: {
  filename: string;
  storage_path: string;
  url: string;
  size: string;
  prompt?: string;
  metadata?: unknown;
  created_by?: string;
}) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("native_ads_gallery")
    .insert(image)
    .select()
    .single();

  if (error) throw new Error(`Failed to add native ad: ${error.message}`);
  return data;
}

export async function deleteNativeAdsImage(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("native_ads_gallery")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete native ad: ${error.message}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase-db.ts
git commit -m "feat: add Supabase DB helper functions for all tables"
```

---

## Task 8: Migrate Brand Config API Routes

**Files:**
- Modify: `src/app/api/brand/route.ts`
- Modify: `src/app/api/brand/upload-pdf/route.ts`

- [ ] **Step 1: Rewrite brand route**

Replace the contents of `src/app/api/brand/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getBrandConfig, updateBrandConfig } from "@/lib/supabase-db";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const config = await getBrandConfig();
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const config = await updateBrandConfig(body, user.id);
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Rewrite brand upload-pdf route**

Replace the contents of `src/app/api/brand/upload-pdf/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { getBrandConfig, updateBrandConfig } from "@/lib/supabase-db";
import { uploadFile } from "@/lib/supabase-storage";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const market = (formData.get("market") as string) || "il";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
    const { text } = await extractText(pdf, { mergePages: true });

    // Upload PDF to Supabase Storage
    const storagePath = `brand/brand-book-${market === "us" ? "us" : "il"}.pdf`;
    await uploadFile("references", storagePath, buffer, "application/pdf");

    // Update brand config with extracted text
    const configKey = market === "us" ? "brandBookContentUS" : "brandBookContent";
    await updateBrandConfig({ [configKey]: text } as Record<string, string>, user.id);

    return NextResponse.json({
      success: true,
      pages: pdf.numPages,
      chars: text.length,
      preview: text.slice(0, 500),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Verify brand routes work**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors in brand routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/brand/
git commit -m "feat: migrate brand config API routes to Supabase DB + Storage"
```

---

## Task 9: Migrate History API Route

**Files:**
- Modify: `src/app/api/history/route.ts`

- [ ] **Step 1: Rewrite history route**

Replace the contents of `src/app/api/history/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  getHistory,
  addToHistory,
  updateHistoryEntry,
  deleteHistoryEntry,
} from "@/lib/supabase-db";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const entries = await getHistory();
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await req.json();
    const { action } = body;

    if (action === "add") {
      const entry = await addToHistory({
        reference_filename: body.referencePreviewUrl,
        reference_url: body.uploadedUrl,
        language: body.language || "he",
        product_id: body.productId,
        analysis: body.analysis,
        prompt: body.prompt,
        copy_variations: body.copyVariations,
        created_by: user?.id,
      });
      return NextResponse.json({ entry });
    }

    if (action === "update") {
      // Map frontend field names to DB column names
      const dbUpdates: Record<string, unknown> = {};
      if (body.updates.copyVariations !== undefined) {
        dbUpdates.copy_variations = body.updates.copyVariations;
      }
      if (body.updates.prompt !== undefined) {
        dbUpdates.prompt = body.updates.prompt;
      }
      if (body.updates.analysis !== undefined) {
        dbUpdates.analysis = body.updates.analysis;
      }

      await updateHistoryEntry(body.id, dbUpdates);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await deleteHistoryEntry(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/history/route.ts
git commit -m "feat: migrate history API route to Supabase DB"
```

---

## Task 10: Migrate Gallery API Route

**Files:**
- Modify: `src/app/api/gallery/route.ts`

- [ ] **Step 1: Rewrite gallery route**

Replace the contents of `src/app/api/gallery/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  getGalleryImages,
  addGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
  getGalleryFolders,
  createGalleryFolder,
  renameGalleryFolder,
  deleteGalleryFolder,
} from "@/lib/supabase-db";
import { downloadAndStore, getSignedUrl, deleteFile } from "@/lib/supabase-storage";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export async function GET() {
  try {
    const [images, folders] = await Promise.all([
      getGalleryImages(),
      getGalleryFolders(),
    ]);

    // Generate signed URLs for each image
    const imagesWithUrls = await Promise.all(
      images.map(async (img) => {
        try {
          const signedUrl = await getSignedUrl("gallery", img.storage_path);
          return { ...img, url: signedUrl };
        } catch {
          return img;
        }
      })
    );

    return NextResponse.json({ images: imagesWithUrls, folders });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await req.json();
    const { action } = body;

    if (action === "add-image") {
      const id = crypto.randomUUID();
      const ext = "png";
      const filename = `${id}.${ext}`;
      const storagePath = filename;

      // Download from Nano Banana and upload to Supabase Storage
      await downloadAndStore(body.sourceUrl, "gallery", storagePath);
      const signedUrl = await getSignedUrl("gallery", storagePath);

      const image = await addGalleryImage({
        filename,
        storage_path: storagePath,
        url: signedUrl,
        size: body.size || "1:1",
        angle: body.angle,
        prompt: body.prompt,
        reference_url: body.referencePreview,
        product_scope: body.productScope,
        folder: body.folderId || "root",
        source_image_id: body.sourceImageId,
        history_id: body.historyId,
        metadata: {
          originalPrompt: body.originalPrompt,
          referenceImageUrl: body.referenceImageUrl,
          productImageIds: body.productImageIds,
          copyVariation: body.copyVariation,
          isQcFix: body.isQcFix,
        },
        created_by: user?.id,
      });

      return NextResponse.json({ image });
    }

    if (action === "create-folder") {
      const folder = await createGalleryFolder(body.name);
      return NextResponse.json({ folder });
    }

    if (action === "move-image") {
      await updateGalleryImage(body.imageId, { folder: body.folderId });
      return NextResponse.json({ success: true });
    }

    if (action === "rename-folder") {
      await renameGalleryFolder(body.folderId, body.name);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const imageId = req.nextUrl.searchParams.get("imageId");
    const folderId = req.nextUrl.searchParams.get("folderId");

    if (imageId) {
      // Get image to find storage path before deleting
      const supabase = await createClient();
      const { data: image } = await supabase
        .from("gallery_images")
        .select("storage_path")
        .eq("id", imageId)
        .single();

      if (image?.storage_path) {
        try {
          await deleteFile("gallery", image.storage_path);
        } catch {
          // File may already be deleted — continue with DB cleanup
        }
      }

      await deleteGalleryImage(imageId);
      return NextResponse.json({ success: true });
    }

    if (folderId) {
      await deleteGalleryFolder(folderId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Missing imageId or folderId" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/gallery/route.ts
git commit -m "feat: migrate gallery API route to Supabase DB + Storage"
```

---

## Task 11: Migrate Products API Route

**Files:**
- Modify: `src/app/api/products/route.ts`

- [ ] **Step 1: Rewrite products route**

Replace the contents of `src/app/api/products/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getProductImages, addProductImage, deleteProductImage } from "@/lib/supabase-db";
import { uploadFile, deleteFile, getSignedUrl } from "@/lib/supabase-storage";
import { createClient } from "@/lib/supabase/server";
import { readProductIndex, type ProductScope } from "@/lib/productImages";
import crypto from "crypto";

const SCOPE: ProductScope = "main";

export async function GET() {
  try {
    // Merge seed products (from public/) with DB products
    const [seedProducts, dbProducts] = await Promise.all([
      readProductIndex(SCOPE),
      getProductImages(SCOPE),
    ]);

    // DB products with signed URLs
    const dbWithUrls = await Promise.all(
      dbProducts
        .filter((p) => !p.is_seed)
        .map(async (p) => {
          if (p.storage_path) {
            try {
              const signedUrl = await getSignedUrl("products", p.storage_path);
              return { ...p, url: signedUrl };
            } catch {
              return p;
            }
          }
          return p;
        })
    );

    // Seed products keep their /product-images/ URLs
    const allProducts = [...seedProducts, ...dbWithUrls];

    return NextResponse.json({ products: allProducts });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const ext = file.name.split(".").pop() || "png";
    const filename = `${id}.${ext}`;
    const storagePath = `${SCOPE}/${filename}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadFile("products", storagePath, buffer, file.type);

    const signedUrl = await getSignedUrl("products", storagePath);

    const product = await addProductImage({
      filename,
      storage_path: storagePath,
      url: signedUrl,
      label: file.name.replace(/\.[^/.]+$/, ""),
      scope: SCOPE,
      is_seed: false,
      created_by: user?.id,
    });

    return NextResponse.json({ product });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Get product to check if it has a storage path
    const supabase = await createClient();
    const { data: product } = await supabase
      .from("product_images")
      .select("storage_path, is_seed")
      .eq("id", id)
      .single();

    if (product?.storage_path && !product.is_seed) {
      try {
        await deleteFile("products", product.storage_path);
      } catch {
        // Continue with DB cleanup
      }
    }

    await deleteProductImage(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/products/route.ts
git commit -m "feat: migrate products API route to Supabase DB + Storage"
```

---

## Task 12: Migrate Analyze API Route

**Files:**
- Modify: `src/app/api/analyze/route.ts`

- [ ] **Step 1: Update analyze route to read from Storage**

The analyze route currently reads reference images from the local filesystem. Update it to also handle Supabase Storage paths. The key change: when `imageUrl` starts with a Supabase Storage signed URL or when the file is in Storage, download it from there.

Read the current `src/app/api/analyze/route.ts` and make these changes:

1. Add import at the top:
```typescript
import { downloadFile } from "@/lib/supabase-storage";
import { createClient } from "@/lib/supabase/server";
```

2. In the section where local file URLs are resolved (the block that handles `/api/upload/file/` URLs), add a new branch for Supabase Storage paths. When the request body includes `storagePath` and `storageBucket`, read from Storage:

```typescript
// After the existing multipart/JSON parsing, add:
if (body.storagePath && body.storageBucket) {
  const fileBuffer = await downloadFile(body.storageBucket, body.storagePath);
  imageBase64 = fileBuffer.toString("base64");
  // Detect MIME from magic bytes (use existing detectMimeType logic)
}
```

3. The history save at the end of the route should use `addToHistory` from `@/lib/supabase-db` instead of the old filesystem approach. However, note that the current analyze route does NOT save history — that's done by the frontend. So no history change needed here.

The primary change is supporting Storage-based image reads alongside the existing HTTP URL and local file paths.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/analyze/route.ts
git commit -m "feat: update analyze route to support Supabase Storage image reads"
```

---

## Task 13: Migrate Upload Flow (UploadZone Component)

**Files:**
- Modify: `src/app/components/UploadZone.tsx`
- Modify: `src/app/page.tsx` (upload handling section)

- [ ] **Step 1: Update UploadZone to return File objects (no change needed)**

The UploadZone component already just calls `onFilesAdded(files)` with raw File objects. The actual upload happens in `page.tsx` when the user clicks "Analyze". So UploadZone itself doesn't need changes.

- [ ] **Step 2: Update page.tsx upload logic**

In `src/app/page.tsx`, find the function that handles the "Analyze" button click (the function that uploads files to `/api/upload` and then calls `/api/analyze`). Update it to upload to Supabase Storage instead:

Add import:
```typescript
import { createClient } from "@/lib/supabase/client";
```

Replace the upload call from:
```typescript
// Old: POST to /api/upload
const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
const { url, filename } = await uploadRes.json();
```

To:
```typescript
// New: Upload directly to Supabase Storage
const supabase = createClient();
const ext = file.name.split(".").pop() || "png";
const storagePath = `${crypto.randomUUID()}.${ext}`;
const { error: uploadError } = await supabase.storage
  .from("references")
  .upload(storagePath, file);

if (uploadError) throw new Error(uploadError.message);

const { data: urlData } = await supabase.storage
  .from("references")
  .createSignedUrl(storagePath, 3600);

const url = urlData?.signedUrl || "";
```

Then when calling `/api/analyze`, pass `storagePath` and `storageBucket` in the request body so the server can read the file from Storage:

```typescript
// When calling analyze with JSON body:
const analyzeRes = await fetch("/api/analyze", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    storagePath,
    storageBucket: "references",
    language,
    productId,
  }),
});
```

Note: The exact location of this code in `page.tsx` depends on how the upload/analyze flow is structured. Look for the function that iterates over references and uploads each one — typically in the `handleAnalyze` or similar function.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: migrate upload flow to Supabase Storage (references bucket)"
```

---

## Task 14: Migrate Native Ads Gallery API Route

**Files:**
- Modify: `src/app/api/native-ads/gallery/route.ts`

- [ ] **Step 1: Rewrite native ads gallery route**

Replace the contents of `src/app/api/native-ads/gallery/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  getNativeAdsGallery,
  addNativeAdsImage,
  deleteNativeAdsImage,
} from "@/lib/supabase-db";
import { downloadAndStore, getSignedUrl, deleteFile } from "@/lib/supabase-storage";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export async function GET() {
  try {
    const images = await getNativeAdsGallery();

    const imagesWithUrls = await Promise.all(
      images.map(async (img) => {
        try {
          const signedUrl = await getSignedUrl("gallery", img.storage_path);
          return { ...img, url: signedUrl };
        } catch {
          return img;
        }
      })
    );

    return NextResponse.json({ images: imagesWithUrls });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await req.json();
    const { action } = body;

    if (action === "add-image") {
      const id = crypto.randomUUID();
      const filename = `native-${id}.png`;
      const storagePath = `native/${filename}`;

      await downloadAndStore(body.sourceUrl, "gallery", storagePath);
      const signedUrl = await getSignedUrl("gallery", storagePath);

      const image = await addNativeAdsImage({
        filename,
        storage_path: storagePath,
        url: signedUrl,
        size: body.size || "1:1",
        prompt: body.prompt,
        metadata: {
          description: body.description,
          pestId: body.pestId,
          vibe: body.vibe,
          batchId: body.batchId,
        },
        created_by: user?.id,
      });

      return NextResponse.json({ image });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const imageId = req.nextUrl.searchParams.get("imageId");
    if (!imageId) {
      return NextResponse.json({ error: "Missing imageId" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: image } = await supabase
      .from("native_ads_gallery")
      .select("storage_path")
      .eq("id", imageId)
      .single();

    if (image?.storage_path) {
      try {
        await deleteFile("gallery", image.storage_path);
      } catch {
        // Continue with DB cleanup
      }
    }

    await deleteNativeAdsImage(imageId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/native-ads/gallery/route.ts
git commit -m "feat: migrate native ads gallery route to Supabase DB + Storage"
```

---

## Task 15: Migrate Product Variant Routes

**Files:**
- Modify: `src/app/api/ants/products/route.ts`
- Modify: `src/app/api/birds/products/route.ts`
- Modify: `src/app/api/fly/products/route.ts`
- Modify: `src/app/api/pet-tag/products/route.ts`
- Modify: `src/app/api/ants/gallery/route.ts`
- Modify: `src/app/api/birds/gallery/route.ts`
- Modify: `src/app/api/fly/gallery/route.ts`
- Modify: `src/app/api/pet-tag/gallery/route.ts`
- Modify: `src/app/api/ants/analyze/route.ts`
- Modify: `src/app/api/birds/analyze/route.ts`
- Modify: `src/app/api/fly/analyze/route.ts`
- Modify: `src/app/api/pet-tag/analyze/route.ts`

- [ ] **Step 1: Update each product-variant products route**

Each variant products route (`ants`, `birds`, `fly`, `pet-tag`) follows the exact same pattern as the main `/api/products/route.ts` from Task 11, but with a different `SCOPE` value. For each file:

1. Open the file
2. Replace with the same code as Task 11's `/api/products/route.ts`
3. Change the `SCOPE` constant:
   - `src/app/api/ants/products/route.ts` → `const SCOPE: ProductScope = "ants";`
   - `src/app/api/birds/products/route.ts` → `const SCOPE: ProductScope = "birds";`
   - `src/app/api/fly/products/route.ts` → `const SCOPE: ProductScope = "fly";`
   - `src/app/api/pet-tag/products/route.ts` → `const SCOPE: ProductScope = "pet-tag";`

- [ ] **Step 2: Update each product-variant gallery route**

Each variant gallery route follows the same pattern as the main `/api/gallery/route.ts` from Task 10, but passes its `productScope` when querying. For each file, apply the same Supabase migration pattern:

- Replace filesystem-based gallery reads with `getGalleryImages(SCOPE)`
- Replace filesystem-based gallery writes with `addGalleryImage({ ..., product_scope: SCOPE })`
- Replace filesystem image downloads with `downloadAndStore()` to `"gallery"` bucket

- [ ] **Step 3: Update each product-variant analyze route**

Each variant analyze route follows the same pattern as the main `/api/analyze/route.ts` from Task 12. Add the same Storage read support (`storagePath` + `storageBucket` in request body).

- [ ] **Step 4: Verify all variant routes build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ants/ src/app/api/birds/ src/app/api/fly/ src/app/api/pet-tag/
git commit -m "feat: migrate all product-variant API routes to Supabase"
```

---

## Task 16: Update Frontend Pages for Signed URLs

**Files:**
- Modify: `src/app/gallery/page.tsx`
- Modify: `src/app/history/page.tsx`
- Modify: `src/app/brand/page.tsx`
- Modify: `src/app/components/GenerationCard.tsx`
- Modify: `src/app/components/ProductLibrary.tsx`

- [ ] **Step 1: Update gallery page**

In `src/app/gallery/page.tsx`:
- Images now come with signed URLs from the API (the GET route already returns `url` as a signed URL)
- Remove any references to `/api/gallery/file/` URLs
- Add `useAuth()` import and conditionally show delete buttons only for admins:

```typescript
import { useAuth } from "@/context/AuthContext";

// Inside the component:
const { isAdmin } = useAuth();

// Wrap delete buttons:
{isAdmin && (
  <button onClick={() => handleDelete(image.id)}>Delete</button>
)}
```

- [ ] **Step 2: Update history page**

In `src/app/history/page.tsx`:
- Add `useAuth()` and conditionally show delete buttons for admins only
- Reference preview URLs now come from Storage (already handled by the API returning signed URLs)

```typescript
import { useAuth } from "@/context/AuthContext";
const { isAdmin } = useAuth();

// Wrap delete buttons:
{isAdmin && (
  <button onClick={() => handleDelete(entry.id)}>Delete</button>
)}
```

- [ ] **Step 3: Update brand page**

In `src/app/brand/page.tsx`:
- Add `useAuth()` and make the form read-only for members:

```typescript
import { useAuth } from "@/context/AuthContext";
const { isAdmin } = useAuth();

// Disable form inputs for non-admins:
<input ... disabled={!isAdmin} />
<button ... disabled={!isAdmin}>Save</button>

// Hide PDF upload for non-admins:
{isAdmin && <PdfUploadSection />}
```

- [ ] **Step 4: Update GenerationCard**

In `src/app/components/GenerationCard.tsx`:
- Generated image URLs are now signed URLs from Supabase Storage
- The `resultUrl` from Nano Banana polling is still an external URL (from kie.ai)
- When the image is saved to gallery (which happens automatically), the gallery returns a signed URL
- No structural changes needed — the component already uses `resultUrl` for display

- [ ] **Step 5: Update ProductLibrary**

In `src/app/components/ProductLibrary.tsx`:
- Product URLs are now either `/product-images/...` (seed) or signed URLs (uploaded)
- The API already returns the correct URLs — no frontend URL construction changes needed
- Upload now goes through the API which handles Storage upload
- No structural changes needed

- [ ] **Step 6: Commit**

```bash
git add src/app/gallery/page.tsx src/app/history/page.tsx src/app/brand/page.tsx src/app/components/GenerationCard.tsx src/app/components/ProductLibrary.tsx
git commit -m "feat: update frontend pages for signed URLs and admin-only actions"
```

---

## Task 17: Settings Page (Admin Team Management)

**Files:**
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: Create settings page**

Create `src/app/settings/page.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export default function SettingsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [members, setMembers] = useState<Profile[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push("/");
    }
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    setMembers(data || []);
    setLoading(false);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess("");

    try {
      const res = await fetch("/api/settings/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      });

      if (!res.ok) {
        const data = await res.json();
        setInviteError(data.error || "Failed to invite");
        return;
      }

      setInviteSuccess(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
    } catch {
      setInviteError("Failed to send invite");
    }
  }

  async function handleRoleChange(userId: string, newRole: "admin" | "member") {
    await supabase
      .from("profiles")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("id", userId);
    loadMembers();
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Team Settings</h1>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-400 hover:text-white"
          >
            Back
          </button>
        </div>

        {/* Invite */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Invite Team Member
          </h2>
          <form onSubmit={handleInvite} className="flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              required
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              Invite
            </button>
          </form>
          {inviteError && (
            <p className="text-red-400 text-sm mt-2">{inviteError}</p>
          )}
          {inviteSuccess && (
            <p className="text-green-400 text-sm mt-2">{inviteSuccess}</p>
          )}
        </div>

        {/* Team Members */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Team Members
          </h2>
          <div className="space-y-3">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0"
              >
                <div>
                  <p className="text-white">
                    {member.full_name || member.email}
                  </p>
                  <p className="text-sm text-gray-500">{member.email}</p>
                </div>
                <select
                  value={member.role}
                  onChange={(e) =>
                    handleRoleChange(
                      member.id,
                      e.target.value as "admin" | "member"
                    )
                  }
                  className="px-3 py-1 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create invite API route**

Create `src/app/api/settings/invite/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Use service client for admin operations
    const serviceClient = createServiceClient();
    const { error } = await serviceClient.auth.admin.inviteUserByEmail(email);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/page.tsx src/app/api/settings/invite/route.ts
git commit -m "feat: add admin settings page with team management and invite flow"
```

---

## Task 18: Delete Unused Files & Cleanup

**Files:**
- Delete: `src/lib/gallery.ts`
- Delete: `src/lib/adHistory.ts`
- Delete: `src/app/api/upload/route.ts`
- Delete: `src/app/api/upload/file/[filename]/route.ts`
- Delete: `src/app/api/gallery/file/[filename]/route.ts`
- Delete: `src/app/api/native-ads/gallery/file/[filename]/route.ts`
- Delete: All product-variant `file/[filename]/route.ts` files
- Delete: `src/app/api/products/file/[filename]/route.ts`

- [ ] **Step 1: Delete old filesystem library files**

```bash
cd /Users/benmargalit/Documents/GitHub/Bugo/static-ads-bugo
rm src/lib/gallery.ts
rm src/lib/adHistory.ts
rm src/lib/native-ads-gallery.ts
```

Note: Only delete these if no other files import from them. Check first:

```bash
grep -r "from.*['\"]@/lib/gallery['\"]" src/ --include="*.ts" --include="*.tsx"
grep -r "from.*['\"]@/lib/adHistory['\"]" src/ --include="*.ts" --include="*.tsx"
grep -r "from.*['\"]@/lib/native-ads-gallery['\"]" src/ --include="*.ts" --include="*.tsx"
```

If any files still import from them (e.g., the old API routes that haven't been migrated yet), update those imports first.

- [ ] **Step 2: Delete file-serving API routes**

```bash
rm -rf src/app/api/upload/
rm -rf src/app/api/gallery/file/
rm -rf src/app/api/native-ads/gallery/file/
rm -rf src/app/api/products/file/
rm -rf src/app/api/ants/products/file/
rm -rf src/app/api/birds/products/file/
rm -rf src/app/api/fly/products/file/
rm -rf src/app/api/pet-tag/products/file/
rm -rf src/app/api/ants/gallery/file/
rm -rf src/app/api/birds/gallery/file/
rm -rf src/app/api/fly/gallery/file/
rm -rf src/app/api/pet-tag/gallery/file/
```

- [ ] **Step 3: Remove any remaining imports to deleted files**

Search for broken imports:

```bash
grep -r "api/upload/file" src/ --include="*.ts" --include="*.tsx"
grep -r "api/gallery/file" src/ --include="*.ts" --include="*.tsx"
grep -r "api/products/file" src/ --include="*.ts" --include="*.tsx"
```

Update any remaining references to use signed URLs or the new Storage patterns.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds with no errors. All routes should compile.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete unused filesystem files and file-serving API routes"
```

---

## Task 19: Seed Product Images in Database

**Files:**
- Create: `scripts/seed-products.ts` (one-time script)

- [ ] **Step 1: Create seed script**

Create `scripts/seed-products.ts`:

```typescript
/**
 * One-time script to seed the product_images table with entries
 * for the default product images in public/product-images/.
 *
 * Run with: npx tsx scripts/seed-products.ts
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

interface SeedProduct {
  id: string;
  filename: string;
  url: string;
  label?: string;
  uploadedAt: string;
}

const SCOPES = [
  { scope: "main", dir: "products" },
  { scope: "ants", dir: "ants-products" },
  { scope: "birds", dir: "birds-products" },
  { scope: "fly", dir: "fly-products" },
  { scope: "pet-tag", dir: "pet-tag-products" },
] as const;

async function main() {
  for (const { scope, dir } of SCOPES) {
    const indexPath = path.join(
      process.cwd(),
      "public",
      "product-images",
      dir,
      "index.json"
    );

    if (!fs.existsSync(indexPath)) {
      console.log(`No index.json for ${scope}, skipping`);
      continue;
    }

    const products: SeedProduct[] = JSON.parse(
      fs.readFileSync(indexPath, "utf-8")
    );

    console.log(`Seeding ${products.length} products for scope: ${scope}`);

    for (const product of products) {
      const { error } = await supabase.from("product_images").upsert(
        {
          id: product.id,
          filename: product.filename,
          url: `/product-images/${dir}/${product.filename}`,
          label: product.label || product.filename,
          scope,
          is_seed: true,
          created_at: product.uploadedAt,
        },
        { onConflict: "id" }
      );

      if (error) {
        console.error(`Error seeding ${product.id}:`, error.message);
      } else {
        console.log(`  Seeded: ${product.filename}`);
      }
    }
  }

  console.log("Done!");
}

main().catch(console.error);
```

- [ ] **Step 2: Install tsx for running the script**

```bash
npm install -D tsx
```

- [ ] **Step 3: Run the seed script**

```bash
npx tsx scripts/seed-products.ts
```

Expected: Each seed product is inserted into the `product_images` table with `is_seed = true`.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-products.ts package.json package-lock.json
git commit -m "feat: add seed script for default product images"
```

---

## Task 20: Final Integration Test & Cleanup

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test auth flow**

1. Open http://localhost:3000 → should redirect to `/login`
2. Log in with your admin credentials → should redirect to `/`
3. Verify header shows email + logout + Settings link
4. Click Settings → should show team management page

- [ ] **Step 3: Test brand config**

1. Go to `/brand`
2. Edit a field and save → should persist (refresh and verify)
3. Upload a brand PDF → should succeed

- [ ] **Step 4: Test product library**

1. On the main page, verify seed product images load from `public/`
2. Upload a new product image → should upload to Supabase Storage
3. Verify it appears in the product grid

- [ ] **Step 5: Test full workflow**

1. Upload a reference image → should go to Supabase Storage `references/` bucket
2. Click Analyze → should read from Storage, analyze with Claude
3. Review copy variations
4. Generate ads → should submit to Nano Banana, save results to Storage `gallery/` bucket
5. Check Gallery → generated images should appear with signed URLs

- [ ] **Step 6: Test gallery management**

1. Create a folder
2. Move an image to the folder
3. Delete an image (admin only)
4. Delete a folder

- [ ] **Step 7: Test history**

1. Go to `/history`
2. Verify recent analyses appear
3. Edit a copy variation → should auto-save
4. Delete an entry (admin only)

- [ ] **Step 8: Remove uploads directory**

Once everything is verified working:

```bash
rm -rf uploads/
echo "uploads/" >> .gitignore
```

- [ ] **Step 9: Final build check**

```bash
npm run build
```

Expected: Clean build with no errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: remove uploads directory, add to gitignore, final cleanup"
```
