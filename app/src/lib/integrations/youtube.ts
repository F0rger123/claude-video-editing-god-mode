import "server-only";
import { PublishingError } from "@/lib/integrations/buffer";

/**
 * Direct YouTube publishing (no Buffer): Google OAuth + YouTube Data API v3.
 * Verified against developers.google.com/youtube/v3 on 2026-10-25:
 *   - OAuth: accounts.google.com/o/oauth2/v2/auth (access_type=offline, prompt=consent → refresh token),
 *     token exchange / refresh at oauth2.googleapis.com/token
 *   - channels.list?part=snippet&mine=true
 *   - videos.insert, resumable: POST upload/youtube/v3/videos?uploadType=resumable → Location,
 *     then PUT chunks (multiples of 256 KiB) with Content-Range; 308 = keep going, 200/201 = done
 *   - status.privacyStatus private + status.publishAt (ISO) = YouTube publishes it at that time
 *   - videos.list?part=status → uploadStatus (uploaded|processed|failed|rejected|deleted), privacyStatus
 * Videos uploaded by a Google project that hasn't passed YouTube's API audit stay private.
 * App credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are Worker secrets; refresh tokens live in
 * content_channel_tokens (service role only). Nothing here runs in the browser.
 */

export const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
const API = "https://www.googleapis.com/youtube/v3";
const CHUNK = 8 * 1024 * 1024; // 32 × 256 KiB

export type YouTubeApp = { clientId: string; clientSecret: string };

export function youtubeApp(): YouTubeApp | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const youtubeChannelKey = (channelId: string) => `youtube:${channelId}`;
export const youtubeVideoKey = (videoId: string) => `youtube:${videoId}`;
export const fromKey = (key: string) => (key.startsWith("youtube:") ? key.slice(8) : null);
export const watchUrl = (videoId: string) => `https://youtu.be/${videoId}`;

export function authUrl(app: YouTubeApp, redirectUri: string, state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  }).toString();
  return u.toString();
}

/** YouTube rejects < and > in titles and descriptions; titles max 100 characters. */
export function cleanTitle(title: string): string {
  return title.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 100) || "Untitled";
}
export function cleanDescription(text: string): string {
  return text.replace(/[<>]/g, "").slice(0, 5000);
}

/** Schedule on YouTube only when the time is far enough ahead; otherwise publish on upload. */
export function privacyFor(dueAt: Date, now = Date.now()): { privacyStatus: "private" | "public"; publishAt?: string } {
  return dueAt.getTime() > now + 15 * 60000 ? { privacyStatus: "private", publishAt: dueAt.toISOString() } : { privacyStatus: "public" };
}

type GoogleError = { error?: string | { code?: number; message?: string; errors?: { reason?: string }[] }; error_description?: string };

async function fail(res: Response, what: string): Promise<never> {
  const body = (await res.json().catch(() => null)) as GoogleError | null;
  const err = body?.error;
  const reason = typeof err === "object" ? err.errors?.[0]?.reason : err;
  const message = (typeof err === "object" ? err.message : body?.error_description) || `HTTP ${res.status}`;
  if (reason === "invalid_grant" || res.status === 401) throw new PublishingError(`YouTube sign-in expired or was removed. Connect the channel again. (${what})`, "auth");
  if (reason === "quotaExceeded" || reason === "rateLimitExceeded" || reason === "uploadLimitExceeded" || res.status === 429)
    throw new PublishingError(`YouTube's daily upload limit for this app is used up; it retries automatically. (${what})`, "rate_limit");
  if (res.status >= 500) throw new PublishingError(`YouTube is having trouble (${what}): ${message}`, "network");
  throw new PublishingError(`YouTube refused ${what}: ${message}`, "invalid");
}

async function call(fetchImpl: typeof fetch, url: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (e) {
    throw new PublishingError(`YouTube unreachable (${what}): ${(e as Error).message}`, "network");
  }
}

export class YouTubeClient {
  constructor(private readonly app: YouTubeApp, private readonly fetchImpl: typeof fetch = fetch) {}

  async exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string | null; accessToken: string; scope: string }> {
    const res = await call(this.fetchImpl, "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: this.app.clientId, client_secret: this.app.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    }, "sign-in");
    if (!res.ok) await fail(res, "sign-in");
    const t = (await res.json()) as { access_token: string; refresh_token?: string; scope?: string };
    return { accessToken: t.access_token, refreshToken: t.refresh_token ?? null, scope: t.scope ?? "" };
  }

  async accessToken(refreshToken: string): Promise<string> {
    const res = await call(this.fetchImpl, "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: this.app.clientId, client_secret: this.app.clientSecret, grant_type: "refresh_token" }),
    }, "token refresh");
    if (!res.ok) await fail(res, "token refresh");
    return ((await res.json()) as { access_token: string }).access_token;
  }

  async myChannels(accessToken: string): Promise<{ id: string; title: string; avatarUrl: string | null }[]> {
    const res = await call(this.fetchImpl, `${API}/channels?part=snippet&mine=true&maxResults=50`, { headers: { Authorization: `Bearer ${accessToken}` } }, "channel list");
    if (!res.ok) await fail(res, "channel list");
    const body = (await res.json()) as { items?: { id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }[] };
    return (body.items ?? []).map((c) => ({ id: c.id, title: c.snippet.title, avatarUrl: c.snippet.thumbnails?.default?.url ?? null }));
  }

  /** Streams the video from `source` to YouTube in 8 MB chunks (never holds the whole file). */
  async upload(input: {
    accessToken: string;
    source: Response;
    title: string;
    description: string;
    tags: string[];
    dueAt: Date;
  }): Promise<{ videoId: string; scheduled: boolean }> {
    const { accessToken, source } = input;
    if (!source.ok || !source.body) throw new PublishingError(`The final video could not be read (HTTP ${source.status}).`, source.status >= 500 ? "network" : "invalid");
    const total = Number(source.headers.get("content-length")) || null;
    const type = source.headers.get("content-type")?.startsWith("video/") ? source.headers.get("content-type")! : "video/mp4";
    const privacy = privacyFor(input.dueAt);

    const init = await call(this.fetchImpl, "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": type,
        ...(total ? { "X-Upload-Content-Length": String(total) } : {}),
      },
      body: JSON.stringify({
        snippet: { title: cleanTitle(input.title), description: cleanDescription(input.description), tags: input.tags.map((t) => t.replace(/^#/, "")).filter(Boolean).slice(0, 30), categoryId: "22" },
        status: { ...privacy, selfDeclaredMadeForKids: false, embeddable: true },
      }),
    }, "upload start");
    if (!init.ok) await fail(init, "upload start");
    const session = init.headers.get("location");
    if (!session) throw new PublishingError("YouTube did not start the upload.", "remote");

    const reader = source.body.getReader();
    let buf = new Uint8Array(0);
    let sent = 0;
    let done = false;
    while (!done || buf.length) {
      while (!done && buf.length < CHUNK) {
        const r = await reader.read();
        if (r.done) done = true;
        else {
          const next = new Uint8Array(buf.length + r.value.length);
          next.set(buf);
          next.set(r.value, buf.length);
          buf = next;
        }
      }
      const last = done && buf.length <= CHUNK;
      const part = last ? buf : buf.subarray(0, CHUNK);
      const size = last ? String(sent + part.length) : total ? String(total) : "*";
      const res = await call(this.fetchImpl, session, {
        method: "PUT",
        headers: { "Content-Length": String(part.length), "Content-Range": part.length ? `bytes ${sent}-${sent + part.length - 1}/${size}` : `bytes */${size}` },
        body: part,
      }, "upload");
      if (res.status === 308) {
        const got = res.headers.get("range")?.match(/-(\d+)$/);
        if (!got || Number(got[1]) !== sent + part.length - 1) throw new PublishingError("YouTube lost part of the upload; it retries automatically.", "network");
        sent += part.length;
        buf = buf.slice(part.length);
        continue;
      }
      if (res.status === 200 || res.status === 201) {
        const video = (await res.json()) as { id: string };
        return { videoId: video.id, scheduled: privacy.privacyStatus === "private" };
      }
      await fail(res, "upload");
    }
    throw new PublishingError("YouTube did not confirm the upload.", "remote");
  }

  async videoStates(accessToken: string, ids: string[]): Promise<Map<string, { uploadStatus: string; privacyStatus: string; reason: string | null }>> {
    const out = new Map<string, { uploadStatus: string; privacyStatus: string; reason: string | null }>();
    for (let i = 0; i < ids.length; i += 50) {
      const res = await call(this.fetchImpl, `${API}/videos?part=status&id=${ids.slice(i, i + 50).join(",")}`, { headers: { Authorization: `Bearer ${accessToken}` } }, "status check");
      if (!res.ok) await fail(res, "status check");
      const body = (await res.json()) as { items?: { id: string; status: { uploadStatus: string; privacyStatus: string; failureReason?: string; rejectionReason?: string } }[] };
      for (const v of body.items ?? []) out.set(v.id, { uploadStatus: v.status.uploadStatus, privacyStatus: v.status.privacyStatus, reason: v.status.failureReason ?? v.status.rejectionReason ?? null });
    }
    return out;
  }
}

/** YouTube video state → our post status (null = no change yet). Missing = deleted on YouTube. */
export function mapYouTubeState(state: { uploadStatus: string; privacyStatus: string } | undefined, dueAt: Date, now = Date.now()): "published" | "failed" | "stuck_private" | null {
  if (!state || state.uploadStatus === "deleted") return "failed";
  if (state.uploadStatus === "failed" || state.uploadStatus === "rejected") return "failed";
  if (state.privacyStatus === "public" || state.privacyStatus === "unlisted") return "published";
  // Still private well after its time: YouTube locks uploads from unaudited Google projects to private.
  if (now > dueAt.getTime() + 30 * 60000) return "stuck_private";
  return null;
}
