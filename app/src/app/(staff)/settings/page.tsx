import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { getStaffClient } from "@/lib/actions";
import { tick } from "@/lib/workflow";
import { serverCaptionsEnabled } from "@/lib/integrations/captions";
import { ActionForm, SubmitButton } from "@/components/form";
import { ButtonLink, Notice, PageHeader, Section } from "@/components/ui";
import { formatAgo } from "@/lib/format";
import { HapticsToggle } from "@/components/haptics-toggle";
import { PasskeySettings } from "@/components/passkeys";
import { AppUpdateButton } from "@/components/app-update-button";
import { PushToggle } from "@/components/push-toggle";
import { BufferConnect } from "./buffer-connect";
import { agencyBufferKey } from "@/lib/workflow";
import { youtubeApp } from "@/lib/integrations/youtube";
import { instagramApp } from "@/lib/integrations/instagram";
import type { ActionState } from "@/lib/forms";

export const metadata = { title: "Settings" };

async function runNow(): Promise<ActionState> {
  "use server";
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  try {
    const r = await tick(createAdminClient());
    revalidatePath("/", "layout");
    return { success: `Done: ${r.intake} intake, ${r.routed} routed, ${r.sent} sent to Buffer. Statuses refreshed.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

type Backup = { status: string; dest?: string; last_ok_at?: string | null; files?: number | null; bytes?: number | null; message?: string | null };

const STATUS: Record<string, string> = { ok: "text-success", degraded: "text-attention", disconnected: "text-danger", error: "text-danger", unknown: "text-ash" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: integrations }, { data: audit }, { data: staff }, { data: workspaces }, { data: passkeys }] = await Promise.all([
    supabase.from("content_integrations").select("*").order("kind"),
    supabase.from("content_audit").select("id, action, actor_label, entity, detail, at, workspace_id").order("at", { ascending: false }).limit(40),
    supabase.from("content_staff").select("user_id, role, display_name"),
    supabase.from("content_workspaces").select("id, name, is_agency"),
    supabase.from("content_passkeys").select("id, device_name, created_at, last_used_at").order("created_at"),
  ]);
  const names = Object.fromEntries((workspaces ?? []).map((w) => [w.id, w.name]));
  const agencyId = (workspaces ?? []).find((w) => w.is_agency)?.id;
  const { data: ytChannels } = await supabase.from("content_channels").select("id, name, provider, workspace_id, is_disconnected").in("provider", ["youtube", "instagram"]);
  const editor = (integrations ?? []).find((i) => i.kind === "editor" && !i.workspace_id);
  const detail = (editor?.detail ?? {}) as { drive_root?: string; message?: string; queue?: number; version?: string; brands?: string[]; backup?: Backup | null };
  const backup = detail.backup ?? null;
  const gb = (n?: number | null) => (n ? `${(n / 1e9).toFixed(n > 1e10 ? 0 : 1)} GB` : null);

  return (
    <div>
      <PageHeader title="Settings" />
      <Section title="Editor (Herk Edit Kit on the editing PC)">
        <div className="rounded-2xl border border-rule p-4 text-sm">
          <p className={`font-medium ${STATUS[editor?.status ?? "unknown"]}`}>{editor ? (editor.status === "ok" ? "Connected" : editor.status) : "Never connected"}</p>
          <p className="text-mist">{editor?.last_seen_at ? `Last check-in ${formatAgo(editor.last_seen_at)}` : "Start the bridge on the editing PC: npm run bridge (see bridge/README.md)."}</p>
          {detail.message ? <p className="mt-1 text-attention">{detail.message}</p> : null}
          {detail.drive_root ? <p className="mt-1 text-ash">Editor folder: {detail.drive_root}{detail.brands?.length ? ` · brands: ${detail.brands.join(", ")}` : ""}</p> : null}
        </div>
      </Section>
      <Section title="Google Drive backup">
        <div className="rounded-2xl border border-rule p-4 text-sm">
          <p className={`font-medium ${backup?.status === "ok" ? "text-success" : backup?.status === "error" ? "text-danger" : backup?.status === "copying" ? "text-active" : "text-attention"}`}>
            {!backup ? "Not reported yet" : backup.status === "ok" ? "Backed up" : backup.status === "copying" ? "Copying to Drive now…" : backup.status === "paused" ? "Paused" : backup.status === "error" ? "Last copy had problems" : "Waiting for the next copy"}
          </p>
          <p className="text-mist">
            {backup?.last_ok_at ? `Last complete copy ${formatAgo(backup.last_ok_at)}` : "Copies the editor folder to Google Drive every 30 minutes."}
            {backup?.files ? ` · ${backup.files.toLocaleString()} files${gb(backup.bytes) ? `, ${gb(backup.bytes)}` : ""}` : ""}
          </p>
          {backup?.message ? <p className="mt-1 text-attention">{backup.message}</p> : null}
          <p className="mt-1 text-ash">{backup?.dest ? `In Drive: ${backup.dest}` : "In Drive: My Drive › God Mode Cut backup"} · nothing is ever deleted from the backup.</p>
        </div>
      </Section>
      <Section title="Buffer">
        {await (async () => {
          const connected = isAdminConfigured() ? Boolean(await agencyBufferKey(createAdminClient())) : false;
          const info = (integrations ?? []).find((i) => i.kind === "buffer" && !i.workspace_id);
          return <BufferConnect connected={connected} channels={(info?.detail as { channels?: number } | null)?.channels ?? null} />;
        })()}
      </Section>

      <Section title="Direct posting (no Buffer)">
        <div className="grid gap-2 rounded-2xl border border-rule p-4 text-sm">
          <p className={youtubeApp() ? "text-mist" : "text-attention"}>YouTube: {youtubeApp() ? "ready" : "not set up yet (docs/YOUTUBE.md)"}</p>
          <p className={instagramApp() ? "text-mist" : "text-attention"}>Instagram: {instagramApp() ? "ready" : "not set up yet (docs/INSTAGRAM.md)"}</p>
          {(ytChannels ?? []).length ? (
            (ytChannels ?? []).map((c) => (
              <p key={c.id} className={c.is_disconnected ? "text-danger" : "text-success"}>
                {c.provider === "instagram" ? "Instagram" : "YouTube"}: {c.name} · {names[c.workspace_id] ?? "client"} · {c.is_disconnected ? "signed out, connect again" : "posting directly"}
              </p>
            ))
          ) : (
            <p className="text-mist">Connect accounts on a client&apos;s Channels tab.</p>
          )}
          <p className="text-ash">
            YouTube keeps uploads private until Google&apos;s free API audit passes (the app warns you). Instagram works for your own accounts now; clients&apos; accounts need Meta&apos;s App Review.
          </p>
        </div>
        {agencyId && (youtubeApp() || instagramApp()) ? <ButtonLink href={`/clients/${agencyId}?tab=channels`} variant="ghost" className="mt-3 w-full">Connect your own accounts</ButtonLink> : null}
      </Section>

      <Section title="Publishing & captions">
        <div className="grid gap-2 text-sm">
          {(integrations ?? []).filter((i) => i.kind === "buffer").map((i) => (
            <p key={i.id} className={STATUS[i.status]}>Buffer{i.workspace_id ? ` (${names[i.workspace_id]})` : ""}: {i.status}{(i.detail as { message?: string })?.message ? ` — ${(i.detail as { message?: string }).message}` : ""}</p>
          ))}
          <p className="text-mist">Captions: written on the editing PC with each edit{serverCaptionsEnabled() ? "; server rewrite available" : "; server rewrite off (no ANTHROPIC_API_KEY)"}.</p>
          <p className="text-mist">Background tasks run every 2 minutes, from the database, even when the editing PC is off{process.env.CRON_SECRET ? "" : " (CRON_SECRET missing: they will not run)"}.</p>
        </div>
        {!isAdminConfigured() ? <div className="mt-3"><Notice tone="danger">SUPABASE_SERVICE_ROLE_KEY is missing on the server. Uploads, invites and publishing need it.</Notice></div> : null}
        <ActionForm action={runNow} className="mt-3">
          <SubmitButton variant="ghost" pending="Running…">Run background tasks now</SubmitButton>
        </ActionForm>
      </Section>
      <Section title="Sign-in">
        <PasskeySettings devices={passkeys ?? []} />
        <ButtonLink href="/reset-password" variant="ghost" icon="key" className="mt-3 w-full">Change password</ButtonLink>
      </Section>
      <Section title="This phone">
        <div className="mb-3 grid gap-3">
          <PushToggle />
          <AppUpdateButton />
        </div>
        <HapticsToggle />
      </Section>
      <Section title="Team" count={staff?.length ?? 0}>
        <ul className="grid gap-1 text-sm text-mist">
          {(staff ?? []).map((s) => <li key={s.user_id}>{s.display_name ?? s.user_id.slice(0, 8)} · {s.role}</li>)}
        </ul>
        <p className="mt-2 text-xs text-ash">Team access is granted with SQL (see supabase/README.md).</p>
      </Section>
      <Section title="Audit log">
        <ul className="grid gap-1.5 text-sm">
          {(audit ?? []).map((a) => (
            <li key={a.id} className="flex gap-3">
              <span className="w-16 shrink-0 text-ash">{formatAgo(a.at)}</span>
              <span className="min-w-0 text-mist">
                {a.action.replace(/_/g, " ")}
                {(a.detail as { to?: string })?.to ? ` → ${(a.detail as { to?: string }).to}` : ""}
                <span className="text-ash"> · {a.workspace_id ? names[a.workspace_id] : "agency"}{a.actor_label ? ` · ${a.actor_label}` : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
