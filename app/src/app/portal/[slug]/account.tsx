"use client";

import Link from "@/components/link";
import { useState } from "react";
import { signOut } from "@/app/actions/auth";
import { Icon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { HapticsToggle } from "@/components/haptics-toggle";
import { PasskeySettings } from "@/components/passkeys";
import { clearOfflineData } from "@/components/pwa";
import { AppUpdateButton } from "@/components/app-update-button";
import { PushToggle } from "@/components/push-toggle";

/** Client's account sheet: fingerprint sign-in, password, vibration, sign out. */
export function PortalAccount({ email, devices }: { email: string; devices: { id: string; device_name: string | null; created_at: string; last_used_at: string | null }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Account" className="press grid size-9 place-items-center rounded-full border border-rule text-mist">
        <Icon name="settings" className="size-4" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Account">
        <p className="mb-4 text-sm text-ash">Signed in as {email}</p>
        <h3 className="mb-2 text-sm font-semibold">Fingerprint or face sign-in</h3>
        <PasskeySettings devices={devices} />
        <Link href="/reset-password" className="press mt-3 flex h-11 items-center justify-center gap-2 rounded-full border border-rule-strong text-sm font-semibold">
          <Icon name="key" className="size-4" /> Change password
        </Link>
        <div className="mt-5 grid gap-3">
          <PushToggle />
          <AppUpdateButton />
          <HapticsToggle />
        </div>
        <form action={signOut} onSubmit={clearOfflineData} className="mt-5">
          <button className="press flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm text-mist">
            <Icon name="logout" className="size-4" /> Sign out
          </button>
        </form>
      </Sheet>
    </>
  );
}
