import { NextRequest, NextResponse } from "next/server";
import { getHistory, addToHistory, deleteHistoryEntry, updateHistoryEntry } from "@/lib/adHistory";

// GET — list all history entries
export async function GET() {
  const entries = await getHistory();
  return NextResponse.json({ entries });
}

// POST — add to history or update entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "add") {
      const entry = await addToHistory({
        referencePreviewUrl: body.referencePreviewUrl,
        uploadedUrl: body.uploadedUrl,
        analysis: body.analysis,
        prompt: body.prompt,
        copyVariations: body.copyVariations,
        language: body.language,
      });
      return NextResponse.json({ entry });
    }

    if (body.action === "update") {
      await updateHistoryEntry(body.id, body.updates);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("History error:", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}

// DELETE — remove entry
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "No id" }, { status: 400 });
    await deleteHistoryEntry(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("History delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
