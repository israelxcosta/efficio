// Checks of an uploaded attachment before it is stored (Effy's fileSignature.js and zipLimit.js,
// stricter): the declared type must be on the allowlist, the extension must be one of that type's,
// and the bytes must carry the type's signature — a payload that is none of the accepted formats
// (HTML, SVG, a script, an executable) cannot enter disguised as one. Text formats (TXT, CSV, XML) have
// no signature: they must not contain NUL bytes and must not look like HTML/SVG. ZIP-based files
// (ZIP, DOCX, XLSX) are read through their central directory: the declared uncompressed total is
// capped (a "zip bomb" would hurt whoever opens it; nothing is decompressed here), ZIP64 and broken
// archives are refused, and DOCX/XLSX must contain the parts of a Word/Excel document. Macros and
// programs never enter (threat model T10): native executables and shebang scripts by their bytes, VBA
// projects in DOCX/XLSX/DOC/XLS, and executables, scripts or macro-enabled Office files inside a ZIP.
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
  /** Some entry would land outside the extraction folder ("zip slip": `..`, absolute or drive paths). */
  unsafePath: boolean;
  /** Some entry (any of them, not only the first 200 names) is a macro project or a dangerous file. */
  dangerous: boolean;
}

/**
 * Inside an archive or an Office document: executables and scripts, macro-enabled Office files, VBA
 * projects and ActiveX controls (threat model T10) — they run code on the computer of whoever opens them.
 */
const DANGEROUS_ENTRY =
  /(?:^|\/)(?:vbaProject\.bin|vbaData\.xml)$|(?:^|\/)activeX\/|\.(?:exe|dll|com|scr|pif|msi|msp|msc|cpl|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|lnk|jar|apk|app|dmg|pkg|deb|rpm|sh|run|iso|img|vhd|vhdx|reg|inf|docm|dotm|xlsm|xltm|xlsb|xlam|pptm|potm|ppsm|ppam|sldm)$/i;

export function isDangerousZipEntry(name: string): boolean {
  return DANGEROUS_ENTRY.test(name.replace(/\\/g, '/'));
}

/** `../x`, `a/../../x`, `/etc/x`, `C:\x` (with either separator): escapes the folder it is extracted to. */
export function isUnsafeZipPath(name: string): boolean {
  const path = name.replace(/\\/g, '/');
  return path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').includes('..');
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
  let unsafePath = false;
  let dangerous = false;
  let p = offset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > offset + size || view.getUint32(p, true) !== 0x02014b50) return null;
    const entrySize = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    if (entrySize === 0xffffffff) return null; // ZIP64 entry
    uncompressed += entrySize;
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    if (isUnsafeZipPath(name)) unsafePath = true;
    if (isDangerousZipEntry(name)) dangerous = true;
    if (names.length < 200) names.push(name);
    p += 46 + nameLength + extraLength + commentLength;
  }
  return { entries: total, uncompressed, names, unsafePath, dangerous };
}

const decodeHead = (bytes: Uint8Array, length: number) =>
  new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, length)));

const MARKUP = /<!doctype\s+html|<\s*(html|svg|script|iframe|object|embed)\b|http:\/\/www\.w3\.org\/(1999\/xhtml|2000\/svg)/i;

/** Native executables (Windows PE, ELF, Mach-O) and scripts with a shebang, whatever they claim to be. */
function isExecutable(bytes: Uint8Array): boolean {
  // Windows PE: "MZ" whose header points at a "PE\0\0" signature (a text starting with "MZ" is fine).
  if (startsWith(bytes, [0x4d, 0x5a]) && bytes.length >= 0x40) {
    const pe = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0x3c, true);
    if (startsWith(bytes, [0x50, 0x45, 0, 0], pe)) return true;
  }
  return (
    startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46]) || // ELF
    startsWith(bytes, [0xfe, 0xed, 0xfa, 0xce]) ||
    startsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(bytes, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe]) ||
    startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe]) || // Mach-O fat / Java class
    startsWith(bytes, [0x23, 0x21, 0x2f]) // #!/
  );
}

/** UTF-16LE "_VBA_PROJECT": the storage of the macros of a Word/Excel 97–2003 (OLE2) document. */
const VBA_PROJECT_UTF16 = Array.from('_VBA_PROJECT').flatMap((c) => [c.charCodeAt(0), 0]);

function containsSequence(bytes: Uint8Array, sequence: readonly number[]): boolean {
  const first = sequence[0]!;
  for (let i = bytes.indexOf(first); i >= 0 && i <= bytes.length - sequence.length; i = bytes.indexOf(first, i + 1)) {
    if (startsWith(bytes, sequence, i)) return true;
  }
  return false;
}

export const MACRO_REFUSED = 'Arquivos com macros ou programas não são aceitos. Salve sem macros (por exemplo, .docx/.xlsx) e envie de novo.';

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
  if (isExecutable(bytes)) return MACRO_REFUSED;
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
      if (!startsWith(bytes, OLE2)) return mismatch;
      return containsSequence(bytes, VBA_PROJECT_UTF16) ? MACRO_REFUSED : null;
    case 'application/zip':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
      if (!startsWith(bytes, ZIP_LOCAL) && !startsWith(bytes, ZIP_EMPTY)) return mismatch;
      const zip = readZipDirectory(bytes);
      if (!zip) return 'O arquivo compactado está corrompido ou usa um formato não aceito (ZIP64).';
      if (zip.unsafePath) return 'O arquivo compactado tem um caminho inválido (fora da pasta de destino).';
      if (zip.dangerous) return MACRO_REFUSED;
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
