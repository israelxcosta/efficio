// Images sent as data URIs (office logo and contract watermark, profile photo): the declared type must
// be PNG, JPEG or WebP (never SVG, which can carry scripts) and the bytes must carry that type's
// signature — a payload that is something else cannot enter disguised as an image. Pure (no Node-only
// API): runs in the browser demo too.

import { ValidationError } from './errors';
import { fromBase64 } from './crypto/encoding';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** The image type the bytes really are (null for anything else). */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, PNG)) return 'image/png';
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp';
  return null;
}

export interface DecodedImage {
  type: ImageType;
  bytes: Uint8Array;
}

/**
 * Decodes `data:image/<type>;base64,<data>` and checks the size and the signature (422 with a pt-BR
 * message otherwise).
 */
export function decodeImageDataUri(value: string, maxBytes: number, tooLarge: string): DecodedImage {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!m) throw new ValidationError('Use PNG, JPG ou WebP.');
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(m[2]!);
  } catch {
    throw new ValidationError('Imagem inválida.');
  }
  if (bytes.length === 0) throw new ValidationError('Imagem inválida.');
  if (bytes.length > maxBytes) throw new ValidationError(tooLarge);
  const declared = m[1] as ImageType;
  if (sniffImage(bytes) !== declared) {
    throw new ValidationError('O conteúdo do arquivo não corresponde a uma imagem PNG, JPG ou WebP.');
  }
  return { type: declared, bytes };
}

export function toDataUri(type: string, bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}
