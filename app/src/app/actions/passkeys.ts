"use server";

import { AGENCY_NAME, APP_NAME } from "@/lib/brand";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

/**
 * Fingerprint / face sign-in with passkeys (WebAuthn). The phone keeps the private key behind its
 * own unlock; we store only the public key. A verified sign-in is turned into a normal Supabase
 * session with a one-time server-side magic-link token, so the rest of the app (cookies, RLS) is
 * unchanged. User verification (the actual fingerprint/face/PIN check) is always required.
 */

const CHALLENGE_COOKIE = "azc-pk-challenge";

async function relyingParty() {
  const h = await headers();
  // Next.js already rejects server-action POSTs whose Origin does not match the host.
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return { origin, rpID: new URL(origin).hostname };
}

async function keepChallenge(challenge: string) {
  (await cookies()).set(CHALLENGE_COOKIE, challenge, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 300 });
}

async function takeChallenge(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CHALLENGE_COOKIE)?.value ?? null;
  store.delete(CHALLENGE_COOKIE);
  return value;
}

/** Friendly name for the device a passkey was saved on, from its user agent. */
function deviceName(ua: string | null): string {
  if (!ua) return "This device";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad|Macintosh.*Mobile/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}

// ── Saving a passkey (signed in) ────────────────────────────────────────────

export async function passkeyRegistrationOptions(): Promise<{ options?: PublicKeyCredentialCreationOptionsJSON; error?: string }> {
  if (!isAdminConfigured()) return { error: "Fingerprint sign-in is not set up on the server." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const email = String(data?.claims?.email ?? "");
  if (!userId) return { error: "Sign in first." };
  const { rpID } = await relyingParty();
  const { data: existing } = await supabase.from("content_passkeys").select("credential_id, transports");
  const options = await generateRegistrationOptions({
    rpName: APP_NAME,
    rpID,
    userName: email || userId,
    userDisplayName: email || AGENCY_NAME,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id, transports: c.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "required", userVerification: "required", authenticatorAttachment: "platform" },
  });
  await keepChallenge(options.challenge);
  return { options };
}

export async function passkeyRegister(response: RegistrationResponseJSON): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { error: "Sign in first." };
  const challenge = await takeChallenge();
  if (!challenge) return { error: "That took too long. Try again." };
  const { origin, rpID } = await relyingParty();
  try {
    const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
    if (!result.verified) return { error: "Your phone did not confirm it. Try again." };
    const { credential } = result.registrationInfo;
    const { error } = await createAdminClient().from("content_passkeys").insert({
      user_id: userId,
      credential_id: credential.id,
      public_key: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      device_name: deviceName((await headers()).get("user-agent")),
    });
    if (error) return { error: /duplicate/i.test(error.message) ? "This device is already set up." : "Could not save it. Try again." };
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message || "Could not save it. Try again." };
  }
}

export async function removePasskey(id: string): Promise<{ ok?: true; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Unknown device." };
  const supabase = await createClient();
  // RLS: people can only delete their own.
  const { error } = await supabase.from("content_passkeys").delete().eq("id", id);
  if (error) return { error: "Could not remove it." };
  revalidatePath("/settings");
  return { ok: true };
}

// ── Signing in with a passkey (signed out) ──────────────────────────────────

export async function passkeyLoginOptions(): Promise<{ options?: PublicKeyCredentialRequestOptionsJSON; error?: string }> {
  if (!isAdminConfigured()) return { error: "Fingerprint sign-in is not set up on the server." };
  const { rpID } = await relyingParty();
  // No allow-list: the phone offers the passkeys it holds for this site.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  await keepChallenge(options.challenge);
  return { options };
}

export async function passkeyLogin(response: AuthenticationResponseJSON): Promise<{ ok?: true; error?: string }> {
  const challenge = await takeChallenge();
  if (!challenge) return { error: "That took too long. Try again." };
  const admin = createAdminClient();
  const { data: key } = await admin.from("content_passkeys").select("id, user_id, credential_id, public_key, counter, transports").eq("credential_id", response.id).maybeSingle();
  if (!key) return { error: "This fingerprint isn't set up for this app yet. Sign in with your password, then turn it on." };
  const { origin, rpID } = await relyingParty();
  let newCounter: number;
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: { id: key.credential_id, publicKey: isoBase64URL.toBuffer(key.public_key), counter: Number(key.counter), transports: key.transports as AuthenticatorTransportFuture[] },
    });
    if (!result.verified) return { error: "Your phone did not confirm it. Try again." };
    newCounter = result.authenticationInfo.newCounter;
  } catch {
    return { error: "Your phone did not confirm it. Try again." };
  }
  await admin.from("content_passkeys").update({ counter: newCounter, last_used_at: new Date().toISOString() }).eq("id", key.id);

  // Turn the verified passkey into a normal session (cookies set by the server client).
  const { data: user } = await admin.auth.admin.getUserById(key.user_id);
  const email = user?.user?.email;
  if (!email) return { error: "This account has no email. Sign in with your password." };
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link?.properties?.hashed_token) return { error: "Could not sign you in. Try your password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) return { error: "Could not sign you in. Try your password." };
  return { ok: true };
}
