import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/** Staff-side read helpers. All go through the user client, so RLS applies. */

export type WorkspaceLite = { id: string; name: string; slug: string; is_agency: boolean; logo_path: string | null; automation_mode: string; access_mode: string; timezone: string };

export const listWorkspaces = cache(async (): Promise<WorkspaceLite[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("content_workspaces")
    .select("id, name, slug, is_agency, logo_path, automation_mode, access_mode, timezone")
    .is("archived_at", null)
    .order("is_agency", { ascending: false })
    .order("name")
    .limit(200);
  return (data ?? []) as WorkspaceLite[];
});

/** The client the owner is focused on (null = all clients). Ignored if it no longer exists. */
export const getFocus = cache(async (): Promise<WorkspaceLite | null> => {
  const id = (await cookies()).get("azc-ws")?.value;
  if (!id) return null;
  return (await listWorkspaces()).find((w) => w.id === id) ?? null;
});

export const unreadCount = cache(async (userId: string): Promise<number> => {
  const supabase = await createClient();
  const since = new Date(Date.now() - 14 * 86400e3).toISOString();
  const [{ data: rows }, { data: reads }] = await Promise.all([
    supabase.from("content_notifications").select("id").gte("created_at", since).limit(200),
    supabase.from("content_notification_reads").select("notification_id").eq("user_id", userId).limit(500),
  ]);
  const read = new Set((reads ?? []).map((r) => r.notification_id));
  return (rows ?? []).filter((r) => !read.has(r.id)).length;
});

export type JobRow = {
  id: string;
  workspace_id: string;
  title: string;
  form: "short" | "long";
  platforms: string[];
  status: import("@/lib/domain/types").JobStatus;
  review_stage: "agency" | "client" | null;
  needs_attention: boolean;
  attention_reason: string | null;
  priority: string;
  due_date: string | null;
  source: string;
  revision_count: number;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export const JOB_COLUMNS =
  "id, workspace_id, title, form, platforms, status, review_stage, needs_attention, attention_reason, priority, due_date, source, revision_count, current_version_id, created_at, updated_at";

/** Adds `workspace_id = focus` to a query when the owner is focused on one client. */
export function scoped<T>(query: T, workspaceId: string | null | undefined): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return workspaceId ? (query as any).eq("workspace_id", workspaceId) : query;
}
