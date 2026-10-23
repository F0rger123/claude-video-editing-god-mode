import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { signedViewUrls } from "@/lib/integrations/storage";
import { MediaThumb } from "@/components/media-thumb";
import { ActionForm, SubmitButton } from "@/components/form";
import { ButtonLink, Notice, PageHeader, Section, StatusPill } from "@/components/ui";
import { formatAgo, formatWhen, toLocalInput } from "@/lib/format";
import { PLATFORM_LABEL, type JobStatus, type Platform } from "@/lib/domain/types";
import type { RevisionInstructions } from "@/lib/domain/feedback";
import { ReviewPanel } from "./review-panel";
import { ProgressSteps } from "@/components/progress-steps";
import { PostEditor, type PostRow } from "./post-editor";
import { decide, jobStatusAction, updateJob } from "./actions";

export const metadata = { title: "Video" };

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const supabase = await createClient();
  const { data: job } = await supabase.from("content_jobs").select("*").eq("id", id).maybeSingle();
  if (!job) notFound();

  const [{ data: ws }, { data: versions }, { data: feedback }, { data: media }, { data: posts }, { data: channels }, { data: internal }, { data: activity }, { data: revisions }] = await Promise.all([
    supabase.from("content_workspaces").select("id, name, slug, timezone, approval_rules, access_mode, allowed_platforms, automation_mode").eq("id", job.workspace_id).single(),
    supabase.from("content_versions").select("*").eq("job_id", id).order("number", { ascending: false }),
    supabase.from("content_feedback").select("id, version_id, body, at_seconds, reference_url, author_label, internal, created_at").eq("job_id", id).order("created_at"),
    supabase.from("content_media").select("id, kind, role, review_status, file_name, url, body, duration_seconds, size_bytes, storage_path, review_note, created_at").eq("job_id", id).order("created_at"),
    supabase.from("content_posts").select("*").eq("job_id", id).neq("status", "cancelled").order("platform"),
    supabase.from("content_channels").select("id, name, platform, is_disconnected").eq("workspace_id", job.workspace_id).eq("enabled", true),
    supabase.from("content_job_internal").select("*").eq("job_id", id).maybeSingle(),
    supabase.from("content_audit").select("id, action, actor_label, detail, at").eq("entity_id", id).order("at", { ascending: false }).limit(25),
    supabase.from("content_revisions").select("id, round, status, instructions, created_at").eq("job_id", id).order("round", { ascending: false }),
  ]);
  const tz = ws?.timezone ?? "America/New_York";
  const current = (versions ?? []).find((x) => x.id === v) ?? (versions ?? []).find((x) => x.id === job.current_version_id) ?? versions?.[0] ?? null;
  const signed = isAdminConfigured()
    ? await signedViewUrls(createAdminClient(), [...(versions ?? []).map((x) => x.storage_path), ...(media ?? []).map((m) => m.storage_path).filter(Boolean)] as string[], 3600)
    : new Map<string, string>();
  const status = job.status as JobStatus;
  const canDecide = status === "review" && job.review_stage === "agency" && current?.id === job.current_version_id;
  const versionFeedback = (feedback ?? []).filter((f) => !current || f.version_id === current.id || f.version_id === null);
  const editorRef = (internal?.editor_ref ?? {}) as { needs_review?: string; paused?: string; drive_clip?: string; project?: string };

  return (
    <div>
      <PageHeader
        title={job.title}
        back="/inbox"
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={status} />
            <span>{ws?.name}</span>
            <span className="text-ash">·</span>
            <span>{job.form === "short" ? "Short-form" : "Long-form"}</span>
            {job.platforms.length ? <span className="text-ash">· {job.platforms.map((p: string) => PLATFORM_LABEL[p as Platform] ?? p).join(", ")}</span> : null}
            {current ? <span className="text-ash">· V{current.number}</span> : null}
            {status === "review" && job.review_stage === "client" ? <span className="text-attention">· waiting for client</span> : null}
          </span>
        }
      />

      <ProgressSteps status={status} note={editorRef.paused ? `Editor paused (${editorRef.paused}); it resumes by itself.` : ["queued", "editing", "rendering"].includes(status) ? `Updated ${formatAgo(job.updated_at)}. The editor reports progress every few minutes.` : null} />

      {job.needs_attention ? (
        <div className="mb-4">
          <Notice>
            <p>{job.attention_reason ?? "Needs attention."}</p>
            <ActionForm action={jobStatusAction} className="mt-2">
              <input type="hidden" name="job" value={id} />
              <SubmitButton variant="ghost" name="what" value="resolve" className="h-9 text-xs">Mark as handled</SubmitButton>
            </ActionForm>
          </Notice>
        </div>
      ) : null}
      {editorRef.needs_review ? <div className="mb-4"><Notice>Editor flagged this edit: {editorRef.needs_review}</Notice></div> : null}
      {editorRef.paused ? <div className="mb-4"><Notice tone="neutral">Editor paused: {editorRef.paused}. It resumes by itself.</Notice></div> : null}
      {status === "failed" && internal?.last_error ? <div className="mb-4"><Notice tone="danger">{internal.last_error}</Notice></div> : null}

      {status === "needs_changes" && !(revisions ?? []).some((r) => r.status === "pending" || r.status === "sent") ? (
        <div className="mb-6">
          <Notice>
            <p>Changes were requested{versionFeedback.length ? ` (${versionFeedback.length} note${versionFeedback.length === 1 ? "" : "s"})` : ""}. Review the notes below, then send them to the editor.</p>
            <ActionForm action={decide} className="mt-2">
              <input type="hidden" name="job" value={id} />
              <label className="mb-2 flex items-center gap-2 text-xs"><input type="checkbox" name="overage" className="accent-bone" /> Allow beyond the revision allowance</label>
              <SubmitButton name="decision" value="changes_requested" pending="Sending…" className="h-10">Send changes to editor</SubmitButton>
            </ActionForm>
          </Notice>
        </div>
      ) : null}

      {["pending_approval", "failed", "incoming", "archived"].includes(status) ? (
        <div className="mb-6 grid grid-cols-2 gap-2">
          <ActionForm action={jobStatusAction} className="col-span-2">
            <input type="hidden" name="job" value={id} />
            {status === "archived" ? (
              <SubmitButton name="what" value="restore" className="w-full">Restore</SubmitButton>
            ) : (
              <>
                <SubmitButton name="what" value={status === "failed" ? "retry" : "start"} pending="Sending…" className="w-full">{status === "failed" ? "Retry edit" : "Approve & edit"}</SubmitButton>
                <label className="mt-2 flex items-center gap-2 text-xs text-ash"><input type="checkbox" name="overage" className="accent-bone" /> Allow if over the package limit (owner)</label>
              </>
            )}
          </ActionForm>
        </div>
      ) : null}

      {current || status === "review" ? (
        <ReviewPanel
          jobId={id}
          versionId={current?.id ?? null}
          src={current ? signed.get(current.storage_path) ?? null : null}
          feedback={versionFeedback}
          canDecide={canDecide}
          stage={job.review_stage}
          clientReview={Boolean(ws?.approval_rules?.client_review) && ws?.access_mode === "client_collab"}
        />
      ) : (
        <div className="mb-2 rounded-3xl border border-dashed border-rule px-5 py-10 text-center text-sm text-ash">
          {["queued", "editing", "rendering"].includes(status) ? "The editor is working on this. You will get a notification when V1 is ready." : "No edit yet."}
        </div>
      )}

      {(versions ?? []).length ? (
        <Section title="Versions" count={versions!.length}>
          <ul className="divide-y divide-rule rounded-2xl border border-rule">
            {versions!.map((x) => (
              <li key={x.id}>
                <Link href={`/jobs/${id}?v=${x.id}`} className={`press flex items-center gap-3 px-4 py-3 ${x.id === current?.id ? "bg-char" : ""}`}>
                  <span className="tabular w-8 font-semibold">V{x.number}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-mist">{x.description ?? "Edit"}</span>
                  <span className="text-xs text-ash">{x.decision === "pending" ? formatAgo(x.created_at) : `${x.decision.replace("_", " ")} ${formatAgo(x.decided_at)}`}</span>
                  {x.client_visible ? <span className="t-label">client</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div id="posts" />
      <Section title="Posts" count={posts?.length ?? 0} action={status === "approved" && !(posts ?? []).length ? (
        <ActionForm action={jobStatusAction}><input type="hidden" name="job" value={id} /><SubmitButton variant="ghost" name="what" value="plan_posts" className="h-9 text-xs">Plan posts</SubmitButton></ActionForm>
      ) : null}>
        {(posts ?? []).length ? (
          <div className="grid gap-3">
            {(posts ?? []).map((p) => (
              <PostEditor key={p.id} post={{ ...(p as PostRow), whenLocal: toLocalInput(p.scheduled_at, tz) }} channels={channels ?? []} />
            ))}
            <p className="text-xs text-ash">Times are in {tz}. {posts!.some((p) => p.scheduled_at) ? `Next: ${formatWhen(posts!.filter((p) => p.scheduled_at).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0].scheduled_at, tz)}.` : ""}</p>
          </div>
        ) : (
          <p className="text-sm text-ash">Posts are planned when the edit is approved: a caption per platform and a slot from {ws?.name}&apos;s posting rules.</p>
        )}
      </Section>

      <Section title="Source files" count={media?.length ?? 0} action={<ButtonLink href={`/upload?job=${id}`} variant="ghost" icon="plus" className="h-9 px-3.5 text-xs">Add footage</ButtonLink>}>
        {(media ?? []).length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(media ?? []).map((m) => (
              <div key={m.id}>
                <MediaThumb media={{ ...m, src: m.storage_path ? signed.get(m.storage_path) ?? null : null }} />
                <p className="mt-1 truncate text-[11px] text-ash">{m.role === "primary" ? "Main take" : m.role === "reference" ? "Reference" : m.file_name ?? m.kind}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ash">No files yet.</p>
        )}
      </Section>

      {(revisions ?? []).length ? (
        <Section title="Instructions sent to the editor">
          <ul className="grid gap-2">
            {revisions!.map((r) => {
              const ins = r.instructions as RevisionInstructions;
              return (
                <li key={r.id} className="rounded-2xl border border-rule px-4 py-3 text-sm">
                  <p className="font-medium">Round {r.round} · {r.status}</p>
                  <p className="text-mist">{ins.summary}</p>
                  {ins.timestamped.length ? <ul className="mt-1 text-mist">{ins.timestamped.map((t, i) => <li key={i}>At {t.at}: {t.change}</li>)}</ul> : null}
                  {ins.general.length ? <ul className="mt-1 text-mist">{ins.general.map((g, i) => <li key={i}>{g}</li>)}</ul> : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Section title="Details">
        <ActionForm action={updateJob} className="grid gap-3">
          <input type="hidden" name="job" value={id} />
          <input name="title" defaultValue={job.title} className="field" aria-label="Title" />
          <div className="grid grid-cols-2 gap-2">
            <select name="form" defaultValue={job.form} className="field" aria-label="Format">
              <option value="short">Short-form</option>
              <option value="long">Long-form</option>
            </select>
            <select name="priority" defaultValue={job.priority} className="field" aria-label="Priority">
              {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input type="date" name="due_date" defaultValue={job.due_date ?? ""} className="field" aria-label="Due date" />
            <input name="category" defaultValue={job.category ?? ""} placeholder="Category" className="field" />
          </div>
          <div className="flex flex-wrap gap-2">
            {(ws?.allowed_platforms ?? []).map((p: string) => (
              <label key={p}>
                <input type="checkbox" name="platforms" value={p} defaultChecked={job.platforms.includes(p)} className="sr-only" />
                <span className="chip press">{PLATFORM_LABEL[p as Platform] ?? p}</span>
              </label>
            ))}
          </div>
          <select name="auto_post" defaultValue={job.auto_post === null ? "inherit" : job.auto_post ? "on" : "off"} className="field" aria-label="Auto-post">
            <option value="inherit">Posting: follow {ws?.name} rules</option>
            <option value="on">Posting: schedule automatically</option>
            <option value="off">Posting: wait for my approval</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="needs_attention" defaultChecked={job.needs_attention} className="accent-bone" /> I want to review this manually
          </label>
          <textarea name="agency_notes" defaultValue={internal?.agency_notes ?? ""} className="field" placeholder="Agency notes (never shown to the client)" />
          {job.client_notes ? <p className="rounded-xl border border-rule px-3 py-2 text-sm text-mist">Client note: {job.client_notes}</p> : null}
          <SubmitButton>Save details</SubmitButton>
        </ActionForm>
        {status !== "archived" && status !== "published" ? (
          <ActionForm action={jobStatusAction} className="mt-3">
            <input type="hidden" name="job" value={id} />
            <SubmitButton variant="ghost" name="what" value="archive" className="h-10 w-full border-0 text-ash">Archive this video</SubmitButton>
          </ActionForm>
        ) : null}
      </Section>

      <Section title="Activity">
        <ul className="grid gap-1.5 text-sm">
          {(activity ?? []).map((a) => (
            <li key={a.id} className="flex gap-3">
              <span className="w-16 shrink-0 text-ash">{formatAgo(a.at)}</span>
              <span className="text-mist">
                {a.action.replace(/_/g, " ")}
                {a.detail?.to ? ` → ${String(a.detail.to).replace("_", " ")}` : ""}
                {a.actor_label ? <span className="text-ash"> · {a.actor_label}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
