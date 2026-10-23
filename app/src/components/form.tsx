"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/forms";
import { haptic } from "@/lib/haptics";

export function SubmitButton({ children, pending = "Saving…", variant = "solid", className = "", name, value, haptic }: { children: ReactNode; pending?: string; variant?: "solid" | "ghost" | "danger"; className?: string; name?: string; value?: string; haptic?: "success" | "warning" | "error" | "select" }) {
  const status = useFormStatus();
  const busy = status.pending && (!name || status.data?.get(name) === value);
  const style =
    variant === "solid" ? "bg-bone text-ink" : variant === "danger" ? "border border-danger/60 text-danger" : "border border-rule-strong text-bone hover:border-bone";
  return (
    <button type="submit" name={name} value={value} disabled={status.pending} data-haptic={haptic ?? (variant === "danger" ? "warning" : variant === "solid" ? "select" : undefined)} className={`press inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-50 ${style} ${className}`}>
      {busy ? pending : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState | undefined }) {
  // Every action result is felt as well as read: success buzz, or the error pattern.
  useEffect(() => {
    if (state?.error) haptic("error");
    else if (state?.success) haptic("success");
  }, [state]);
  if (!state?.error && !state?.success) return null;
  return (
    <p role={state.error ? "alert" : "status"} className={`text-sm ${state.error ? "text-danger" : "text-success"}`}>
      {state.error ?? state.success}
    </p>
  );
}

/** Form bound to a server action returning ActionState; optional reset on success. */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state.success) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <div className="mt-3">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {hint ? <span className="ml-2 font-normal text-ash">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Toggle({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 border-b border-rule py-2 last:border-0">
      <span>
        <span className="block text-sm">{label}</span>
        {hint ? <span className="block text-xs text-ash">{hint}</span> : null}
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-graphite transition-colors peer-checked:bg-bone peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-bone after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-ash after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-ink" />
    </label>
  );
}

export function ChipGroup({ name, options, defaultValues = [], type = "checkbox" }: { name: string; options: { value: string; label: string }[]; defaultValues?: string[]; type?: "checkbox" | "radio" }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value}>
          <input type={type} name={name} value={o.value} defaultChecked={defaultValues.includes(o.value)} className="sr-only" />
          <span className="chip press">{o.label}</span>
        </label>
      ))}
    </div>
  );
}
