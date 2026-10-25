import "server-only";
import { PublishingError } from "@/lib/integrations/buffer";

/**
 * Direct Instagram Reels (no Buffer): "Instagram API with Instagram Login" (business login).
 * Verified against developers.facebook.com/docs/instagram-platform on 2026-10-25:
 *   - authorize: www.instagram.com/oauth/authorize (scopes instagram_business_basic,
 *     instagram_business_content_publish); the "#_" Instagram appends to the redirect is not part of the code
 *   - code → short-lived token: POST api.instagram.com/oauth/access_token
 *   - short → long-lived (60 days): GET graph.instagram.com/access_token?grant_type=ig_exchange_token
 *   - refresh (token ≥ 24 h old, not expired): GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token
 *   - Reel: POST /<IG_ID>/media (media_type=REELS, video_url, caption, share_to_feed) → container;
 *     GET /<container>?fields=status_code (IN_PROGRESS | FINISHED | ERROR | EXPIRED after 24 h | PUBLISHED);
 *     POST /<IG_ID>/media_publish (creation_id) → media id. 100 API posts per account per 24 h.
 * Instagram can't schedule: the app creates the container shortly before the posting time and
 * publishes it at the time. Only Business / Creator accounts can publish. Accounts you own work in
 * the app's development mode (Standard Access); clients' accounts need Meta's App Review.
 */

export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];
const GRAPH = "https://graph.instagram.com/v24.0";
/** Create the container this long before the posting time, so processing is done when it's due. */
export const PREPARE_AHEAD_MS = 20 * 60000;

export type InstagramApp = { appId: string; appSecret: string };

export function instagramApp(): InstagramApp | null {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  return appId && appSecret ? { appId, appSecret } : null;
}

export const instagramChannelKey = (userId: string) => `instagram:${userId}`;
export const containerKey = (id: string) => `igc:${id}`;
export const mediaKey = (id: string) => `instagram:${id}`;
export const userIdFromChannelKey = (key: string) => (key.startsWith("instagram:") ? key.slice(10) : null);
export const containerFromKey = (key: string) => (key.startsWith("igc:") ? key.slice(4) : null);

export function authUrl(app: InstagramApp, redirectUri: string, state: string): string {
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.search = new URLSearchParams({
    client_id: app.appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    enable_fb_login: "false",
    force_reauth: "true",
    state,
  }).toString();
  return u.toString();
}

/** Instagram captions: 2,200 characters, at most 30 hashtags. */
export function cleanCaption(text: string): string {
  let tags = 0;
  return text
    .replace(/#[\p{L}\p{N}_]+/gu, (t) => (++tags > 30 ? "" : t))
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, 2200);
}

/** Refresh when the token is over a week old (it lasts 60 days; refreshing needs it ≥ 24 h old). */
export function needsRefresh(updatedAt: string | null, expiresAt: string | null, now = Date.now()): boolean {
  if (expiresAt && new Date(expiresAt).getTime() - now < 3 * 86400e3) return true;
  return !updatedAt || now - new Date(updatedAt).getTime() > 7 * 86400e3;
}

type MetaError = { error?: { message?: string; type?: string; code?: number; error_subcode?: number; error_user_msg?: string } | string; error_message?: string; error_type?: string };

async function fail(res: Response, what: string): Promise<never> {
  const body = (await res.json().catch(() => null)) as MetaError | null;
  const err = typeof body?.error === "object" ? body.error : null;
  const message = err?.error_user_msg || err?.message || body?.error_message || (typeof body?.error === "string" ? body.error : "") || `HTTP ${res.status}`;
  const code = err?.code;
  // 190 = token invalid/expired, 10/200 = permission missing.
  if (code === 190 || res.status === 401 || (/OAuthException/.test(err?.type ?? body?.error_type ?? "") && /token|session/i.test(message)))
    throw new PublishingError(`Instagram sign-in expired or was removed. Connect the account again. (${what})`, "auth");
  // 4/17/32/613 = rate limits; 9 = posting limit (100 per 24 h).
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 9 || res.status === 429)
    throw new PublishingError(`Instagram's posting limit was reached; it retries automatically. (${what})`, "rate_limit");
  if (res.status >= 500 || code === 1 || code === 2) throw new PublishingError(`Instagram is having trouble (${what}): ${message}`, "network");
  throw new PublishingError(`Instagram refused ${what}: ${message}`, "invalid");
}

async function call(fetchImpl: typeof fetch, url: string, init: RequestInit | undefined, what: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (e) {
    throw new PublishingError(`Instagram unreachable (${what}): ${(e as Error).message}`, "network");
  }
  if (!res.ok) await fail(res, what);
  return res;
}

const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields),
});

export class InstagramClient {
  constructor(private readonly app: InstagramApp, private readonly fetchImpl: typeof fetch = fetch) {}

  /** Code → long-lived (60-day) token. */
  async exchangeCode(code: string, redirectUri: string): Promise<{ token: string; expiresAt: string; userId: string; permissions: string[] }> {
    const short = await call(this.fetchImpl, "https://api.instagram.com/oauth/access_token", form({
      client_id: this.app.appId, client_secret: this.app.appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code: code.replace(/#_$/, ""),
    }), "sign-in");
    const s = (await short.json()) as { access_token?: string; user_id?: string | number; permissions?: string[] | string; data?: { access_token: string; user_id: string | number; permissions?: string[] | string }[] };
    const row = s.data?.[0] ?? s;
    if (!row.access_token) throw new PublishingError("Instagram didn't return a sign-in.", "invalid");
    const long = await call(this.fetchImpl, `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: this.app.appSecret, access_token: row.access_token })}`, undefined, "sign-in");
    const l = (await long.json()) as { access_token: string; expires_in: number };
    const permissions = Array.isArray(row.permissions) ? row.permissions : String(row.permissions ?? "").split(",").filter(Boolean);
    return { token: l.access_token, expiresAt: new Date(Date.now() + l.expires_in * 1000).toISOString(), userId: String(row.user_id), permissions };
  }

  async refresh(token: string): Promise<{ token: string; expiresAt: string }> {
    const res = await call(this.fetchImpl, `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`, undefined, "token refresh");
    const t = (await res.json()) as { access_token: string; expires_in: number };
    return { token: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString() };
  }

  async me(token: string): Promise<{ userId: string; username: string; avatarUrl: string | null; accountType: string }> {
    const res = await call(this.fetchImpl, `${GRAPH}/me?${new URLSearchParams({ fields: "user_id,username,profile_picture_url,account_type", access_token: token })}`, undefined, "profile");
    const m = (await res.json()) as { id: string; user_id?: string; username: string; profile_picture_url?: string; account_type?: string };
    return { userId: String(m.user_id ?? m.id), username: m.username, avatarUrl: m.profile_picture_url ?? null, accountType: m.account_type ?? "" };
  }

  /** Hands Instagram the video URL; Instagram fetches and processes it in the background. */
  async createReel(token: string, userId: string, input: { videoUrl: string; caption: string }): Promise<string> {
    const res = await call(this.fetchImpl, `${GRAPH}/${userId}/media`, form({
      media_type: "REELS", video_url: input.videoUrl, caption: cleanCaption(input.caption), share_to_feed: "true", access_token: token,
    }), "Reel upload");
    return ((await res.json()) as { id: string }).id;
  }

  async containerStatus(token: string, containerId: string): Promise<{ status: string; detail: string | null }> {
    const res = await call(this.fetchImpl, `${GRAPH}/${containerId}?${new URLSearchParams({ fields: "status_code,status", access_token: token })}`, undefined, "processing check");
    const c = (await res.json()) as { status_code?: string; status?: string };
    return { status: c.status_code ?? "IN_PROGRESS", detail: c.status ?? null };
  }

  async publish(token: string, userId: string, containerId: string): Promise<{ mediaId: string; permalink: string | null }> {
    const res = await call(this.fetchImpl, `${GRAPH}/${userId}/media_publish`, form({ creation_id: containerId, access_token: token }), "publishing");
    const mediaId = ((await res.json()) as { id: string }).id;
    const link = await call(this.fetchImpl, `${GRAPH}/${mediaId}?${new URLSearchParams({ fields: "permalink", access_token: token })}`, undefined, "link").then((r) => r.json() as Promise<{ permalink?: string }>).catch(() => ({ permalink: undefined }));
    return { mediaId, permalink: link.permalink ?? null };
  }
}

/** What the app does with a waiting container on this pass. */
export function nextContainerStep(status: string, dueAt: Date, createdAt: Date, now = Date.now()): "publish" | "wait" | "retry" | "already" {
  if (status === "ERROR") return "retry";
  if (status === "EXPIRED") return "retry";
  if (status === "PUBLISHED") return "already"; // a pass published it but didn't record it; never publish twice
  if (status === "FINISHED") return dueAt.getTime() <= now ? "publish" : "wait";
  // Still processing: give Instagram up to an hour.
  return now - createdAt.getTime() > 3600e3 ? "retry" : "wait";
}
