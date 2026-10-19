import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestion de Stock | Tableau de bord",
  description: "Application de gestion commerciale des stocks en FCFA."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
