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
