"use client";

import { useEffect } from "react";

/** Enregistre le service worker (production uniquement) : il rend l'application installable et gère la page hors ligne. */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}
