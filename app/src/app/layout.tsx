import { APP_NAME, APP_SHORT_NAME } from "@/lib/brand";
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Haptics } from "@/components/haptics";
import { CachedRefresh } from "@/components/pwa";
import { AppUpdate } from "@/components/app-update";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s — ${APP_NAME}` },
  description: `${APP_NAME}: uploads, editing, review, approvals and publishing.`,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  // It's an app: no pinch / double-tap zoom, and it always fits the phone's width.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US" className={`${GeistSans.variable} ${GeistMono.variable} h-full`}>
      <body className="min-h-full">
        {/* If a stored copy of a screen points at code from an older deploy, drop stored copies and reload once. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `addEventListener("error",function(e){var t=e.target;if(!t||t.tagName!=="SCRIPT"||(t.src||"").indexOf("/_next/static/")<0)return;try{if(sessionStorage.getItem("azc-reloaded"))return;sessionStorage.setItem("azc-reloaded","1")}catch(_){}(window.caches?caches.keys().then(function(k){return Promise.all(k.map(function(n){return caches.delete(n)}))}):Promise.resolve()).then(function(){location.reload()})},true);`,
          }}
        />
        <Haptics />
        <CachedRefresh stamp={new Date().toISOString()} />
        <AppUpdate />
        {children}
      </body>
    </html>
  );
}
