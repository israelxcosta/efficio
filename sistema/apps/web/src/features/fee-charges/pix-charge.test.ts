import { describe, expect, it } from 'vitest';
import type { PixReceiver } from '@effinance/shared';
import { pixChargeOf, pixCodeFor, pixMessageBlock } from './pix-charge';

const RECEIVER: PixReceiver = {
  available: true,
  keyType: 'email',
  key: 'financeiro@efficio.app',
  merchantName: 'Efficio Contabilidade Ltda',
  merchantCity: 'Mogi Guaçu',
  missing: [],
};

describe('Pix charge of a receivable', () => {
  it('builds the code with the amount and the fee competence', () => {
    const charge = pixChargeOf({ id: '0e8f6c3a-1111-2222-3333-444455556666', amount: 45000, description: 'Honorários', feeKind: 'fee', feeCompetence: '2026-10' });
    expect(charge).toEqual({ amount: 45000, description: 'Honorarios 10/2026', txid: '0e8f6c3a1111222233334444' + '5' });
    const code = pixCodeFor(RECEIVER, charge)!;
    expect(code).toContain('0122financeiro@efficio.app');
    expect(code).toContain('5406450.00');
    expect(code).toContain('6010Mogi Guacu');
  });

  it('gives no code when the office is incomplete or the amount is zero', () => {
    expect(pixCodeFor({ ...RECEIVER, available: false, missing: ['Cidade'] }, { amount: 100, description: 'x' })).toBeNull();
    expect(pixCodeFor(undefined, { amount: 100, description: 'x' })).toBeNull();
    expect(pixCodeFor(RECEIVER, { amount: 0, description: 'x' })).toBeNull();
  });

  it('explains how to pay in the message', () => {
    expect(pixMessageBlock('000201', 45000)).toBe(
      'Para pagar por Pix, copie o código abaixo e cole em "Pix Copia e Cola" no aplicativo do seu banco (o valor de R$ 450,00 já está incluso):\n\n000201',
    );
  });
});
