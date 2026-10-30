import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import InstallPrompt from "@/components/install-prompt";
import PwaRegister from "@/components/pwa-register";
import "./globals.css";

/** Police unique de l'application : Inter (interface et chiffres), hébergée avec le site lors du build. */
const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Gestion de Stock | Tableau de bord",
  description: "Application de gestion commerciale des stocks en FCFA.",
  applicationName: "Gestion de Stock",
  appleWebApp: { capable: true, title: "Gestion de Stock", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
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
      <body>
        {children}
        <PwaRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
