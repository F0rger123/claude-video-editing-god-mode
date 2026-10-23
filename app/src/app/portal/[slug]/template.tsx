import type { ReactNode } from "react";

/** Re-mounted on every navigation, so each screen eases in. */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-in">{children}</div>;
}
