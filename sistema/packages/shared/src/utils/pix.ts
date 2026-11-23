// Static Pix "copia e cola" (BR Code) with the amount inside: the payer's bank app opens with the value
// already filled in, using only the office's Pix key (no bank API, no fee). Format: EMV® QRCPS-MPM as
// specified by the Banco Central do Brasil (Manual de Padrões para Iniciação do Pix), CRC16-CCITT-FALSE.
// A static code does not settle the receivable by itself: the payment is confirmed on the statement
// (Relatórios → Recebimentos) or by the bank import.

import type { PixKeyType } from '../constants';
import { normalizePixKey } from '../schemas';

export interface PixPayloadInput {
  /** The office's Pix key, as stored (normalized for its type). */
  key: string;
  /** Receiver name shown by the payer's bank (cut to 25 ASCII characters). */
  merchantName: string;
  /** Receiver city (cut to 15 ASCII characters). */
  merchantCity: string;
  /** Cents; 0 or absent = the payer types the amount. */
  amount?: number;
  /** Identifier shown on the statement when the bank supports it: letters and digits, up to 25. */
  txid?: string | null;
  /** Free text shown to the payer by some banks ("Honorários 10/2026"). */
  description?: string | null;
}

/** Max sizes of the fields (EMV). */
export const PIX_LIMITS = { name: 25, city: 15, txid: 25, merchantAccount: 99 } as const;

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** ASCII only (accents removed), the characters every bank app accepts, single spaces. */
export function pixText(value: string, max: number): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

/** Letters and digits only, up to 25; '***' when empty (= no identifier, as the standard asks). */
export function pixTxid(value: string | null | undefined): string {
  const clean = (value ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, PIX_LIMITS.txid);
  return clean || '***';
}

/** CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF), 4 uppercase hex digits. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** "1234.50" from cents (EMV amount: dot as decimal separator, no thousands separator). */
export function pixAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** The BR Code (Pix copia e cola). Throws when the receiver data cannot form a valid code. */
export function buildPixPayload({ key, merchantName, merchantCity, amount, txid, description }: PixPayloadInput): string {
  const name = pixText(merchantName, PIX_LIMITS.name);
  const city = pixText(merchantCity, PIX_LIMITS.city);
  if (!key.trim()) throw new Error('Chave Pix ausente');
  if (!name) throw new Error('Nome do recebedor ausente');
  if (!city) throw new Error('Cidade do recebedor ausente');
  if (amount !== undefined && (!Number.isInteger(amount) || amount < 0 || amount > 99_999_999_999)) throw new Error('Valor inválido');

  const gui = tlv('00', 'br.gov.bcb.pix');
  const keyField = tlv('01', key.trim());
  // The description shares the 99 characters of the merchant account with the GUI and the key.
  const room = PIX_LIMITS.merchantAccount - gui.length - keyField.length - 4;
  const info = description && room > 0 ? pixText(description, Math.min(room, 72)) : '';
  const account = gui + keyField + (info ? tlv('02', info) : '');

  const body =
    tlv('00', '01') +
    tlv('26', account) +
    tlv('52', '0000') +
    tlv('53', '986') +
    (amount ? tlv('54', pixAmount(amount)) : '') +
    tlv('58', 'BR') +
    tlv('59', name) +
    tlv('60', city) +
    tlv('62', tlv('05', pixTxid(txid))) +
    '6304';
  return body + crc16(body);
}

/** True when the stored key is valid for its type (guards codes made from old or edited rows). */
export function isUsablePixKey(type: PixKeyType | null | undefined, key: string | null | undefined): boolean {
  return Boolean(type && key && normalizePixKey(type, key) === key);
}
