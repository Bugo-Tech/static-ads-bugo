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

/**
 * Maps a raw Supabase gallery_images row (snake_case) to the camelCase
 * shape expected by all frontend gallery pages.
 */
export function mapGalleryRow(row: Record<string, unknown>, signedUrl?: string) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    filename: row.filename,
    url: signedUrl ?? row.url,
    sourceUrl: row.url,
    prompt: row.prompt ?? "",
    size: row.size ?? "1:1",
    angle: row.angle ?? "",
    referencePreview: row.reference_url,
    folderId: row.folder ?? "root",
    createdAt: row.created_at,
    originalPrompt: meta.originalPrompt as string | undefined,
    referenceImageUrl: meta.referenceImageUrl as string | undefined,
    productImageIds: meta.productImageIds as string[] | undefined,
    copyVariation: meta.copyVariation as unknown,
    sourceImageId: row.source_image_id,
    isQcFix: meta.isQcFix as boolean | undefined,
  };
}

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
