import { AGENCY_NAME, APP_SHORT_NAME } from "@/lib/brand";
import Link from "@/components/link";
import { InstallGuide } from "./install-guide";

export const metadata = { title: "Install the app", robots: { index: false, follow: false } };

/** Public page (no sign-in needed) so it can be sent to clients as a link. */
export default function InstallPage() {
  return (
    <main className="pt-safe mx-auto w-full max-w-lg px-5 py-10">
      <p className="text-sm text-ash">{AGENCY_NAME}</p>
      <h1 className="t-display mt-1 mb-6">Get the app.</h1>
      <p className="mb-6 text-mist">{APP_SHORT_NAME} installs straight from this website onto your home screen. No app store, no download file, nothing to update.</p>
      <InstallGuide />
      <p className="mt-10 text-center text-sm">
        <Link href="/login" className="text-mist underline underline-offset-4">Sign in instead</Link>
      </p>
    </main>
  );
}
