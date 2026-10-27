import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/** Police unique de l'application : Inter (interface et chiffres), hébergée avec le site lors du build. */
const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Gestion de Stock | Tableau de bord",
  description: "Application de gestion commerciale des stocks en FCFA."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0c0e"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
