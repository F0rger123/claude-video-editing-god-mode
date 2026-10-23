"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

export function PortalNav({ items }: { items: { href: string; label: string; icon: IconName }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Portal" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-ink/90 backdrop-blur-md">
      <ul className="mx-auto grid h-16 max-w-md" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((n, i) => {
          const on = i === 0 ? pathname === n.href : pathname.startsWith(n.href);
          return (
            <li key={n.href} className="grid place-items-center">
              <Link href={n.href} prefetch aria-current={on ? "page" : undefined} className={`press flex flex-col items-center gap-0.5 text-[11px] ${on ? "text-bone" : "text-ash"}`}>
                <Icon name={n.icon} className="size-6" />
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
