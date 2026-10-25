import Link from "@/components/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";

export const metadata = { title: "Your portals" };

export default async function PortalPicker() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.portals.length === 1) redirect(`/portal/${viewer.portals[0].slug}`);
  if (!viewer.portals.length) redirect(viewer.staffRole ? "/" : "/no-access");
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="t-display mb-6">Choose a business.</h1>
      <ul className="grid gap-2">
        {viewer.portals.map((p) => (
          <li key={p.slug}>
            <Link href={`/portal/${p.slug}`} className="press block rounded-2xl border border-rule px-5 py-4 font-medium hover:border-rule-strong">{p.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
