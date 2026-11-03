// Task attachments in the browser (spec §9.1, item 5): the type from the extension (the contract's
// list), the limits checked before sending (the API checks them again, and the file's signature),
// names truncated in the middle and sizes in pt-BR. Pure functions, tested in phase2-logic.test.ts.

import {
  fileExtension,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TASK,
  MAX_TASK_ATTACHMENT_BYTES,
  TASK_ATTACHMENT_TYPES,
  type TaskAttachmentType,
} from '@effinance/shared';

/** Files picked or dropped at once. */
export const MAX_FILES_AT_ONCE = 5;

export const ATTACHMENT_ERRORS = {
  tooBig: 'O arquivo passa de 10 MB.',
  empty: 'O arquivo está vazio.',
  type: 'Tipo de arquivo não aceito. Envie PDF, imagem (PNG, JPG ou WebP), Word, Excel, XML, TXT, CSV ou ZIP.',
  count: `Esta tarefa já tem ${MAX_ATTACHMENTS_PER_TASK} anexos.`,
  total: 'Os anexos desta tarefa já somam 50 MB.',
  atOnce: `Envie até ${MAX_FILES_AT_ONCE} arquivos de uma vez.`,
  network: 'Não foi possível enviar. Confira a conexão e tente de novo.',
} as const;

const BY_EXTENSION = new Map<string, TaskAttachmentType>(
  (Object.entries(TASK_ATTACHMENT_TYPES) as [TaskAttachmentType, { extensions: readonly string[] }][]).flatMap(([type, def]) =>
    def.extensions.map((ext) => [ext, type] as const),
  ),
);

/** `accept` of the file input: the extensions of the contract. */
export const ATTACHMENT_ACCEPT = [...BY_EXTENSION.keys()].map((ext) => `.${ext}`).join(',');

/**
 * Content type to send for a file: the one of its extension (browsers disagree on MIME types — a CSV
 * is `application/vnd.ms-excel` on Windows, XML may be `text/xml`), or null when not accepted.
 */
export function attachmentTypeOf(fileName: string): TaskAttachmentType | null {
  return BY_EXTENSION.get(fileExtension(fileName)) ?? null;
}

export interface FileLike {
  name: string;
  size: number;
}

export interface AttachmentCheck<F extends FileLike> {
  accepted: { file: F; contentType: TaskAttachmentType }[];
  rejected: { file: F; message: string }[];
}

/**
 * Which of the picked files can be sent, given what the task already has: type, empty file and size
 * per file, then how many fit in the 50 files and 50 MB of the task (in the order picked).
 */
export function checkAttachments<F extends FileLike>(files: F[], existing: { count: number; bytes: number }): AttachmentCheck<F> {
  const out: AttachmentCheck<F> = { accepted: [], rejected: [] };
  let count = existing.count;
  let bytes = existing.bytes;
  files.forEach((file, index) => {
    const contentType = attachmentTypeOf(file.name);
    let message: string | null = null;
    if (index >= MAX_FILES_AT_ONCE) message = ATTACHMENT_ERRORS.atOnce;
    else if (!contentType) message = ATTACHMENT_ERRORS.type;
    else if (file.size === 0) message = ATTACHMENT_ERRORS.empty;
    else if (file.size > MAX_ATTACHMENT_BYTES) message = ATTACHMENT_ERRORS.tooBig;
    else if (count >= MAX_ATTACHMENTS_PER_TASK) message = ATTACHMENT_ERRORS.count;
    else if (bytes + file.size > MAX_TASK_ATTACHMENT_BYTES) message = ATTACHMENT_ERRORS.total;
    if (message || !contentType) {
      out.rejected.push({ file, message: message ?? ATTACHMENT_ERRORS.type });
      return;
    }
    count += 1;
    bytes += file.size;
    out.accepted.push({ file, contentType });
  });
  return out;
}

export type AttachmentIconKind = 'text' | 'image' | 'sheet' | 'code' | 'archive';

/** Neutral icon of a type: text for PDF, Word and TXT; image; sheet for Excel and CSV; code for XML; archive for ZIP. */
export function attachmentIconKind(type: TaskAttachmentType): AttachmentIconKind {
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/zip') return 'archive';
  if (type === 'application/xml') return 'code';
  if (type === 'text/csv' || type.includes('excel') || type.includes('spreadsheet')) return 'sheet';
  return 'text';
}

/** "contrato-soc…alteracao.pdf": cut in the middle, keeping the extension in sight. */
export function middleTruncate(name: string, max = 32): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : '';
  const stem = name.slice(0, name.length - ext.length);
  const room = max - ext.length - 1;
  const head = Math.ceil(room / 2);
  const tail = Math.floor(room / 2);
  return `${stem.slice(0, head)}…${stem.slice(stem.length - tail)}${ext}`;
}

/** "48 KB", "1,2 MB", "820 bytes". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/** Reads a file as base64 (the API takes the file inside JSON), reporting the read progress (0..1). */
export function fileToBase64(file: Blob, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o arquivo.'));
    reader.onabort = () => reject(new DOMException('Cancelado', 'AbortError'));
    reader.onload = () => {
      const url = String(reader.result ?? '');
      resolve(url.slice(url.indexOf(',') + 1));
    };
    signal?.addEventListener('abort', () => reader.abort(), { once: true });
    reader.readAsDataURL(file);
  });
}
