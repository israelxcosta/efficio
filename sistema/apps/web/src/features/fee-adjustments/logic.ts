// Yearly fee adjustment in batch (contract clause 3): pure rules of the screen, tested. The percentage
// and the new values are computed here while the user types, with the same shared utilities the API
// uses (`suggestedAdjustment`, `adjustByBps`, `chosenAdjustmentIndex`, `adjustmentFactorText`).

import {
  addDays,
  addMonthKey,
  adjustByBps,
  adjustmentFactorText,
  chosenAdjustmentIndex,
  FEE_ADJUSTMENT_INDEXES,
  FEE_ADJUSTMENT_INDEX_LABELS,
  FEE_ADJUSTMENT_NOTICE_DAYS,
  formatPercentBps,
  MAX_FEE_ADJUSTMENT_BPS,
  monthKey,
  suggestedAdjustment,
  type FeeAdjustment,
  type FeeAdjustmentIndex,
  type FeeAdjustmentIndexValues,
  type FeeAdjustmentPreviewItem,
  type FeeAdjustmentValues,
  type ISODate,
  type MonthKey,
} from '@effinance/shared';

/** Short name of each index in sentences ("Maior índice: IPCA 4,27%"). */
export const INDEX_SHORT_LABELS: Record<FeeAdjustmentIndex, string> = {
  igpm: 'IGP-M',
  ipca: 'IPCA',
  inpc: 'INPC',
  cct: 'CCT',
};

export const NO_INDICES: FeeAdjustmentIndexValues = { igpm: null, ipca: null, inpc: null, cct: null };

// ---------------------------------------------------------------------------
// Percentages typed by the user
// ---------------------------------------------------------------------------

export type PercentResult = { ok: true; bps: number | null } | { ok: false; error: string };

const PERCENT_FORMAT_MESSAGE = 'Use um número com até duas casas decimais, como 4,27';

/** "4,27", "-1.5", "+3", "4,27 %" → basis points; null when blank; 'invalid' otherwise. */
function percentToBps(text: string): number | null | 'invalid' {
  const t = text
    .trim()
    .replace(/%$/, '')
    .trim()
    .replace(/^[−–]/, '-')
    .replace(',', '.');
  if (t === '') return null;
  if (!/^[+-]?\d{1,3}(\.\d{1,2})?$/.test(t)) return 'invalid';
  const bps = Math.round(Number(t) * 100);
  return bps === 0 ? 0 : bps; // never -0
}

/**
 * An index accumulated in 12 months (clause 3.3): blank = not informed, negative allowed, from −100%
 * to 100% (the API's range).
 */
export function parseIndexPercent(text: string): PercentResult {
  const bps = percentToBps(text);
  if (bps === 'invalid') return { ok: false, error: PERCENT_FORMAT_MESSAGE };
  if (bps !== null && Math.abs(bps) > MAX_FEE_ADJUSTMENT_BPS) return { ok: false, error: 'Use um percentual entre -100% e 100%' };
  return { ok: true, bps };
}

export type IndexTexts = Record<FeeAdjustmentIndex, string>;

export const EMPTY_INDEX_TEXTS: IndexTexts = { igpm: '', ipca: '', inpc: '', cct: '' };

/** The four fields → values by index (a field with an error counts as not informed) and the errors. */
export function parseIndices(texts: IndexTexts): { values: FeeAdjustmentIndexValues; errors: Partial<Record<FeeAdjustmentIndex, string>>; valid: boolean } {
  const values: FeeAdjustmentIndexValues = { ...NO_INDICES };
  const errors: Partial<Record<FeeAdjustmentIndex, string>> = {};
  for (const index of FEE_ADJUSTMENT_INDEXES) {
    const parsed = parseIndexPercent(texts[index]);
    if (parsed.ok) values[index] = parsed.bps;
    else errors[index] = parsed.error;
  }
  return { values, errors, valid: Object.keys(errors).length === 0 };
}

/** The percentage applied: required, never negative (the contract only adjusts upwards), up to 100%. */
export function parseAppliedPercent(text: string): PercentResult {
  const bps = percentToBps(text);
  if (bps === 'invalid') return { ok: false, error: PERCENT_FORMAT_MESSAGE };
  if (bps === null) return { ok: false, error: 'Informe o percentual a aplicar' };
  if (bps < 0) return { ok: false, error: 'O reajuste não pode ser negativo: o contrato só reajusta para cima' };
  if (bps > MAX_FEE_ADJUSTMENT_BPS) return { ok: false, error: 'Use um percentual entre 0% e 100%' };
  return { ok: true, bps };
}

/** 427 → "4,27%", −150 → "−1,5%", 0 → "0%". */
export function formatBps(bps: number): string {
  return `${bps < 0 ? '−' : ''}${formatPercentBps(Math.abs(bps))}%`;
}

/** The value of a percentage field: 427 → "4,27", −150 → "-1,5", null → "". */
export function bpsToInput(bps: number | null): string {
  if (bps === null) return '';
  return `${bps < 0 ? '-' : ''}${formatPercentBps(Math.abs(bps))}`;
}

// ---------------------------------------------------------------------------
// Month, percentage and calculation memory
// ---------------------------------------------------------------------------

/**
 * The first month whose periods all start at least 30 days from today, so the formal notice of every
 * client is still on time (clause 3.5): today + 30 days, rounded up to the start of a month.
 */
export function defaultAdjustmentMonth(today: ISODate): MonthKey {
  const earliest = addDays(today, FEE_ADJUSTMENT_NOTICE_DAYS);
  const month = monthKey(earliest);
  return earliest.endsWith('-01') ? month : addMonthKey(month, 1);
}

/** `?mes=2027-01` → the month, or null when absent or malformed. */
export function monthParam(value: string | null): MonthKey | null {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

/** "Janeiro de 2027" → "janeiro de 2027" (inside sentences). */
export function monthInSentence(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

export interface AdjustmentPlan {
  /** Largest positive index (clause 3.3); `bps` 0 and `index` null when none is positive. */
  suggested: { bps: number; index: FeeAdjustmentIndex | null };
  appliedBps: number;
  /** The index whose value is applied ("o escolhido"); null = typed by hand or no positive index. */
  chosen: FeeAdjustmentIndex | null;
  /** The percentage differs from the largest index (negotiated, clause 3.6). */
  manual: boolean;
  /** "1,0427". */
  factor: string;
  /** "Maior índice: IPCA 4,27% → fator 1,0427". */
  memory: string;
}

/** The percentage of the batch from the indices and, when typed, the applied percentage. */
export function adjustmentPlan(indices: FeeAdjustmentIndexValues, applied: number | null = null): AdjustmentPlan {
  const suggested = suggestedAdjustment(indices);
  const appliedBps = applied ?? suggested.bps;
  const factor = adjustmentFactorText(appliedBps);
  const informed = FEE_ADJUSTMENT_INDEXES.some((index) => indices[index] !== null);
  const best = suggested.index
    ? `Maior índice: ${INDEX_SHORT_LABELS[suggested.index]} ${formatBps(suggested.bps)}`
    : informed
      ? 'Nenhum índice positivo'
      : 'Nenhum índice informado';
  const manual = appliedBps !== suggested.bps;
  return {
    suggested,
    appliedBps,
    chosen: chosenAdjustmentIndex(indices, appliedBps),
    manual,
    factor,
    memory: manual || !suggested.index ? `${best} · aplicado ${formatBps(appliedBps)} → fator ${factor}` : `${best} → fator ${factor}`,
  };
}

/** How a batch got its percentage, for the history and the letters: "IPCA", "Negociado", "Sem índice positivo". */
export function batchIndexLabel(batch: Pick<FeeAdjustment, 'chosenIndex' | 'appliedBps'>): string {
  if (batch.chosenIndex) return INDEX_SHORT_LABELS[batch.chosenIndex];
  return batch.appliedBps > 0 ? 'Negociado' : 'Sem índice positivo';
}

/** The four indices of a batch for the calculation table of the letter. */
export function indexRows(indices: FeeAdjustmentIndexValues, chosen: FeeAdjustmentIndex | null): { index: FeeAdjustmentIndex; label: string; value: string; chosen: boolean }[] {
  return FEE_ADJUSTMENT_INDEXES.map((index) => ({
    index,
    label: FEE_ADJUSTMENT_INDEX_LABELS[index],
    value: indices[index] === null ? 'não informado' : formatBps(indices[index]),
    chosen: index === chosen,
  }));
}

// ---------------------------------------------------------------------------
// Clients of the month
// ---------------------------------------------------------------------------

/** The previous period's values with the percentage (the fee per employee only when asked), as the API does. */
export function adjustedValues(current: FeeAdjustmentValues, bps: number, adjustEmployeeFee: boolean): FeeAdjustmentValues {
  return {
    amount: adjustByBps(current.amount, bps),
    employeeFee: adjustEmployeeFee ? adjustByBps(current.employeeFee, bps) : current.employeeFee,
  };
}

/** The clients that can be adjusted (the ones checked when the month opens). */
export function readyIds(items: readonly FeeAdjustmentPreviewItem[]): Set<string> {
  return new Set(items.filter((i) => i.status === 'ready').map((i) => i.clientId));
}

export interface SelectionTotals {
  /** Selected clients that can be adjusted. */
  count: number;
  /** Monthly fees now and adjusted (cents). */
  current: number;
  proposed: number;
  /** Selected clients whose notice deadline has passed. */
  late: number;
}

/** Totals of the selected clients that are ready, with the percentage on screen. */
export function selectionTotals(items: readonly FeeAdjustmentPreviewItem[], selected: ReadonlySet<string>, bps: number): SelectionTotals {
  const totals: SelectionTotals = { count: 0, current: 0, proposed: 0, late: 0 };
  for (const item of items) {
    if (item.status !== 'ready' || !item.current || !selected.has(item.clientId)) continue;
    totals.count += 1;
    totals.current += item.current.amount;
    totals.proposed += adjustByBps(item.current.amount, bps);
    if (item.noticeLate) totals.late += 1;
  }
  return totals;
}

/** "14 clientes · 12 prontos · 1 já reajustado · 1 sem vigência anterior". */
export function monthSummary(items: readonly FeeAdjustmentPreviewItem[]): string {
  const count = (status: FeeAdjustmentPreviewItem['status']) => items.filter((i) => i.status === status).length;
  const ready = count('ready');
  const done = count('already_adjusted');
  const missing = count('no_previous_fee');
  return [
    `${items.length} ${items.length === 1 ? 'cliente' : 'clientes'}`,
    ready ? `${ready} ${ready === 1 ? 'pronto' : 'prontos'}` : '',
    done ? `${done} já ${done === 1 ? 'reajustado' : 'reajustados'}` : '',
    missing ? `${missing} sem vigência anterior` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The month of the period that follows one ending on `endDate` (the renewal month of a client). */
export function renewalMonth(endDate: ISODate): MonthKey {
  return monthKey(addDays(endDate, 1));
}
