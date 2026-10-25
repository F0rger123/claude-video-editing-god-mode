import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { YouTubeClient, authUrl, cleanTitle, fromKey, mapYouTubeState, privacyFor, youtubeVideoKey } = await import("./youtube");

const app = { clientId: "client-id", clientSecret: "client-secret" };

describe("youtube helpers", () => {
  it("asks for upload + read access with a lasting sign-in", () => {
    const u = new URL(authUrl(app, "https://x.test/api/youtube/callback", "s1"));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("scope")).toContain("youtube.upload");
    expect(u.searchParams.get("state")).toBe("s1");
  });

  it("cleans titles the way YouTube needs", () => {
    expect(cleanTitle("  Fix <your> site   now  ")).toBe("Fix your site now");
    expect(cleanTitle("x".repeat(150))).toHaveLength(100);
    expect(cleanTitle("<>")).toBe("Untitled");
  });

  it("schedules on YouTube only when the time is ahead", () => {
    const now = Date.parse("2026-10-25T12:00:00Z");
    expect(privacyFor(new Date(now + 3600e3), now)).toEqual({ privacyStatus: "private", publishAt: "2026-10-25T13:00:00.000Z" });
    expect(privacyFor(new Date(now + 60e3), now)).toEqual({ privacyStatus: "public" });
  });

  it("keeps video ids apart from Buffer ids", () => {
    expect(fromKey(youtubeVideoKey("abc"))).toBe("abc");
    expect(fromKey("6512buffer")).toBeNull();
  });

  it("maps YouTube state to post status", () => {
    const due = new Date("2026-10-25T12:00:00Z");
    const before = due.getTime() - 60e3;
    expect(mapYouTubeState({ uploadStatus: "processed", privacyStatus: "public" }, due, before)).toBe("published");
    expect(mapYouTubeState({ uploadStatus: "processed", privacyStatus: "private" }, due, before)).toBeNull();
    expect(mapYouTubeState({ uploadStatus: "processed", privacyStatus: "private" }, due, due.getTime() + 3600e3)).toBe("stuck_private");
    expect(mapYouTubeState({ uploadStatus: "rejected", privacyStatus: "private" }, due, before)).toBe("failed");
    expect(mapYouTubeState(undefined, due, before)).toBe("failed");
  });
});

describe("youtube upload", () => {
  function fakeYouTube(size: number) {
    const puts: { range: string; length: number }[] = [];
    let received = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("uploadType=resumable")) {
        const meta = JSON.parse(String(init?.body));
        expect(meta.status.privacyStatus).toBe("private");
        expect(meta.snippet.tags).toEqual(["seo", "websites"]);
        return new Response(null, { status: 200, headers: { location: "https://upload.test/session" } });
      }
      const body = init?.body as Uint8Array;
      const range = (init?.headers as Record<string, string>)["Content-Range"];
      puts.push({ range, length: body.length });
      received += body.length;
      // Like YouTube: the upload only finishes once a request states the total size.
      if (received < size || range.endsWith("/*")) return new Response(null, { status: 308, headers: { range: `bytes=0-${received - 1}` } });
      return Response.json({ id: "vid123" }, { status: 201 });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, puts };
  }

  function source(size: number, withLength: boolean) {
    const bytes = new Uint8Array(size).fill(7);
    // Deliver in uneven pieces, like a network stream.
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < size; i += 3_000_000) c.enqueue(bytes.subarray(i, Math.min(size, i + 3_000_000)));
        c.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "video/mp4", ...(withLength ? { "content-length": String(size) } : {}) } });
  }

  const due = new Date(Date.now() + 86400e3);

  it("streams in 8 MB chunks with correct ranges", async () => {
    const size = 20 * 1024 * 1024 + 5;
    const { fetchImpl, puts } = fakeYouTube(size);
    const r = await new YouTubeClient(app, fetchImpl).upload({ accessToken: "t", source: source(size, true), title: "T", description: "D", tags: ["#seo", "websites"], dueAt: due });
    expect(r).toEqual({ videoId: "vid123", scheduled: true });
    expect(puts.map((p) => p.range)).toEqual([`bytes 0-8388607/${size}`, `bytes 8388608-16777215/${size}`, `bytes 16777216-${size - 1}/${size}`]);
  });

  it("works when the size is unknown up front", async () => {
    const size = 16 * 1024 * 1024; // exact multiple of the chunk size
    const { fetchImpl, puts } = fakeYouTube(size);
    const r = await new YouTubeClient(app, fetchImpl).upload({ accessToken: "t", source: source(size, false), title: "T", description: "D", tags: ["seo", "websites"], dueAt: due });
    expect(r.videoId).toBe("vid123");
    expect(puts.at(-1)?.range).toMatch(new RegExp(`/${size}$`));
  });

  it("reports a used-up quota as retryable", async () => {
    const fetchImpl = (async () => Response.json({ error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } }, { status: 403 })) as unknown as typeof fetch;
    await expect(new YouTubeClient(app, fetchImpl).upload({ accessToken: "t", source: source(10, true), title: "T", description: "D", tags: [], dueAt: due })).rejects.toMatchObject({ kind: "rate_limit" });
  });

  it("reports a removed sign-in as auth", async () => {
    const fetchImpl = (async () => Response.json({ error: "invalid_grant", error_description: "revoked" }, { status: 400 })) as unknown as typeof fetch;
    await expect(new YouTubeClient(app, fetchImpl).accessToken("r")).rejects.toMatchObject({ kind: "auth" });
  });
});
