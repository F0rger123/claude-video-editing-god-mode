import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "New password" };
export const dynamic = "force-dynamic";

/** Reached from the "reset password" email (already signed in by the link) or from Settings. */
export default async function ResetPasswordPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?error=link");
  return <NewPasswordForm email={viewer.email} />;
}
