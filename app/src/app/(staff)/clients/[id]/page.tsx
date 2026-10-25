import { AGENCY_NAME } from "@/lib/brand";
import Link from "@/components/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { usageFor, syncChannels } from "@/lib/workflow";
import { ActionForm, SubmitButton, Toggle } from "@/components/form";
import { Meter, Notice, PageHeader, PlatformTag, Section } from "@/components/ui";
import { PERMISSION_KEYS, PERMISSION_LABEL, normalizePermissions } from "@/lib/domain/permissions";
import { platformFromService } from "@/lib/integrations/buffer";
import type { PackageLimits, Workspace } from "@/lib/domain/types";
import { formatAgo } from "@/lib/format";
import { ClientForm } from "../client-form";
import { StylesTab } from "./styles-tab";
import { BrandTab, ProjectsTab, type BrandAsset } from "./brand-tab";
import { signedViewUrls } from "@/lib/integrations/storage";
import { youtubeApp } from "@/lib/integrations/youtube";
import { instagramApp } from "@/lib/integrations/instagram";
import { archiveClient, inviteMember, mapChannel, saveBufferKey, updateClientWorkspace, updateMember } from "../actions";

export const metadata = { title: "Client" };

const YT_RESULT: Record<string, { tone: "neutral" | "danger"; text: string }> = {
  connected: { tone: "neutral", text: "YouTube connected. Approved videos for this client now upload straight to YouTube at their posting time." },
  cancelled: { tone: "danger", text: "YouTube wasn't connected: the Google sign-in was cancelled." },
  expired: { tone: "danger", text: "That sign-in link expired. Tap Connect YouTube again." },
  taken: { tone: "danger", text: "That YouTube channel already posts for another client. A channel can only post for one client." },
  "no-channel": { tone: "danger", text: "That Google account has no YouTube channel. Pick the account (or brand account) that owns the channel." },
  "no-upload": { tone: "danger", text: "Google didn't allow uploads. Connect again and tick \"Manage your YouTube videos\"." },
  "no-offline": { tone: "danger", text: "Google didn't give a lasting sign-in. Remove the app at myaccount.google.com/permissions, then connect again." },
  "not-set-up": { tone: "danger", text: "YouTube posting isn't set up on the server yet: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing. See docs/YOUTUBE.md." },
  failed: { tone: "danger", text: "YouTube couldn't be connected. Try again in a minute." },
};

const IG_RESULT: Record<string, { tone: "neutral" | "danger"; text: string }> = {
  connected: { tone: "neutral", text: "Instagram connected. Approved Reels for this client now post straight to Instagram at their posting time." },
  cancelled: { tone: "danger", text: "Instagram wasn't connected: the sign-in was cancelled." },
  expired: { tone: "danger", text: "That sign-in link expired. Tap Connect Instagram again." },
  taken: { tone: "danger", text: "That Instagram account already posts for another client. An account can only post for one client." },
  personal: { tone: "danger", text: "That's a personal Instagram account, which can't post through apps. In Instagram, switch it to a Professional (Creator or Business) account, then connect again." },
  "no-publish": { tone: "danger", text: "Instagram didn't allow posting. Connect again and allow content publishing." },
  "not-set-up": { tone: "danger", text: "Instagram posting isn't set up on the server yet: INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET are missing. See docs/INSTAGRAM.md." },
  failed: { tone: "danger", text: "Instagram couldn't be connected. If it's not your own account, Meta has to approve the app first (docs/INSTAGRAM.md)." },
};

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; tab?: string; yt?: string; ig?: string }> }) {
  const { id } = await params;
  const { created, tab = "overview", yt, ig } = await searchParams;
  const supabase = await createClient();
  const { data: ws } = await supabase.from("content_workspaces").select("*").eq("id", id).maybeSingle();
  if (!ws) notFound();
  const w = ws as Workspace;
  const admin = isAdminConfigured() ? createAdminClient() : null;

  const [{ data: members }, { data: channels }, usage, { data: hasKey }] = await Promise.all([
    supabase.from("content_members").select("*").eq("workspace_id", id).order("invited_at"),
    supabase.from("content_channels").select("*").eq("workspace_id", id).order("platform"),
    admin ? usageFor(admin, id) : Promise.resolve(null),
    admin ? admin.from("content_secrets").select("kind").eq("workspace_id", id).eq("kind", "buffer_api_key").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { data: presetRows } = tab === "styles" ? await supabase.from("content_style_presets").select("id, kind, name, instructions, is_default").eq("workspace_id", id).is("archived_at", null).order("name") : { data: [] };
  const wantsKit = tab === "brand" || tab === "projects";
  const [{ data: assetRows }, { data: projectRows }, { data: projectJobs }] = wantsKit
    ? await Promise.all([
        supabase.from("content_brand_assets").select("id, kind, name, notes, value, url, file_name, mime_type, is_primary, project_id, storage_path").eq("workspace_id", id).is("archived_at", null).order("sort").order("created_at"),
        supabase.from("content_projects").select("id, name, brief, status").eq("workspace_id", id).order("status").order("created_at", { ascending: false }),
        supabase.from("content_jobs").select("project_id").eq("workspace_id", id).not("project_id", "is", null),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const previews = admin && assetRows?.length ? await signedViewUrls(admin, assetRows.filter((a) => a.storage_path && a.mime_type?.startsWith("image/")).map((a) => a.storage_path as string), 3600) : new Map<string, string>();
  const brandAssets: BrandAsset[] = (assetRows ?? []).map(({ storage_path, ...a }) => ({ ...(a as Omit<BrandAsset, "preview">), preview: storage_path ? previews.get(storage_path) ?? null : null }));
  const { data: presetRefs } = presetRows?.length ? await supabase.from("content_media").select("preset_id").in("preset_id", presetRows.map((p) => p.id)) : { data: [] };
  let remote: Awaited<ReturnType<typeof syncChannels>>["channels"] = [];
  let bufferError: string | null = null;
  if (tab === "channels" && admin) {
    try {
      remote = (await syncChannels(admin, id)).channels;
    } catch (e) {
      bufferError = (e as Error).message;
    }
  }
  const pkg = (w.package ?? {}) as PackageLimits;
  const mapped = new Set((channels ?? []).map((c) => c.buffer_channel_id));
  const { data: taken } = remote.length ? await supabase.from("content_channels").select("buffer_channel_id, workspace_id").in("buffer_channel_id", remote.map((r) => r.id)) : { data: [] };
  const takenElsewhere = new Set((taken ?? []).filter((t) => t.workspace_id !== id).map((t) => t.buffer_channel_id));
  const tabs = [
    ["overview", "Overview"],
    ["portal", "Portal"],
    ["channels", "Channels"],
    ["brand", "Brand kit"],
    ["projects", "Projects"],
    ["styles", "Styles"],
    ["settings", "Settings"],
  ] as const;

  return (
    <div>
      <PageHeader title={w.name} back="/clients" meta={w.is_agency ? "Your own workspace" : w.contact_email ?? undefined} />
      {created ? <div className="mb-4"><Notice tone="neutral">Client created. Next: connect channels, then invite the client if they get a portal.</Notice></div> : null}
      <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4">
        {tabs.map(([key, label]) => (
          <Link key={key} href={`/clients/${id}?tab=${key}`} className={`press shrink-0 rounded-full px-4 py-2 text-sm ${tab === key ? "bg-bone font-semibold text-ink" : "border border-rule text-mist"}`}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <>
          <Section title="This month">
            {usage ? (
              <div className="grid gap-3 rounded-2xl border border-rule p-4">
                <Meter label="Short-form edit jobs" used={usage.shortJobsThisMonth} limit={pkg.short_per_month} />
                <Meter label="Long-form edit jobs" used={usage.longJobsThisMonth} limit={pkg.long_per_month} />
                <Meter label="This week" used={usage.jobsThisWeek} limit={pkg.videos_per_week} />
                <Meter label="Editing right now" used={usage.activeJobs} limit={pkg.max_simultaneous_jobs} />
                <div className="mt-1 grid grid-cols-3 gap-2 border-t border-rule pt-3 text-center">
                  <div><p className="tabular text-xl font-semibold">{usage.rawFiles}</p><p className="text-xs text-ash">raw files</p></div>
                  <div><p className="tabular text-xl font-semibold">{usage.deliverablesThisMonth}</p><p className="text-xs text-ash">approved</p></div>
                  <div><p className="tabular text-xl font-semibold">{usage.publishedThisMonth}</p><p className="text-xs text-ash">published</p></div>
                </div>
              </div>
            ) : <p className="text-sm text-ash">Usage needs the server service key.</p>}
          </Section>
          <Section title="Quick links">
            <div className="grid grid-cols-2 gap-2">
              <Link href={`/jobs?ws=${id}`} className="press rounded-2xl border border-rule p-4 text-sm">All content</Link>
              <Link href={`/calendar?ws=${id}`} className="press rounded-2xl border border-rule p-4 text-sm">Calendar</Link>
              <Link href={`/upload`} className="press rounded-2xl border border-rule p-4 text-sm">Upload</Link>
              {w.access_mode !== "agency_only" ? <Link href={`/portal/${w.slug}`} className="press rounded-2xl border border-rule p-4 text-sm">Client portal</Link> : null}
            </div>
          </Section>
        </>
      ) : null}

      {tab === "portal" ? (
        <>
          {w.access_mode === "agency_only" ? <div className="mb-4"><Notice tone="neutral">This client is Agency only. Change Client access in Settings to give them a portal.</Notice></div> : null}
          <Section title="Invite">
            <ActionForm action={inviteMember} resetOnSuccess className="flex gap-2">
              <input type="hidden" name="id" value={id} />
              <input name="email" type="email" required placeholder="client@business.com" className="field" />
              <SubmitButton pending="Sending…" className="shrink-0">Invite</SubmitButton>
            </ActionForm>
            <p className="mt-2 text-xs text-ash">They get an email link; no password needed. Portal: /portal/{w.slug}</p>
          </Section>
          <Section title="People with access" count={(members ?? []).filter((m) => !m.revoked_at).length}>
            <div className="grid gap-3">
              {(members ?? []).map((m) => {
                const p = normalizePermissions(m.permissions);
                return (
                  <details key={m.id} className="rounded-2xl border border-rule p-4">
                    <summary className="flex cursor-pointer list-none items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{m.invited_email}</span>
                      <span className={`text-xs ${m.revoked_at ? "text-danger" : m.user_id ? "text-success" : "text-attention"}`}>{m.revoked_at ? "revoked" : m.user_id ? "active" : "invited"}</span>
                    </summary>
                    <ActionForm action={updateMember} className="mt-3">
                      <input type="hidden" name="member" value={m.id} />
                      {PERMISSION_KEYS.map((k) => <Toggle key={k} name={`perm_${k}`} label={PERMISSION_LABEL[k]} defaultChecked={p[k]} />)}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <SubmitButton name="intent" value="save">Save</SubmitButton>
                        {m.revoked_at ? <SubmitButton variant="ghost" name="intent" value="restore">Restore access</SubmitButton> : <SubmitButton variant="danger" name="intent" value="revoke">Revoke access</SubmitButton>}
                      </div>
                    </ActionForm>
                  </details>
                );
              })}
              {!(members ?? []).length ? <p className="text-sm text-ash">Nobody invited yet.</p> : null}
            </div>
          </Section>
        </>
      ) : null}

      {tab === "channels" ? (
        <>
          <Section title="Connected to this client" count={channels?.length ?? 0}>
            <ul className="grid gap-2">
              {(channels ?? []).map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-rule px-4 py-3">
                  <PlatformTag platform={c.platform} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.is_disconnected ? (
                    <span className="text-xs text-danger">{c.provider === "buffer" ? "disconnected in Buffer" : "signed out"}</span>
                  ) : (
                    <span className="text-xs text-ash">{c.provider === "buffer" ? `synced ${formatAgo(c.synced_at)}` : "direct"}</span>
                  )}
                  <ActionForm action={mapChannel}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="channel" value={c.buffer_channel_id} />
                    <SubmitButton variant="ghost" name="intent" value="unmap" className="h-9 text-xs">Remove</SubmitButton>
                  </ActionForm>
                </li>
              ))}
              {!(channels ?? []).length ? <p className="text-sm text-ash">No channels yet. Connect YouTube directly, or pick from Buffer below.</p> : null}
            </ul>
          </Section>
          <Section title="YouTube, direct">
            {yt && YT_RESULT[yt] ? <div className="mb-3"><Notice tone={YT_RESULT[yt].tone}>{YT_RESULT[yt].text}</Notice></div> : null}
            <p className="mb-3 text-sm text-ash">
              Uploads straight to YouTube, no Buffer. Sign in with the Google account that owns {w.is_agency ? "your" : `${w.name}'s`} channel, or one the client added as a channel manager.
            </p>
            {youtubeApp() ? (
              // A plain link: this leaves the app for Google's sign-in page.
              <a href={`/api/youtube/connect?ws=${id}`} className="press inline-flex h-11 items-center gap-2 rounded-full bg-bone px-5 text-sm font-medium text-ink">
                {(channels ?? []).some((c) => c.provider === "youtube") ? "Connect another YouTube channel" : "Connect YouTube"}
              </a>
            ) : (
              <Notice tone="neutral">Not set up on the server yet: the owner adds the Google app keys once (docs/YOUTUBE.md, about 10 minutes).</Notice>
            )}
          </Section>
          <Section title="Instagram, direct">
            {ig && IG_RESULT[ig] ? <div className="mb-3"><Notice tone={IG_RESULT[ig].tone}>{IG_RESULT[ig].text}</Notice></div> : null}
            <p className="mb-3 text-sm text-ash">
              Posts Reels straight to Instagram, no Buffer. Needs a Professional (Creator or Business) account. Your own accounts work right away; a client&apos;s account needs Meta to approve the app first.
            </p>
            {instagramApp() ? (
              // A plain link: this leaves the app for Instagram's sign-in page.
              <a href={`/api/instagram/connect?ws=${id}`} className="press inline-flex h-11 items-center gap-2 rounded-full bg-bone px-5 text-sm font-medium text-ink">
                {(channels ?? []).some((c) => c.provider === "instagram") ? "Connect another Instagram account" : "Connect Instagram"}
              </a>
            ) : (
              <Notice tone="neutral">Not set up on the server yet: the owner adds the Meta app keys once (docs/INSTAGRAM.md, about 15 minutes).</Notice>
            )}
          </Section>
          <Section title="Available in Buffer">
            {bufferError ? <Notice tone="danger">{bufferError}</Notice> : null}
            <ul className="grid gap-2">
              {remote.filter((r) => !mapped.has(r.id)).map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-rule px-4 py-3">
                  <PlatformTag platform={platformFromService(r.platform)} />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  {takenElsewhere.has(r.id) ? (
                    <span className="text-xs text-ash">another client</span>
                  ) : (
                    <ActionForm action={mapChannel}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="channel" value={r.id} />
                      <SubmitButton name="intent" value="map" className="h-9 text-xs">Use for {w.name}</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
              {!remote.length && !bufferError ? <p className="text-sm text-ash">No Buffer channels found. Add BUFFER_API_KEY on the server, or a client key below.</p> : null}
            </ul>
          </Section>
          <Section title="Buffer account">
            <ActionForm action={saveBufferKey} className="grid gap-2">
              <input type="hidden" name="id" value={id} />
              <p className="text-sm text-ash">{hasKey ? "This client uses its own Buffer account (key stored, hidden)." : `Uses the ${AGENCY_NAME} Buffer account.`} Only add a key if the client owns their Buffer.</p>
              <input name="buffer_key" type="password" autoComplete="off" placeholder="Client Buffer API key (leave empty to use the agency account)" className="field" />
              <SubmitButton variant="ghost">Save Buffer account</SubmitButton>
            </ActionForm>
          </Section>
        </>
      ) : null}

      {tab === "styles" ? (
        <StylesTab workspaceId={id} presets={(presetRows ?? []).map((p) => ({ ...p, refs: (presetRefs ?? []).filter((m) => m.preset_id === p.id).length }))} />
      ) : null}

      {tab === "brand" ? <BrandTab workspaceId={id} name={w.name} assets={brandAssets} /> : null}
      {tab === "projects" ? (
        <ProjectsTab
          workspaceId={id}
          assets={brandAssets}
          projects={(projectRows ?? []).map((p) => ({ ...p, videos: (projectJobs ?? []).filter((j) => j.project_id === p.id).length }))}
        />
      ) : null}

      {tab === "settings" ? (
        <>
          <ClientForm ws={w} action={updateClientWorkspace} submit="Save settings" />
          {!w.is_agency ? (
            <ActionForm action={archiveClient} className="mt-6">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="archive" value={w.archived_at ? "0" : "1"} />
              <SubmitButton variant={w.archived_at ? "ghost" : "danger"} className="w-full">{w.archived_at ? "Restore client" : "Archive client and revoke portal access"}</SubmitButton>
            </ActionForm>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
