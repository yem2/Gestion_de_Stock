import { qrcodegen } from "@/lib/qrcodegen";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** QR code au format SVG (sans aucune bibliothèque à installer). Les couleurs doivent être au format #RRGGBB. */
export function qrSvg(text: string, options: { border?: number; dark?: string; light?: string } = {}): string {
  const border = Math.max(0, Math.min(8, Math.floor(options.border ?? 2)));
  const dark = HEX.test(options.dark ?? "") ? options.dark! : "#15171c";
  const light = HEX.test(options.light ?? "") ? options.light! : "#ffffff";
  const qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM);
  const cells: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) if (qr.getModule(x, y)) cells.push(`M${x + border},${y + border}h1v1h-1z`);
  }
  const side = qr.size + border * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${cells.join(" ")}" fill="${dark}"/></svg>`;
}
