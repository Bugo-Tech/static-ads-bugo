// ============================================================
// Core Types for Static Ads Bugo
// ============================================================

export type WorkflowStep = "upload" | "analyze" | "review" | "generate" | "done";

export type Language = "he" | "en" | "ar" | "de" | "ru" | "fr";

// Languages that get a parallel editable Hebrew companion textarea in CopyEditor.
// "he" and "en" are intentionally excluded — the user reads both natively.
export const HEBREW_COMPANION_LANGUAGES: Language[] = ["ar", "de", "ru", "fr"];
export function needsHebrewCompanion(lang: Language): boolean {
  return HEBREW_COMPANION_LANGUAGES.includes(lang);
}
export const HEBREW_COMPANION_LANGUAGE_LABELS: Partial<Record<Language, string>> = {
  ar: "ערבית",
  de: "גרמנית",
  ru: "רוסית",
  fr: "צרפתית",
};

export type AdSize = "1:1" | "9:16";

export type PromptMode = "auto" | "manual";

// --- Copy Section (dynamic, not fixed structure) ---

export interface CopySection {
  id: string;
  label: string; // e.g., "headline", "sub-headline", "testimonial", "badge", "bullet-1"
  originalText: string; // text from reference ad
  adaptedText: string; // adapted text for Bugo — source of truth for image generation
  hebrewText?: string; // optional parallel Hebrew preview (only populated for HEBREW_COMPANION_LANGUAGES)
}

export interface CopyVariation {
  id: string;
  angle: string; // e.g., "health/chemical-free", "cost savings", "family safety"
  sections: CopySection[];
}

// --- Analysis ---

export interface AnalysisResult {
  layout: string;
  copyFound: string[];
  copySections: { label: string; text: string }[];
  productPlacement: string;
  colorScheme: string[];
  angle: string;
  niche: "pest-control" | "other";
  nicheMapping?: string; // how the original concept maps to Bugo
  referenceHasProduct?: boolean; // whether the reference image contains a physical product photo
  suggestedPrompt: string;
}

// --- Reference Ad ---

export interface ReferenceAd {
  id: string;
  file: File;
  previewUrl: string;
  uploadedUrl?: string;
  status: "idle" | "uploading" | "analyzing" | "analyzed" | "generating" | "done" | "error";
  error?: string;
  analysis?: AnalysisResult;
  prompt?: string;
  promptMode: PromptMode;
  copyVariations?: CopyVariation[];
  selectedVariationId?: string;
  selectedVariationIds?: string[]; // multi-selection for generation
  generations?: GenerationJob[];
  historyId?: string; // server-side history entry id, captured after analyze auto-save
}

// --- Image Generation ---

export interface GenerationJob {
  jobId: string;
  size: AdSize;
  variationId: string;
  status: "queued" | "processing" | "completed" | "failed";
  resultUrl?: string;
  error?: string;
  qcStatus?: "pending" | "passed" | "failed" | "fixing";
  qcIssues?: string[];
}

// --- Product Library ---

export interface ProductImage {
  id: string;
  filename: string;
  url: string;
  label?: string;
  uploadedAt: string;
}

// --- Product ---

export interface BrandProduct {
  id: string;
  name: string;
  description: string;
  specs?: Record<string, string>;
  pestTypes?: string[];
  imageIds?: string[]; // associated product image IDs from ProductLibrary
}

// --- Brand Config ---

export interface BrandConfig {
  productName: string;
  tagline: string;
  website: string;
  socialLinks: { platform: string; url: string }[];
  productSpecs: {
    technology: string;
    coverage: string;
    lifespan: string;
    plug: string;
    noise: string;
    maintenance: string;
    safety: string;
  };
  pricing: {
    single: string;
    bundle2plus1: string;
    bundle3plus2: string;
  };
  painPoints: string[];
  marketingAngles: string[];
  voiceAndTone: string;
  pestTypes: string[];
  visualIdentity: {
    primaryColor: string;
    accentColor: string;
    fonts: string;
  };
  legalDisclaimers: string[];
  brandBookContent: string; // full brand book text (Israel/Hebrew)
  brandBookContentUS: string; // US/English brand book text
  pricingUS: {
    single: string;
    bundle3: string;
    bundle5: string;
    bundle8: string;
  };
  customNotes: string;
  products?: BrandProduct[];
}

// --- Workflow State ---

export interface WorkflowState {
  step: WorkflowStep;
  references: ReferenceAd[];
  selectedProductImageIds: string[];
  selectedProductId?: string; // which brand product context to use (e.g., "indoor" or "garden")
  language: Language;
  enhancedVariationMatching: boolean;
}

export type WorkflowAction =
  | { type: "SET_STEP"; step: WorkflowStep }
  | { type: "ADD_REFERENCES"; files: File[] }
  | { type: "REMOVE_REFERENCE"; id: string }
  | { type: "UPDATE_REFERENCE"; id: string; updates: Partial<ReferenceAd> }
  | { type: "SET_LANGUAGE"; language: Language }
  | { type: "SET_SELECTED_PRODUCTS"; ids: string[] }
  | { type: "UPDATE_COPY_SECTION"; refId: string; variationId: string; sectionId: string; text: string }
  | { type: "UPDATE_COPY_SECTION_HEBREW"; refId: string; variationId: string; sectionId: string; text: string }
  | { type: "REPLACE_COPY_VARIATIONS"; refId: string; variations: CopyVariation[] }
  | { type: "SELECT_VARIATION"; refId: string; variationId: string }
  | { type: "TOGGLE_VARIATION_FOR_GENERATION"; refId: string; variationId: string }
  | { type: "UPDATE_GENERATION"; refId: string; jobId: string; updates: Partial<GenerationJob> }
  | { type: "ADD_GENERATION"; refId: string; job: GenerationJob }
  | { type: "SET_ENHANCED_VARIATION_MATCHING"; enabled: boolean }
  | { type: "SET_SELECTED_PRODUCT_ID"; productId: string | undefined }
  | { type: "RESET" }
  | { type: "HYDRATE"; state: Partial<WorkflowState> };

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "member";
  created_at: string;
  updated_at: string;
}
