"use client";

import { AGENCY_NAME } from "@/lib/brand";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { Logo } from "@/components/logo";
import { Icon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { clearStoredScreens } from "@/components/pwa";
import { OFFER_DISMISSED, PasskeyLoginButton, savePasskeyHere, usePasskeySupport } from "@/components/passkeys";

type Mode = "password" | "link" | "reset";

/**
 * One simple sign-in screen.
 *   Fingerprint / face (passkey) when this phone has one saved — one tap, no typing.
 *   Email + password (with show/hide), or a one-tap emailed link for clients without a password.
 *   "Forgot password?" emails a link to set a new one.
 * After a password sign-in on a phone that can do it, we offer to turn on fingerprint sign-in.
 */
export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const router = useRouter();
  const { supported, savedHere } = usePasskeySupport();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>(linkError ? { error: "That link has expired. Send a new one." } : {});

  function go() {
    router.replace(next);
    router.refresh();
  }

  function switchMode(m: Mode) {
    setMode(m);
    setMessage({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage({});
    const supabase = createClient();
    const callback = (to: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(to)}`;

    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) {
        haptic("error");
        return setMessage({ error: /invalid login/i.test(error.message) ? "Email or password is wrong." : error.message });
      }
      haptic("success");
      clearStoredScreens();
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(OFFER_DISMISSED) === "1";
      } catch {
        // storage blocked
      }
      if (supported && !savedHere && !dismissed) return setOffer(true);
      return go();
    }

    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: callback("/reset-password") });
      setBusy(false);
      if (error) {
        haptic("error");
        return setMessage({ error: /rate limit|too many/i.test(error.message) ? "Too many emails sent. Wait a few minutes, then try again." : error.message });
      }
      haptic("success");
      // Same message whether or not the email has an account, so nobody can probe for accounts.
      return setMessage({ ok: `If ${email.trim()} has an account, a reset link is on its way. Open it on this phone.` });
    }

    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: callback(next) } });
    setBusy(false);
    if (error) {
      haptic("error");
      return setMessage({ error: /not allowed|signups not allowed|not found/i.test(error.message) ? `This email has no access yet. Ask ${AGENCY_NAME} for an invite.` : error.message });
    }
    haptic("success");
    setMessage({ ok: `Check ${email.trim()} for your sign-in link.` });
  }

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="page-in mb-10">
        <Logo />
      </div>

      {supported && mode !== "reset" ? (
        <div className="page-in mb-6 [animation-delay:60ms]">
          <PasskeyLoginButton next={next} primary={savedHere} />
          <div className="mt-6 flex items-center gap-3 text-xs text-ash">
            <span className="h-px flex-1 bg-rule" /> or use your email <span className="h-px flex-1 bg-rule" />
          </div>
        </div>
      ) : null}

      {mode === "reset" ? (
        <div className="page-in mb-6">
          <h1 className="t-title">Reset your password</h1>
          <p className="mt-1 text-sm text-mist">We email you a link. Tap it on this phone and choose a new password.</p>
        </div>
      ) : (
        <div className="page-in mb-6 grid grid-cols-2 gap-1 rounded-full border border-rule p-1 text-sm [animation-delay:90ms]">
          {(["password", "link"] as const).map((m) => (
            <button key={m} type="button" onClick={() => switchMode(m)} className={`press h-10 rounded-full ${mode === m ? "bg-bone font-semibold text-ink" : "text-mist"}`}>
              {m === "password" ? "Password" : "Email me a link"}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="page-in grid gap-4 [animation-delay:120ms]">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Email</span>
          <input type="email" required autoComplete="username" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} className="field h-14" />
        </label>
        {mode === "password" ? (
          <div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Password</span>
              <span className="relative block">
                <input type={show ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field h-14 pr-20" />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                  className="press absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-full px-3 text-sm text-mist hover:text-bone"
                >
                  {show ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            <button type="button" onClick={() => switchMode("reset")} className="press mt-2 h-9 text-sm text-mist underline-offset-4 hover:text-bone hover:underline">
              Forgot password?
            </button>
          </div>
        ) : mode === "link" ? (
          <p className="text-sm text-ash">We email you a link. Tap it on this phone and you are in. No password needed.</p>
        ) : null}
        <button type="submit" disabled={busy} className={`press h-14 w-full rounded-full text-base font-semibold disabled:opacity-50 ${supported && savedHere && mode === "password" ? "border border-rule-strong text-bone" : "bg-bone text-ink"}`}>
          {busy ? "One moment…" : mode === "password" ? "Sign in" : mode === "reset" ? "Email me a reset link" : "Send my link"}
        </button>
        {mode === "reset" ? (
          <button type="button" onClick={() => switchMode("password")} className="press h-10 text-sm text-mist">
            Back to sign in
          </button>
        ) : null}
      </form>

      {message.error ? <p role="alert" className="mt-5 text-center text-sm text-danger">{message.error}</p> : null}
      {message.ok ? <p role="status" className="mt-5 text-center text-sm text-success">{message.ok}</p> : null}

      <a href="/install" className="press mt-10 text-center text-sm text-mist underline underline-offset-4">Put the app on your phone</a>

      <Sheet open={offer} onClose={go} title="Faster sign-in">
        <div className="grid justify-items-center gap-4 pt-2 text-center">
          <span className="grid size-20 place-items-center rounded-full bg-bone text-ink">
            <Icon name="fingerprint" className="size-10" />
          </span>
          <p className="max-w-xs text-mist">Use your fingerprint or face next time instead of typing your password. It stays on this phone.</p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setOfferError(null);
              const r = await savePasskeyHere();
              setBusy(false);
              if (r.ok) {
                haptic("success");
                return go();
              }
              if (r.error) {
                haptic("error");
                setOfferError(r.error);
              }
            }}
            className="press flex h-14 w-full items-center justify-center gap-2 rounded-full bg-bone text-base font-semibold text-ink disabled:opacity-60"
          >
            <Icon name="fingerprint" className="size-5" /> {busy ? "Waiting for your phone…" : "Turn it on"}
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(OFFER_DISMISSED, "1");
              } catch {
                // storage blocked
              }
              go();
            }}
            className="press h-11 text-sm text-mist"
          >
            Not now
          </button>
          {offerError ? <p role="alert" className="text-sm text-danger">{offerError}</p> : null}
        </div>
      </Sheet>
    </main>
  );
}
