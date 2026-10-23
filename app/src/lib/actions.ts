import { AGENCY_NAME } from "@/lib/brand";
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ActionState } from "@/lib/forms";

/**
 * Shared server-action helpers (same contract as the agency's src/lib/actions.ts):
 *   1. verify the session with getUser() — server actions are their own request;
 *   2. validate input;
 *   3. confirm the write touched a row.
 */
export type UserClient = Awaited<ReturnType<typeof createClient>>;

export async function getUserClient(): Promise<{ supabase: UserClient; userId: string } | { error: string }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : { error: "Your session has expired. Sign in again." };
}

/** Staff-only action guard: proves the session AND content_staff membership server-side. */
export async function getStaffClient(): Promise<{ supabase: UserClient; userId: string; role: "owner" | "agency" } | { error: string }> {
  const ctx = await getUserClient();
  if ("error" in ctx) return ctx;
  const { data } = await ctx.supabase.from("content_staff").select("role").eq("user_id", ctx.userId).maybeSingle();
  if (!data) return { error: `Only ${AGENCY_NAME} can do that.` };
  return { ...ctx, role: data.role as "owner" | "agency" };
}

export function notFoundWhenNoRows(count: number | null, what = "Record"): ActionState | null {
  return count === 0 || count === null ? { error: `${what} not found, or it was already changed.` } : null;
}

export function isActionError(value: unknown): value is ActionState {
  return typeof value === "object" && value !== null && "error" in value;
}

export function cleanError(message: string | undefined): string {
  if (!message) return "Something went wrong.";
  if (/row-level security|permission denied|42501/i.test(message)) return "You do not have permission to do that.";
  return message.replace(/^.*?ERROR:\s*/, "");
}
