"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { RegisterServiceWorker, clearOfflineData } from "@/components/pwa";
import { setFocusWorkspace, signOut } from "@/app/actions/auth";
import { Logo, LogoMark } from "@/components/logo";

type Ws = { id: string; name: string; is_agency: boolean };

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Today", icon: "home" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/upload", label: "Upload", icon: "plus" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/clients", label: "Clients", icon: "clients" },
];

/**
 * Staff shell. Phone: a top bar with the client switcher + a bottom tab bar within thumb reach,
 * Upload in the middle. Desktop: same items in a left rail, so nothing is relearned.
 */
export function StaffShell({ children, workspaces, focus, unread, email }: { children: ReactNode; workspaces: Ws[]; focus: Ws | null; unread: number; email: string }) {
  const pathname = usePathname();
  const [switcher, setSwitcher] = useState(false);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="min-h-svh md:grid md:grid-cols-[15rem_1fr]">
      <RegisterServiceWorker />
      <aside className="sticky top-0 hidden h-svh flex-col border-r border-rule px-4 py-6 md:flex">
        <Link href="/" className="px-1"><Logo /></Link>
        <nav className="mt-8 grid gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} prefetch className={`press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active(n.href) ? "bg-graphite text-bone" : "text-mist hover:text-bone"}`}>
              <Icon name={n.icon} className="size-[18px]" />
              {n.label}
            </Link>
          ))}
          <Link href="/scripts" className={`press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active("/scripts") ? "bg-graphite text-bone" : "text-mist hover:text-bone"}`}>
            <Icon name="spark" className="size-[18px]" />
            Script ideas
          </Link>
          <Link href="/library" className={`press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active("/library") ? "bg-graphite text-bone" : "text-mist hover:text-bone"}`}>
            <Icon name="audio" className="size-[18px]" />
            Library
          </Link>
          <Link href="/jobs" className={`press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active("/jobs") ? "bg-graphite text-bone" : "text-mist hover:text-bone"}`}>
            <Icon name="search" className="size-[18px]" />
            All content
          </Link>
          <Link href="/settings" className={`press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active("/settings") ? "bg-graphite text-bone" : "text-mist hover:text-bone"}`}>
            <Icon name="settings" className="size-[18px]" />
            Settings
          </Link>
          <Link href="/guide" className={`press flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active("/guide") ? "bg-graphite text-bone" : "text-mist hover:text-bone"}`}>
            <Icon name="help" className="size-[18px]" />
            How it works
          </Link>
        </nav>
        <p className="mt-auto truncate px-2 text-xs text-ash">{email}</p>
      </aside>

      <div className="min-w-0">
        <header className="pt-safe sticky top-0 z-30 border-b border-rule bg-ink/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
            <Link href="/" aria-label="Today" className="press shrink-0 md:hidden"><LogoMark className="size-8" /></Link>
            <button type="button" onClick={() => setSwitcher(true)} className="press flex min-w-0 items-center gap-2 rounded-full border border-rule px-3.5 py-1.5 text-sm hover:border-rule-strong">
              <span className={`size-2 shrink-0 rounded-full ${focus ? "bg-bone" : "bg-ash"}`} />
              <span className="truncate">{focus ? focus.name : "All clients"}</span>
              <Icon name="chevron" className="size-3.5 rotate-90 text-ash" />
            </button>
            <div className="ml-auto flex items-center gap-1">
              <Link href="/scripts" prefetch aria-label="Script ideas" className="press grid size-10 place-items-center rounded-full text-mist hover:text-bone md:hidden">
                <Icon name="spark" />
              </Link>
              <Link href="/jobs" aria-label="Search content" className="press grid size-10 place-items-center rounded-full text-mist hover:text-bone md:hidden">
                <Icon name="search" />
              </Link>
              <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="press relative grid size-10 place-items-center rounded-full text-mist hover:text-bone">
                <Icon name="bell" />
                {unread ? <span className="tabular absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-bone px-1 text-[10px] font-bold text-ink">{unread > 99 ? "99+" : unread}</span> : null}
              </Link>
              <Link href="/settings" aria-label="Settings" className="press grid size-10 place-items-center rounded-full text-mist hover:text-bone md:hidden">
                <Icon name="settings" />
              </Link>
            </div>
          </div>
        </header>

        <main className="pb-nav mx-auto w-full max-w-3xl px-4 pt-6 md:pb-12">{children}</main>
      </div>

      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-ink/90 backdrop-blur-md md:hidden">
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
          {NAV.map((n) => {
            const on = active(n.href);
            const upload = n.href === "/upload";
            return (
              <li key={n.href} className="grid place-items-center">
                <Link href={n.href} prefetch aria-current={on ? "page" : undefined} className={`press flex flex-col items-center gap-0.5 text-[11px] ${on ? "text-bone" : "text-ash"}`}>
                  {upload ? (
                    <span className="grid size-11 place-items-center rounded-full bg-bone text-ink">
                      <Icon name="plus" className="size-6" />
                    </span>
                  ) : (
                    <>
                      <Icon name={n.icon} className="size-6" />
                      {n.label}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Sheet open={switcher} onClose={() => setSwitcher(false)} title="Switch client">
        <form action={setFocusWorkspace} className="grid gap-1">
          <input type="hidden" name="back" value={pathname} />
          {[{ id: "all", name: "All clients", is_agency: false }, ...workspaces].map((w) => {
            const on = (focus?.id ?? "all") === w.id;
            return (
              <button key={w.id} name="workspace" value={w.id} onClick={() => setTimeout(() => setSwitcher(false), 50)} className={`press flex min-h-12 items-center gap-3 rounded-xl px-3 text-left ${on ? "bg-graphite" : "hover:bg-char"}`}>
                <span className={`size-2 rounded-full ${on ? "bg-bone" : "bg-graphite"}`} />
                <span className="flex-1">{w.name}</span>
                {w.is_agency ? <span className="t-label">own</span> : null}
              </button>
            );
          })}
        </form>
        <Link href="/clients/new" onClick={() => setSwitcher(false)} className="press mt-4 flex h-12 items-center justify-center rounded-full border border-rule-strong text-sm font-semibold">
          Add client
        </Link>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Link href="/library" onClick={() => setSwitcher(false)} className="press flex h-11 items-center justify-center rounded-full border border-rule text-sm text-mist">Library</Link>
          <Link href="/guide" onClick={() => setSwitcher(false)} className="press flex h-11 items-center justify-center rounded-full border border-rule text-sm text-mist">How it works</Link>
          <Link href="/install" onClick={() => setSwitcher(false)} className="press flex h-11 items-center justify-center rounded-full border border-rule text-sm text-mist">Install app</Link>
        </div>
        <form action={signOut} onSubmit={clearOfflineData} className="mt-6 border-t border-rule pt-4">
          <button className="press flex items-center gap-2 text-sm text-mist hover:text-bone">
            <Icon name="logout" className="size-4" /> Sign out
          </button>
        </form>
      </Sheet>
    </div>
  );
}
