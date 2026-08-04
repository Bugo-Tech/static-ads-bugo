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
