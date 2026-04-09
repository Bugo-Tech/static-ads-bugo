// ============================================================
// Core Types for Static Ads Bugo
// ============================================================

export type WorkflowStep = "upload" | "analyze" | "review" | "generate" | "done";

export type Language = "he" | "en" | "ar" | "de";

export type AdSize = "1:1" | "9:16";

export type PromptMode = "auto" | "manual";

// --- Copy Section (dynamic, not fixed structure) ---

export interface CopySection {
  id: string;
  label: string; // e.g., "headline", "sub-headline", "testimonial", "badge", "bullet-1"
  originalText: string; // text from reference ad
  adaptedText: string; // adapted text for Bugo
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
  generations?: GenerationJob[];
}

// --- Image Generation ---

export interface GenerationJob {
  jobId: string;
  size: AdSize;
  variationId: string;
  status: "queued" | "processing" | "completed" | "failed";
  resultUrl?: string;
  error?: string;
}

// --- Product Library ---

export interface ProductImage {
  id: string;
  filename: string;
  url: string;
  label?: string;
  uploadedAt: string;
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
  brandBookContent: string; // full brand book text
  customNotes: string;
}

// --- Workflow State ---

export interface WorkflowState {
  step: WorkflowStep;
  references: ReferenceAd[];
  selectedProductImageIds: string[];
  language: Language;
}

export type WorkflowAction =
  | { type: "SET_STEP"; step: WorkflowStep }
  | { type: "ADD_REFERENCES"; files: File[] }
  | { type: "REMOVE_REFERENCE"; id: string }
  | { type: "UPDATE_REFERENCE"; id: string; updates: Partial<ReferenceAd> }
  | { type: "SET_LANGUAGE"; language: Language }
  | { type: "SET_SELECTED_PRODUCTS"; ids: string[] }
  | { type: "UPDATE_COPY_SECTION"; refId: string; variationId: string; sectionId: string; text: string }
  | { type: "SELECT_VARIATION"; refId: string; variationId: string }
  | { type: "UPDATE_GENERATION"; refId: string; jobId: string; updates: Partial<GenerationJob> }
  | { type: "RESET" };
