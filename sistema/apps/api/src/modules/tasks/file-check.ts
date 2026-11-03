// Checks of an uploaded attachment before it is stored (Effy's fileSignature.js and zipLimit.js,
// stricter): the declared type must be on the allowlist, the extension must be one of that type's,
// and the bytes must carry the type's signature — a payload that is none of the accepted formats
// (HTML, SVG, a script, an executable) cannot enter disguised as one. Text formats (TXT, CSV, XML) have
// no signature: they must not contain NUL bytes and must not look like HTML/SVG. ZIP-based files
// (ZIP, DOCX, XLSX) are read through their central directory: the declared uncompressed total is
// capped (a "zip bomb" would hurt whoever opens it; nothing is decompressed here), ZIP64 and broken
// archives are refused, and DOCX/XLSX must contain the parts of a Word/Excel document.
// Pure (no Node-only API): runs in the browser demo too.

import { fileExtension, TASK_ATTACHMENT_TYPES, type TaskAttachmentType } from '@effinance/shared';

/** Declared uncompressed size a ZIP-based attachment may expand to. */
export const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 10_000;

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];

export interface ZipInfo {
  entries: number;
  uncompressed: number;
  names: string[];
}

/** Reads the central directory of a ZIP (never decompresses). Null for a broken or ZIP64 archive. */
export function readZipDirectory(bytes: Uint8Array): ZipInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minEocd = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= minEocd; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const total = view.getUint16(eocd + 10, true);
  const size = view.getUint32(eocd + 12, true);
  const offset = view.getUint32(eocd + 16, true);
  if (total === 0xffff || size === 0xffffffff || offset === 0xffffffff) return null; // ZIP64
  if (offset + size > eocd) return null;
  const names: string[] = [];
  const decoder = new TextDecoder();
  let uncompressed = 0;
  let p = offset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > offset + size || view.getUint32(p, true) !== 0x02014b50) return null;
    const entrySize = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    if (entrySize === 0xffffffff) return null; // ZIP64 entry
    uncompressed += entrySize;
    if (names.length < 200) names.push(decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength)));
    p += 46 + nameLength + extraLength + commentLength;
  }
  return { entries: total, uncompressed, names };
}

const decodeHead = (bytes: Uint8Array, length: number) =>
  new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, length)));

const MARKUP = /<!doctype\s+html|<\s*(html|svg|script|iframe|object|embed)\b|http:\/\/www\.w3\.org\/(1999\/xhtml|2000\/svg)/i;

function hasNul(bytes: Uint8Array, length = 8192): boolean {
  const end = Math.min(bytes.length, length);
  for (let i = 0; i < end; i++) if (bytes[i] === 0) return true;
  return false;
}

/** Why the attachment is refused (pt-BR), or null when it may be stored. */
export function attachmentProblem(fileName: string, contentType: TaskAttachmentType, bytes: Uint8Array): string | null {
  const type = TASK_ATTACHMENT_TYPES[contentType];
  if (!type) return 'Tipo de arquivo não permitido.';
  if (!(type.extensions as readonly string[]).includes(fileExtension(fileName)))
    return `A extensão do arquivo não corresponde ao tipo ${type.label}.`;
  const mismatch = 'O conteúdo do arquivo não corresponde ao tipo informado.';
  switch (contentType) {
    case 'application/pdf':
      return startsWith(bytes, PDF) ? null : mismatch;
    case 'image/png':
      return startsWith(bytes, PNG) ? null : mismatch;
    case 'image/jpeg':
      return startsWith(bytes, JPEG) ? null : mismatch;
    case 'image/webp':
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8) ? null : mismatch;
    case 'application/msword':
    case 'application/vnd.ms-excel':
      return startsWith(bytes, OLE2) ? null : mismatch;
    case 'application/zip':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
      if (!startsWith(bytes, ZIP_LOCAL) && !startsWith(bytes, ZIP_EMPTY)) return mismatch;
      const zip = readZipDirectory(bytes);
      if (!zip) return 'O arquivo compactado está corrompido ou usa um formato não aceito (ZIP64).';
      if (zip.entries > MAX_ZIP_ENTRIES || zip.uncompressed > MAX_UNCOMPRESSED_BYTES)
        return 'O arquivo expande para um tamanho muito maior que o permitido ao ser aberto. Envie um arquivo com menos conteúdo.';
      if (contentType !== 'application/zip') {
        const folder = contentType.includes('wordprocessingml') ? 'word/' : 'xl/';
        if (!zip.names.includes('[Content_Types].xml') || !zip.names.some((n) => n.startsWith(folder))) return mismatch;
      }
      return null;
    }
    case 'application/xml': {
      if (hasNul(bytes)) return mismatch;
      const head = decodeHead(bytes, 65536).replace(/^\uFEFF/, '').trimStart();
      if (!head.startsWith('<') || MARKUP.test(head)) return mismatch;
      return null;
    }
    case 'text/plain':
    case 'text/csv': {
      if (hasNul(bytes)) return mismatch;
      return MARKUP.test(decodeHead(bytes, 65536)) ? mismatch : null;
    }
  }
}

/** `attachment; filename="…"; filename*=UTF-8''…` with an ASCII fallback (RFC 6266 / 5987). */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
