import { AGENCY_NAME } from "@/lib/brand";
import { signOut } from "@/app/actions/auth";

export const metadata = { title: "No access" };

export default function NoAccess() {
  return (
    <main className="mx-auto grid min-h-svh max-w-md content-center gap-4 px-6">
      <h1 className="t-display">No access yet.</h1>
      <p className="text-mist">You are signed in, but no workspace has been shared with this account. If you expected one, ask {AGENCY_NAME} to resend your invitation.</p>
      <form action={signOut}>
        <button className="press h-12 rounded-full border border-rule-strong px-5 text-sm font-semibold">Sign out</button>
      </form>
    </main>
  );
}
