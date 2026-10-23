import { AGENCY_NAME } from "@/lib/brand";
import { ActionForm, SubmitButton, Toggle } from "@/components/form";
import { StepGroups } from "@/components/step-groups";
import { PERMISSION_KEYS, PERMISSION_LABEL, normalizePermissions } from "@/lib/domain/permissions";
import { PLATFORMS, PLATFORM_LABEL, type Workspace } from "@/lib/domain/types";
import type { ActionState } from "@/lib/forms";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-rule p-4">
      <legend className="px-1 text-base font-semibold tracking-tight">{title}</legend>
      {hint ? <p className="-mt-1 mb-3 text-sm text-ash">{hint}</p> : null}
      <div className="grid gap-3">{children}</div>
    </fieldset>
  );
}

function Num({ name, label, value, suffix }: { name: string; label: string; value?: number; suffix?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ash">{label}</span>
      <div className="flex items-center gap-2">
        <input name={name} type="number" min={0} inputMode="numeric" defaultValue={value ?? ""} placeholder="No limit" className="field" />
        {suffix ? <span className="shrink-0 text-xs text-ash">{suffix}</span> : null}
      </div>
    </label>
  );
}

/**
 * One form for Add client (as a step-by-step wizard) and client settings (all sections at once),
 * in the order decisions are made: who → brand → accounts → access → editing → approvals →
 * limits → schedule → scripts.
 */
export function ClientForm({ ws, action, submit, wizard = false }: { ws?: Partial<Workspace> & { id?: string }; action: (s: ActionState, f: FormData) => Promise<ActionState>; submit: string; wizard?: boolean }) {
  const b = ws?.brand_profile ?? {};
  const pkg = ws?.package ?? {};
  const rules = ws?.approval_rules ?? { edit_approval: true, caption_approval: true };
  const cond = ws?.conditional_rules ?? {};
  const sched = ws?.schedule_rules ?? {};
  const perms = normalizePermissions(ws?.default_permissions);
  const platforms = ws?.allowed_platforms ?? ["instagram", "facebook", "tiktok", "youtube"];

  const groups = [
    <Group key="business" title="Business">
      <input name="name" required defaultValue={ws?.name} placeholder="Client / business name" className="field" maxLength={120} />
      <input name="contact_email" type="email" defaultValue={ws?.contact_email ?? ""} placeholder="Contact email" className="field" />
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-ash">Logo</span>
        <input name="logo" type="file" accept="image/*" className="block w-full text-sm text-mist file:mr-3 file:rounded-full file:border-0 file:bg-graphite file:px-4 file:py-2 file:text-bone" />
      </label>
      {!ws?.id ? <input name="slug" placeholder="Portal link name (optional, e.g. dhauss)" className="field" /> : null}
      <input name="timezone" defaultValue={ws?.timezone ?? "America/New_York"} className="field" aria-label="Timezone" />
    </Group>,

    <Group key="brand" title="Brand & guidelines" hint="Claude reads this for every edit and every caption.">
      <textarea name="brand_about" defaultValue={b.about} placeholder="Who the videos are for, what the business does" className="field" />
      <input name="brand_handle" defaultValue={b.handle} placeholder="Main handle (@…)" className="field" />
      <textarea name="brand_voice" defaultValue={b.voice} placeholder="Voice: e.g. friendly, expert, no slang" className="field min-h-20" />
      <div className="grid grid-cols-2 gap-2">
        <input name="brand_colors" defaultValue={b.colors} placeholder="Colors" className="field" />
        <input name="brand_fonts" defaultValue={b.fonts} placeholder="Fonts" className="field" />
      </div>
      <textarea name="brand_always" defaultValue={b.always} placeholder="Always do" className="field min-h-20" />
      <textarea name="brand_never" defaultValue={b.never} placeholder="Never do" className="field min-h-20" />
      <input name="brand_cta" defaultValue={b.cta} placeholder="Default call to action" className="field" />
      <input name="brand_hashtags" defaultValue={b.hashtags} placeholder="Brand hashtags" className="field" />
      <p className="text-xs text-ash">Caption, sound-effect and editing styles (with reference screenshots or recordings) go in the client&apos;s Styles tab after saving.</p>
    </Group>,

    <Group key="platforms" title="Social accounts" hint="Where this client posts. Each account is connected under Channels after saving.">
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => (
          <label key={p}>
            <input type="checkbox" name="platforms" value={p} defaultChecked={platforms.includes(p)} className="sr-only" />
            <span className="chip press">{PLATFORM_LABEL[p]}</span>
          </label>
        ))}
      </div>
      <input name="posting_frequency" defaultValue={ws?.posting_frequency ?? ""} placeholder="Posting frequency (e.g. 4 reels a week)" className="field" />
    </Group>,

    <Group key="access" title="Who can see and do what" hint="What the client's private portal can do. Each switch is independent.">
      <select name="access_mode" defaultValue={ws?.access_mode ?? "agency_only"} className="field">
        <option value="agency_only">Agency only: no client portal</option>
        <option value="client_upload">Client upload: they send footage and notes</option>
        <option value="client_collab">Collaboration: drafts, feedback, approvals, calendar, scripts</option>
      </select>
      <div>
        {PERMISSION_KEYS.map((k) => (
          <Toggle key={k} name={`perm_${k}`} label={PERMISSION_LABEL[k]} defaultChecked={perms[k]} hint={k === "can_trigger_editing" ? "Their raw clips start editing without waiting for you" : undefined} />
        ))}
      </div>
    </Group>,

    <Group key="automation" title="When Claude starts editing" hint="Decided before any editing time is spent.">
      <select name="automation_mode" defaultValue={ws?.automation_mode ?? "manual"} className="field">
        <option value="manual">Wait for me: I approve every upload first</option>
        <option value="auto">Auto edit: raw clips start editing right away</option>
        <option value="conditional">Conditional: start only when the rules below pass</option>
        <option value="full_auto">Full auto: edit, caption, schedule, publish</option>
      </select>
      <div>
        <Toggle name="rule_require_quota" label="Only while package quota remains" defaultChecked={cond.require_quota} />
        <Toggle name="rule_short_only" label="Short-form only" defaultChecked={cond.short_form_only} />
        <Toggle name="rule_agency_only" label={`Only uploads from ${AGENCY_NAME}`} defaultChecked={cond.agency_uploads_only} />
        <Toggle name="rule_require_reference" label="Reference required" defaultChecked={cond.require_reference} />
        <Toggle name="rule_trusted" label="Trusted client" defaultChecked={cond.trusted_client ?? true} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Num name="rule_max_minutes" label="Max source length" value={cond.max_duration_minutes} suffix="min" />
        <label className="block">
          <span className="mb-1 block text-xs text-ash">Auto categories</span>
          <input name="rule_categories" defaultValue={cond.categories?.join(", ")} placeholder="e.g. tips, promo" className="field" />
        </label>
      </div>
    </Group>,

    <Group key="approvals" title="Approvals and posting">
      <div>
        <Toggle name="edit_approval" label="Edit approval required" defaultChecked={rules.edit_approval !== false} hint="Off + full auto: approved by itself" />
        <Toggle name="client_review" label="Client approves edits too" defaultChecked={rules.client_review} hint="Needs Collaboration access" />
        <Toggle name="caption_approval" label="Caption approval required" defaultChecked={rules.caption_approval !== false} />
        <Toggle name="final_post_approval" label="Final post approval required" defaultChecked={rules.final_post_approval} />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-ash">When approved videos post</span>
        <select name="default_post_timing" defaultValue={ws?.default_post_timing ?? "auto_slot"} className="field">
          <option value="auto_slot">Best open slot from the schedule</option>
          <option value="after_edit">Right after editing is approved</option>
          <option value="fixed">At a set time of day</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-ash">Set time (for “at a set time of day”)</span>
        <input type="time" name="default_post_time" defaultValue={ws?.default_post_time ?? "12:00"} className="field" />
      </label>
    </Group>,

    <Group key="package" title="Package limits" hint="Counts edited videos, not raw files. Empty = no limit.">
      <div className="grid grid-cols-2 gap-2">
        <Num name="videos_per_week" label="Videos / week" value={pkg.videos_per_week} />
        <Num name="short_per_month" label="Short-form / month" value={pkg.short_per_month} />
        <Num name="long_per_month" label="Long-form / month" value={pkg.long_per_month} />
        <Num name="revision_rounds" label="Revision rounds" value={pkg.revision_rounds} />
        <Num name="max_video_minutes" label="Max video length" value={pkg.max_video_minutes} suffix="min" />
        <Num name="max_simultaneous_jobs" label="Jobs editing at once" value={pkg.max_simultaneous_jobs} />
        <Num name="turnaround_days" label="Turnaround target" value={pkg.turnaround_days} suffix="days" />
      </div>
      <select name="overage_behavior" defaultValue={ws?.overage_behavior ?? "require_owner_approval"} className="field">
        <option value="require_owner_approval">Over limit: wait for my approval</option>
        <option value="warn">Over limit: warn, continue</option>
        <option value="allow_billable">Over limit: continue and flag billable</option>
        <option value="block">Over limit: block</option>
      </select>
    </Group>,

    <Group key="schedule" title="Posting schedule" hint="Used to pick times automatically. You can always override a time.">
      <div className="flex flex-wrap gap-2">
        {DAYS.map((d, i) => (
          <label key={d}>
            <input type="checkbox" name="days" value={i} defaultChecked={sched.preferred_days?.length ? sched.preferred_days.includes(i) : i >= 1 && i <= 5} className="sr-only" />
            <span className="chip press">{d}</span>
          </label>
        ))}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-ash">Preferred windows (24h, comma separated)</span>
        <input name="windows" defaultValue={(sched.windows ?? [{ start: "09:00", end: "11:00" }, { start: "17:00", end: "19:00" }]).map((w) => `${w.start}-${w.end}`).join(", ")} className="field" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Num name="max_posts_per_week" label="Max posts / week" value={sched.max_posts_per_week} suffix="per account" />
        <Num name="max_posts_per_day" label="Max posts / day" value={sched.max_posts_per_day ?? 2} />
        <Num name="min_gap_minutes" label="Min gap between posts" value={sched.min_gap_minutes ?? 120} suffix="min" />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-ash">Blackout dates</span>
        <input name="blackout" defaultValue={sched.blackout_dates?.join(" ")} placeholder="2026-12-25 2026-12-31" className="field" />
      </label>
    </Group>,

    <Group key="scripts" title="Script ideas & editor" hint="Claude writes hook and script ideas that you (and the client, if allowed) swipe through.">
      <div>
        <Toggle name="scripts_enabled" label="Write script ideas for this client" defaultChecked={ws?.scripts_enabled} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Num name="scripts_per_batch" label="Ideas per automatic batch" value={ws?.scripts_per_batch ?? 6} />
        <Num name="ideas_per_request" label="Ideas per button press" value={ws?.ideas_per_request ?? 5} />
      </div>
      <Num name="idea_requests_per_month" label="Client idea requests per month" value={ws?.idea_requests_per_month ?? 4} suffix="(needs “Ask Claude for content ideas”)" />
      <label className="block">
        <span className="mb-1 block text-xs text-ash">Editor brand folder on Google Drive</span>
        <input name="editor_brand_folder" defaultValue={ws?.editor_brand_folder ?? ""} placeholder={ws?.name ? `Defaults to “${ws.name}”` : "Defaults to the client name"} className="field" />
      </label>
    </Group>,
  ];
  const titles = ["Business", "Brand", "Accounts", "Access", "Editing", "Approvals", "Limits", "Schedule", "Scripts"];
  const button = <SubmitButton className="h-14 w-full text-base shadow-[0_12px_40px_-12px_rgb(0_0_0)]">{submit}</SubmitButton>;

  return (
    <ActionForm action={action} className="grid gap-5">
      {ws?.id ? <input type="hidden" name="id" value={ws.id} /> : null}
      {wizard ? (
        <StepGroups titles={titles} submit={button}>{groups}</StepGroups>
      ) : (
        <>
          {groups}
          <div className="pb-safe sticky bottom-16 z-20 -mx-4 bg-gradient-to-t from-ink via-ink/95 to-transparent px-4 pb-4 pt-6 md:bottom-0">{button}</div>
        </>
      )}
    </ActionForm>
  );
}
