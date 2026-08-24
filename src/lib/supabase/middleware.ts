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

  // getClaims() verifies the session JWT locally (against cached JWKS keys)
  // instead of a network round-trip to Supabase Auth on every request. On
  // projects still using symmetric JWT secrets it transparently falls back to
  // the server-side check, so behavior is unchanged there.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/api/callback")
  ) {
    // API calls get JSON, never a redirect. A redirect here is a 307, which
    // preserves the POST method, so fetch follows it and receives the login
    // page as HTML with status 200 — res.ok is true and res.json() blows up on
    // "<!doctype". That turned an expired session into an unexplained failure
    // deep inside the workflow instead of a plain "log in again".
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Not authenticated — your session expired. Reload the page and sign in again." },
        { status: 401 }
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
