import "server-only";
import type { Platform } from "@/lib/domain/types";

/**
 * Publishing adapter. The rest of the app depends on `PublishingAdapter`, not on Buffer,
 * so another scheduler can be swapped in later (or the agency's own social module).
 *
 * Buffer implementation: GraphQL API at https://api.buffer.com (developers.buffer.com),
 * `Authorization: Bearer <API key>`. Verified against the published docs on 2026-10-23:
 *   - channels(input:{organizationId}) { id name displayName service avatar isDisconnected }
 *   - createPost(input: CreatePostInput!) → PostActionSuccess { post { id dueAt status } } | MutationError { message }
 *   - CreatePostInput: text, channelId, schedulingType (automatic), mode (customScheduled | addToQueue),
 *     dueAt (ISO UTC), assets: [AssetInput!] with { video: { url } }, metadata.{instagram|facebook|youtube…}
 *   - PostStatus: draft | error | needs_approval | scheduled | sending | sent
 * GraphQL errors arrive as HTTP 200; 429 = rate limited (Retry-After).
 */

export type RemoteChannel = {
  id: string;
  organizationId: string;
  name: string;
  platform: string;
  avatarUrl: string | null;
  isDisconnected: boolean;
};

export type CreateRemotePost = {
  channelId: string;
  platform: Platform;
  text: string;
  dueAt: Date;
  videoUrl: string;
  title?: string | null;
};

export type RemotePostState = { id: string; status: "scheduled" | "sending" | "sent" | "error" | "draft" | "needs_approval" | string; dueAt: string | null };

export interface PublishingAdapter {
  listChannels(): Promise<RemoteChannel[]>;
  createPost(input: CreateRemotePost): Promise<{ id: string; status: string }>;
  postStates(organizationId: string, channelIds: string[]): Promise<RemotePostState[]>;
}

export class PublishingError extends Error {
  constructor(message: string, readonly kind: "auth" | "rate_limit" | "invalid" | "network" | "remote") {
    super(message);
  }
}

const ENDPOINT = "https://api.buffer.com";

export class BufferAdapter implements PublishingAdapter {
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  private async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
    } catch (e) {
      throw new PublishingError(`Buffer unreachable: ${(e as Error).message}`, "network");
    }
    if (res.status === 429) throw new PublishingError(`Buffer rate limit; retry after ${res.headers.get("retry-after") ?? "?"}s.`, "rate_limit");
    if (res.status === 401 || res.status === 403) throw new PublishingError("Buffer rejected the API key.", "auth");
    const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] } | null;
    if (!body) throw new PublishingError(`Buffer returned HTTP ${res.status}.`, "remote");
    if (body.errors?.length) {
      const code = body.errors[0].extensions?.code;
      const kind = code === "UNAUTHORIZED" || code === "FORBIDDEN" ? "auth" : code === "RATE_LIMIT_EXCEEDED" ? "rate_limit" : "remote";
      throw new PublishingError(body.errors.map((e) => e.message).join("; "), kind);
    }
    return body.data as T;
  }

  async listChannels(): Promise<RemoteChannel[]> {
    const orgs = await this.gql<{ account: { organizations: { id: string; name: string }[] } }>(
      `query Orgs { account { organizations { id name } } }`,
    );
    const out: RemoteChannel[] = [];
    for (const org of orgs.account.organizations) {
      const data = await this.gql<{ channels: { id: string; name: string; displayName: string | null; service: string; avatar: string; isDisconnected: boolean }[] }>(
        `query Channels($org: OrganizationId!) { channels(input: { organizationId: $org }) { id name displayName service avatar isDisconnected } }`,
        { org: org.id },
      );
      for (const c of data.channels) {
        out.push({ id: c.id, organizationId: org.id, name: c.displayName || c.name, platform: c.service, avatarUrl: c.avatar || null, isDisconnected: c.isDisconnected });
      }
    }
    return out;
  }

  async createPost(input: CreateRemotePost): Promise<{ id: string; status: string }> {
    const metadata: Record<string, unknown> = {};
    if (input.platform === "instagram") metadata.instagram = { type: "reel", shouldShareToFeed: true };
    if (input.platform === "facebook") metadata.facebook = { type: "reel" };
    // categoryId 22 = People & Blogs (required by Buffer for YouTube).
    if (input.platform === "youtube") metadata.youtube = { title: (input.title || input.text.split("\n")[0]).slice(0, 100), categoryId: "22" };

    const data = await this.gql<{ createPost: { post?: { id: string; status: string }; message?: string } }>(
      `mutation Create($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess { post { id status dueAt } }
          ... on MutationError { message }
        }
      }`,
      {
        input: {
          channelId: input.channelId,
          text: input.text,
          schedulingType: "automatic",
          mode: "customScheduled",
          dueAt: input.dueAt.toISOString(),
          assets: [{ video: { url: input.videoUrl } }],
          ...(Object.keys(metadata).length ? { metadata } : {}),
        },
      },
    );
    if (!data.createPost.post) throw new PublishingError(data.createPost.message || "Buffer did not create the post.", "invalid");
    return { id: data.createPost.post.id, status: data.createPost.post.status };
  }

  async postStates(organizationId: string, channelIds: string[]): Promise<RemotePostState[]> {
    const out: RemotePostState[] = [];
    let after: string | null = null;
    for (let page = 0; page < 5; page++) {
      const data: { posts: { edges: { node: RemotePostState }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await this.gql(
        `query Posts($org: OrganizationId!, $channels: [ChannelId!], $after: String) {
          posts(first: 50, after: $after, input: { organizationId: $org, filter: { channelIds: $channels } }) {
            edges { node { id status dueAt } }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { org: organizationId, channels: channelIds, after },
      );
      out.push(...data.posts.edges.map((e) => e.node));
      if (!data.posts.pageInfo.hasNextPage) break;
      after = data.posts.pageInfo.endCursor;
    }
    return out;
  }
}

/** Buffer status → our post status. */
export function mapRemoteStatus(status: string): "scheduled" | "publishing" | "published" | "failed" | null {
  switch (status) {
    case "scheduled":
    case "needs_approval":
    case "draft":
      return "scheduled";
    case "sending":
      return "publishing";
    case "sent":
      return "published";
    case "error":
      return "failed";
    default:
      return null;
  }
}

/** Buffer `service` → our platform id. */
export function platformFromService(service: string): string {
  const s = service.toLowerCase();
  if (s.includes("instagram")) return "instagram";
  if (s.includes("facebook")) return "facebook";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("youtube")) return "youtube";
  if (s.includes("linkedin")) return "linkedin";
  if (s.includes("threads")) return "threads";
  if (s.includes("pinterest")) return "pinterest";
  if (s === "twitter" || s === "x") return "twitter";
  return s;
}
