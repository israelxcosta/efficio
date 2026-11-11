// Pure logic of Relatórios › Evolução (spec §4): the finding of the month, the KPIs against the
// previous month, the bridge of the monthly fee and the month-by-month rows. The API sends the months
// already aggregated (GET /reports/evolution); everything here is unit-tested.

import { EVOLUTION_METRIC_LABELS, formatBRL, formatMonthKey, MONTH_NAMES, type EvolutionMonth, type MonthKey } from '@effinance/shared';

const MINUS = '−';
const percent1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** +4 · −1 · 0 */
export function signedCount(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${MINUS}${Math.abs(n)}`;
  return '0';
}

/** +R$ 4.800,00 · −R$ 300,00 · R$ 0,00 */
export function signedMoney(cents: number): string {
  if (cents > 0) return `+${formatBRL(cents)}`;
  if (cents < 0) return `${MINUS}${formatBRL(Math.abs(cents))}`;
  return formatBRL(0);
}

/** 0.419 → "+41,9%" · −0.158 → "−15,8%" · 0 → "0,0%" (one decimal, thousands separated). */
export function signedPercent(ratio: number): string {
  const text = `${percent1.format(Math.abs(ratio) * 100)}%`;
  const rounded = Math.round(ratio * 1000);
  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `${MINUS}${text}`;
  return '0,0%';
}

const wholePercent = (ratio: number) => `${Math.round(ratio * 100)}%`;
/** "outubro" (month name, lowercase, for "vs outubro"). */
export const monthName = (key: MonthKey) => MONTH_NAMES[Number(key.slice(5, 7)) - 1]!.toLowerCase();
const capitalized = (key: MonthKey) => MONTH_NAMES[Number(key.slice(5, 7)) - 1]!;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const movesText = (month: EvolutionMonth) =>
  `${plural(month.newClients, 'novo', 'novos')}, ${plural(month.churnedClients, 'encerrado', 'encerrados')}`;

/** The month and the one before it in the window (undefined for the first one). */
function pick(months: readonly EvolutionMonth[], ref: MonthKey) {
  const index = Math.max(0, months.findIndex((x) => x.month === ref));
  return { current: months[index], previous: index > 0 ? months[index - 1] : undefined };
}

/** "+R$ 4.800,00 (+41,9%)", or just the money when the previous fee was 0. */
function moneyChange(current: number, previous: number): string {
  const diff = current - previous;
  return previous === 0 ? signedMoney(diff) : `${signedMoney(diff)} (${signedPercent(diff / Math.abs(previous))})`;
}

/**
 * Subtitle of "Carteira mês a mês" (spec §4.3): "Novembro: +4 clientes (4 novos, 0 encerrados) ·
 * honorário mensal +R$ 4.800,00 (+41,9%) vs outubro"; "carteira estável" without moves; "base igual a"
 * when moves cancel out; the first month of the window has nothing to compare with.
 */
export function evolutionFinding(months: readonly EvolutionMonth[], ref: MonthKey): string {
  const { current, previous } = pick(months, ref);
  if (!current) return '';
  const name = capitalized(current.month);
  if (!previous) return `${name}: ${plural(current.activeClients, 'cliente ativo', 'clientes ativos')} · honorário mensal ${formatBRL(current.recurringFees)}`;
  const vs = monthName(previous.month);
  const base =
    current.netChange !== 0
      ? `${signedCount(current.netChange)} ${Math.abs(current.netChange) === 1 ? 'cliente' : 'clientes'} (${movesText(current)})`
      : current.newClients === 0 && current.churnedClients === 0
        ? `carteira estável em ${plural(current.activeClients, 'cliente', 'clientes')}`
        : `base igual a ${vs} (${movesText(current)})`;
  const fees =
    current.recurringFees === previous.recurringFees
      ? `honorário mensal igual a ${vs}`
      : `honorário mensal ${moneyChange(current.recurringFees, previous.recurringFees)} vs ${vs}`;
  return `${name}: ${base} · ${fees}`;
}

export interface KpiPart {
  text: string;
  /** Colour of a change that is good or bad news (only the base, the fees and what came in). */
  tone?: 'success' | 'danger';
}

export interface EvolutionKpi {
  key: 'activeClients' | 'recurringFees' | 'averageFee' | 'billed';
  label: string;
  value: string;
  /** The footer in one line (`parts` joined). */
  footer: string;
  parts: KpiPart[];
  trend: 'up' | 'down' | 'flat';
}

const trendOf = (diff: number): EvolutionKpi['trend'] => (diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat');
const toneOf = (diff: number): KpiPart['tone'] => (diff > 0 ? 'success' : diff < 0 ? 'danger' : undefined);
const kpi = (key: EvolutionKpi['key'], label: string, value: string, parts: KpiPart[], trend: EvolutionKpi['trend']): EvolutionKpi => ({
  key,
  label,
  value,
  parts,
  footer: parts.map((p) => p.text).join(''),
  trend,
});

/**
 * The 4 KPIs of the reference month (spec §4.3) against the month before it: clients (with the moves),
 * monthly fee, average fee and billed (with what came in: "até hoje" and no % in the partial month).
 */
export function evolutionKpis(months: readonly EvolutionMonth[], ref: MonthKey): EvolutionKpi[] {
  const { current, previous } = pick(months, ref);
  if (!current) return [];
  const vs = previous ? ` vs ${monthName(previous.month)}` : '';
  const noPrevious = 'sem o mês anterior na janela';

  // Clientes ativos.
  const activeDiff = previous ? current.activeClients - previous.activeClients : 0;
  const activeParts: KpiPart[] = !previous
    ? [{ text: movesText(current) }]
    : activeDiff === 0
      ? [{ text: `igual a ${monthName(previous.month)} · ${movesText(current)}` }]
      : [{ text: signedCount(activeDiff), tone: toneOf(activeDiff) }, { text: `${vs} · ${movesText(current)}` }];
  if (current.partial) activeParts.push({ text: ' · parcial' });

  // Honorário mensal recorrente.
  const feesDiff = previous ? current.recurringFees - previous.recurringFees : 0;
  const feesParts: KpiPart[] = !previous
    ? [{ text: noPrevious }]
    : feesDiff === 0
      ? [{ text: `igual a ${monthName(previous.month)}` }]
      : [{ text: moneyChange(current.recurringFees, previous.recurringFees), tone: toneOf(feesDiff) }, { text: vs }];

  // Ticket médio (in ink: a lower average is not bad news by itself).
  const average = current.clientsWithFee > 0 ? current.averageFee : null;
  const previousAverage = previous && previous.clientsWithFee > 0 ? previous.averageFee : null;
  const coverage = average !== null && current.clientsWithFee < current.activeClients ? ` · ${current.clientsWithFee} de ${current.activeClients} com vigência` : '';
  const ticketText =
    average === null
      ? 'nenhum cliente com vigência'
      : !previous
        ? noPrevious
        : previousAverage === null
          ? `sem vigência em ${monthName(previous.month)}${coverage}`
          : average === previousAverage
            ? `igual a ${monthName(previous.month)}${coverage}`
            : `${signedPercent((average - previousAverage) / previousAverage)}${vs}${coverage}`;
  const ticketTrend = average !== null && previousAverage !== null ? trendOf(average - previousAverage) : 'flat';

  // Faturado no mês, with what came in.
  const received = current.partial
    ? `recebido ${formatBRL(current.received)} até hoje`
    : current.billed > 0
      ? `recebido ${wholePercent(current.received / current.billed)}`
      : `recebido ${formatBRL(current.received)}`;
  const billedDiff = previous ? current.billed - previous.billed : 0;
  const billedChange = !previous ? '' : previous.billed === 0 ? '' : billedDiff === 0 ? ` · igual a ${monthName(previous.month)}` : ` · ${signedPercent(billedDiff / previous.billed)}${vs}`;

  return [
    kpi('activeClients', EVOLUTION_METRIC_LABELS.activeClients, String(current.activeClients), activeParts, trendOf(activeDiff)),
    kpi('recurringFees', EVOLUTION_METRIC_LABELS.recurringFees, formatBRL(current.recurringFees), feesParts, trendOf(feesDiff)),
    kpi('averageFee', EVOLUTION_METRIC_LABELS.averageFee, average === null ? '—' : formatBRL(average), [{ text: ticketText }], ticketTrend),
    kpi('billed', 'Faturado no mês', formatBRL(current.billed), [{ text: `${received}${billedChange}` }], previous ? trendOf(billedDiff) : 'flat'),
  ];
}

export interface BridgeRow {
  key: 'previous' | 'new' | 'adjustment' | 'churned' | 'current';
  label: string;
  /** Cents; `adjustment` may be negative (a client lost its fee period, a lower renewal). */
  amount: number;
}

/**
 * Bridge of the monthly fee (spec §4.2): previous base + new − churned + adjustments = current base.
 * New = Σ fees of the month's new clients; churned = Σ fees they had at the end of the previous month;
 * adjustments = the rest (renewals, fee periods gained or lost). Null without the previous month.
 */
export function feeBridge(current: EvolutionMonth, previous: EvolutionMonth | undefined): BridgeRow[] | null {
  if (!previous) return null;
  const added = current.newList.reduce((sum, c) => sum + c.fee, 0);
  const churned = current.churnedList.reduce((sum, c) => sum + c.fee, 0);
  return [
    { key: 'previous', label: `Base de ${monthName(previous.month)}`, amount: previous.recurringFees },
    { key: 'new', label: `Novos (${current.newClients})`, amount: added },
    { key: 'adjustment', label: 'Reajustes', amount: current.recurringFees - previous.recurringFees - added + churned },
    { key: 'churned', label: `Encerrados (${current.churnedClients})`, amount: churned },
    { key: 'current', label: `Base de ${monthName(current.month)}`, amount: current.recurringFees },
  ];
}

export interface EvolutionRow {
  month: MonthKey;
  /** "Out/26". */
  label: string;
  activeClients: number;
  newClients: number;
  churnedClients: number;
  netChange: number;
  recurringFees: number;
  /** Against the month below; null for the oldest one (no previous month in the window). */
  feesChange: number | null;
  /** Null without any client with a fee period. */
  averageFee: number | null;
  billed: number;
  received: number;
  /** received ÷ billed (may pass 100%); null when nothing was billed. */
  receivedShare: number | null;
  partial: boolean;
  /** The oldest month of the window: the table shows "—" in the changes. */
  first: boolean;
  source: EvolutionMonth;
}

/** Rows of "Mês a mês", newest first. */
export function evolutionRows(months: readonly EvolutionMonth[]): EvolutionRow[] {
  return months
    .map((x, i) => {
      const previous = i > 0 ? months[i - 1] : undefined;
      return {
        month: x.month,
        label: formatMonthKey(x.month, 'short'),
        activeClients: x.activeClients,
        newClients: x.newClients,
        churnedClients: x.churnedClients,
        netChange: x.netChange,
        recurringFees: x.recurringFees,
        feesChange: previous ? x.recurringFees - previous.recurringFees : null,
        averageFee: x.clientsWithFee > 0 ? x.averageFee : null,
        billed: x.billed,
        received: x.received,
        receivedShare: x.billed > 0 ? x.received / x.billed : null,
        partial: x.partial,
        first: i === 0,
        source: x,
      };
    })
    .reverse();
}

/**
 * Subtitle of "Faturado, recebido e honorário mensal": what came in against what was billed in the
 * reference month and how the billed moved; the partial month is said with its day.
 */
export function moneyFinding(months: readonly EvolutionMonth[], ref: MonthKey): string {
  const { current, previous } = pick(months, ref);
  if (!current) return '';
  const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const parts: string[] = [];
  if (current.partial) parts.push(`${capitalized(current.month)} até ${day(current.asOf)}: recebido ${formatBRL(current.received)}`);
  else parts.push(`${capitalized(current.month)}: ${current.billed > 0 ? `recebido ${wholePercent(current.received / current.billed)} do faturado` : `recebido ${formatBRL(current.received)}, nada faturado`}`);
  if (previous && previous.billed > 0) {
    const diff = current.billed - previous.billed;
    parts.push(diff === 0 ? `faturado igual a ${monthName(previous.month)}` : `faturado ${signedPercent(diff / previous.billed)} vs ${monthName(previous.month)}`);
  }
  const last = months.at(-1);
  if (last && last.partial && last.month !== current.month) parts.push(`${monthName(last.month)} parcial (até ${day(last.asOf)})`);
  return parts.join(' · ');
}
