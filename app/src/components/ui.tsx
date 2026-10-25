import Link from "@/components/link";
import type { ReactNode } from "react";
import { JOB_STATUS_LABEL, PLATFORM_LABEL, type JobStatus, type Platform } from "@/lib/domain/types";
import { statusTone } from "@/lib/domain/status";
import { Icon, type IconName } from "@/components/icons";

/** Reusable primitives. No data access here, so they can move into the agency as-is. */

const TONE: Record<ReturnType<typeof statusTone>, string> = {
  neutral: "border-rule-strong text-mist",
  active: "border-active/50 text-active",
  attention: "border-attention/60 text-attention",
  danger: "border-danger/60 text-danger",
  success: "border-success/60 text-success",
  muted: "border-rule text-ash",
};

export function StatusPill({ status, className = "" }: { status: JobStatus; className?: string }) {
  const tone = statusTone(status);
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${TONE[tone]} ${className}`}>
      {tone === "active" ? <span className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" /> : null}
      {JOB_STATUS_LABEL[status]}
    </span>
  );
}

const POST_LABEL: Record<string, string> = {
  draft: "Draft",
  awaiting_approval: "Needs approval",
  approved: "Approved",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function PostPill({ status }: { status: string }) {
  const tone = status === "failed" ? TONE.danger : status === "published" ? TONE.success : status === "awaiting_approval" ? TONE.attention : status === "publishing" ? TONE.active : TONE.neutral;
  return <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium ${tone}`}>{POST_LABEL[status] ?? status}</span>;
}

export function PlatformTag({ platform }: { platform: string }) {
  return <span className="t-label rounded border border-rule px-1.5 py-0.5">{PLATFORM_LABEL[platform as Platform] ?? platform}</span>;
}

export function PageHeader({ title, back, action, meta }: { title: string; back?: string; action?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end gap-3">
      {back ? (
        <Link href={back} aria-label="Back" className="press -ml-2 grid size-10 shrink-0 place-items-center rounded-full text-mist hover:text-bone">
          <Icon name="back" />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="t-display truncate">{title}</h1>
        {meta ? <div className="mt-2 text-sm text-mist">{meta}</div> : null}
      </div>
      {action}
    </header>
  );
}

export function Section({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {typeof count === "number" ? <span className="tabular text-sm text-ash">{count}</span> : null}
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

export function ButtonLink({ href, children, variant = "solid", icon, className = "" }: { href: string; children: ReactNode; variant?: "solid" | "ghost"; icon?: IconName; className?: string }) {
  const base = variant === "solid" ? "bg-bone text-ink" : "border border-rule-strong text-bone hover:border-bone";
  return (
    <Link href={href} className={`press inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold ${base} ${className}`}>
      {icon ? <Icon name={icon} className="size-4" /> : null}
      {children}
    </Link>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-rule px-5 py-8 text-center">
      <p className="font-medium">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-sm text-sm text-ash">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Large tappable count tile for the dashboard: the number is the point. */
export function CountTile({ href, label, value, tone = "neutral" }: { href: string; label: string; value: number; tone?: "neutral" | "attention" | "danger" }) {
  const zero = value === 0;
  const color = zero ? "text-ash" : tone === "danger" ? "text-danger" : tone === "attention" ? "text-attention" : "text-bone";
  return (
    <Link href={href} className={`press flex min-h-24 flex-col justify-between rounded-2xl border border-rule bg-coal p-4 hover:border-rule-strong ${zero ? "opacity-70" : ""}`}>
      <span className={`tabular text-4xl font-semibold tracking-tight ${color}`}>{value}</span>
      <span className="text-sm text-mist">{label}</span>
    </Link>
  );
}

export function Meter({ used, limit, label }: { used: number; limit?: number | null; label: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-mist">{label}</span>
        <span className="tabular">
          {used}
          {limit ? <span className="text-ash">/{limit}</span> : <span className="text-ash"> · no limit</span>}
        </span>
      </div>
      {pct !== null ? (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-graphite">
          <div className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-attention" : "bg-bone"}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function Notice({ tone = "attention", children }: { tone?: "attention" | "danger" | "neutral"; children: ReactNode }) {
  const color = tone === "danger" ? "border-danger/50 text-danger" : tone === "attention" ? "border-attention/50 text-attention" : "border-rule text-mist";
  return <div className={`flex gap-2.5 rounded-xl border px-4 py-3 text-sm ${color}`}><Icon name="alert" className="mt-0.5 size-4 shrink-0" /><div className="min-w-0">{children}</div></div>;
}
