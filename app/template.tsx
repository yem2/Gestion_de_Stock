"use client";

import { usePathname } from "next/navigation";
import InstallPrompt from "@/components/install-prompt";
import PwaRegister from "@/components/pwa-register";
import "@/components/install.css";

/**
 * Branche l'application installable sur toutes les pages (service worker, mode « application » sur iPhone/Android,
 * proposition d'installation). Ce fichier est volontairement indépendant du layout, du menu et de la configuration.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  return (
    <>
      <meta name="application-name" content="Gestion de Stock" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="Gestion de Stock" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      {children}
      <PwaRegister />
      {!pathname.startsWith("/installer") && <InstallPrompt />}
    </>
  );
}
