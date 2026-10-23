import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 proxy: refreshes the Supabase session and sends signed-out visitors to /login.
 * Being signed in is only the first gate: staff layouts check content_staff, portal pages check
 * membership, and Postgres RLS enforces both on every row.
 */
const PUBLIC = [/^\/login/, /^\/install/, /^\/auth\//, /^\/api\/cron\//, /^\/api\/bridge\//, /^\/offline/, /^\/no-access/];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  // An email link whose redirect URL wasn't on Supabase's allow-list falls back to the site root
  // with ?code=…; finish the sign-in properly instead of bouncing to the login screen.
  const code = request.nextUrl.searchParams.get("code");
  if (pathname === "/" && code) {
    const callback = new URL("/auth/callback", request.url);
    callback.searchParams.set("code", code);
    return NextResponse.redirect(callback);
  }

  if (!signedIn && !PUBLIC.some((re) => re.test(pathname))) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  // GET only: server actions posted from the login screen right after signing in (turning on
  // fingerprint sign-in) must reach their action, not be bounced to the home page.
  if (signedIn && pathname === "/login" && request.method === "GET") return NextResponse.redirect(new URL("/", request.url));
  // Remember the calendar view (Month / Week / List) the moment it is opened, so the app reopens on it.
  const view = request.nextUrl.searchParams.get("view");
  if (view && /^(month|week|list)$/.test(view) && /^\/(calendar|portal\/[^/]+\/calendar)/.test(pathname)) {
    response.cookies.set(pathname.startsWith("/portal") ? "azc-portal-cal-view" : "azc-cal-view", view, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  // Private pages must never be stored by shared caches.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // Everything except static files (anything with a file extension: icons, favicon, sw.js, manifest…).
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
