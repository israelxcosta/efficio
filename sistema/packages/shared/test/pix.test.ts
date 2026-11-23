// Static Pix (BR Code) with the amount inside: checked against the example of the Banco Central manual.
import { describe, expect, it } from 'vitest';
import { buildPixPayload, crc16, isUsablePixKey, pixText, pixTxid } from '../src';

const KEY = '123e4567-e12b-12d1-a456-426655440000';

describe('Pix copia e cola (BR Code estático)', () => {
  it('reproduces the example of the BCB manual (no amount)', () => {
    expect(buildPixPayload({ key: KEY, merchantName: 'Fulano de Tal', merchantCity: 'BRASILIA' })).toBe(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D',
    );
  });

  it('carries the amount (field 54) and a valid CRC', () => {
    const code = buildPixPayload({ key: KEY, merchantName: 'Efficio Contabilidade', merchantCity: 'São José dos Campos', amount: 123450, txid: 'HON-2026/10 ABC' });
    expect(code).toContain('5407' + '1234.50');
    expect(code).toContain('6015Sao Jose dos Ca');
    expect(code).toContain('62160512HON202610ABC');
    expect(code.slice(-4)).toBe(crc16(code.slice(0, -4)));
  });

  it('keeps the merchant account within 99 characters with a description', () => {
    const code = buildPixPayload({ key: KEY, merchantName: 'X', merchantCity: 'Y', amount: 100, description: 'Honorários de outubro de 2026 — cliente com nome bem comprido demais' });
    const len = Number(code.slice(code.indexOf('26') + 2, code.indexOf('26') + 4));
    expect(len).toBeLessThanOrEqual(99);
    expect(code).toContain('Honorarios de outubro');
  });

  it('cleans text and txid, and refuses incomplete receivers', () => {
    expect(pixText('  Açaí & Cia. Ltda!  ', 25)).toBe('Acai Cia. Ltda');
    expect(pixTxid('')).toBe('***');
    expect(pixTxid('a-b_c')).toBe('abc');
    expect(() => buildPixPayload({ key: KEY, merchantName: 'X', merchantCity: '' })).toThrow('Cidade');
    expect(() => buildPixPayload({ key: '', merchantName: 'X', merchantCity: 'Y' })).toThrow('Chave');
    expect(() => buildPixPayload({ key: KEY, merchantName: 'X', merchantCity: 'Y', amount: 1.5 })).toThrow('Valor');
  });

  it('accepts only keys stored normalized for their type', () => {
    expect(isUsablePixKey('random', KEY)).toBe(true);
    expect(isUsablePixKey('email', 'Financeiro@X.com')).toBe(false);
    expect(isUsablePixKey(null, KEY)).toBe(false);
  });
});
