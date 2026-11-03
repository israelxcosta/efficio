// CSV cells of the task report export (spec §14.2): `;` separator, quotes when needed and no formula
// injection — a value starting with = + - @, a tab or CR gets a leading ' (like Effy). Pure.

/** A CSV cell: quoted when needed; a leading = + - @ tab or CR gets a ' (no formula injection). */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
