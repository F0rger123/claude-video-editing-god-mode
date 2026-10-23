import { ActionForm, SubmitButton } from "@/components/form";
import { ButtonLink, EmptyState } from "@/components/ui";
import { addIdea } from "@/app/actions/scripts";
import { IdeaDetail, type IdeaFull } from "@/components/idea-detail";

type Saved = IdeaFull & { id: string; status: string; job_id: string | null };

/** Liked / saved ideas ready to record, plus "add my own idea". Shared by staff and portal. */
export function IdeaLibrary({ workspaceId, ideas, uploadHref, jobHref, canAdd }: { workspaceId: string; ideas: Saved[]; uploadHref: string; jobHref: string; canAdd: boolean }) {
  return (
    <div className="grid gap-3">
      {ideas.length ? (
        ideas.map((i) => (
          <details key={i.id} className="rounded-2xl border border-rule p-4">
            <summary className="flex cursor-pointer list-none items-start gap-3">
              <span className="min-w-0 flex-1 font-medium">{i.hook}</span>
              <span className="shrink-0 text-xs text-ash">{i.status === "recorded" ? "recorded" : i.form === "short" ? "short" : "long"}</span>
            </summary>
            <div className="mt-4"><IdeaDetail idea={i} /></div>
            <div className="mt-3">
              {i.job_id ? (
                <ButtonLink href={`${jobHref}${i.job_id}`} variant="ghost" className="h-10 w-full text-xs">See the video</ButtonLink>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <ButtonLink href={`${uploadHref}?script=${i.id}&record=1`} icon="film" className="h-11">Record now</ButtonLink>
                  <ButtonLink href={`${uploadHref}?script=${i.id}`} variant="ghost" icon="upload" className="h-11">Upload a take</ButtonLink>
                </div>
              )}
            </div>
          </details>
        ))
      ) : (
        <EmptyState title="Nothing saved yet." body="Swipe right or tap ★ on ideas you want to film." />
      )}
      {canAdd ? (
        <details className="rounded-2xl border border-dashed border-rule p-4">
          <summary className="cursor-pointer list-none text-sm font-medium">+ Add my own idea</summary>
          <ActionForm action={addIdea} resetOnSuccess className="mt-3 grid gap-2">
            <input type="hidden" name="workspace" value={workspaceId} />
            <input name="hook" required placeholder="The hook (first line)" className="field" maxLength={400} />
            <textarea name="script" placeholder="Script or notes (optional)" className="field" />
            <select name="form" className="field" defaultValue="short">
              <option value="short">Short-form</option>
              <option value="long">Long-form</option>
            </select>
            <SubmitButton>Save idea</SubmitButton>
          </ActionForm>
        </details>
      ) : null}
    </div>
  );
}
