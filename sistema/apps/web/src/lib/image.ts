// Images picked by the user (office logo, contract watermark, profile photo): type and size checked
// before anything is sent; SVG is never accepted (it can carry scripts).

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type ImageCheck = { ok: true } | { ok: false; error: string };

/** "Use PNG, JPG ou WebP." / "A logo passa de 500 KB." */
export function checkImageFile(file: { type: string; size: number }, maxBytes: number, tooBig: string): ImageCheck {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return { ok: false, error: 'Use PNG, JPG ou WebP.' };
  if (file.size > maxBytes) return { ok: false, error: tooBig };
  return { ok: true };
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

/** Opens the file picker for one image (resolves null when cancelled). */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = IMAGE_TYPES.join(',');
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export interface CropState {
  /** Zoom (1 = the image covers the square). */
  zoom: number;
  /** Offset of the image center from the square center, in square-size units (-0.5…0.5 range). */
  x: number;
  y: number;
}

/**
 * Source rectangle of a square crop: the image covers the square at zoom 1; zoom enlarges it and the
 * offset moves it, always kept inside the image (pure, tested).
 */
export function cropRect(width: number, height: number, crop: CropState): { sx: number; sy: number; size: number } {
  const zoom = Math.max(1, crop.zoom);
  const size = Math.min(width, height) / zoom;
  const maxX = (width - size) / 2;
  const maxY = (height - size) / 2;
  const cx = width / 2 - clamp(crop.x * size, -maxX, maxX);
  const cy = height / 2 - clamp(crop.y * size, -maxY, maxY);
  return { sx: cx - size / 2, sy: cy - size / 2, size };
}

/** Keeps the offset inside the image for the zoom (after a drag or a zoom change). */
export function clampCrop(width: number, height: number, crop: CropState): CropState {
  const zoom = Math.max(1, crop.zoom);
  const size = Math.min(width, height) / zoom;
  const maxX = (width - size) / 2 / size;
  const maxY = (height - size) / 2 / size;
  return { zoom, x: clamp(crop.x, -maxX, maxX), y: clamp(crop.y, -maxY, maxY) };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** Draws the crop in a 256×256 canvas and encodes it as WebP (falls back to JPEG). */
export async function renderCrop(image: HTMLImageElement, crop: CropState, out = 256): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível ajustar a imagem.');
  const { sx, sy, size } = cropRect(image.naturalWidth, image.naturalHeight, crop);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, size, size, 0, 0, out, out);
  let url = canvas.toDataURL('image/webp', 0.86);
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.88);
  return url;
}

/** A shown image (object URL) back to a data URI, through a canvas (CSP: no `fetch` of blob URLs). */
export function imageUrlToDataUrl(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0);
      const out = canvas.toDataURL('image/webp', 0.9);
      resolve(out.startsWith('data:image/webp') ? out : canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
