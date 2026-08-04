/**
 * POST /api/native-ads/generate
 *
 * Body:
 *   {
 *     description: string,          // user-typed description (Mode 1) or approved idea (Mode 2)
 *     variationCount: 1 | 3 | 5,    // how many distinct variations to generate
 *     pestId?: NativePestId,        // Mode 2 only — for gallery metadata
 *     vibe?: NativeVibeId,          // Mode 2 only — for gallery metadata
 *   }
 *
 * Flow:
 *   1. Call Claude to build {variationCount} distinct nano-banana prompts.
 *   2. For each prompt × each size (1:1, 9:16) → submit to kie.ai.
 *   3. Return all jobs to the frontend so it can poll /api/image-status
 *      and auto-save to /api/native-ads/gallery on completion.
 *
 * Pure text-to-image: NO referenceImageUrl, NO productImageUrl, NO uploadToPublicHost.
 */

import { NextRequest, NextResponse } from "next/server";
import { submitGeneration } from "@/lib/nanoBanana";
import { buildNativePromptVariations } from "@/lib/native-ads-claude";
import {
  DEFAULT_VARIATION_COUNT,
  SIZES,
  VARIATION_COUNTS,
  type NativePestId,
  type NativeVibeId,
} from "@/lib/native-ads-defaults";

interface NativeGenerationJob {
  jobId: string;
  size: string;
  prompt: string;
  variationIndex: number; // 0..variationCount-1
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      description,
      variationCount = DEFAULT_VARIATION_COUNT,
      pestId,
      vibe,
    } = body as {
      description?: string;
      variationCount?: number;
      pestId?: NativePestId;
      vibe?: NativeVibeId;
    };

    if (!description || typeof description !== "string" || !description.trim()) {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }
    if (!VARIATION_COUNTS.includes(variationCount as 1 | 3 | 5)) {
      return NextResponse.json(
        { error: `variationCount must be one of ${VARIATION_COUNTS.join(", ")}` },
        { status: 400 }
      );
    }

    // 1. Build N distinct UGC-realistic prompts via Claude.
    const variations = await buildNativePromptVariations(description, variationCount);

    // 2. Submit each (prompt × size) to kie.ai. Sequential to avoid hammering
    //    the API — kie.ai accepts a queue; this gives 2 × N submissions per
    //    request.
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const jobs: NativeGenerationJob[] = [];
    const submissionErrors: string[] = [];

    for (let i = 0; i < variations.length; i++) {
      const v = variations[i];
      for (const size of SIZES) {
        try {
          const result = await submitGeneration({ prompt: v.prompt, size });
          jobs.push({
            jobId: result.jobId,
            size,
            prompt: v.prompt,
            variationIndex: i,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          submissionErrors.push(`variation ${i + 1} (${size}): ${msg}`);
        }
      }
    }

    if (jobs.length === 0) {
      return NextResponse.json(
        {
          error: "All kie.ai submissions failed",
          details: submissionErrors,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      batchId,
      jobs,
      variationCount: variations.length,
      // Metadata the frontend will pass back to /api/native-ads/gallery when
      // each image completes — keeps gallery rows tagged with source context.
      meta: {
        description,
        pestId: pestId || null,
        vibe: vibe || null,
      },
      // Surface partial failures so the UI can warn the user.
      partialErrors: submissionErrors.length ? submissionErrors : undefined,
    });
  } catch (error) {
    console.error("Native ads generate error:", error);
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
