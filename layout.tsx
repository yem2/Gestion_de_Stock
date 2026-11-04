import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/** Polices : Inter (texte et chiffres) et Plus Jakarta Sans (titres), hébergées avec le site lors du build. */
const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-sans" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-title" });

export const metadata: Metadata = {
  title: "Gestion de Stock | Tableau de bord",
  description: "Application de gestion commerciale des stocks en FCFA."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${inter.variable} ${jakarta.variable}`}>
      <body>{children}</body>
    </html>
  );
}
