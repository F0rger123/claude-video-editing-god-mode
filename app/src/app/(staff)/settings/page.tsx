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
import { connectBuffer } from "./buffer-actions";
import { agencyBufferKey } from "@/lib/workflow";
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

const STATUS: Record<string, string> = { ok: "text-success", degraded: "text-attention", disconnected: "text-danger", error: "text-danger", unknown: "text-ash" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: integrations }, { data: audit }, { data: staff }, { data: workspaces }, { data: passkeys }] = await Promise.all([
    supabase.from("content_integrations").select("*").order("kind"),
    supabase.from("content_audit").select("id, action, actor_label, entity, detail, at, workspace_id").order("at", { ascending: false }).limit(40),
    supabase.from("content_staff").select("user_id, role, display_name"),
    supabase.from("content_workspaces").select("id, name"),
    supabase.from("content_passkeys").select("id, device_name, created_at, last_used_at").order("created_at"),
  ]);
  const names = Object.fromEntries((workspaces ?? []).map((w) => [w.id, w.name]));
  const editor = (integrations ?? []).find((i) => i.kind === "editor" && !i.workspace_id);
  const detail = (editor?.detail ?? {}) as { drive_root?: string; message?: string; queue?: number; version?: string; brands?: string[] };

  return (
    <div>
      <PageHeader title="Settings" />
      <Section title="Editor (Herk Edit Kit on the editing PC)">
        <div className="rounded-2xl border border-rule p-4 text-sm">
          <p className={`font-medium ${STATUS[editor?.status ?? "unknown"]}`}>{editor ? (editor.status === "ok" ? "Connected" : editor.status) : "Never connected"}</p>
          <p className="text-mist">{editor?.last_seen_at ? `Last check-in ${formatAgo(editor.last_seen_at)}` : "Start the bridge on the editing PC: npm run bridge (see bridge/README.md)."}</p>
          {detail.message ? <p className="mt-1 text-attention">{detail.message}</p> : null}
          {detail.drive_root ? <p className="mt-1 text-ash">Drive: {detail.drive_root}{detail.brands?.length ? ` · brands: ${detail.brands.join(", ")}` : ""}</p> : null}
        </div>
      </Section>
      <Section title="Buffer">
        {await (async () => {
          const connected = isAdminConfigured() ? Boolean(await agencyBufferKey(createAdminClient())) : false;
          const info = (integrations ?? []).find((i) => i.kind === "buffer" && !i.workspace_id);
          return (
            <div className="rounded-2xl border border-rule p-4">
              <p className={`font-medium ${connected ? "text-success" : "text-attention"}`}>{connected ? "Connected" : "Not connected"}</p>
              <p className="mt-1 text-sm text-mist">
                {connected
                  ? `${(info?.detail as { channels?: number } | null)?.channels ?? "Your"} social accounts available. New client? Add their Instagram/TikTok/… in Buffer, then pick them on the client's Channels tab. No need to come back here.`
                  : "Connect once. Every client's social accounts you add in Buffer then appear on their Channels tab."}
              </p>
              <ol className="mt-3 grid gap-1 text-sm text-ash">
                <li>1. In <a href="https://publish.buffer.com" target="_blank" rel="noopener noreferrer" className="text-bone underline underline-offset-4">Buffer</a>, connect the social accounts you manage.</li>
                <li>2. Get your API key at <a href="https://developers.buffer.com" target="_blank" rel="noopener noreferrer" className="text-bone underline underline-offset-4">developers.buffer.com</a> → “Get API Key”.</li>
                <li>3. Paste it here.</li>
              </ol>
              <ActionForm action={connectBuffer} resetOnSuccess className="mt-3 grid gap-2">
                <input name="key" type="password" autoComplete="off" placeholder={connected ? "Paste a new key to replace it" : "Buffer API key"} className="field" />
                <div className="grid grid-cols-2 gap-2">
                  <SubmitButton name="intent" value="connect" pending="Checking…" haptic="success">{connected ? "Replace key" : "Connect Buffer"}</SubmitButton>
                  {connected ? <SubmitButton variant="ghost" name="intent" value="disconnect">Disconnect</SubmitButton> : null}
                </div>
              </ActionForm>
            </div>
          );
        })()}
      </Section>

      <Section title="Publishing & captions">
        <div className="grid gap-2 text-sm">
          {(integrations ?? []).filter((i) => i.kind === "buffer").map((i) => (
            <p key={i.id} className={STATUS[i.status]}>Buffer{i.workspace_id ? ` (${names[i.workspace_id]})` : ""}: {i.status}{(i.detail as { message?: string })?.message ? ` — ${(i.detail as { message?: string }).message}` : ""}</p>
          ))}
          <p className="text-mist">Captions: written on the editing PC with each edit{serverCaptionsEnabled() ? "; server rewrite available" : "; server rewrite off (no ANTHROPIC_API_KEY)"}.</p>
          <p className="text-mist">Background tasks run every 5 minutes{process.env.CRON_SECRET ? "" : " (CRON_SECRET missing: they will not run)"}.</p>
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
