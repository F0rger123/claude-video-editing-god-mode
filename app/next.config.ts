import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Changes every build: the service worker URL carries it, so each deploy drops screens stored by the last one.
  env: { NEXT_PUBLIC_BUILD_ID: String(Date.now()) },
  experimental: {
    // Media never passes through server actions: phones upload straight to Supabase Storage with a signed URL.
    serverActions: { bodySizeLimit: "2mb" },
    // Screens visited (dynamic) or preloaded by the tab bar (static = prefetch) are reused instantly for
    // this long; any save clears them (server actions revalidate), so nothing goes stale after a change.
    staleTimes: { dynamic: 120, static: 300 },
  },
};

export default nextConfig;
