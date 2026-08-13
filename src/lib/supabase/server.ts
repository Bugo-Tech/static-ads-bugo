import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createJsClient, type SupabaseClient } from "@supabase/supabase-js";

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

// The service client is stateless (no user session), so one instance can be
// shared across all requests handled by a warm function instance.
let serviceClient: SupabaseClient | null = null;

export function createServiceClient() {
  if (!serviceClient) {
    serviceClient = createJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return serviceClient;
}
