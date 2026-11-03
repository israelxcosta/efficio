// Field-level encryption with a workspace data key: AES-256-GCM, random 96-bit IV, AAD binding the
// value to `${workspaceId}:${table}:${column}` (a ciphertext copied to another tenant, table or
// column fails to decrypt). Stored as `v1.<iv>.<ciphertext+tag>` (base64url).

import { fromBase64Url, fromUtf8, randomBytes, toBase64Url, toHex, utf8, type Bytes } from './encoding';

const PREFIX = 'v1';

export class DecryptionError extends Error {
  constructor(message = 'Falha ao decifrar dado protegido') {
    super(message);
    this.name = 'DecryptionError';
  }
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${PREFIX}.`) && value.split('.').length === 3;
}

export class FieldCipher {
  private constructor(
    readonly workspaceId: string,
    private readonly key: CryptoKey,
    private readonly indexKey: CryptoKey,
  ) {}

  static async create(workspaceId: string, dataKey: Bytes): Promise<FieldCipher> {
    const subtle = globalThis.crypto.subtle;
    const key = await subtle.importKey('raw', dataKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
    // The blind-index key is derived from the data key, so it is per workspace and is destroyed with it.
    const hkdf = await subtle.importKey('raw', dataKey, 'HKDF', false, ['deriveKey']);
    const indexKey = await subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: utf8('effinance:blind-index:v1') },
      hkdf,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    );
    return new FieldCipher(workspaceId, key, indexKey);
  }

  private aad(table: string, column: string): Bytes {
    return utf8(`${this.workspaceId}:${table}:${column}`);
  }

  async encrypt(table: string, column: string, value: string | null | undefined): Promise<string | null> {
    if (value === null || value === undefined || value === '') return value === '' ? '' : null;
    const iv = randomBytes(12);
    const ct = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: this.aad(table, column) },
      this.key,
      utf8(value),
    );
    return `${PREFIX}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ct))}`;
  }

  async decrypt(table: string, column: string, value: string | null | undefined): Promise<string | null> {
    if (value === null || value === undefined || value === '') return value === '' ? '' : null;
    if (!isEncrypted(value)) throw new DecryptionError('Dado protegido em formato desconhecido');
    const [, iv, ct] = value.split('.') as [string, string, string];
    try {
      const plain = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64Url(iv), additionalData: this.aad(table, column) },
        this.key,
        fromBase64Url(ct),
      );
      return fromUtf8(new Uint8Array(plain));
    } catch {
      throw new DecryptionError();
    }
  }

  /**
   * Encrypts binary content (a task attachment): `iv (12 bytes) || ciphertext || tag (16 bytes)`, with
   * the AAD bound to the workspace, the table, the column and `context` (the row id), so a content
   * copied to another row, table or workspace does not decrypt.
   */
  async encryptBytes(table: string, column: string, context: string, data: Uint8Array): Promise<Uint8Array> {
    const iv = randomBytes(12);
    const ct = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: utf8(`${this.workspaceId}:${table}:${column}:${context}`) },
      this.key,
      data as Bytes,
    );
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(ct), 12);
    return out;
  }

  async decryptBytes(table: string, column: string, context: string, data: Uint8Array): Promise<Uint8Array> {
    if (data.byteLength < 12 + 16) throw new DecryptionError('Dado protegido em formato desconhecido');
    try {
      const plain = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: data.slice(0, 12), additionalData: utf8(`${this.workspaceId}:${table}:${column}:${context}`) },
        this.key,
        data.slice(12),
      );
      return new Uint8Array(plain);
    } catch {
      throw new DecryptionError();
    }
  }

  /** Encrypts the given columns of a row-like object (other keys are copied as is). */
  async encryptFields<T extends Record<string, unknown>>(table: string, row: T, columns: readonly (keyof T & string)[]) {
    const out: Record<string, unknown> = { ...row };
    for (const c of columns) {
      if (c in row) out[c] = await this.encrypt(table, c, row[c] as string | null);
    }
    return out as T;
  }

  async decryptFields<T extends Record<string, unknown>>(table: string, row: T, columns: readonly (keyof T & string)[]) {
    const out: Record<string, unknown> = { ...row };
    for (const c of columns) out[c] = await this.decrypt(table, c, row[c] as string | null);
    return out as T;
  }

  /** Deterministic keyed hash (HMAC-SHA-256) for exact-match search over an encrypted value. */
  async blindIndex(value: string): Promise<string> {
    const mac = await globalThis.crypto.subtle.sign('HMAC', this.indexKey, utf8(value));
    return toHex(new Uint8Array(mac));
  }
}
