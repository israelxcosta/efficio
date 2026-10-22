/** Short axis label from cents: 1_400_000 → "14k", 350_000 → "3,5k", 120_000_000 → "1,2M". */
export const moneyAxisFormatter = (cents: number) => {
  const v = cents / 100;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
  if (abs >= 1_000_000) return `${sign}${fmt(Math.round((abs / 1_000_000) * 10) / 10)}M`;
  if (abs >= 1_000) return `${sign}${fmt(Math.round((abs / 1_000) * 10) / 10)}k`;
  return `${sign}${Math.round(abs)}`;
};
