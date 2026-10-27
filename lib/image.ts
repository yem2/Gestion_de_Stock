/**
 * Redimensionne une photo dans le navigateur : recadrage carré au centre, 256×256, JPEG.
 * Le fichier envoyé au serveur pèse ainsi quelques dizaines de Ko, quelle que soit la photo d'origine.
 */
export async function resizeToAvatar(file: File, size = 256): Promise<{ contentType: "image/jpeg"; data: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Choisissez un fichier image.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Image trop lourde (15 Mo maximum).");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Format d’image non pris en charge. Utilisez JPEG, PNG ou WebP.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Traitement de l’image impossible sur cet appareil.");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { contentType: "image/jpeg", data: dataUrl.split(",")[1] };
}
