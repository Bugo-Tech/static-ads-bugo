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
-- GALLERY FOLDERS
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

-- ============================================
-- STORAGE POLICIES (run in SQL editor)
-- ============================================

-- references bucket
create policy "Auth users can read references"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'references');

create policy "Auth users can upload references"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'references');

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

-- gallery bucket
create policy "Auth users can read gallery"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'gallery');

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

-- products bucket
create policy "Auth users can read products"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'products');

create policy "Auth users can upload products"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'products');

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
