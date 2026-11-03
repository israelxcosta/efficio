// Relatórios de tarefas (spec §14): the URL of the page (period and filters), the API query, the
// headline, the punctuality rows and their order. Pure functions, tested in phase2-logic.test.ts.

import {
  addMonthKey,
  endOfMonth,
  formatMonthKey,
  isoDateSchema,
  monthKeySchema,
  TASK_KINDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type ISODate,
  type MonthKey,
  type TaskBreakdownRow,
  type TaskKind,
  type TaskPriority,
  type TaskReportQuery,
  type TaskReportResponse,
  type TaskStatus,
} from '@effinance/shared';
import { isUuid } from '@/lib/safe-url';

export type ReportPreset = 'month' | 'last-3' | 'last-6' | 'last-12' | 'year' | 'custom';
/** Grouped situations and exact statuses of the "Situação" filter. */
export type ReportSituation = '' | 'open' | 'done' | 'overdue' | 'doneLate' | 'doneOnTime' | `status:${TaskStatus}`;

const PRESET_PARAM: Record<ReportPreset, string> = { month: 'mes', 'last-3': '3-meses', 'last-6': '6-meses', 'last-12': '12-meses', year: 'ano', custom: 'personalizado' };
const SITUATION_PARAM: Record<string, string> = {
  open: 'abertas',
  done: 'concluidas',
  overdue: 'atrasadas',
  doneLate: 'com-atraso',
  doneOnTime: 'no-prazo',
  'status:todo': 'a-fazer',
  'status:in_progress': 'em-andamento',
  'status:waiting_client': 'aguardando',
  'status:done': 'concluida',
  'status:canceled': 'cancelada',
};
const KIND_PARAM: Record<TaskKind, string> = { standalone: 'avulsas', recurring: 'recorrentes', flow: 'processos' };
const PRIORITY_PARAM: Record<TaskPriority, string> = { low: 'baixa', medium: 'media', high: 'alta', urgent: 'urgente' };

export interface ReportFilters {
  preset: ReportPreset;
  /** Anchor month of `month` and of the "last N" ranges. */
  month: MonthKey;
  year: number;
  from: ISODate | '';
  to: ISODate | '';
  department: string;
  /** Member id or `none`. */
  assignee: string;
  category: string;
  /** Client id or `internal`. */
  client: string;
  situation: ReportSituation;
  priority: TaskPriority | '';
  kind: TaskKind | '';
  page: number;
}

const key = <T extends string>(map: Record<T, string>, value: string | null): T | undefined => (Object.keys(map) as T[]).find((k) => map[k] === value);

export function parseReportFilters(params: URLSearchParams, today: ISODate): ReportFilters {
  const month = params.get('mes') ?? '';
  const year = Number(params.get('ano'));
  const from = params.get('de') ?? '';
  const to = params.get('ate') ?? '';
  const page = Number(params.get('pagina') ?? '1');
  const id = (v: string | null) => (isUuid(v) ? v : '');
  const assignee = params.get('responsavel');
  const client = params.get('cliente');
  return {
    preset: key(PRESET_PARAM, params.get('periodo')) ?? 'month',
    month: monthKeySchema.safeParse(month).success ? month : today.slice(0, 7),
    year: Number.isInteger(year) && year >= 1900 && year <= 2199 ? year : Number(today.slice(0, 4)),
    from: isoDateSchema.safeParse(from).success ? from : '',
    to: isoDateSchema.safeParse(to).success ? to : '',
    department: id(params.get('departamento')),
    assignee: assignee === 'nenhum' ? 'none' : id(assignee),
    category: id(params.get('categoria')),
    client: client === 'interna' ? 'internal' : id(client),
    situation: (key(SITUATION_PARAM as Record<string, string>, params.get('situacao')) ?? '') as ReportSituation,
    priority: key(PRIORITY_PARAM, params.get('prioridade')) ?? '',
    kind: key(KIND_PARAM, params.get('tipo')) ?? '',
    page: Number.isInteger(page) && page > 0 && page <= 10_000 ? page : 1,
  };
}

export function writeReportFilters(params: URLSearchParams, patch: Partial<ReportFilters>, today: ISODate): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (k: string, v: string | null | undefined) => (v ? next.set(k, v) : next.delete(k));
  if (patch.preset !== undefined) set('periodo', patch.preset === 'month' ? null : PRESET_PARAM[patch.preset]);
  if (patch.month !== undefined) set('mes', patch.month === today.slice(0, 7) ? null : patch.month);
  if (patch.year !== undefined) set('ano', patch.year === Number(today.slice(0, 4)) ? null : String(patch.year));
  if (patch.from !== undefined) set('de', patch.from);
  if (patch.to !== undefined) set('ate', patch.to);
  if (patch.department !== undefined) set('departamento', patch.department);
  if (patch.assignee !== undefined) set('responsavel', patch.assignee === 'none' ? 'nenhum' : patch.assignee);
  if (patch.category !== undefined) set('categoria', patch.category);
  if (patch.client !== undefined) set('cliente', patch.client === 'internal' ? 'interna' : patch.client);
  if (patch.situation !== undefined) set('situacao', patch.situation ? SITUATION_PARAM[patch.situation] : null);
  if (patch.priority !== undefined) set('prioridade', patch.priority ? PRIORITY_PARAM[patch.priority] : null);
  if (patch.kind !== undefined) set('tipo', patch.kind ? KIND_PARAM[patch.kind] : null);
  if (patch.page !== undefined) set('pagina', patch.page > 1 ? String(patch.page) : null);
  else next.delete('pagina');
  return next;
}

/** The range of the period (up to a year, as the API accepts). */
export function reportRange(f: Pick<ReportFilters, 'preset' | 'month' | 'year' | 'from' | 'to'>): { from: ISODate; to: ISODate } {
  const last = (n: number) => ({ from: `${addMonthKey(f.month, -(n - 1))}-01`, to: endOfMonth(`${f.month}-01`) });
  switch (f.preset) {
    case 'last-3':
      return last(3);
    case 'last-6':
      return last(6);
    case 'last-12':
      return last(12);
    case 'year':
      return { from: `${f.year}-01-01`, to: `${f.year}-12-31` };
    case 'custom': {
      const from = f.from || `${addMonthKey(f.month, -2)}-01`;
      const to = f.to || endOfMonth(`${f.month}-01`);
      return from <= to ? { from, to } : { from: to, to: from };
    }
    default:
      return { from: `${f.month}-01`, to: endOfMonth(`${f.month}-01`) };
  }
}

/** "Outubro de 2026", "de janeiro a outubro de 2026", "de 01/08/2026 a 31/10/2026". */
export function rangeLabel(range: { from: ISODate; to: ISODate }): string {
  const fromMonth = range.from.slice(0, 7);
  const toMonth = range.to.slice(0, 7);
  const isMonthStart = range.from.endsWith('-01') && range.to === endOfMonth(range.to);
  if (fromMonth === toMonth && isMonthStart) return formatMonthKey(fromMonth);
  if (isMonthStart) {
    const a = formatMonthKey(fromMonth).toLowerCase();
    const b = formatMonthKey(toMonth).toLowerCase();
    return fromMonth.slice(0, 4) === toMonth.slice(0, 4) ? `De ${a.split(' de ')[0]} a ${b}` : `De ${a} a ${b}`;
  }
  const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  return `De ${br(range.from)} a ${br(range.to)}`;
}

export type ReportApiFilters = Omit<TaskReportQuery, 'page' | 'pageSize' | 'from' | 'to'>;

export function reportApiFilters(f: ReportFilters): ReportApiFilters {
  const status = f.situation.startsWith('status:') ? (f.situation.slice(7) as TaskStatus) : undefined;
  return {
    departmentId: f.department || undefined,
    assigneeId: (f.assignee || undefined) as TaskReportQuery['assigneeId'],
    categoryId: f.category || undefined,
    clientId: (f.client || undefined) as TaskReportQuery['clientId'],
    situation: !status && f.situation ? (f.situation as Exclude<ReportSituation, '' | `status:${TaskStatus}`>) : undefined,
    status: status && (TASK_STATUSES as readonly string[]).includes(status) ? status : undefined,
    priority: f.priority || undefined,
    kind: f.kind && (TASK_KINDS as readonly string[]).includes(f.kind) ? f.kind : undefined,
  };
}

export const REPORT_PAGE_SIZE = 50;

export function toReportQuery(f: ReportFilters): TaskReportQuery {
  return { ...reportRange(f), ...reportApiFilters(f), page: f.page, pageSize: REPORT_PAGE_SIZE };
}

export function reportFilterCount(f: ReportFilters): number {
  return [f.department, f.assignee, f.category, f.client, f.situation, f.priority, f.kind].filter(Boolean).length;
}

/** "89%" of concluded on time, or null without concluded tasks. */
export function onTimeRate(row: Pick<TaskBreakdownRow, 'done' | 'doneOnTime'>): number | null {
  return row.done > 0 ? Math.round((row.doneOnTime / row.done) * 100) : null;
}

export type PunctualityOrder = 'late' | 'delivered';

/** "Mais atrasos" (late deliveries, then overdue open ones) or "Mais entregas" (concluded). */
export function sortPunctuality(rows: TaskBreakdownRow[], order: PunctualityOrder): TaskBreakdownRow[] {
  return [...rows].sort((a, b) =>
    order === 'late'
      ? b.doneLate - a.doneLate || b.overdue - a.overdue || b.done - a.done || a.label.localeCompare(b.label, 'pt-BR')
      : b.done - a.done || b.doneOnTime - a.doneOnTime || a.label.localeCompare(b.label, 'pt-BR'),
  );
}

/** Up to `max` rows and "Outros (N)" summing the rest when there are more than max + 1. */
export function capRows(rows: TaskBreakdownRow[], max: number): TaskBreakdownRow[] {
  if (rows.length <= max + 1) return rows;
  const rest = rows.slice(max);
  const sum = (k: keyof Pick<TaskBreakdownRow, 'total' | 'done' | 'doneOnTime' | 'doneLate' | 'canceled' | 'open' | 'overdue'>) => rest.reduce((n, r) => n + r[k], 0);
  return [
    ...rows.slice(0, max),
    { key: '__others__', label: `Outros (${rest.length})`, total: sum('total'), done: sum('done'), doneOnTime: sum('doneOnTime'), doneLate: sum('doneLate'), canceled: sum('canceled'), open: sum('open'), overdue: sum('overdue') },
  ];
}

/**
 * The finding of the page (§14.1): "Outubro de 2026: 61 concluídas, 54 no prazo (89%). Fiscal concentra
 * 5 das 7 entregas com atraso." Without concluded ones: "… nenhuma tarefa concluída ainda."
 */
export function reportHeadline(r: Pick<TaskReportResponse, 'summary' | 'byDepartment'>, label: string): string {
  const s = r.summary;
  if (s.done === 0) return `${label}: nenhuma tarefa concluída ainda.`;
  const rate = Math.round((s.doneOnTime / s.done) * 100);
  let text = `${label}: ${s.done} ${s.done === 1 ? 'concluída' : 'concluídas'}, ${s.doneOnTime} no prazo (${rate}%).`;
  const top = [...r.byDepartment].filter((d) => d.key).sort((a, b) => b.doneLate - a.doneLate)[0];
  if (s.doneLate > 0 && top && top.doneLate > 0 && r.byDepartment.filter((d) => d.key).length > 1) {
    text += ` ${top.label} concentra ${top.doneLate} das ${s.doneLate} ${s.doneLate === 1 ? 'entrega' : 'entregas'} com atraso.`;
  }
  return text;
}
