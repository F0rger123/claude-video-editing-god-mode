import { requireStaff } from "@/lib/auth";
import { getFocus, listWorkspaces, unreadCount } from "@/lib/data";
import { StaffShell } from "@/components/staff-shell";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  const [workspaces, focus, unread] = await Promise.all([listWorkspaces(), getFocus(), unreadCount(viewer.userId)]);
  return (
    <StaffShell workspaces={workspaces} focus={focus} unread={unread} email={viewer.email}>
      {children}
    </StaffShell>
  );
}
