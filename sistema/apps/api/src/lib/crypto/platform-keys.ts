// Platform-wide keys for data that has no workspace context — e.g. the Open Finance webhook index,
// keyed by the aggregator's item id, and the profile photos (one per user, across workspaces). Each key is 32 random bytes wrapped by the key provider
// (`encryptSecret`: KMS in production) and stored in `platform_keys`; the first instance to need it
// creates it (concurrent creators converge on the stored one). Use from the system connection, never
// inside a tenant transaction.

import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client';
import { platformKeys } from '../../db/schema';
import { fromBase64Url, randomBytes, toBase64Url, toHex, utf8 } from './encoding';
import type { KeyProvider } from './key-provider';
import { keyProvider } from './keyring';

const cache = new WeakMap<KeyProvider, Map<string, Promise<CryptoKey>>>();

type KeyUse = 'hmac' | 'aes';

async function load(db: DbExecutor, provider: KeyProvider, name: string, use: KeyUse): Promise<CryptoKey> {
  const context = `platform-key:${name}`;
  const read = async () => (await db.select({ wrapped: platformKeys.wrappedKey }).from(platformKeys).where(eq(platformKeys.name, name)))[0];
  let row = await read();
  if (!row) {
    const wrapped = await provider.encryptSecret(toBase64Url(randomBytes(32)), context);
    await db.insert(platformKeys).values({ name, wrappedKey: wrapped }).onConflictDoNothing();
    row = await read();
    if (!row) throw new Error(`platform key ${name} could not be stored`);
  }
  const raw = fromBase64Url(await provider.decryptSecret(row.wrapped, context));
  return use === 'hmac'
    ? globalThis.crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    : globalThis.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function platformKey(db: DbExecutor, name: string, use: KeyUse = 'hmac'): Promise<CryptoKey> {
  const provider = keyProvider();
  let keys = cache.get(provider);
  if (!keys) cache.set(provider, (keys = new Map()));
  // A key name is bound to one use (an HMAC key is never also an encryption key).
  const slot = `${use}:${name}`;
  let key = keys.get(slot);
  if (!key) {
    key = load(db, provider, name, use);
    keys.set(slot, key);
    key.catch(() => keys.delete(slot));
  }
  return key;
}

/**
 * Encrypts bytes with the platform key `name` (AES-256-GCM): `iv (12) || ciphertext || tag (16)`, AAD
 * bound to `name:context` (e.g. the user id), so content copied to another row does not decrypt.
 */
export async function platformEncryptBytes(db: DbExecutor, name: string, context: string, data: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(12);
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(`${name}:${context}`) },
    await platformKey(db, name, 'aes'),
    data as Uint8Array<ArrayBuffer>,
  );
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return out;
}

export async function platformDecryptBytes(db: DbExecutor, name: string, context: string, data: Uint8Array): Promise<Uint8Array> {
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.slice(0, 12), additionalData: utf8(`${name}:${context}`) },
    await platformKey(db, name, 'aes'),
    data.slice(12),
  );
  return new Uint8Array(plain);
}

/** HMAC-SHA-256 (hex) of `value` with the platform key `name`. */
export async function platformHmac(db: DbExecutor, name: string, value: string): Promise<string> {
  const mac = await globalThis.crypto.subtle.sign('HMAC', await platformKey(db, name), utf8(value));
  return toHex(new Uint8Array(mac));
}
