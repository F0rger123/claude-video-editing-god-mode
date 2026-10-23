import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatAgo } from "@/lib/format";

export const metadata = { title: "Notifications" };

async function markAllRead() {
  "use server";
  const supabase = await createClient();
  const viewer = await getViewer();
  if (!viewer) return;
  const { data } = await supabase.from("content_notifications").select("id").gte("created_at", new Date(Date.now() - 30 * 86400e3).toISOString()).limit(300);
  if (data?.length) await supabase.from("content_notification_reads").upsert(data.map((n) => ({ notification_id: n.id, user_id: viewer.userId })), { onConflict: "notification_id,user_id", ignoreDuplicates: true });
  revalidatePath("/", "layout");
}

const TONE: Record<string, string> = { publish_failed: "text-danger", edit_failed: "text-danger", integration_disconnected: "text-danger", quota_reached: "text-attention", needs_attention: "text-attention", approval_needed: "text-attention", client_feedback: "text-attention", published: "text-success" };

export default async function NotificationsPage() {
  const supabase = await createClient();
  const viewer = await getViewer();
  const [{ data: items }, { data: reads }] = await Promise.all([
    supabase.from("content_notifications").select("id, kind, title, body, link, created_at, audience").eq("audience", "staff").order("created_at", { ascending: false }).limit(80),
    supabase.from("content_notification_reads").select("notification_id").eq("user_id", viewer?.userId ?? "").limit(500),
  ]);
  const read = new Set((reads ?? []).map((r) => r.notification_id));
  return (
    <div>
      <PageHeader title="Notifications" action={<form action={markAllRead}><button className="press h-10 rounded-full border border-rule px-4 text-sm">Mark all read</button></form>} />
      {(items ?? []).length ? (
        <ul className="divide-y divide-rule rounded-2xl border border-rule">
          {(items ?? []).map((n) => (
            <li key={n.id}>
              <Link href={n.link ?? "/"} className="press flex gap-3 px-4 py-3">
                <span className={`mt-2 size-2 shrink-0 rounded-full ${read.has(n.id) ? "bg-transparent" : "bg-bone"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${TONE[n.kind] ?? ""}`}>{n.title}</p>
                  {n.body ? <p className="line-clamp-2 text-sm text-mist">{n.body}</p> : null}
                  <p className="text-xs text-ash">{formatAgo(n.created_at)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nothing yet." body="Client uploads, finished edits, feedback, failures and limits show up here." />
      )}
      <p className="mt-4 text-xs text-ash">Phone alerts: the editing PC also sends these to your ntfy app. PWA push and email can be added on the same notification records.</p>
    </div>
  );
}
