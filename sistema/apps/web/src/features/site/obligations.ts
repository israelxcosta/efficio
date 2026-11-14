// The month of a company's obligations, for the public site's calendar ("O mês da sua empresa").
// Reference days of the federal rules, the same ones the office's recurring tasks use (DAS on the
// 20th, DCTFWeb on the last business day of the month after the period (IN RFB 2.248/2025; the office
// transmits it earlier, by the 15th, for the DARF of the 20th), payroll by the 5th business day...).
// National holidays are marked so
// the visitor sees which due days are not business days; how each obligation moves (earlier or
// later) is not computed here: the page says the office checks it every month.

export type Regime = 'mei' | 'simples' | 'presumido' | 'real';

export const REGIMES: { id: Regime; label: string; long: string }[] = [
  { id: 'mei', label: 'MEI', long: 'MEI' },
  { id: 'simples', label: 'Simples', long: 'Simples Nacional' },
  { id: 'presumido', label: 'Presumido', long: 'Lucro Presumido' },
  { id: 'real', label: 'Real', long: 'Lucro Real' },
];

/** When an obligation falls due in a month. */
export type DueRule =
  /** A fixed day of every month. */
  | { kind: 'day'; day: number }
  /** The last business day (Monday to Friday, not a national holiday) of the listed months (1–12; all when omitted). */
  | { kind: 'last-business-day'; months?: number[] }
  /** Once a year, on a fixed day or on the last business day of the month. */
  | { kind: 'annual'; month: number; day: number | 'last-business-day' }
  /** No fixed calendar day: counted in business days or set by the state. Shown as text. */
  | { kind: 'floating'; label: string };

export interface Obligation {
  id: string;
  name: string;
  /** Label inside the calendar cell. */
  short: string;
  /** What it is, in a few words. */
  detail: string;
  regimes: Regime[];
  /** Only for companies with employees. */
  employees?: boolean;
  due: DueRule;
}

const ALL: Regime[] = ['mei', 'simples', 'presumido', 'real'];
const COMPANIES: Regime[] = ['simples', 'presumido', 'real'];
const PROFIT: Regime[] = ['presumido', 'real'];

export const OBLIGATIONS: Obligation[] = [
  { id: 'das-mei', name: 'DAS-MEI', short: 'DAS', detail: 'guia mensal do MEI', regimes: ['mei'], due: { kind: 'day', day: 20 } },
  { id: 'das', name: 'DAS do Simples Nacional', short: 'DAS', detail: 'apuração no PGDAS-D e guia', regimes: ['simples'], due: { kind: 'day', day: 20 } },
  { id: 'dctfweb', name: 'DCTFWeb', short: 'DCTFWeb', detail: 'débitos do eSocial e da EFD-Reinf', regimes: COMPANIES, due: { kind: 'last-business-day' } },
  { id: 'inss', name: 'INSS da DCTFWeb', short: 'INSS', detail: 'DARF do pró-labore e da folha', regimes: COMPANIES, due: { kind: 'day', day: 20 } },
  { id: 'reinf', name: 'EFD-Reinf', short: 'Reinf', detail: 'retenções e serviços tomados', regimes: PROFIT, due: { kind: 'day', day: 15 } },
  { id: 'pis-cofins', name: 'PIS e COFINS', short: 'PIS/COFINS', detail: 'DARF sobre o faturamento', regimes: PROFIT, due: { kind: 'day', day: 25 } },
  { id: 'balancete', name: 'Balancete do mês', short: 'Balancete', detail: 'entrega do escritório', regimes: COMPANIES, due: { kind: 'day', day: 25 } },
  { id: 'irpj-tri', name: 'IRPJ e CSLL trimestrais', short: 'IRPJ', detail: 'apuração do trimestre', regimes: ['presumido'], due: { kind: 'last-business-day', months: [1, 4, 7, 10] } },
  { id: 'irpj-mensal', name: 'IRPJ e CSLL por estimativa', short: 'IRPJ', detail: 'recolhimento mensal', regimes: ['real'], due: { kind: 'last-business-day' } },
  { id: 'efd-contrib', name: 'EFD-Contribuições', short: 'EFD', detail: '10º dia útil do 2º mês seguinte', regimes: PROFIT, due: { kind: 'floating', label: '10º dia útil' } },
  { id: 'sped-fiscal', name: 'SPED Fiscal (EFD ICMS/IPI)', short: 'SPED', detail: 'comércio e indústria', regimes: PROFIT, due: { kind: 'floating', label: 'prazo do estado' } },
  { id: 'salarios', name: 'Salários e holerites', short: 'Folha', detail: 'fechamento da folha', regimes: ALL, employees: true, due: { kind: 'floating', label: 'até o 5º dia útil' } },
  { id: 'esocial', name: 'eSocial: eventos do mês', short: 'eSocial', detail: 'fechamento dos periódicos', regimes: ALL, employees: true, due: { kind: 'day', day: 15 } },
  { id: 'fgts', name: 'FGTS Digital', short: 'FGTS', detail: 'guia do FGTS da equipe', regimes: ALL, employees: true, due: { kind: 'day', day: 20 } },
  { id: 'defis', name: 'DEFIS', short: 'DEFIS', detail: 'declaração anual do Simples', regimes: ['simples'], due: { kind: 'annual', month: 3, day: 31 } },
  { id: 'dasn-simei', name: 'DASN-SIMEI', short: 'DASN', detail: 'declaração anual do MEI', regimes: ['mei'], due: { kind: 'annual', month: 5, day: 31 } },
  { id: 'ecd', name: 'ECD', short: 'ECD', detail: 'escrituração contábil digital', regimes: PROFIT, due: { kind: 'annual', month: 6, day: 'last-business-day' } },
  { id: 'ecf', name: 'ECF', short: 'ECF', detail: 'escrituração contábil fiscal', regimes: PROFIT, due: { kind: 'annual', month: 7, day: 'last-business-day' } },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Easter Sunday (Gregorian, Meeus/Jones/Butcher), as [month 1–12, day]. */
export function easter(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

/** National holidays of a year, keyed by "MM-DD" (Lei 662/1949, 6.802/1980, 14.759/2023 and Good Friday). */
export function nationalHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>([
    ['01-01', 'Confraternização Universal'],
    ['04-21', 'Tiradentes'],
    ['05-01', 'Dia do Trabalho'],
    ['09-07', 'Independência'],
    ['10-12', 'Nossa Senhora Aparecida'],
    ['11-02', 'Finados'],
    ['11-15', 'Proclamação da República'],
    ['11-20', 'Consciência Negra'],
    ['12-25', 'Natal'],
  ]);
  const [m, d] = easter(year);
  const goodFriday = new Date(Date.UTC(year, m - 1, d - 2));
  holidays.set(`${pad(goodFriday.getUTCMonth() + 1)}-${pad(goodFriday.getUTCDate())}`, 'Sexta-feira Santa');
  return holidays;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isBusinessDay(year: number, month: number, day: number, holidays = nationalHolidays(year)): boolean {
  const w = weekday(year, month, day);
  return w !== 0 && w !== 6 && !holidays.has(`${pad(month)}-${pad(day)}`);
}

export function lastBusinessDay(year: number, month: number): number {
  const holidays = nationalHolidays(year);
  for (let day = daysInMonth(year, month); day > 0; day--) if (isBusinessDay(year, month, day, holidays)) return day;
  return daysInMonth(year, month);
}

export function appliesTo(o: Obligation, regime: Regime, employees: boolean): boolean {
  return o.regimes.includes(regime) && (!o.employees || employees);
}

/** The calendar day of `o` in this month, or null (floating, or not due this month). */
export function dueDay(o: Obligation, year: number, month: number): number | null {
  const due = o.due;
  if (due.kind === 'day') return Math.min(due.day, daysInMonth(year, month));
  if (due.kind === 'last-business-day') return !due.months || due.months.includes(month) ? lastBusinessDay(year, month) : null;
  if (due.kind === 'annual') {
    if (due.month !== month) return null;
    return due.day === 'last-business-day' ? lastBusinessDay(year, month) : Math.min(due.day, daysInMonth(year, month));
  }
  return null;
}

export interface AgendaDay {
  day: number;
  weekday: number;
  /** National holiday name, when there is one. */
  holiday: string | null;
  businessDay: boolean;
  items: Obligation[];
}

export interface MonthAgenda {
  year: number;
  month: number;
  /** Due days in order, each with its obligations. */
  days: AgendaDay[];
  /** Obligations without a fixed calendar day (business-day counts, state deadlines). */
  floating: Obligation[];
  /** Total of obligations of the month (dated + floating). */
  total: number;
}

export function monthAgenda(year: number, month: number, regime: Regime, employees: boolean): MonthAgenda {
  const holidays = nationalHolidays(year);
  const byDay = new Map<number, Obligation[]>();
  const floating: Obligation[] = [];
  for (const o of OBLIGATIONS) {
    if (!appliesTo(o, regime, employees)) continue;
    if (o.due.kind === 'floating') {
      floating.push(o);
      continue;
    }
    const day = dueDay(o, year, month);
    if (day === null) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), o]);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, items]) => ({
      day,
      weekday: weekday(year, month, day),
      holiday: holidays.get(`${pad(month)}-${pad(day)}`) ?? null,
      businessDay: isBusinessDay(year, month, day, holidays),
      items,
    }));
  return { year, month, days, floating, total: days.reduce((n, d) => n + d.items.length, 0) + floating.length };
}

export interface CalendarCell {
  day: number;
  /** False for the leading/trailing days of the neighbouring months. */
  inMonth: boolean;
  weekday: number;
  holiday: string | null;
}

/** The month as whole weeks, Monday first (like the app's mini calendar). */
export function calendarCells(year: number, month: number): CalendarCell[] {
  const holidays = nationalHolidays(year);
  const first = weekday(year, month, 1);
  const lead = (first + 6) % 7;
  const total = daysInMonth(year, month);
  const prevTotal = daysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  const cells: CalendarCell[] = [];
  for (let i = lead; i > 0; i--) cells.push({ day: prevTotal - i + 1, inMonth: false, weekday: (first - i + 7) % 7, holiday: null });
  for (let day = 1; day <= total; day++) {
    cells.push({ day, inMonth: true, weekday: weekday(year, month, day), holiday: holidays.get(`${pad(month)}-${pad(day)}`) ?? null });
  }
  let next = 1;
  while (cells.length % 7 !== 0) cells.push({ day: next++, inMonth: false, weekday: (cells.length + 1) % 7, holiday: null });
  return cells;
}

export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "dia 15 · domingo, feriado (Proclamação da República)". */
export function dayLabel(d: AgendaDay): string {
  const when = d.holiday ? `${WEEKDAYS[d.weekday]}, feriado` : WEEKDAYS[d.weekday];
  return `dia ${d.day} · ${when}`;
}

/** The due days of the month that are not business days, for the note under the calendar. */
export function nonBusinessDueDays(agenda: MonthAgenda): number[] {
  return agenda.days.filter((d) => !d.businessDay).map((d) => d.day);
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
