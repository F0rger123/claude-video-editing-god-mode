"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { Logo } from "@/components/logo";

export function NewPasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    const { error: e } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (e) {
      haptic("error");
      return setError(/same/i.test(e.message) ? "That's your current password. Choose a new one." : /weak|short/i.test(e.message) ? "Choose a longer password." : e.message);
    }
    haptic("success");
    setDone(true);
    setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 1200);
  }

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="page-in mb-10">
        <Logo />
      </div>
      <h1 className="page-in t-title">Choose a new password</h1>
      <p className="page-in mt-1 text-sm text-mist">For {email}.</p>
      <form onSubmit={submit} className="page-in mt-6 grid gap-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">New password</span>
          <span className="relative block">
            <input type={show ? "text" : "password"} required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field h-14 pr-20" />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="press absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-full px-3 text-sm text-mist hover:text-bone">
              {show ? "Hide" : "Show"}
            </button>
          </span>
          <span className={`mt-1.5 block text-xs ${tooShort ? "text-attention" : "text-ash"}`}>At least 8 characters.</span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Type it again</span>
          <input type={show ? "text" : "password"} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field h-14" />
          {mismatch ? <span className="mt-1.5 block text-xs text-attention">Doesn&apos;t match yet.</span> : null}
        </label>
        <button type="submit" disabled={busy || done} className="press mt-2 h-14 w-full rounded-full bg-bone text-base font-semibold text-ink disabled:opacity-60">
          {done ? "Saved" : busy ? "Saving…" : "Save new password"}
        </button>
      </form>
      {error ? <p role="alert" className="mt-5 text-center text-sm text-danger">{error}</p> : null}
      {done ? <p role="status" className="mt-5 text-center text-sm text-success">Password changed. Taking you in…</p> : null}
    </main>
  );
}
