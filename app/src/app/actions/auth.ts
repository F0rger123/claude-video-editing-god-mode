"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete("azc-ws");
  redirect("/login");
}

/** Remembers which client the owner is focused on (phone-friendly "switch client"). */
export async function setFocusWorkspace(formData: FormData) {
  const id = String(formData.get("workspace") ?? "");
  const store = await cookies();
  if (!id || id === "all") store.delete("azc-ws");
  else if (/^[0-9a-f-]{36}$/i.test(id)) store.set("azc-ws", id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 90 });
  const back = String(formData.get("back") ?? "/");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}
