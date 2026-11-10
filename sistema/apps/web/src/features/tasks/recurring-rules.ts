// Tarefas recorrentes (spec §10): the URL of the list, the wording of the legal deadline and the
// target, the preview of the next 3 periods with the non-business-day adjustments, the national
// holidays of the year and "Aplica-se a". Pure functions, tested in phase2-logic.test.ts.

import {
  addMonthKey,
  dayOfWeek,
  formatDateBR,
  MONTH_SHORT,
  nationalHolidays,
  nextOccurrences,
  RECURRENCE_PERIOD_LABELS,
  RECURRENCE_PERIODS,
  recurringMonths,
  TAX_REGIME_LABELS,
  TAX_REGIMES,
  type ISODate,
  type MonthKey,
  type RecurrencePeriod,
  type RecurringSchedule,
  type RecurringTask,
  type RecurringTaskQuery,
  type TaskClientOption,
  type TaskRecurrence,
  type TaxRegime,
} from '@effinance/shared';
import { isUuid } from '@/lib/safe-url';
import { shortName } from './due';
import { competenceName } from './occurrence';
import { repeatShortText } from './repeat-rules';

// ---------------------------------------------------------------------------
// URL (`busca`, `periodicidade`, `departamento`, `responsavel`, `regime`, `situacao`, `recorrente`)
// ---------------------------------------------------------------------------

const PERIOD_PARAM: Record<RecurrencePeriod, string> = {
  weekly: 'semanal',
  monthly: 'mensal',
  bimonthly: 'bimestral',
  quarterly: 'trimestral',
  semiannual: 'semestral',
  annual: 'anual',
};

export interface RecurringFilters {
  search: string;
  period: RecurrencePeriod | '';
  department: string;
  assignee: string;
  regime: TaxRegime | '';
  /** Tipo (revision 4): obligations (origin registry), repetitions (origin task) or both. */
  kind: '' | 'obligations' | 'repetitions';
  status: 'active' | 'ended';
  /** Recurring task whose registry is open: an id, `nova` (create) or ''. */
  open: string;
}

export function parseRecurringFilters(params: URLSearchParams): RecurringFilters {
  const period = params.get('periodicidade');
  const regime = params.get('regime') ?? '';
  const open = params.get('recorrente') ?? '';
  const id = (v: string | null) => (isUuid(v) ? v : '');
  return {
    search: (params.get('busca') ?? '').slice(0, 200),
    period: (RECURRENCE_PERIODS.find((p) => PERIOD_PARAM[p] === period) ?? '') as RecurrencePeriod | '',
    department: id(params.get('departamento')),
    assignee: id(params.get('responsavel')),
    regime: (TAX_REGIMES as readonly string[]).includes(regime) ? (regime as TaxRegime) : '',
    kind: params.get('tipo') === 'obrigacoes' ? 'obligations' : params.get('tipo') === 'repeticoes' ? 'repetitions' : '',
    status: params.get('situacao') === 'encerradas' ? 'ended' : 'active',
    // With `periodo` the parameter belongs to the occurrence sheet.
    open: params.get('periodo') ? '' : open === 'nova' || isUuid(open) ? open : '',
  };
}

export function writeRecurringFilters(params: URLSearchParams, patch: Partial<RecurringFilters>): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null | undefined) => (value ? next.set(key, value) : next.delete(key));
  if (patch.search !== undefined) set('busca', patch.search.trim());
  if (patch.period !== undefined) set('periodicidade', patch.period ? PERIOD_PARAM[patch.period] : null);
  if (patch.department !== undefined) set('departamento', patch.department);
  if (patch.assignee !== undefined) set('responsavel', patch.assignee);
  if (patch.regime !== undefined) set('regime', patch.regime);
  if (patch.kind !== undefined) set('tipo', patch.kind === 'obligations' ? 'obrigacoes' : patch.kind === 'repetitions' ? 'repeticoes' : null);
  if (patch.status !== undefined) set('situacao', patch.status === 'ended' ? 'encerradas' : null);
  if (patch.open !== undefined) set('recorrente', patch.open);
  return next;
}

export function recurringFilterCount(f: RecurringFilters): number {
  return [f.search, f.period, f.department, f.assignee, f.regime, f.kind].filter(Boolean).length;
}

export function toRecurringQuery(f: RecurringFilters, month: MonthKey): RecurringTaskQuery {
  return {
    month,
    search: f.search || undefined,
    period: f.period || undefined,
    departmentId: f.department || undefined,
    assigneeId: f.assignee || undefined,
    regime: f.regime || undefined,
    origin: f.kind === 'obligations' ? 'registry' : f.kind === 'repetitions' ? 'task' : 'all',
    status: f.status,
  };
}

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT: Record<number, string> = { 1: 'segunda', 2: 'terça', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sábado', 7: 'domingo' };
const WEEKDAY_LONG: Record<number, string> = {
  1: 'segunda-feira',
  2: 'terça-feira',
  3: 'quarta-feira',
  4: 'quinta-feira',
  5: 'sexta-feira',
  6: 'sábado',
  7: 'domingo',
};
const DOW_ABBR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DOW_NAME = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const monthsShort = (months: number[]) => months.map((m) => MONTH_SHORT[m - 1]!.toLowerCase());

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

type Rule = Pick<RecurringTask, 'period' | 'dueDay' | 'dueMonth'>;

/** Column "Prazo legal": "Toda sexta", "Dia 20", "Dia 31 ou o último", "Dia 20 · jan, mar, mai…", "31/05". */
export function dueRuleText(r: Rule): string {
  if (r.period === 'weekly') {
    const day = WEEKDAY_SHORT[r.dueDay] ?? '';
    return r.dueDay >= 6 ? `Todo ${day}` : `Toda ${day}`;
  }
  const day = r.dueDay === 31 ? 'Dia 31 ou o último' : `Dia ${r.dueDay}`;
  if (r.period === 'monthly') return day;
  if (r.period === 'annual') return `${String(r.dueDay).padStart(2, '0')}/${String(r.dueMonth ?? 1).padStart(2, '0')}`;
  const months = monthsShort(recurringMonths(r));
  return `Dia ${r.dueDay} · ${r.period === 'semiannual' ? joinList(months) : months.join(', ')}`;
}

/** Hint of the form: "Toda sexta-feira.", "Todo dia 20.", "Dia 20 de jan, mar, mai, jul, set e nov.", "Todo ano em 31/05." */
export function dueRuleHint(r: Rule): string {
  if (r.period === 'weekly') {
    const day = WEEKDAY_LONG[r.dueDay];
    if (!day) return '';
    return `${r.dueDay >= 6 ? 'Todo' : 'Toda'} ${day}.`;
  }
  let text: string;
  if (r.period === 'monthly') text = `Todo dia ${r.dueDay}.`;
  else if (r.period === 'annual') text = `Todo ano em ${String(r.dueDay).padStart(2, '0')}/${String(r.dueMonth ?? 1).padStart(2, '0')}.`;
  else text = `Dia ${r.dueDay} de ${joinList(monthsShort(recurringMonths(r)))}.`;
  const short = shortMonthsWarning(r);
  return short ? `${text} ${short}` : text;
}

/** "Em fevereiro, dia 28." when the day does not exist in some month of the rule (it becomes the last day). */
export function shortMonthsWarning(r: Rule): string | null {
  if (r.period === 'weekly' || r.dueDay <= 28) return null;
  const months = r.period === 'monthly' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : recurringMonths(r);
  const lastDay = (m: number) => (m === 2 ? 28 : [4, 6, 9, 11].includes(m) ? 30 : 31);
  const cut = months.filter((m) => lastDay(m) < r.dueDay);
  if (cut.length === 0) return null;
  const groups = new Map<number, string[]>();
  for (const m of cut) groups.set(lastDay(m), [...(groups.get(lastDay(m)) ?? []), competenceName(`2026-${String(m).padStart(2, '0')}`).split(' ')[0]!]);
  const parts = [...groups.entries()].sort(([a], [b]) => b - a).map(([day, names]) => `em ${joinList(names)}, dia ${day}`);
  const text = parts.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

type RepetitionRule = Pick<TaskRecurrence, 'frequency' | 'interval' | 'weekdays' | 'dueDay' | 'nonBusinessDayRule' | 'ends' | 'endDate' | 'count' | 'targetDaysBefore'>;

/**
 * Column "Prazo" (spec §10.2): an obligation says the legal deadline and, below, the target, the rule and
 * the reference; a repetition says its rule ("Toda segunda") and, below, how it ends or its target.
 */
export function recurringDeadlineText(
  r: Pick<RecurringTask, 'origin' | 'period' | 'dueDay' | 'dueMonth' | 'targetDaysBefore' | 'nonBusinessDayRule' | 'referenceOffset'> & { recurrence: RepetitionRule | null },
): { line1: string; line2: string } {
  if (r.origin !== 'task' || !r.recurrence) return { line1: dueRuleText(r), line2: targetRuleText(r) };
  const rule = r.recurrence;
  const short = repeatShortText(rule);
  const line2 =
    rule.ends === 'count' && rule.count
      ? `${rule.count} ${rule.count === 1 ? 'vez' : 'vezes'}`
      : rule.ends === 'date' && rule.endDate
        ? `termina em ${rule.endDate.slice(5, 7)}/${rule.endDate.slice(0, 4)}`
        : rule.targetDaysBefore > 0
          ? `meta ${rule.targetDaysBefore} ${rule.targetDaysBefore === 1 ? 'dia' : 'dias'} antes`
          : '';
  return { line1: `${short.charAt(0).toUpperCase()}${short.slice(1)}`, line2 };
}

/** Second line of the column: "meta 5 dias antes · antecipa · ref. mês anterior". */
export function targetRuleText(r: Pick<RecurringTask, 'targetDaysBefore' | 'nonBusinessDayRule' | 'referenceOffset' | 'period'>): string {
  const meta = r.targetDaysBefore === 0 ? 'meta no prazo' : `meta ${r.targetDaysBefore} ${r.targetDaysBefore === 1 ? 'dia' : 'dias'} antes`;
  const rule = r.nonBusinessDayRule === 'anticipate' ? 'antecipa' : r.nonBusinessDayRule === 'postpone' ? 'posterga' : 'mantém';
  const parts = [meta, rule];
  if (r.period !== 'weekly') parts.push(referenceOptionLabel(r.referenceOffset, true));
  return parts.join(' · ');
}

/** "Mesmo mês do prazo", "Mês anterior", "2 meses antes"… (`short`: "ref. mês anterior"). */
export function referenceOptionLabel(offset: number, short = false): string {
  if (short) return offset === 0 ? 'ref. mesmo mês' : offset === 1 ? 'ref. mês anterior' : `ref. ${offset} meses antes`;
  return offset === 0 ? 'Mesmo mês do prazo' : offset === 1 ? 'Mês anterior' : `${offset} meses antes`;
}

export const NON_BUSINESS_HINTS = {
  anticipate: 'Vai para o dia útil anterior.',
  postpone: 'Vai para o próximo dia útil.',
  keep: 'Fica na data, mesmo em fim de semana ou feriado.',
} as const;

// ---------------------------------------------------------------------------
// Preview and holidays
// ---------------------------------------------------------------------------

const dm = (d: ISODate) => formatDateBR(d).slice(0, 5);
const dow = (d: ISODate) => DOW_ABBR[dayOfWeek(d)]!;

/**
 * The next 3 periods from the later of the current competence and the start (§10.3), with the
 * adjustments in sight: "Novembro (ref. 10/2026): meta 13/11 (sex) · prazo legal 19/11 (qui; 20/11 é
 * feriado: Dia Nacional de Zumbi e da Consciência Negra)." Weekly: "Semana de 02/11: meta 05/11 (qui) ·
 * prazo legal 06/11 (sex)."
 */
export function previewLines(schedule: RecurringSchedule, current: MonthKey, start: MonthKey | null): string[] {
  const from = start && start > current ? start : current;
  return nextOccurrences(schedule, from, 3).map((o) => {
    let legal = `prazo legal ${dm(o.legalDueDate)} (${dow(o.legalDueDate)}`;
    if (o.nominalDate !== o.legalDueDate || o.holiday || [0, 6].includes(dayOfWeek(o.nominalDate))) {
      const why = o.holiday ? `${dm(o.nominalDate)} é feriado: ${o.holiday}` : [0, 6].includes(dayOfWeek(o.nominalDate)) ? `${dm(o.nominalDate)} é ${DOW_NAME[dayOfWeek(o.nominalDate)]}` : null;
      if (why) legal += `; ${why}${o.nominalDate === o.legalDueDate ? ', fica na data' : ''}`;
    }
    legal += ')';
    const meta = o.targetDate < o.legalDueDate ? `meta ${dm(o.targetDate)} (${dow(o.targetDate)}) · ` : '';
    if (schedule.period === 'weekly') return `Semana de ${dm(o.periodKey)}: ${meta}${legal}.`;
    const month = competenceName(o.competence).split(' ')[0]!;
    const ref = `ref. ${o.referenceMonth.slice(5, 7)}/${o.referenceMonth.slice(0, 4)}`;
    return `${month.charAt(0).toUpperCase()}${month.slice(1)} (${ref}): ${meta}${legal}.`;
  });
}

/** "Confraternização Universal 01/01, Carnaval 16 e 17/02, Sexta-feira Santa 03/04, …" (the year's list). */
export function holidaysText(year: number): string {
  const byName: { name: string; dates: ISODate[] }[] = [];
  for (const [date, name] of [...nationalHolidays(year).entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const last = byName.at(-1);
    if (last && last.name === name) last.dates.push(date);
    else byName.push({ name, dates: [date] });
  }
  const parts = byName.map(({ name, dates }) => {
    if (dates.length === 1) return `${name} ${dm(dates[0]!)}`;
    const sameMonth = dates.every((d) => d.slice(5, 7) === dates[0]!.slice(5, 7));
    return sameMonth ? `${name} ${dates.map((d) => d.slice(8, 10)).join(' e ')}/${dates[0]!.slice(5, 7)}` : `${name} ${dates.map(dm).join(' e ')}`;
  });
  return `${joinList(parts)}.`;
}

// ---------------------------------------------------------------------------
// "Aplica-se a"
// ---------------------------------------------------------------------------

/** Clients active in a competence (contract started by then, not inactivated before its first day). */
export function activeInCompetence(clients: TaskClientOption[], competence: MonthKey): TaskClientOption[] {
  const first = `${competence}-01`;
  const last = `${addMonthKey(competence, 1)}-01`;
  return clients.filter((c) => c.contractStartDate < last && (c.status === 'active' || (c.inactivatedAt !== null && c.inactivatedAt > first)));
}

export interface AppliesTo {
  total: number;
  byRegime: number;
  specific: number;
  exceptions: number;
}

/** "Aplica-se a 25 clientes ativos em outubro: 23 pelo regime, mais 2 específicos, menos 0 exceções." */
export function appliesTo(
  clients: TaskClientOption[],
  competence: MonthKey,
  v: { regimes: TaxRegime[]; clientIds: string[]; excludedClientIds: string[] },
): AppliesTo {
  const active = activeInCompetence(clients, competence).filter((c) => c.status === 'active');
  const regimes = new Set(v.regimes);
  const excluded = new Set(v.excludedClientIds);
  const byRegime = active.filter((c) => regimes.has(c.taxRegime));
  const regimeIds = new Set(byRegime.map((c) => c.id));
  const specific = active.filter((c) => v.clientIds.includes(c.id) && !regimeIds.has(c.id));
  const exceptions = byRegime.filter((c) => excluded.has(c.id) && !v.clientIds.includes(c.id));
  return { total: byRegime.length + specific.length - exceptions.length, byRegime: byRegime.length, specific: specific.length, exceptions: exceptions.length };
}

/** Column "Aplica-se a": "Simples Nacional e MEI · 23 clientes", "4 clientes específicos", "… · 2 exceções". */
export function appliesToText(r: Pick<RecurringTask, 'regimes' | 'clientIds' | 'excludedClientIds' | 'clientCount'>): string {
  const count = `${r.clientCount} ${r.clientCount === 1 ? 'cliente' : 'clientes'}`;
  const exceptions = r.excludedClientIds.length ? ` · ${r.excludedClientIds.length} ${r.excludedClientIds.length === 1 ? 'exceção' : 'exceções'}` : '';
  if (r.regimes.length === 0) return `${r.clientIds.length} ${r.clientIds.length === 1 ? 'cliente específico' : 'clientes específicos'}${exceptions}`;
  const names = r.regimes.map((x) => TAX_REGIME_LABELS[x]);
  const more = names.length - 1 + r.clientIds.length;
  const head = r.clientIds.length === 0 && names.length <= 2 ? joinList(names) : `${names[0]} e mais ${more}`;
  return `${head} · ${count}${exceptions}`;
}

/** One line per receiver: "Ana P. 12 (padrão)", "Bruno C. 1 (à mão)", "sem responsável 2". */
function distributionParts(r: Pick<RecurringTask, 'distribution'>): string {
  return r.distribution
    .map((d) => (d.assignee ? `${shortName(d.assignee.name)} ${d.count}${d.source === 'default' ? ' (padrão)' : d.source === 'manual' ? ' (à mão)' : ''}` : `sem responsável ${d.count}`))
    .join(' · ');
}

/** Who receives the current competence: "Hoje: Ana P. 12 (padrão) · Bruno C. 1 (à mão) · sem responsável 2". */
export function distributionText(r: Pick<RecurringTask, 'distribution'>): string {
  return r.distribution.length ? `Hoje: ${distributionParts(r)}` : '';
}

/** Tooltip of the responsibles (the same, without "Hoje"). */
export function distributionTip(r: Pick<RecurringTask, 'distribution'>): string {
  return distributionParts(r);
}

export const PERIOD_OPTIONS = RECURRENCE_PERIODS.map((p) => ({ value: p, label: RECURRENCE_PERIOD_LABELS[p] }));

/** Competences of the "Começa em" select: 12 months back to 24 ahead. */
export function competenceOptions(current: MonthKey, back = 12, ahead = 24): MonthKey[] {
  const out: MonthKey[] = [];
  for (let i = -back; i <= ahead; i++) out.push(addMonthKey(current, i));
  return out;
}

/** "Encerrada em 09/2026". */
export function endedLabel(end: MonthKey): string {
  return `Encerrada em ${end.slice(5, 7)}/${end.slice(0, 4)}`;
}
