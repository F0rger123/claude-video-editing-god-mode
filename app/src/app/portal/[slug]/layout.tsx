import { AGENCY_NAME } from "@/lib/brand";
import Link from "next/link";
import { getPortal } from "@/lib/portal";
import { getViewer } from "@/lib/auth";
import { PortalNav } from "./portal-nav";
import { PortalAccount } from "./account";
import { createClient } from "@/lib/supabase/server";
import { RegisterServiceWorker } from "@/components/pwa";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const portal = await getPortal(slug);
  const viewer = await getViewer();
  const { data: passkeys } = viewer && !viewer.staffRole ? await (await createClient()).from("content_passkeys").select("id, device_name, created_at, last_used_at").order("created_at") : { data: [] };
  const p = portal.permissions;
  const items = [
    { href: `/portal/${slug}`, label: "Home", icon: "home" as const },
    ...(p.can_upload ? [{ href: `/portal/${slug}/upload`, label: "Upload", icon: "plus" as const }] : []),
    ...(p.can_view_scripts ? [{ href: `/portal/${slug}/scripts`, label: "Ideas", icon: "spark" as const }] : []),
    ...(p.can_view_calendar || p.can_view_published ? [{ href: `/portal/${slug}/calendar`, label: "Calendar", icon: "calendar" as const }] : []),
  ];
  return (
    <div className="min-h-svh">
      <RegisterServiceWorker />
      <header className="pt-safe sticky top-0 z-30 border-b border-rule bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link href={`/portal/${slug}`} className="min-w-0 truncate font-semibold tracking-tight">{portal.name}</Link>
          <span className="text-xs text-ash">with {AGENCY_NAME}</span>
          <div className="ml-auto flex items-center gap-2">
            {(viewer?.portals.length ?? 0) > 1 ? <Link href="/portal" className="text-sm text-mist">Switch</Link> : null}
            {viewer?.staffRole ? <Link href="/" className="text-sm text-mist">Back to app</Link> : (
              <PortalAccount email={viewer?.email ?? ""} devices={passkeys ?? []} />
            )}
          </div>
        </div>
        {portal.isStaffPreview ? <p className="bg-attention/15 px-4 py-1.5 text-center text-xs text-attention">Preview: this is what {portal.name} sees (default permissions). Actions are disabled.</p> : null}
      </header>
      <main className={`mx-auto w-full max-w-2xl px-4 pt-6 ${items.length > 1 ? "pb-nav" : "pb-12"}`}>{children}</main>
      {items.length > 1 ? <PortalNav items={items} /> : null}
    </div>
  );
}
