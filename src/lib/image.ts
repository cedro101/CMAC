// Enough to read a nutrition label, while keeping uploads quick and cheap.
const MAX_EDGE_PX = 1400;
const JPEG_QUALITY = 0.8;

export type LabelPhoto = { mediaType: "image/jpeg"; data: string };

// Shrinks a photo on the phone and returns it as base64. This also converts
// iPhone HEIC photos to JPEG.
export async function prepareLabelPhoto(file: File): Promise<LabelPhoto> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas isn't available");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

export function photoSrc(photo: LabelPhoto): string {
  return `data:${photo.mediaType};base64,${photo.data}`;
}
