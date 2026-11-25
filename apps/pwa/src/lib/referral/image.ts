// Prepares the X-ray image for sharing with the receiving facility (E10-07, ADR-28).
// Re-encoding through a canvas makes a smaller JPEG under the 2 MB bucket limit and drops
// all file metadata (EXIF, including any GPS location the camera wrote). Pure sizing is
// tested in image.test.ts; the canvas part runs in the browser only.

export const MAX_SIDE = 1600;
export const MAX_BYTES = 2_000_000; // bucket limit is 2 MiB; keep a margin

/** Scale (w, h) down so the longer side is at most `max`; never scales up. */
export function fitWithin(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** JPEG qualities to try, highest first, until the file fits. */
export const QUALITIES = [0.85, 0.75, 0.65, 0.5] as const;

export async function toShareableJpeg(file: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const { w, h } = fitWithin(bitmap.width, bitmap.height);
  if (w === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  for (const q of QUALITIES) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  return null;
}
