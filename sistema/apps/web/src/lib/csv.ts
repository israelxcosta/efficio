// CSV for spreadsheets (Excel/LibreOffice in pt-BR): `;` separator, quoted cells, formulas neutralised,
// CRLF lines and a BOM so the accents open right. Shared by every "Exportar CSV".

/**
 * One cell: quoted, with formulas neutralised (a value starting with = + - @ tab or CR, even after
 * spaces, gets a leading apostrophe).
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^\s*[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Cents as "1234,56" (no thousands separator, so spreadsheets read it as a number). */
export const csvMoney = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/** Head + rows as the file's text (BOM included). */
export function toCsv(head: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const lines = [head, ...rows].map((r) => r.map(csvCell).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}
