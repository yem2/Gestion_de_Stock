import type { MetadataRoute } from "next";

const androidPackage = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(process.env.NEXT_PUBLIC_ANDROID_PACKAGE ?? "") ? process.env.NEXT_PUBLIC_ANDROID_PACKAGE : undefined;

export default function manifest(): MetadataRoute.Manifest {
  const icon = (src: string, size: number, purpose?: "any" | "maskable") => ({ src, sizes: `${size}x${size}`, type: "image/png", ...(purpose ? { purpose } : {}) });
  return {
    id: "/",
    name: "Gestion de Stock",
    short_name: "Stock",
    description: "Application de gestion commerciale des stocks en FCFA : produits, mouvements, ventes, achats et paiements.",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f5f8",
    theme_color: "#0c0c0e",
    categories: ["business", "productivity"],
    icons: [
      icon("/icons/icon-192.png", 192, "any"),
      icon("/icons/icon-512.png", 512, "any"),
      icon("/icons/icon-maskable-512.png", 512, "maskable")
    ],
    // Une fois l'application Android publiée, le navigateur propose de l'ouvrir plutôt que de réinstaller la version web.
    ...(androidPackage ? { related_applications: [{ platform: "play", id: androidPackage, url: `https://play.google.com/store/apps/details?id=${androidPackage}` }], prefer_related_applications: false } : {}),
    shortcuts: [
      { name: "Nouvelle vente", short_name: "Ventes", url: "/ventes", icons: [icon("/icons/icon-192.png", 192)] },
      { name: "Produits", short_name: "Produits", url: "/produits", icons: [icon("/icons/icon-192.png", 192)] },
      { name: "Mouvements de stock", short_name: "Mouvements", url: "/mouvements", icons: [icon("/icons/icon-192.png", 192)] }
    ]
  };
}
