/** Full content idea: everything needed to film it. Server-renderable. */
export type IdeaFull = {
  hook: string;
  title?: string | null;
  script?: string | null;
  outline?: string | null;
  broll?: string | null;
  thumbnail_text?: string | null;
  caption?: string | null;
  why?: string | null;
  style?: string | null;
  form: "short" | "long";
};

function Block({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <p className="t-label mb-1">{label}</p>
      <p className="whitespace-pre-wrap text-sm leading-6 text-mist">{children}</p>
    </div>
  );
}

export function IdeaDetail({ idea }: { idea: IdeaFull }) {
  return (
    <div className="grid gap-4">
      {idea.title ? <Block label="Title">{idea.title}</Block> : null}
      {idea.thumbnail_text ? <Block label="Thumbnail text">{idea.thumbnail_text}</Block> : null}
      {idea.script ? <Block label={idea.form === "long" ? "Intro (say this)" : "Script (say this)"}>{idea.script}</Block> : null}
      {idea.outline ? <Block label="Outline">{idea.outline}</Block> : null}
      {idea.broll ? <Block label="Shots / B-roll">{idea.broll}</Block> : null}
      {idea.caption ? <Block label="Caption">{idea.caption}</Block> : null}
      {idea.why ? <Block label="Why it works">{idea.why}</Block> : null}
    </div>
  );
}
