import { BadgeCheck, ClipboardList, FileCheck2, FileText, KeyRound, type LucideIcon } from 'lucide-react';
import {
  CLIENT_DOCUMENT_KIND_GROUP,
  addDays,
  deadlineText,
  type ClientDocumentGroup,
  type ClientDocumentKind,
  type DeadlineBucket,
  type DeadlineInfo,
  type DeadlinesSummary,
  type ISODate,
} from '@effinance/shared';
import { pluralize } from '@/lib/utils';

// Deadlines of clients' documents and unions' agreements (spec §6.10, §13.7, §13.8). Pure (tested):
// the strip of the home page, the bell, the sheet, the client sheet and the union list use these.

export type DeadlineKind = 'documents' | 'conventions';
/** `?vencimentos=` of the sheet. */
export const DEADLINE_KIND_PARAM: Record<DeadlineKind, string> = { documents: 'documentos', conventions: 'convencoes' };

export function deadlineKindFromParam(value: string | null): DeadlineKind | null {
  if (value === 'documentos') return 'documents';
  if (value === 'convencoes') return 'conventions';
  return null;
}

/** Icon of a document by its group (spec §6.10). */
const GROUP_ICONS: Record<ClientDocumentGroup, LucideIcon> = {
  certificates: KeyRound,
  certificates_of_debt: FileCheck2,
  licenses: BadgeCheck,
  health_safety: ClipboardList,
  others: FileText,
};

export function documentIcon(kind: ClientDocumentKind): LucideIcon {
  return GROUP_ICONS[CLIENT_DOCUMENT_KIND_GROUP[kind]];
}

/**
 * Classes of the deadline text: overdue `font-semibold text-danger`, today `font-semibold
 * text-warning`, up to 30 days `font-medium text-warning`, later `text-muted`, without date `text-subtle`.
 */
export function deadlineClass(deadline: Pick<DeadlineInfo, 'bucket' | 'days'>): string {
  if (deadline.bucket === 'overdue') return 'font-semibold text-danger';
  if (deadline.days === 0) return 'font-semibold text-warning';
  if (deadline.bucket === 'within30') return 'font-medium text-warning';
  if (deadline.bucket === 'noDate') return 'text-subtle';
  return 'text-muted';
}

/** "Venceu há 3 dias", "Vence hoje", "Vence em 12 dias" or the text for no date. */
export function deadlineLabel(deadline: Pick<DeadlineInfo, 'days'>, noDate = 'Sem vencimento'): string {
  return deadlineText(deadline.days) ?? noDate;
}

/** Due date of a renewal task: 7 days before the expiry, never before today. */
export function renewalDueDate(expiresAt: ISODate | null, today: ISODate): ISODate {
  if (!expiresAt) return today;
  const target = addDays(expiresAt, -7);
  return target < today ? today : target;
}

/** "Certificado digital (e-CNPJ A1/A3)" → "certificado digital"; acronyms keep their capitals. */
export function documentNoun(name: string): string {
  const base = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const first = base.split(/\s+/)[0] ?? '';
  const acronym = first.length > 1 && first === first.toUpperCase() && /[A-Z]/.test(first);
  return acronym ? base : base.charAt(0).toLowerCase() + base.slice(1);
}

/** "Renovar certificado digital". */
export function renewalTitle(name: string): string {
  return `Renovar ${documentNoun(name)}`;
}

/** "Aplicar o reajuste da convenção SINDCOM 2026/2027". */
export function adjustmentTitle(unionName: string, label: string): string {
  return `Aplicar o reajuste da convenção ${unionName} ${label}`;
}

export interface StripPart {
  kind: DeadlineKind;
  bucket: Extract<DeadlineBucket, 'overdue' | 'within30'>;
  /** Number in `text-danger` (overdue), when there is a number. */
  count: number | null;
  /** Text after the number ("documentos vencidos"), or the whole text without a number. */
  text: string;
  /** The single overdue agreement opens the union. */
  unionId?: string;
}

/**
 * Pieces of the strip of the home page (spec §6.10): "2 documentos vencidos · 3 vencem em até 30 dias ·
 * convenção do SINDCOM vencida há 12 dias". Empty when nothing is overdue or due in up to 30 days.
 */
export function stripParts(summary: DeadlinesSummary): StripPart[] {
  const parts: StripPart[] = [];
  const d = summary.documents;
  const c = summary.conventions;
  if (d.overdue) parts.push({ kind: 'documents', bucket: 'overdue', count: d.overdue, text: d.overdue === 1 ? 'documento vencido' : 'documentos vencidos' });
  if (d.within30) {
    const verb = d.within30 === 1 ? 'vence' : 'vencem';
    const noun = d.overdue ? '' : d.within30 === 1 ? 'documento ' : 'documentos ';
    parts.push({ kind: 'documents', bucket: 'within30', count: d.within30, text: `${noun}${verb} em até 30 dias` });
  }
  if (c.overdue === 1 && summary.overdueConvention) {
    const days = summary.overdueConvention.days;
    parts.push({
      kind: 'conventions',
      bucket: 'overdue',
      count: null,
      text: `convenção do ${summary.overdueConvention.name} vencida há ${pluralize(days, 'dia', 'dias')}`,
      unionId: summary.overdueConvention.unionId,
    });
  } else if (c.overdue) {
    parts.push({ kind: 'conventions', bucket: 'overdue', count: c.overdue, text: c.overdue === 1 ? 'convenção vencida' : 'convenções vencidas' });
  }
  if (c.within30) {
    parts.push({ kind: 'conventions', bucket: 'within30', count: c.within30, text: c.within30 === 1 ? 'convenção vence em até 30 dias' : 'convenções vencem em até 30 dias' });
  }
  return parts;
}

/** The icon of the strip: danger with something overdue, warning with only "em até 30 dias". */
export function stripTone(summary: DeadlinesSummary): 'danger' | 'warning' {
  return summary.documents.overdue + summary.conventions.overdue > 0 ? 'danger' : 'warning';
}

/** Lines of the bell's "Vencimentos" group. */
export function bellDeadlines(summary: DeadlinesSummary | undefined): { documents: number; conventions: number; soon: number } {
  if (!summary) return { documents: 0, conventions: 0, soon: 0 };
  return {
    documents: summary.documents.overdue,
    conventions: summary.conventions.overdue,
    soon: summary.documents.within30 + summary.conventions.within30,
  };
}

/** "Documentos (5)": overdue + up to 30 days of a kind. */
export function urgentCount(counts: { overdue: number; within30: number }): number {
  return counts.overdue + counts.within30;
}

export type DeadlineGroupKey = 'overdue' | 'within30' | 'within60' | 'noDate';
export const DEADLINE_GROUP_ORDER: DeadlineGroupKey[] = ['overdue', 'within30', 'within60', 'noDate'];
export const DEADLINE_GROUP_LABELS: Record<DeadlineGroupKey, string> = {
  overdue: 'Vencidos',
  within30: 'Em até 30 dias',
  within60: 'Em 31 a 60 dias',
  noDate: 'Sem vencimento informado',
};

/** Items by group, in the order of the sheet; empty groups out (items beyond 60 days too). */
export function groupByDeadline<T>(items: readonly T[], bucketOf: (item: T) => DeadlineBucket): { key: DeadlineGroupKey; items: T[] }[] {
  return DEADLINE_GROUP_ORDER.map((key) => ({ key, items: items.filter((i) => bucketOf(i) === key) })).filter((g) => g.items.length);
}

/** "1 vencido · 1 vence em até 30 dias" of a client's documents (pieces with their tone). */
export function documentsSummary(documents: readonly { deadline: Pick<DeadlineInfo, 'bucket'> }[]): { text: string; tone: 'danger' | 'warning' }[] {
  const overdue = documents.filter((d) => d.deadline.bucket === 'overdue').length;
  const soon = documents.filter((d) => d.deadline.bucket === 'within30').length;
  const out: { text: string; tone: 'danger' | 'warning' }[] = [];
  if (overdue) out.push({ text: pluralize(overdue, 'vencido', 'vencidos'), tone: 'danger' });
  if (soon) out.push({ text: `${soon} ${soon === 1 ? 'vence' : 'vencem'} em até 30 dias`, tone: 'warning' });
  return out;
}

const BUCKET_RANK: Record<DeadlineBucket, number> = { overdue: 0, within30: 1, within60: 2, later: 3, noDate: 4 };

/** Overdue first, then by date, without date at the end (the client sheet). */
export function sortByDeadline<T extends { expiresAt: ISODate | null; deadline: Pick<DeadlineInfo, 'bucket'> }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const r = BUCKET_RANK[a.deadline.bucket] - BUCKET_RANK[b.deadline.bucket];
    if (r) return r;
    if (a.expiresAt && b.expiresAt) return a.expiresAt < b.expiresAt ? -1 : a.expiresAt > b.expiresAt ? 1 : 0;
    return 0;
  });
}

/** The subtitle of a client under the "Documentos" filter: "Certificado digital venceu há 3 dias". */
export function mostUrgentText(doc: { name: string; deadline: Pick<DeadlineInfo, 'days'> }): string {
  const label = doc.name.replace(/\s*\([^)]*\)\s*$/, '');
  const text = deadlineText(doc.deadline.days);
  return text ? `${label} ${text.charAt(0).toLowerCase()}${text.slice(1)}` : label;
}
