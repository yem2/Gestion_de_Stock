import type { Platform } from "@/lib/platform";

export type AppLink = { url: string; label: string };
type Env = Partial<Record<"android" | "ios" | "windows" | "mac" | "linux", string | undefined>>;

/** Seuls les liens https:// sont acceptés (jamais de javascript: ni de lien non chiffré). */
function cleanUrl(value: string | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function labelFor(platform: Exclude<Platform, "other">, url: string): string {
  const u = url.toLowerCase();
  if (platform === "android") {
    if (u.includes("play.google.com")) return "Télécharger sur Google Play";
    if (u.split("?")[0].endsWith(".apk")) return "Télécharger l’APK Android";
    return "Télécharger l’application Android";
  }
  if (platform === "ios") {
    if (u.includes("apps.apple.com")) return "Télécharger sur l’App Store";
    if (u.includes("testflight.apple.com")) return "Rejoindre sur TestFlight";
    return "Télécharger l’application iOS";
  }
  return { windows: "Télécharger pour Windows", mac: "Télécharger pour Mac", linux: "Télécharger pour Linux" }[platform];
}

/** Construit les liens de téléchargement natifs à partir de variables d'environnement (vides par défaut). */
export function resolveAppLinks(env: Env): Partial<Record<Platform, AppLink>> {
  const out: Partial<Record<Platform, AppLink>> = {};
  for (const platform of ["android", "ios", "windows", "mac", "linux"] as const) {
    const url = cleanUrl(env[platform]);
    if (url) out[platform] = { url, label: labelFor(platform, url) };
  }
  return out;
}

// Les variables NEXT_PUBLIC_* sont lues à la compilation : elles doivent être écrites en toutes lettres.
export const APP_LINKS = resolveAppLinks({
  android: process.env.NEXT_PUBLIC_ANDROID_APP_URL,
  ios: process.env.NEXT_PUBLIC_IOS_APP_URL,
  windows: process.env.NEXT_PUBLIC_WINDOWS_APP_URL,
  mac: process.env.NEXT_PUBLIC_MAC_APP_URL,
  linux: process.env.NEXT_PUBLIC_LINUX_APP_URL
});
