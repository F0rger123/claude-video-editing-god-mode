import { AGENCY_NAME } from "@/lib/brand";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "How it works" };

function Step({ n, title, done, href, cta, children }: { n: number; title: string; done?: boolean; href?: string; cta?: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className={`tabular grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold ${done ? "border-success bg-success text-ink" : "border-rule-strong"}`}>{done ? "✓" : Number.isInteger(n) ? n : "↳"}</span>
      <div className="min-w-0 flex-1 pb-6">
        <p className="font-semibold">{title}</p>
        <div className="mt-1 text-sm leading-6 text-mist">{children}</div>
        {href && cta ? <Link href={href} className="press mt-2 inline-flex h-10 items-center rounded-full border border-rule-strong px-4 text-sm font-semibold hover:border-bone">{cta}</Link> : null}
      </div>
    </li>
  );
}

/** The whole process in order, with live checkmarks for the one-time setup. */
export default async function GuidePage() {
  const supabase = await createClient();
  const [{ data: editor }, { count: channels }, { count: clients }, { data: agency }] = await Promise.all([
    supabase.from("content_integrations").select("status").eq("kind", "editor").is("workspace_id", null).maybeSingle(),
    supabase.from("content_channels").select("id", { count: "exact", head: true }),
    supabase.from("content_workspaces").select("id", { count: "exact", head: true }).eq("is_agency", false),
    supabase.from("content_workspaces").select("id").eq("is_agency", true).maybeSingle(),
  ]);
  const bufferKey = Boolean(process.env.BUFFER_API_KEY);

  return (
    <div>
      <PageHeader title="How it works" meta="Set up once, then add clients in a few minutes each." />

      <h2 className="t-title mb-4">Once, for everything</h2>
      <ol>
        <Step n={1} title="Install the app on your phone" href="/install" cta="Install">
          It installs from the website to your home screen. Send the same link to clients.
        </Step>
        <Step n={2} title="Connect the editing PC" done={editor?.status === "ok"} href="/settings" cta="Check status">
          The PC that runs your Herk Edit Kit runs a small bridge every 5 minutes (bridge/README.md). It hands videos to your editor
          through the same Google Drive folders you already use, and brings the finished edits back here.
        </Step>
        <Step n={3} title="Connect Buffer (one account for all clients)" done={bufferKey}>
          In Buffer, connect every social account you manage, yours and your clients&apos; (Instagram, TikTok, Facebook, YouTube…). Then
          create one Buffer API key and add it to the server as <code className="text-bone">BUFFER_API_KEY</code>. You do this once, not
          per client. Only if a client insists on their own Buffer do you paste their key on that client&apos;s Channels tab.
        </Step>
        <Step n={4} title="Set up your own brand" done={(channels ?? 0) > 0} href={agency ? `/clients/${agency.id}?tab=channels` : "/clients"} cta={`${AGENCY_NAME} channels`}>
          {AGENCY_NAME} is already in full auto. Pick its Instagram, TikTok and other accounts under Channels, add caption, sound and
          editing styles under Styles, and turn on script ideas. Want to approve before posting? Settings → turn on “Final post approval”.
        </Step>
      </ol>

      <h2 className="t-title mb-4 mt-4">For each new client</h2>
      <ol>
        <Step n={1} title="Add the client" done={(clients ?? 0) > 0} href="/clients/new" cta="Add client">
          A step-by-step form: business, brand guidelines, which social accounts they post to, what they can see and do, when Claude
          starts editing (wait for you, or edit raw clips automatically), approvals, package limits (for example 5 videos a week) and
          the posting schedule (for example one post a week at 12:00).
        </Step>
        <Step n={2} title="Pick their social accounts">
          On the client&apos;s Channels tab, tap each of their accounts that is already in Buffer. An account can belong to only one client,
          so nothing can post to the wrong page.
        </Step>
        <Step n={3} title="Save their styles and materials">
          On the Styles tab, name the caption looks, sound effects and editing styles they like and add references: screenshots,
          screen recordings or Instagram links. Sound effects, film burns, LUTs and fonts go in the Library (upload, link, or a path on
          the editing PC). Uploads pick exact items, or say “Let Claude decide”.
        </Step>
        <Step n={4} title="Invite them (optional)">
          On the Portal tab, invite their email. They sign in with an emailed link and see only what you switched on: upload, drafts,
          comments, approvals, calendar, published posts, script ideas.
        </Step>
      </ol>

      <h2 className="t-title mb-4 mt-4">Every day</h2>
      <ol>
        <Step n={1} title="Ideas" href="/scripts" cta="Get ideas">
          Tap Short-form or Long-form ideas, pick a style (story, how-to, case study…) and an optional topic. Claude writes complete
          ideas: hook, script or outline, shots, caption, thumbnail text. Swipe right to like, left to pass; each batch learns from you.
          Clients can do the same if you allow it, with a monthly limit you set per client.
        </Step>
        <Step n={1.5} title="Record with the script on screen" href="/scripts" cta="Ready to record">
          On a saved idea, tap Record now: the camera opens with the script scrolling as a teleprompter. Use the take, and it goes
          straight into the upload.
        </Step>
        <Step n={2} title="Record and upload" href="/upload" cta="Upload">
          Short-form or long-form, all takes and B-roll in one go, plus reference screenshots, recordings or links, the style, and when
          to post. Clients upload from their portal the same way.
        </Step>
        <Step n={3} title="Claude edits">
          Depending on the client&apos;s rules, editing starts right away or waits in your Inbox for a tap. Each video shows its progress:
          Queued, Editing, Rendering, Review.
        </Step>
        <Step n={4} title="Review on your phone" href="/inbox" cta="Inbox">
          Watch it, add notes at exact moments, then Approve, Fix it (Claude edits again from your notes), ask for a re-record, or Delete.
          Your own brand skips this unless you turned approvals on.
        </Step>
        <Step n={5} title="It posts">
          Captions are written per platform in the client&apos;s voice, the time comes from the posting rules (or right after editing, or a
          set time), and Buffer publishes. Failures show up on Today with a retry button.
        </Step>
      </ol>
    </div>
  );
}
