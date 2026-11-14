// Início da Gestão: the cards of Effy's dashboard (`GET /tasks/dashboard`). Each card has bands
// (vencidos, a vencer em 30 dias, em dia, sem data…) that open the list behind them. Pure functions,
// tested in dashboard-logic.test.ts.

import {
  addDays,
  endOfMonth,
  CLIENT_COMPLETENESS_FIELD_LABELS,
  CLIENT_OVERVIEW_STATUS_HINTS,
  CLIENT_OVERVIEW_STATUS_LABELS,
  CLIENT_OVERVIEW_STATUSES,
  dayOfWeek,
  type ClientCompletenessField,
  type ClientOverviewStatus,
  type DashboardDocumentItem,
  type DashboardDocuments,
  type DashboardDocumentSituation,
  type DashboardFeeItem,
  type DocumentDeadline,
  type ISODate,
  type MonthKey,
  type TaskDashboardResponse,
} from '@effinance/shared';
import { shortName } from './due';

/**
 * Status tones ("Cores de status" in docs/design-system.md): `danger` overdue/late; `warning` due in
 * 30 days or pending issues; `success` up to date/concluded; `data` in progress; `dataSoft` 31 to 60
 * days; `muted` pending/no date.
 */
export type BandTone = 'danger' | 'warning' | 'success' | 'data' | 'dataSoft' | 'muted';

export interface Band<K extends string = string> {
  key: K;
  label: string;
  count: number;
  tone: BandTone;
  hint?: string;
}

/** Dot colour of each tone (the bands and the legends). */
export const BAND_DOT: Record<BandTone, string> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  success: 'bg-success',
  data: 'bg-data',
  dataSoft: 'bg-data/45',
  muted: 'bg-border-strong',
};

// --- certificates and "laudos" --------------------------------------------------------------------

const DOCUMENT_BAND: Record<DashboardDocumentSituation, { label: string; tone: BandTone }> = {
  overdue: { label: 'Vencidos', tone: 'danger' },
  within30: { label: 'A vencer (30 dias)', tone: 'warning' },
  ok: { label: 'Em dia', tone: 'success' },
  noDate: { label: 'Sem data', tone: 'muted' },
};

/** Effy's lines: vencidos, a vencer (30 dias), em dia — and "sem data" when there is any. */
export function documentBands(docs: Pick<DashboardDocuments, 'counts'>): Band<DashboardDocumentSituation>[] {
  const keys: DashboardDocumentSituation[] = ['overdue', 'within30', 'ok', ...(docs.counts.noDate > 0 ? (['noDate'] as const) : [])];
  return keys.map((key) => ({ key, ...DOCUMENT_BAND[key], count: docs.counts[key] }));
}

/** The documents of a band (null: all), by expiry (most overdue first, without date last). */
export function documentsOf(docs: Pick<DashboardDocuments, 'items'>, situation: DashboardDocumentSituation | null): DashboardDocumentItem[] {
  return docs.items
    .filter((d) => !situation || d.situation === situation)
    .sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'));
}

/** A document of the card as a row of the deadlines sheet (`DocumentDeadlineRow` is reused). */
export function toDocumentDeadline(d: DashboardDocumentItem): DocumentDeadline {
  const bucket = d.situation === 'ok' ? (d.days !== null && d.days <= 60 ? 'within60' : 'later') : d.situation;
  return { id: d.id, client: d.client, kind: d.kind, name: d.name, note: null, expiresAt: d.expiresAt, deadline: { bucket, days: d.days } };
}

// --- collective agreements --------------------------------------------------------------------------

export type ConventionBandKey = 'overdue' | 'within30' | 'within60' | 'ok' | 'noDate';

/** Base dates passed, in up to 30 and 60 days, the others up to date, and unions without base month. */
export function conventionBands(conv: Pick<TaskDashboardResponse['conventions'], 'counts' | 'noBaseMonth' | 'total'>): Band<ConventionBandKey>[] {
  const { overdue, within30, within60 } = conv.counts;
  const ok = Math.max(0, conv.total - overdue - within30 - within60 - conv.noBaseMonth);
  return [
    { key: 'overdue', label: 'Data-base passou', count: overdue, tone: 'danger' },
    { key: 'within30', label: 'Em até 30 dias', count: within30, tone: 'warning' },
    { key: 'within60', label: 'Em 31 a 60 dias', count: within60, tone: 'dataSoft' },
    { key: 'ok', label: 'Em dia', count: ok, tone: 'success' },
    { key: 'noDate', label: 'Sem data-base', count: conv.noBaseMonth, tone: 'muted' },
  ];
}

// --- fees ------------------------------------------------------------------------------------------

export type FeeBandKey = 'ended' | 'within30' | 'within60';
type Fees = NonNullable<TaskDashboardResponse['fees']>;

export function feesOf(fees: Fees, band: FeeBandKey | null): DashboardFeeItem[] {
  const ended = fees.within30.filter((f) => f.days < 0);
  const soon = fees.within30.filter((f) => f.days >= 0);
  const all = { ended, within30: soon, within60: fees.within60 };
  const list = band ? all[band] : [...ended, ...soon, ...fees.within60];
  return [...list].sort((a, b) => a.days - b.days);
}

/** Fee periods already ended without a new one, ending in up to 30 days, and in 31 to 60. */
export function feeBands(fees: Fees): Band<FeeBandKey>[] {
  return [
    { key: 'ended', label: 'Vigência encerrada', count: feesOf(fees, 'ended').length, tone: 'danger' },
    { key: 'within30', label: 'Vencem em 30 dias', count: feesOf(fees, 'within30').length, tone: 'warning' },
    { key: 'within60', label: 'Vencem em 31 a 60 dias', count: fees.within60.length, tone: 'muted' },
  ];
}

// --- tasks -----------------------------------------------------------------------------------------

export type TaskStatusKey = 'overdue' | 'pending' | 'concluded';

/** "Situação das tarefas": overdue apart from the other pending ones, and the concluded share. */
export function taskStatusBands(s: TaskDashboardResponse['taskStatus']): { bands: Band<TaskStatusKey>[]; percent: number } {
  return {
    bands: [
      { key: 'overdue', label: 'Atrasadas', count: s.overdue, tone: 'danger' },
      { key: 'pending', label: 'Pendentes', count: s.pending, tone: 'muted' },
      { key: 'concluded', label: 'Concluídas', count: s.concluded, tone: 'success' },
    ],
    percent: s.total ? Math.round((s.concluded / s.total) * 100) : 0,
  };
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** The seven days of "Fluxo de tarefas por dia" (from today), the empty ones included. */
export function flowDays(flow: TaskDashboardResponse['flow'], today: ISODate): { date: ISODate; label: string; total: number; recurring: number; standalone: number }[] {
  const byDate = new Map(flow.map((f) => [f.date, f]));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const f = byDate.get(date);
    const recurring = f?.recurring ?? 0;
    const standalone = f?.standalone ?? 0;
    return { date, label: i === 0 ? 'Hoje' : `${WEEKDAYS[dayOfWeek(date)]} ${date.slice(8, 10)}`, total: recurring + standalone, recurring, standalone };
  });
}

/** "Processos por departamento": the most pending work first; "Sem departamento" last. */
export function processRows(rows: TaskDashboardResponse['processes']): TaskDashboardResponse['processes'] {
  return [...rows].sort(
    (a, b) =>
      Number(a.department === null) - Number(b.department === null) ||
      b.pending + b.overdue - (a.pending + a.overdue) ||
      (a.department?.name ?? '').localeCompare(b.department?.name ?? '', 'pt-BR'),
  );
}

const OVERVIEW_TONE: Record<ClientOverviewStatus, BandTone> = { attention: 'danger', pending: 'warning', upToDate: 'success' };

/** "Visão geral dos clientes": Atenção (overdue), Pendências, Em dia — with Effy's hints. */
export function overviewBands(counts: Record<ClientOverviewStatus, number>): Band<ClientOverviewStatus>[] {
  return CLIENT_OVERVIEW_STATUSES.map((key) => ({ key, label: CLIENT_OVERVIEW_STATUS_LABELS[key], count: counts[key], tone: OVERVIEW_TONE[key], hint: CLIENT_OVERVIEW_STATUS_HINTS[key] }));
}

const joinPt = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`);

/** "Falta: Inscrição municipal e Certificado digital". */
export function incompleteText(item: { missing: ClientCompletenessField[] }): string {
  return `Falta: ${joinPt(item.missing.map((f) => CLIENT_COMPLETENESS_FIELD_LABELS[f]))}`;
}

// --- status cards: headlines, progress and the finding lines ----------------------------------------

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const dayMonth = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Progress bar of a card: concluded (success) → overdue (danger) → pending not overdue (grey). */
export function progressSegments(s: { done: number; overdue: number; pending: number }): { value: number; tone: BandTone }[] {
  return [
    { value: s.done, tone: 'success' },
    { value: s.overdue, tone: 'danger' },
    { value: s.pending, tone: 'muted' },
  ];
}

/** Hero of a progress card: the share concluded ("18%", "5 de 28 concluídas"). */
export function progressHeadline(done: number, total: number): { value: string; label: string } {
  if (total <= 0) return { value: '0%', label: 'nada na competência' };
  return { value: `${Math.round((done / total) * 100)}%`, label: `${done} de ${total} concluídas` };
}

/**
 * Hero of a distribution card: the count of the most severe band with anything in it (danger, then
 * warning) or, without alerts, the share up to date.
 */
export function severityHeadline<K extends string>(bands: Band<K>[]): { value: string; label: string; tone: BandTone } {
  for (const tone of ['danger', 'warning'] as const) {
    const band = bands.find((b) => b.tone === tone && b.count > 0);
    if (band) return { value: String(band.count), label: lowerFirst(band.label), tone };
  }
  const total = bands.reduce((a, b) => a + b.count, 0);
  if (total === 0) return { value: '0', label: 'nenhum cadastrado', tone: 'muted' };
  const ok = bands.find((b) => b.tone === 'success');
  return { value: `${Math.round(((ok?.count ?? 0) / total) * 100)}%`, label: ok ? lowerFirst(ok.label) : 'em dia', tone: 'success' };
}

/** Share of `month` already gone by on `today` (0 before it starts, 1 once it ended). */
export function monthElapsed(today: ISODate, month: MonthKey): number {
  const current = today.slice(0, 7);
  if (month < current) return 1;
  if (month > current) return 0;
  const days = Number(endOfMonth(`${month}-01`).slice(8, 10));
  return Number(today.slice(8, 10)) / days;
}

/** "5 em aberto em 7 dias · pico ter 10 (4)". */
export function flowInsight(days: ReturnType<typeof flowDays>): string {
  const total = days.reduce((a, d) => a + d.total, 0);
  if (total === 0) return 'Nada em aberto nos próximos 7 dias';
  const peak = days.reduce((best, d) => (d.total > best.total ? d : best), days[0]!);
  return `${total} em aberto em 7 dias · pico ${lowerFirst(peak.label)} (${peak.total})`;
}

/** "2 prazos legais até 10/11 · próximo: DCTFWeb em 07/11" (the next 7 days, today included). */
export function agendaInsight(upcoming: readonly { name: string; legalDueDate: ISODate }[], today: ISODate): string {
  const until = addDays(today, 6);
  const inWindow = upcoming.filter((o) => o.legalDueDate >= today && o.legalDueDate <= until).sort((a, b) => a.legalDueDate.localeCompare(b.legalDueDate));
  if (inWindow.length === 0) return `Nenhum prazo legal até ${dayMonth(until)}`;
  const next = inWindow[0]!;
  const count = inWindow.length === 1 ? '1 prazo legal' : `${inWindow.length} prazos legais`;
  return `${count} até ${dayMonth(until)} · próximo: ${next.name} em ${dayMonth(next.legalDueDate)}`;
}

/**
 * "Ana R. concentra 80% · 3 atrasadas" (open work = open + overdue; `open` excludes overdue). The
 * unassigned row keeps its label ("Sem responsável").
 */
export function assigneeInsight(rows: readonly { label: string; open: number; overdue: number; unassigned?: boolean }[]): string | null {
  const load = (r: { open: number; overdue: number }) => r.open + r.overdue;
  const total = rows.reduce((a, r) => a + load(r), 0);
  if (total === 0) return null;
  const top = rows.reduce((best, r) => (load(r) > load(best) ? r : best), rows[0]!);
  const late = rows.reduce((a, r) => a + r.overdue, 0);
  const head = `${top.unassigned ? top.label : shortName(top.label)} concentra ${Math.round((load(top) / total) * 100)}%`;
  return late > 0 ? `${head} · ${late === 1 ? '1 atrasada' : `${late} atrasadas`}` : head;
}

/** "2 de 18 concluídas · mais pendências: Fiscal (16)" (the second part only with 2+ departments). */
export function processInsight(rows: TaskDashboardResponse['processes']): string | null {
  if (rows.length === 0) return null;
  const done = rows.reduce((a, r) => a + r.done, 0);
  const total = rows.reduce((a, r) => a + r.done + r.pending + r.overdue, 0);
  if (total === 0) return null;
  const head = `${done} de ${total} concluídas`;
  if (rows.length < 2) return head;
  const open = (r: (typeof rows)[number]) => r.pending + r.overdue;
  const top = rows.reduce((best, r) => (open(r) > open(best) ? r : best), rows[0]!);
  return open(top) > 0 ? `${head} · mais pendências: ${top.department?.name ?? 'Sem departamento'} (${open(top)})` : head;
}

const countOf = <K extends string>(bands: Band<K>[], key: K) => bands.find((b) => b.key === key)?.count ?? 0;

/** "1 vencido · 1 vence em 30 dias" (certificates and "laudos"). */
export function documentsInsight(bands: Band<DashboardDocumentSituation>[]): string {
  const overdue = countOf(bands, 'overdue');
  const soon = countOf(bands, 'within30');
  const parts = [
    overdue ? `${overdue} ${overdue === 1 ? 'vencido' : 'vencidos'}` : '',
    soon ? `${soon} ${soon === 1 ? 'vence' : 'vencem'} em 30 dias` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Nenhum vencido nem vencendo em 30 dias';
}

/** "1 data-base passou · 2 em até 30 dias". */
export function conventionsInsight(bands: Band<ConventionBandKey>[]): string {
  const overdue = countOf(bands, 'overdue');
  const soon = countOf(bands, 'within30');
  const parts = [overdue ? (overdue === 1 ? '1 data-base passou' : `${overdue} datas-base passaram`) : '', soon ? `${soon} em até 30 dias` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Nenhuma data-base nos próximos 30 dias';
}

/** "1 vigência encerrada · 1 vence em 30 dias" (or the ones in 31 to 60 days). */
export function feesInsight(bands: Band<FeeBandKey>[]): string {
  const ended = countOf(bands, 'ended');
  const soon = countOf(bands, 'within30');
  const later = countOf(bands, 'within60');
  const parts = [
    ended ? `${ended} ${ended === 1 ? 'vigência encerrada' : 'vigências encerradas'}` : '',
    soon ? `${soon} ${soon === 1 ? 'vence' : 'vencem'} em 30 dias` : '',
  ].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return later ? `${later} ${later === 1 ? 'vence' : 'vencem'} em 31 a 60 dias` : 'Nenhuma vigência termina em 60 dias';
}

/** "16 pendentes · nenhuma atrasada" (the competence's tax obligations). */
export function fiscalInsight(t: TaskDashboardResponse['fiscal']['totals']): string {
  if (t.pending + t.overdue === 0) return 'Tudo concluído na competência';
  const late = t.overdue === 0 ? 'nenhuma atrasada' : t.overdue === 1 ? '1 atrasada' : `${t.overdue} atrasadas`;
  return `${t.pending} ${t.pending === 1 ? 'pendente' : 'pendentes'} · ${late}`;
}

/** "8 de 8 clientes com pendências" (attention + pending), or "5 clientes em dia". */
export function overviewInsight(counts: Record<ClientOverviewStatus, number>): string {
  const total = counts.attention + counts.pending + counts.upToDate;
  const issues = counts.attention + counts.pending;
  if (issues === 0) return `${total} ${total === 1 ? 'cliente' : 'clientes'} em dia`;
  return `${issues} de ${total} ${total === 1 ? 'cliente' : 'clientes'} com pendências`;
}
