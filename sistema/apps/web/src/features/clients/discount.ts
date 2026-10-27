// Discount for paying the fee by its due date (desconto por pontualidade), typed as a percentage.

/** Percentage typed by the user ("5", "2,5", "2.75%") → basis points (500 = 5%); null when invalid or not in (0, 100). */
export function parsePercentToBps(input: string): number | null {
  const text = input.trim().replace(/%$/, '').trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) return null;
  const bps = Math.round(Number(text) * 100);
  return bps > 0 && bps < 10_000 ? bps : null;
}

/** Basis points → the text shown in the percentage field ("5", "2,5"). */
export function bpsToPercentInput(bps: number): string {
  return bps > 0 ? (bps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '';
}
