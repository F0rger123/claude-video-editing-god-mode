import { APP_NAME, APP_SHORT_NAME } from "@/lib/brand";
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Haptics } from "@/components/haptics";
import { CachedRefresh } from "@/components/pwa";

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
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US" className={`${GeistSans.variable} ${GeistMono.variable} h-full`}>
      <body className="min-h-full">
        <Haptics />
        <CachedRefresh stamp={new Date().toISOString()} />
        {children}
      </body>
    </html>
  );
}
