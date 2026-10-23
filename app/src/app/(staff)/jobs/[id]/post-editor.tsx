"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { PlatformTag, PostPill } from "@/components/ui";
import { copyProblems, composeText } from "@/lib/domain/captions";
import type { Platform } from "@/lib/domain/types";
import type { ActionState } from "@/lib/forms";
import { regenerateCaption, savePost } from "./actions";

export type PostRow = {
  id: string;
  platform: string;
  caption: string | null;
  hashtags: string[];
  cta: string | null;
  title: string | null;
  description: string | null;
  scheduled_at: string | null;
  slot_source: string | null;
  status: string;
  last_error: string | null;
  channel_id: string | null;
  buffer_post_id: string | null;
  caption_source: string;
  whenLocal: string;
};

/** One card per platform: copy, time, channel, then Approve & schedule. Everything is overridable. */
export function PostEditor({ post, channels }: { post: PostRow; channels: { id: string; name: string; platform: string; is_disconnected: boolean }[] }) {
  const [state, action] = useActionState(savePost, {} as ActionState);
  const [regenState, regen] = useActionState(regenerateCaption, {} as ActionState);
  const locked = Boolean(post.buffer_post_id) && post.status !== "failed";
  const mine = channels.filter((c) => c.platform === post.platform);
  const problems = copyProblems(post.platform as Platform, { caption: post.caption ?? "", hashtags: post.hashtags, cta: post.cta, title: post.title, description: post.description });
  const length = composeText(post.platform as Platform, { caption: post.caption ?? "", hashtags: post.hashtags, cta: post.cta, title: post.title, description: post.description }).length;

  return (
    <div className="rounded-2xl border border-rule p-4">
      <div className="mb-3 flex items-center gap-2">
        <PlatformTag platform={post.platform} />
        <span className="text-xs text-ash">{post.caption_source === "bridge" ? "caption from editor" : post.caption_source === "server" ? "AI caption" : post.caption_source === "template" ? "template caption" : "edited"}</span>
        <span className="ml-auto"><PostPill status={post.status} /></span>
      </div>
      {post.last_error ? <p className="mb-3 text-sm text-danger">{post.last_error}</p> : null}
      <form action={action} className="grid gap-3">
        <input type="hidden" name="post" value={post.id} />
        {post.platform === "youtube" ? <input name="title" defaultValue={post.title ?? ""} placeholder="YouTube title" className="field" disabled={locked} maxLength={100} /> : null}
        <textarea name="caption" defaultValue={post.caption ?? ""} className="field min-h-28" disabled={locked} placeholder="Caption" />
        {post.platform === "youtube" ? <textarea name="description" defaultValue={post.description ?? ""} className="field" disabled={locked} placeholder="YouTube description" /> : null}
        <input name="cta" defaultValue={post.cta ?? ""} placeholder="Call to action" className="field" disabled={locked} />
        <input name="hashtags" defaultValue={post.hashtags.join(" ")} placeholder="#hashtags" className="field" disabled={locked} />
        <p className="tabular text-xs text-ash">{length} characters{problems.length ? ` · ${problems.join(" ")}` : ""}</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-ash">{post.slot_source === "auto" ? "Auto slot" : "Time"}</span>
            <input type="datetime-local" name="when" defaultValue={post.whenLocal} className="field" disabled={locked} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ash">Channel</span>
            <select name="channel" defaultValue={post.channel_id ?? ""} className="field" disabled={locked}>
              <option value="">None</option>
              {mine.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.is_disconnected ? " (disconnected)" : ""}</option>
              ))}
            </select>
          </label>
        </div>
        {!locked && post.status !== "cancelled" && post.status !== "published" ? (
          <div className="grid grid-cols-2 gap-2">
            <SubmitButton variant="ghost" name="intent" value="save">Save</SubmitButton>
            <SubmitButton name="intent" value="approve" pending="Scheduling…">{post.status === "failed" ? "Retry" : "Approve & schedule"}</SubmitButton>
            <SubmitButton variant="ghost" name="intent" value="cancel" className="col-span-2 h-10 border-0 text-ash">Don’t post here</SubmitButton>
          </div>
        ) : null}
        <FormMessage state={state} />
      </form>
      {!locked && post.status !== "published" ? (
        <form action={regen} className="mt-2">
          <input type="hidden" name="post" value={post.id} />
          <SubmitButton variant="ghost" pending="Writing…" className="h-9 border-0 px-0 text-xs text-mist">Rewrite caption</SubmitButton>
          <FormMessage state={regenState} />
        </form>
      ) : null}
    </div>
  );
}
