import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto grid min-h-svh max-w-md content-center gap-3 px-6">
        <h1 className="t-display">Setup required.</h1>
        <p className="text-mist">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then reload. See README.md.</p>
      </main>
    );
  }
  return <LoginForm next={safeNext(next)} linkError={error === "link"} />;
}
