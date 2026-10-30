// Détection de l'appareil (fonctions pures, sans accès au navigateur : faciles à tester).
export type Platform = "android" | "ios" | "windows" | "mac" | "linux" | "other";
export type Form = "phone" | "tablet" | "desktop";
export type Browser = "chromium" | "safari" | "firefox" | "other";

export function detectPlatform(ua: string, navPlatform = "", touchPoints = 0): Platform {
  if (/android/i.test(ua)) return "android";
  // iPadOS se présente comme un Mac : on le reconnaît à son écran tactile.
  if (/iphone|ipod|ipad/i.test(ua) || (navPlatform === "MacIntel" && touchPoints > 1)) return "ios";
  if (/windows/i.test(ua)) return "windows";
  if (/macintosh|mac os x/i.test(ua)) return "mac";
  if (/linux|cros|x11/i.test(ua)) return "linux";
  return "other";
}

export function detectBrowser(ua: string): Browser {
  if (/firefox|fxios/i.test(ua)) return "firefox";
  if (/chrome|chromium|crios|edg|opr|samsungbrowser/i.test(ua)) return "chromium";
  if (/safari/i.test(ua)) return "safari";
  return "other";
}

/** Navigateurs intégrés à d'autres applications (Facebook, Instagram, WebView Android…) : l'installation y est impossible. */
export function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|Instagram|MicroMessenger|Line\/|TikTok|Snapchat|; wv\)/i.test(ua);
}

/** Type d'appareil : les consignes diffèrent (le bouton Partager de l'iPad est en haut, celui de l'iPhone en bas). */
export function detectForm(ua: string, navPlatform = "", touchPoints = 0): Form {
  const platform = detectPlatform(ua, navPlatform, touchPoints);
  if (platform === "ios") return /iphone|ipod/i.test(ua) ? "phone" : "tablet"; // iPadOS déguisé en Mac : tablette
  if (platform === "android") return /mobile/i.test(ua) ? "phone" : "tablet";  // les tablettes Android n'ont pas « Mobile »
  return "desktop";
}
