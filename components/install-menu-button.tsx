"use client";

import { Download } from "lucide-react";
import { requestInstallSheet, shouldOffer, useInstall } from "@/lib/install";

/** Entrée permanente du menu : permet d'installer l'application même après avoir repoussé la proposition. */
export default function InstallMenuButton() {
  const s = useInstall();
  if (!shouldOffer(s)) return null;
  return (
    <button type="button" className="nav-item install-menu" onClick={requestInstallSheet}>
      <Download size={19} /> <span>Installer l’application</span>
    </button>
  );
}
