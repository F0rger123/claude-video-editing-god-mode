import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { InstagramClient, authUrl, cleanCaption, containerFromKey, containerKey, needsRefresh, nextContainerStep, userIdFromChannelKey, instagramChannelKey } = await import("./instagram");

const app = { appId: "123", appSecret: "secret" };

describe("instagram helpers", () => {
  it("asks for publish permission", () => {
    const u = new URL(authUrl(app, "https://x.test/api/instagram/callback", "s1"));
    expect(u.hostname).toBe("www.instagram.com");
    expect(u.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish");
    expect(u.searchParams.get("state")).toBe("s1");
  });

  it("keeps captions inside Instagram's limits", () => {
    const tags = Array.from({ length: 35 }, (_, i) => `#t${i}`).join(" ");
    expect(cleanCaption(`Hi\n\n${tags}`).match(/#/g)).toHaveLength(30);
    expect(cleanCaption("x".repeat(3000))).toHaveLength(2200);
  });

  it("refreshes tokens weekly and before they run out", () => {
    const now = Date.parse("2026-10-25T12:00:00Z");
    expect(needsRefresh(new Date(now - 86400e3).toISOString(), new Date(now + 50 * 86400e3).toISOString(), now)).toBe(false);
    expect(needsRefresh(new Date(now - 8 * 86400e3).toISOString(), new Date(now + 50 * 86400e3).toISOString(), now)).toBe(true);
    expect(needsRefresh(new Date(now - 86400e3).toISOString(), new Date(now + 2 * 86400e3).toISOString(), now)).toBe(true);
  });

  it("keeps ids apart", () => {
    expect(containerFromKey(containerKey("c1"))).toBe("c1");
    expect(userIdFromChannelKey(instagramChannelKey("u1"))).toBe("u1");
    expect(containerFromKey("instagram:m1")).toBeNull();
  });

  it("publishes only when processed and due", () => {
    const due = new Date("2026-10-25T12:00:00Z");
    const created = new Date(due.getTime() - 20 * 60000);
    expect(nextContainerStep("FINISHED", due, created, due.getTime() - 60e3)).toBe("wait");
    expect(nextContainerStep("FINISHED", due, created, due.getTime() + 1)).toBe("publish");
    expect(nextContainerStep("IN_PROGRESS", due, created, due.getTime())).toBe("wait");
    expect(nextContainerStep("IN_PROGRESS", due, created, created.getTime() + 2 * 3600e3)).toBe("retry");
    expect(nextContainerStep("ERROR", due, created, due.getTime())).toBe("retry");
    expect(nextContainerStep("PUBLISHED", due, created, due.getTime())).toBe("already");
  });
});

describe("instagram client", () => {
  it("turns a code into a 60-day token, ignoring the #_ suffix", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).startsWith("https://api.instagram.com")) {
        expect(new URLSearchParams(String(init?.body)).get("code")).toBe("abc");
        return Response.json({ data: [{ access_token: "short", user_id: 42, permissions: "instagram_business_basic,instagram_business_content_publish" }] });
      }
      return Response.json({ access_token: "long", token_type: "bearer", expires_in: 5183944 });
    }) as unknown as typeof fetch;
    const t = await new InstagramClient(app, fetchImpl).exchangeCode("abc#_", "https://x.test/cb");
    expect(t.token).toBe("long");
    expect(t.userId).toBe("42");
    expect(t.permissions).toContain("instagram_business_content_publish");
    expect(calls[1]).toContain("grant_type=ig_exchange_token");
  });

  it("maps Meta errors", async () => {
    const respond = (body: object, status = 400) => (async () => Response.json(body, { status })) as unknown as typeof fetch;
    await expect(new InstagramClient(app, respond({ error: { message: "Error validating access token", type: "OAuthException", code: 190 } })).me("t")).rejects.toMatchObject({ kind: "auth" });
    await expect(new InstagramClient(app, respond({ error: { message: "limit", code: 9 } })).publish("t", "u", "c")).rejects.toMatchObject({ kind: "rate_limit" });
    await expect(new InstagramClient(app, respond({ error: { message: "bad video", code: 100 } })).createReel("t", "u", { videoUrl: "https://v", caption: "c" })).rejects.toMatchObject({ kind: "invalid" });
  });

  it("creates a Reel shared to the feed", async () => {
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      expect(String(url)).toMatch(/\/u1\/media$/);
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("media_type")).toBe("REELS");
      expect(body.get("share_to_feed")).toBe("true");
      return Response.json({ id: "container1" });
    }) as unknown as typeof fetch;
    expect(await new InstagramClient(app, fetchImpl).createReel("t", "u1", { videoUrl: "https://v", caption: "c" })).toBe("container1");
  });
});
