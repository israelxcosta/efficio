// Início da Gestão: the cards of Effy's dashboard (`GET /tasks/dashboard`). Each card has bands
// (vencidos, a vencer em 30 dias, em dia, sem data…) that open the list behind them. Pure functions,
// tested in dashboard-logic.test.ts.

import {
  addDays,
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
  type TaskDashboardResponse,
} from '@effinance/shared';

export type BandTone = 'danger' | 'warning' | 'success' | 'muted' | 'data';

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
  muted: 'bg-border-strong',
  data: 'bg-data',
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
    { key: 'within60', label: 'Em 31 a 60 dias', count: within60, tone: 'data' },
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
      { key: 'pending', label: 'Pendentes', count: s.pending, tone: 'data' },
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
