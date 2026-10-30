import { useSyncExternalStore } from "react";
import { APP_LINKS, type AppLink } from "@/lib/app-links";
import { detectBrowser, detectForm, detectPlatform, isInAppBrowser, type Browser, type Form, type Platform } from "@/lib/platform";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallSnapshot = {
  ready: boolean;
  platform: Platform;
  form: Form;
  browser: Browser;
  inApp: boolean;
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
  dismissed: boolean;
  requested: boolean;
  link: AppLink | null;
};

const SERVER: InstallSnapshot = {
  ready: false, platform: "other", form: "desktop", browser: "other", inApp: false, standalone: false, installed: false,
  canPrompt: false, dismissed: true, requested: false, link: null
};
const STORAGE_KEY = "gs-install-dismissed-until";
const DAY = 86_400_000;

let snapshot: InstallSnapshot = SERVER;
let deferred: BeforeInstallPromptEvent | null = null;
let started = false;
const listeners = new Set<() => void>();

function update(patch: Partial<InstallSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

/** Démarre à l'import du module : l'événement du navigateur peut arriver avant l'affichage de l'interface. */
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const ua = navigator.userAgent;
  const platform = detectPlatform(ua, navigator.platform, navigator.maxTouchPoints);
  const media = window.matchMedia("(display-mode: standalone)");
  let until = 0;
  try { until = Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch { /* stockage indisponible */ }
  snapshot = {
    ...SERVER,
    platform,
    form: detectForm(ua, navigator.platform, navigator.maxTouchPoints),
    browser: detectBrowser(ua),
    inApp: isInAppBrowser(ua),
    standalone: media.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    dismissed: Date.now() < until,
    link: APP_LINKS[platform] ?? null
  };
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    update({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => { deferred = null; update({ installed: true, canPrompt: false }); });
  media.addEventListener("change", (event) => update({ standalone: event.matches }));
  window.setTimeout(() => update({ ready: true }), 1500);
}
start();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useInstall(): InstallSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER);
}

/** Y a-t-il quelque chose d'utile à proposer sur cet appareil ? (bouton d'installation, lien, ou mode d'emploi) */
export function shouldOffer(s: InstallSnapshot): boolean {
  if (s.standalone || s.installed) return false;
  if (s.link || s.canPrompt) return true;
  if (s.platform === "ios") return true;
  if (s.platform === "android" && s.browser === "firefox") return true;
  if (s.platform === "mac" && s.browser === "safari") return true;
  return false;
}

export function isVisible(s: InstallSnapshot): boolean {
  return s.ready && shouldOffer(s) && (s.requested || !s.dismissed);
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null; // l'événement ne peut servir qu'une fois
  update({ canPrompt: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") update({ installed: true });
  else dismissInstall(14);
  return outcome;
}

export function dismissInstall(days = 14) {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now() + days * DAY)); } catch { /* ignoré */ }
  update({ dismissed: true, requested: false });
}

/** Rouvre la fenêtre d'installation même si elle avait été repoussée (bouton du menu). */
export function requestInstallSheet() {
  update({ requested: true });
}
