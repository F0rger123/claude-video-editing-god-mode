import { ActionForm, SubmitButton, Toggle } from "@/components/form";
import { ButtonLink, Section } from "@/components/ui";
import { archivePreset, savePreset } from "../style-actions";

type Preset = { id: string; kind: "captions" | "sound" | "edit"; name: string; instructions: string | null; is_default: boolean; refs: number };

const KINDS = [
  { kind: "captions", title: "Caption styles", example: "e.g. Bold white, one word at a time, yellow keyword, bottom third" },
  { kind: "sound", title: "Sound effects", example: "e.g. Whoosh on cuts, soft click on text, no music" },
  { kind: "edit", title: "Editing styles", example: "e.g. Fast zoom cuts, film burns on key moments, B-roll every point" },
] as const;

/** Per-client styles with reference files. Uploads can pick one, or leave it to Claude. */
export function StylesTab({ workspaceId, presets }: { workspaceId: string; presets: Preset[] }) {
  return (
    <div>
      <p className="mb-5 text-sm text-ash">
        Save the looks this client likes. Each upload can pick one, or leave it to Claude, who then uses the brand profile, the client&apos;s inspiration and what you approved before.
      </p>
      {KINDS.map(({ kind, title, example }) => (
        <Section key={kind} title={title} count={presets.filter((p) => p.kind === kind).length}>
          <div className="grid gap-3">
            {presets.filter((p) => p.kind === kind).map((p) => (
              <details key={p.id} className="rounded-2xl border border-rule p-4">
                <summary className="flex cursor-pointer list-none items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  {p.is_default ? <span className="t-label">default</span> : null}
                  <span className="text-xs text-ash">{p.refs} reference{p.refs === 1 ? "" : "s"}</span>
                </summary>
                <ActionForm action={savePreset} className="mt-3 grid gap-2">
                  <input type="hidden" name="workspace" value={workspaceId} />
                  <input type="hidden" name="preset" value={p.id} />
                  <input type="hidden" name="kind" value={kind} />
                  <input name="name" defaultValue={p.name} className="field" />
                  <textarea name="instructions" defaultValue={p.instructions ?? ""} placeholder={example} className="field" />
                  <Toggle name="is_default" label="Use by default for new uploads" defaultChecked={p.is_default} />
                  <SubmitButton variant="ghost">Save</SubmitButton>
                </ActionForm>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <ButtonLink href={`/upload?preset=${p.id}`} variant="ghost" icon="image" className="h-10 text-xs">Add references</ButtonLink>
                  <ActionForm action={archivePreset}>
                    <input type="hidden" name="preset" value={p.id} />
                    <SubmitButton variant="ghost" className="h-10 w-full border-0 text-xs text-ash">Remove</SubmitButton>
                  </ActionForm>
                </div>
              </details>
            ))}
            <details className="rounded-2xl border border-dashed border-rule p-4">
              <summary className="cursor-pointer list-none text-sm font-medium">+ New {title.toLowerCase().replace(/s$/, "")}</summary>
              <ActionForm action={savePreset} resetOnSuccess className="mt-3 grid gap-2">
                <input type="hidden" name="workspace" value={workspaceId} />
                <input type="hidden" name="kind" value={kind} />
                <input name="name" required placeholder="Name" className="field" />
                <textarea name="instructions" placeholder={example} className="field" />
                <Toggle name="is_default" label="Use by default for new uploads" />
                <SubmitButton>Save style</SubmitButton>
              </ActionForm>
            </details>
          </div>
        </Section>
      ))}
    </div>
  );
}
