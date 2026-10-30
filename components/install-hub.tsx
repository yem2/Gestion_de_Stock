"use client";

import Image from "next/image";
import Link from "next/link";
import { Apple, Download, Laptop, MonitorSmartphone, Share, Smartphone, Tablet } from "lucide-react";
import { APP_LINKS } from "@/lib/app-links";
import { promptInstall, shouldOffer, useInstall } from "@/lib/install";
import type { Platform } from "@/lib/platform";

type Card = { id: Exclude<Platform, "other">; title: string; sub: string; icon: React.ReactNode; steps: React.ReactNode[] };

const CARDS: Card[] = [
  { id: "android", title: "Android", sub: "Téléphones et tablettes", icon: <Smartphone size={22} />,
    steps: ["Ouvrez cette page avec Chrome (ou Samsung Internet).", "Touchez « Installer » dans la fenêtre proposée, ou le menu ⋮ puis « Installer l’application »."] },
  { id: "ios", title: "iPhone et iPad", sub: "Safari recommandé", icon: <Apple size={22} />,
    steps: [<>Ouvrez cette page dans <strong>Safari</strong>.</>, <>Touchez <strong>Partager</strong> <Share size={14} aria-hidden="true" /> (en bas sur iPhone, en haut sur iPad).</>, <>Touchez <strong>« Sur l’écran d’accueil »</strong>, puis <strong>« Ajouter »</strong>.</>] },
  { id: "windows", title: "Windows", sub: "Chrome ou Edge", icon: <Laptop size={22} />,
    steps: ["Ouvrez cette page avec Chrome ou Edge.", "Cliquez sur « Installer » ou sur l’icône d’installation à droite de la barre d’adresse."] },
  { id: "mac", title: "Mac", sub: "Chrome, Edge ou Safari", icon: <MonitorSmartphone size={22} />,
    steps: ["Chrome ou Edge : cliquez sur « Installer » à droite de la barre d’adresse.", "Safari : menu Fichier → « Ajouter au Dock »."] },
  { id: "linux", title: "Linux et Chromebook", sub: "Chrome ou Edge", icon: <Tablet size={22} />,
    steps: ["Ouvrez cette page avec Chrome ou Edge.", "Cliquez sur « Installer » à droite de la barre d’adresse."] }
];

export default function InstallHub({ qrSvg, url }: { qrSvg: string; url: string }) {
  const s = useInstall();
  const current = s.platform;
  const installed = s.standalone || s.installed;

  return (
    <main className="hub">
      <header className="hub-head">
        <Image src="/icons/icon-192.png" alt="" width={64} height={64} className="hub-logo" priority />
        <div>
          <h1>Installer Gestion de Stock</h1>
          <p>Choisissez votre appareil. L’application s’ouvre dans sa propre fenêtre, avec une icône sur votre écran d’accueil ou votre bureau.</p>
        </div>
      </header>

      {installed && <p className="hub-ok" role="status">L’application est déjà installée sur cet appareil.</p>}
      {current === "windows" || current === "mac" || current === "linux" ? (
        s.browser === "firefox" && <p className="install-note">Firefox ne permet pas d’installer des applications web sur ordinateur : ouvrez cette page avec Chrome ou Edge.</p>
      ) : null}

      <section className="hub-grid" aria-label="Versions disponibles">
        {CARDS.map((card) => {
          const mine = card.id === current;
          const link = APP_LINKS[card.id];
          return (
            <article key={card.id} className={`hub-card ${mine ? "mine" : ""}`} aria-current={mine ? "true" : undefined}>
              <div className="hub-card-head">
                <span className="install-icon" aria-hidden="true">{card.icon}</span>
                <div>
                  <h2>{card.title}</h2>
                  <p>{card.sub}</p>
                </div>
                {mine && <span className="hub-badge">Votre appareil</span>}
              </div>
              <ol className="install-steps">{card.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
              <div className="install-actions">
                {mine && !installed && s.canPrompt && <button type="button" className="btn btn-primary" onClick={() => void promptInstall()}><Download size={18} /> Installer maintenant</button>}
                {link && <a className={`btn ${mine && s.canPrompt ? "" : "btn-primary"}`} href={link.url} target="_blank" rel="noopener noreferrer"><Download size={18} /> {link.label}</a>}
              </div>
              {mine && !installed && !s.canPrompt && !link && !shouldOffer(s) && s.platform !== "ios" && (
                <p className="hub-hint">Le bouton d’installation apparaît automatiquement quand votre navigateur le permet.</p>
              )}
            </article>
          );
        })}
      </section>

      <section className="hub-qr">
        <div className="hub-qr-code" role="img" aria-label="QR code vers cette page" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <div>
          <h2>Ouvrir sur votre téléphone ou tablette</h2>
          <p>Scannez ce code avec l’appareil photo pour ouvrir cette page directement sur l’appareil où vous voulez installer l’application.</p>
          <p className="hub-url">{url}</p>
        </div>
      </section>

      <p className="hub-back"><Link href="/">← Retour à l’application</Link></p>
    </main>
  );
}
