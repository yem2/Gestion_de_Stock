import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import InstallHub from "@/components/install-hub";

export const metadata: Metadata = { title: "Installer l’application | Gestion de Stock" };
export const dynamic = "force-dynamic";

/** Adresse publique de cette page (pour le QR code) : APP_URL si définie, sinon l'adresse de la requête. */
async function publicUrl() {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured && /^https?:\/\//i.test(configured)) return `${configured}/installer`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") === "http" ? "http" : "https";
  return /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `${proto}://${host}/installer` : "https://localhost/installer";
}

export default async function InstallerPage() {
  const url = await publicUrl();
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, width: 168, errorCorrectionLevel: "M", color: { dark: "#15171c", light: "#ffffff" } });
  return <InstallHub qrSvg={qrSvg} url={url} />;
}
