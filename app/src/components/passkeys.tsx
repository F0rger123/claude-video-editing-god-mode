"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { platformAuthenticatorIsAvailable, startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import { passkeyLogin, passkeyLoginOptions, passkeyRegister, passkeyRegistrationOptions, removePasskey } from "@/app/actions/passkeys";
import { Icon } from "@/components/icons";
import { haptic } from "@/lib/haptics";
import { clearStoredScreens } from "@/components/pwa";

/** Set on this phone once a passkey is saved here, so the login screen leads with the fingerprint button. */
const SAVED = "azc-passkey";
export const OFFER_DISMISSED = "azc-passkey-offer";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the offer may show again, nothing else breaks
  }
}

/** Does this phone have a fingerprint / face / screen-lock authenticator the browser can use? */
export function usePasskeySupport(): { supported: boolean; savedHere: boolean } {
  const [state, setState] = useState({ supported: false, savedHere: false });
  useEffect(() => {
    let live = true;
    platformAuthenticatorIsAvailable()
      .then((ok) => live && setState({ supported: ok, savedHere: ok && read(SAVED) === "1" }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** Plain-language message for the browser's WebAuthn errors. Cancelling is not an error. */
function explain(e: unknown): string | null {
  if (e instanceof WebAuthnError) {
    if (e.code === "ERROR_CEREMONY_ABORTED" || e.name === "NotAllowedError") return null;
    if (e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return "This phone is already set up.";
  }
  if (e instanceof Error && e.name === "NotAllowedError") return null;
  return "Your phone could not do that. Try again or use your password.";
}

/** Saves a passkey on this phone for the signed-in person. */
export async function savePasskeyHere(): Promise<{ ok?: true; error?: string }> {
  const { options, error } = await passkeyRegistrationOptions();
  if (!options) return { error };
  try {
    const response = await startRegistration({ optionsJSON: options });
    const r = await passkeyRegister(response);
    if (r.ok) write(SAVED, "1");
    return r;
  } catch (e) {
    const msg = explain(e);
    return msg ? { error: msg } : {};
  }
}

export function PasskeyLoginButton({ next, primary }: { next: string; primary: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const { options, error: optError } = await passkeyLoginOptions();
      if (!options) throw new Error(optError ?? "Not available.");
      const response = await startAuthentication({ optionsJSON: options });
      const r = await passkeyLogin(response);
      if (r.error) {
        haptic("error");
        setError(r.error);
        setBusy(false);
        return;
      }
      write(SAVED, "1");
      clearStoredScreens();
      haptic("success");
      router.replace(next);
      router.refresh();
    } catch (e) {
      const msg = e instanceof WebAuthnError || (e instanceof Error && e.name === "NotAllowedError") ? explain(e) : (e as Error).message;
      if (msg) {
        haptic("error");
        setError(msg);
      }
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        data-haptic="select"
        className={`press flex h-14 w-full items-center justify-center gap-3 rounded-full text-base font-semibold disabled:opacity-60 ${primary ? "bg-bone text-ink" : "border border-rule-strong text-bone"}`}
      >
        <Icon name="fingerprint" className={`size-6 ${busy ? "animate-pulse" : ""}`} />
        {busy ? "Waiting for your phone…" : "Sign in with fingerprint or face"}
      </button>
      {error ? <p role="alert" className="mt-3 text-center text-sm text-danger">{error}</p> : null}
    </div>
  );
}

/** Settings: this person's saved devices, plus "turn on for this phone". */
export function PasskeySettings({ devices }: { devices: { id: string; device_name: string | null; created_at: string; last_used_at: string | null }[] }) {
  const router = useRouter();
  const { supported, savedHere } = usePasskeySupport();
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-3">
      <p className="text-sm text-mist">Sign in with your fingerprint or face instead of typing your password. Your fingerprint never leaves your phone.</p>
      {devices.length ? (
        <ul className="divide-y divide-rule rounded-2xl border border-rule">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <Icon name="fingerprint" className="size-5 text-mist" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{d.device_name ?? "Device"}</span>
                <span className="block text-xs text-ash">
                  Added {new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {d.last_used_at ? ` · last used ${new Date(d.last_used_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </span>
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await removePasskey(d.id);
                    if (r.error) setMessage({ error: r.error });
                    else {
                      haptic("warning");
                      write(SAVED, "0");
                      router.refresh();
                    }
                  })
                }
                className="press h-9 rounded-full border border-rule px-3 text-xs text-mist"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {supported ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMessage({});
              const r = await savePasskeyHere();
              if (r.ok) {
                haptic("success");
                setMessage({ ok: "Done. Next time, sign in with your fingerprint or face." });
                router.refresh();
              } else if (r.error) {
                haptic("error");
                setMessage({ error: r.error });
              }
            })
          }
          className="press flex h-12 items-center justify-center gap-2 rounded-full bg-bone text-sm font-semibold text-ink disabled:opacity-60"
        >
          <Icon name="fingerprint" className="size-5" /> {savedHere ? "Set up this phone again" : "Turn on for this phone"}
        </button>
      ) : (
        <p className="rounded-2xl border border-dashed border-rule px-4 py-3 text-sm text-ash">Open this page on your phone (with a fingerprint, face or screen lock set up) to turn it on.</p>
      )}
      {message.ok ? <p role="status" className="text-sm text-success">{message.ok}</p> : null}
      {message.error ? <p role="alert" className="text-sm text-danger">{message.error}</p> : null}
    </div>
  );
}
