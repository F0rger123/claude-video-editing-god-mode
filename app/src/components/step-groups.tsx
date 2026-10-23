"use client";

import { Children, useState, type ReactNode } from "react";

/**
 * Shows long forms one section at a time (Back / Next). Every section stays mounted, so the
 * single <form> still submits all fields. The last step shows the form's own submit button.
 */
export function StepGroups({ titles, children, submit }: { titles: string[]; children: ReactNode; submit: ReactNode }) {
  const [i, setI] = useState(0);
  const parts = Children.toArray(children);
  const last = i === parts.length - 1;
  return (
    <div>
      <ol className="mb-4 flex gap-1.5" aria-label="Steps">
        {titles.map((t, n) => (
          <li key={t} className={`h-1 flex-1 rounded-full ${n <= i ? "bg-bone" : "bg-graphite"}`}>
            <span className="sr-only">{t}</span>
          </li>
        ))}
      </ol>
      <p className="t-label mb-4">Step {i + 1} of {parts.length} · {titles[i]}</p>
      {parts.map((p, n) => (
        <div key={n} hidden={n !== i}>
          {p}
        </div>
      ))}
      <div className="pb-safe sticky bottom-16 z-20 -mx-4 mt-6 flex gap-2 bg-gradient-to-t from-ink via-ink/95 to-transparent px-4 pb-4 pt-6 md:bottom-0">
        {i > 0 ? (
          <button type="button" onClick={() => setI(i - 1)} className="press h-14 rounded-full border border-rule-strong bg-ink px-6 text-sm font-semibold">Back</button>
        ) : null}
        {last ? (
          <div className="flex-1">{submit}</div>
        ) : (
          <button type="button" onClick={() => setI(i + 1)} className="press h-14 flex-1 rounded-full bg-bone text-base font-semibold text-ink">Next</button>
        )}
      </div>
    </div>
  );
}
