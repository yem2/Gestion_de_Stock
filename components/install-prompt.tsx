"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, MonitorSmartphone, Share, Smartphone, X } from "lucide-react";
import { dismissInstall, isVisible, promptInstall, useInstall } from "@/lib/install";

/** Fenêtre qui propose d'installer l'application, avec un texte et une action adaptés à l'appareil. */
export default function InstallPrompt() {
  const s = useInstall();
  const [steps, setSteps] = useState(false);
  if (!isVisible(s)) return null;

  const desktop = s.platform === "windows" || s.platform === "mac" || s.platform === "linux";
  const title = s.platform === "android" ? (s.form === "tablet" ? "Installer sur votre tablette Android" : "Installer l’application Android")
    : s.platform === "ios" ? (s.form === "tablet" ? "Installer sur votre iPad" : "Installer sur votre iPhone")
    : "Installer sur votre ordinateur";
  const text = desktop
    ? "Ouvrez Gestion de Stock dans sa propre fenêtre, comme un logiciel, avec une icône sur votre bureau."
    : "Accédez à Gestion de Stock depuis votre écran d’accueil, en plein écran, comme une application.";

  // Mode d'emploi quand le navigateur ne propose pas de bouton d'installation.
  let instructions: React.ReactNode = null;
  if (s.platform === "ios") {
    instructions = s.inApp ? (
      <p className="install-note">Ce navigateur intégré ne permet pas l’installation. Ouvrez le lien dans <strong>Safari</strong> (menu ⋯ → Ouvrir dans le navigateur).</p>
    ) : (
      <ol className="install-steps">
        <li>Touchez le bouton <strong>Partager</strong> <Share size={14} aria-hidden="true" /> {s.form === "tablet" ? "en haut de l’écran" : "en bas de l’écran"}.</li>
        <li>Faites défiler et touchez <strong>« Sur l’écran d’accueil »</strong>.</li>
        <li>Touchez <strong>« Ajouter »</strong> : l’icône apparaît parmi vos applications.</li>
      </ol>
    );
  } else if (s.platform === "mac" && s.browser === "safari") {
    instructions = <ol className="install-steps"><li>Dans le menu <strong>Fichier</strong>, choisissez <strong>« Ajouter au Dock »</strong>.</li></ol>;
  } else if (s.platform === "android" && !s.canPrompt) {
    instructions = <ol className="install-steps"><li>Ouvrez le menu <strong>⋮</strong> du navigateur, puis touchez <strong>« Installer »</strong> ou <strong>« Ajouter à l’écran d’accueil »</strong>.</li></ol>;
  }

  return (
    <section className="install-sheet" role="region" aria-labelledby="install-title">
      <div className="install-head">
        <span className="install-icon" aria-hidden="true">{desktop ? <MonitorSmartphone size={22} /> : <Smartphone size={22} />}</span>
        <div>
          <h2 id="install-title">{title}</h2>
          <p>{text}</p>
        </div>
        <button type="button" className="icon-btn" onClick={() => dismissInstall(14)} aria-label="Fermer et me le reproposer plus tard"><X size={18} /></button>
      </div>

      {(steps || s.platform !== "ios" || s.inApp) && instructions}

      <div className="install-actions">
        {s.canPrompt && (
          <button type="button" className="btn btn-primary" onClick={() => void promptInstall()}><Download size={18} /> Installer</button>
        )}
        {s.link && (
          <a className={`btn ${s.canPrompt ? "" : "btn-primary"}`} href={s.link.url} target="_blank" rel="noopener noreferrer"><Download size={18} /> {s.link.label}</a>
        )}
        {s.platform === "ios" && !steps && !s.inApp && (
          <button type="button" className={`btn ${s.link ? "" : "btn-primary"}`} onClick={() => setSteps(true)}><Share size={18} /> Voir comment faire</button>
        )}
        <button type="button" className="btn" onClick={() => dismissInstall(14)}>Plus tard</button>
      </div>
      <div className="install-foot">
        <Link href="/installer" className="install-all">Toutes les versions</Link>
        <button type="button" className="install-never" onClick={() => dismissInstall(365)}>Ne plus me le proposer</button>
      </div>
    </section>
  );
}
