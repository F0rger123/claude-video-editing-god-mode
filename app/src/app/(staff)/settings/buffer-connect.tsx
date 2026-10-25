"use client";

import Link from "@/components/link";
import { useActionState, useRef, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { FormMessage } from "@/components/form";
import type { ActionState } from "@/lib/forms";
import { connectBuffer } from "./buffer-actions";

function Step({ n, title, body, children, doneStep }: { n: number; title: string; body: string; children: ReactNode; doneStep?: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={`tabular mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${doneStep ? "bg-success/20 text-success" : "bg-bone text-ink"}`}>{doneStep ? <Icon name="check" className="size-4" stroke={2.6} /> : n}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-ash">{body}</p>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}

/**
 * Connect Buffer from a phone in three taps: open Buffer (connect the social accounts), open the
 * key page, come back and tap "Paste & connect" (reads the copied key and connects straight away).
 */
export function BufferConnect({ connected, channels }: { connected: boolean; channels: number | null }) {
  const [state, action] = useActionState(connectBuffer, {} as ActionState);
  const [pending, start] = useTransition();
  const [manual, setManual] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const done = connected || Boolean(state.success && !state.success.startsWith("Buffer disconnected"));

  const submit = (key: string, intent = "connect") => {
    const fd = new FormData();
    fd.set("key", key);
    fd.set("intent", intent);
    setManual(false);
    start(() => action(fd));
  };

  async function pasteAndConnect() {
    setPasteError(null);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text.length < 10 || /\s/.test(text)) {
        setPasteError("That doesn't look like a Buffer key. Copy the key, then tap again.");
        return;
      }
      submit(text);
    } catch {
      setPasteError("Your phone didn't allow pasting. Type or paste the key below.");
      setManual(true);
      setTimeout(() => keyRef.current?.focus(), 50);
    }
  }

  return (
    <div id="buffer" className="scroll-mt-24 rounded-3xl border border-rule p-4">
      <div className="mb-4 flex items-center gap-3">
        <span className={`grid size-10 place-items-center rounded-2xl ${done ? "bg-success/15 text-success" : "bg-attention/15 text-attention"}`}>
          <Icon name={done ? "check" : "link"} className="size-5" />
        </span>
        <div>
          <p className="font-semibold">{done ? "Buffer is connected" : "Connect Buffer"}</p>
          <p className="text-sm text-ash">{done ? `${channels ?? "Your"} social accounts ready. Assign them on each client's Channels tab.` : "Once, about a minute. Posts then go out by themselves."}</p>
        </div>
      </div>

      {!done ? (
        <ol className="grid gap-4">
          <Step n={1} title="Connect your social accounts in Buffer" body="Instagram, TikTok, Facebook, YouTube… for you and each client.">
            <a href="https://publish.buffer.com" target="_blank" rel="noopener noreferrer" className="press inline-flex h-10 items-center gap-2 rounded-full border border-rule-strong px-4 text-sm">
              Open Buffer <Icon name="chevron" className="size-3.5" />
            </a>
          </Step>
          <Step n={2} title="Copy your API key" body="Sign in, tap Get API Key (or Create key), then Copy.">
            <a href="https://developers.buffer.com" target="_blank" rel="noopener noreferrer" className="press inline-flex h-10 items-center gap-2 rounded-full border border-rule-strong px-4 text-sm">
              Open the key page <Icon name="chevron" className="size-3.5" />
            </a>
          </Step>
          <Step n={3} title="Come back and connect" body="We check the key with Buffer, then keep it safely on the server.">
            <button type="button" onClick={pasteAndConnect} disabled={pending} className="press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-bone font-semibold text-ink disabled:opacity-60">
              <Icon name="key" className="size-4" /> {pending ? "Checking with Buffer…" : "Paste & connect"}
            </button>
            {pasteError ? <p className="mt-2 text-sm text-attention">{pasteError}</p> : null}
            {!manual ? (
              <button type="button" onClick={() => setManual(true)} className="press mt-1 h-9 text-xs text-mist underline underline-offset-4">Type the key instead</button>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); submit(keyRef.current?.value ?? ""); }} className="mt-2 flex gap-2">
                <input ref={keyRef} name="key" type="password" autoComplete="off" placeholder="Buffer API key" className="field h-12 min-w-0 flex-1" />
                <button disabled={pending} className="press h-12 shrink-0 rounded-full border border-rule-strong px-4 text-sm">Connect</button>
              </form>
            )}
          </Step>
        </ol>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Link href="/clients" className="press flex h-11 items-center justify-center gap-2 rounded-full bg-bone text-sm font-semibold text-ink">Assign to clients</Link>
          <button type="button" disabled={pending} onClick={() => setManual(!manual)} className="press h-11 rounded-full border border-rule-strong text-sm">Change key</button>
          {manual ? (
            <form onSubmit={(e) => { e.preventDefault(); submit(keyRef.current?.value ?? ""); }} className="col-span-2 mt-1 flex gap-2">
              <input ref={keyRef} type="password" autoComplete="off" placeholder="New Buffer API key" className="field h-12 min-w-0 flex-1" />
              <button disabled={pending} className="press h-12 shrink-0 rounded-full border border-rule-strong px-4 text-sm">Save</button>
            </form>
          ) : null}
          {manual ? (
            <button type="button" disabled={pending} onClick={() => submit("", "disconnect")} className="press col-span-2 h-10 text-xs text-ash hover:text-danger">Disconnect Buffer</button>
          ) : null}
        </div>
      )}
      <div className="mt-3"><FormMessage state={state} /></div>
    </div>
  );
}
