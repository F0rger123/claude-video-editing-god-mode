/**
 * White-label settings. Every user-facing name comes from here, so a business can deploy the app
 * under its own brand by setting build variables (NEXT_PUBLIC_* values are inlined at build time).
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "God Mode Cut";
export const APP_SHORT_NAME = process.env.NEXT_PUBLIC_APP_SHORT_NAME || "God Mode Cut";
/** The business that runs the app (shown to clients as "with <name>", "Ask <name> for an invite"). */
export const AGENCY_NAME = process.env.NEXT_PUBLIC_AGENCY_NAME || "Studio HQ";
/** Optional Android app (a signed APK the business builds itself). Leave empty to hide the download. */
export const ANDROID_PACKAGE = process.env.NEXT_PUBLIC_ANDROID_PACKAGE || "";
export const ANDROID_APK_URL = process.env.NEXT_PUBLIC_ANDROID_APK_URL || "";
export const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL || "https://cut.example.com").replace(/^https?:\/\//, "").replace(/\/$/, "");
