import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Email links (sign-in link, invitation, password reset): exchange the one-time code for a session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  let origin = url.origin;
  try {
    if (process.env.NEXT_PUBLIC_SITE_URL) origin = new URL(process.env.NEXT_PUBLIC_SITE_URL).origin;
  } catch {
    // keep request origin
  }
  const rawNext = url.searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.includes("\\") ? rawNext : "/";
  const code = url.searchParams.get("code");
  if (code && isSupabaseConfigured()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // A "forgot password" link always lands on the new-password screen, whatever `next` says.
      const { data } = await supabase.auth.getClaims();
      const amr = (data?.claims?.amr ?? []) as { method?: string }[];
      const recovery = amr.some((m) => m?.method === "recovery");
      return NextResponse.redirect(new URL(recovery ? "/reset-password" : next, origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
