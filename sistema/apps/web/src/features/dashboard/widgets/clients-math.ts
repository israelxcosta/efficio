// Pure helpers of the client widgets (portfolio by regime, fee periods to renew, incomplete
// registrations and the fees billed for a competence month).

import {
  addDays,
  addMonthKey,
  diffInDays,
  endOfMonth,
  TAX_REGIMES,
  type Client,
  type ClientFee,
  type ContactReportResponse,
  type ISODate,
  type MonthKey,
  type TaxRegime,
  type Transaction,
} from '@effinance/shared';

// ---------------------------------------------------------------------------
// Carteira por regime
// ---------------------------------------------------------------------------

export interface RegimeStat {
  regime: TaxRegime;
  /** Active clients. */
  clients: number;
  /** Active clients with a current fee. */
  withFee: number;
  /** Sum of the current monthly fees of the active clients (cents). */
  amount: number;
}

/**
 * Active clients and current fees per tax regime, largest amount first (regimes with no active
 * client are left out). `byRegime` (API summary, whole workspace) wins over the counted list.
 */
export function regimeStats(clients: readonly Client[], byRegime?: Partial<Record<TaxRegime, number>>): RegimeStat[] {
  const stats = new Map<TaxRegime, RegimeStat>(TAX_REGIMES.map((regime) => [regime, { regime, clients: 0, withFee: 0, amount: 0 }]));
  for (const c of clients) {
    if (c.status !== 'active') continue;
    const s = stats.get(c.taxRegime);
    if (!s) continue;
    s.clients++;
    if (c.currentFee) {
      s.withFee++;
      s.amount += c.currentFee.amount;
    }
  }
  if (byRegime) for (const s of stats.values()) s.clients = Math.max(byRegime[s.regime] ?? 0, s.withFee);
  return [...stats.values()]
    .filter((s) => s.clients > 0 || s.amount > 0)
    .sort((a, b) => b.amount - a.amount || b.clients - a.clients);
}

/** DonutChart (fill mode) puts its legend beside the donut from this width; rows are 26px. */
export const DONUT_BESIDE_PX = 448;
export const DONUT_ROW_PX = 26;
/** Smallest donut whose center still holds a full amount ("R$ 15.160,00" at 12px). */
export const DONUT_MIN_PX = 130;

/**
 * Donut or a stacked bar with a list, from the room the chart gets: the donut needs DONUT_MIN_PX
 * plus its legend (beside it on wide boxes, below it otherwise). `maxItems` leaves the tail to
 * DonutChart's "Outras (N)" row.
 */
export function regimeChartLayout(count: number, width: number, height: number): { donut: boolean; maxItems: number } {
  const beside = width >= DONUT_BESIDE_PX;
  const rows = Math.floor((beside ? height : height - DONUT_MIN_PX - 12) / DONUT_ROW_PX);
  const donut = beside ? height >= DONUT_MIN_PX - 10 && rows >= 1 : rows >= Math.min(count, 2);
  return { donut, maxItems: count <= rows ? count : Math.max(1, rows - 1) };
}

// ---------------------------------------------------------------------------
// Vigências de honorários
// ---------------------------------------------------------------------------

/** Current fee periods ending within this many days are flagged. */
export const FEE_ENDING_DAYS = 60;

export type FeePeriodAlert =
  | {
      kind: 'missing';
      client: Client;
      /** No fee registered, the latest one ended (renewal pending) or the next one starts later. */
      reason: 'none' | 'expired' | 'future';
      /** End of the expired period / start of the future one. */
      date: ISODate | null;
    }
  | { kind: 'ending'; client: Client; date: ISODate; days: number };

/** The client already registered the period that follows the current one. */
function renewed(current: ClientFee, latest: ClientFee | null): boolean {
  return Boolean(latest && latest.id !== current.id && latest.startDate > current.endDate);
}

/**
 * Active clients without a current fee first (none → longest expired → starting later), then the
 * current periods ending in up to FEE_ENDING_DAYS days with no renewal registered, soonest first.
 */
export function feePeriodAlerts(clients: readonly Client[], today: ISODate): FeePeriodAlert[] {
  const missing: Extract<FeePeriodAlert, { kind: 'missing' }>[] = [];
  const ending: Extract<FeePeriodAlert, { kind: 'ending' }>[] = [];
  const limit = addDays(today, FEE_ENDING_DAYS);
  for (const client of clients) {
    if (client.status !== 'active') continue;
    const { currentFee: current, latestFee: latest } = client;
    if (!current) {
      if (!latest) missing.push({ kind: 'missing', client, reason: 'none', date: null });
      else if (latest.endDate < today) missing.push({ kind: 'missing', client, reason: 'expired', date: latest.endDate });
      else missing.push({ kind: 'missing', client, reason: 'future', date: latest.startDate });
    } else if (current.endDate <= limit && !renewed(current, latest)) {
      ending.push({ kind: 'ending', client, date: current.endDate, days: diffInDays(current.endDate, today) });
    }
  }
  const rank = { none: 0, expired: 1, future: 2 } as const;
  missing.sort((a, b) => rank[a.reason] - rank[b.reason] || (a.date ?? '').localeCompare(b.date ?? '') || a.client.name.localeCompare(b.client.name, 'pt-BR'));
  ending.sort((a, b) => a.date.localeCompare(b.date) || a.client.name.localeCompare(b.client.name, 'pt-BR'));
  return [...missing, ...ending];
}

// ---------------------------------------------------------------------------
// Cadastro incompleto
// ---------------------------------------------------------------------------

/** Contact data checked on the client registration, as shown on the chips. */
export const CONTACT_FIELDS: { label: string; missing: (c: Client) => boolean }[] = [
  { label: 'e-mail', missing: (c) => !c.email?.trim() },
  { label: 'telefone', missing: (c) => !c.phone?.trim() },
  { label: 'responsável', missing: (c) => !c.responsibleName?.trim() },
  { label: 'cidade', missing: (c) => !c.city?.trim() },
];

export interface IncompleteClient {
  client: Client;
  missing: string[];
}

/** Active clients missing contact data, the most incomplete first. */
export function incompleteClients(clients: readonly Client[]): IncompleteClient[] {
  return clients
    .filter((c) => c.status === 'active')
    .map((client) => ({ client, missing: CONTACT_FIELDS.filter((f) => f.missing(client)).map((f) => f.label) }))
    .filter((x) => x.missing.length > 0)
    .sort((a, b) => b.missing.length - a.missing.length || a.client.name.localeCompare(b.client.name, 'pt-BR'));
}

// ---------------------------------------------------------------------------
// Honorários do mês
// ---------------------------------------------------------------------------

/** Fees are billed after the month of service: those due in `month` refer to the month before. */
export function feeCompetence(month: MonthKey): MonthKey {
  return addMonthKey(month, -1);
}

/** The API sends the fee fields ("Gerar honorários"); older APIs leave them out. */
export function hasFeeFields(rows: readonly Transaction[]): boolean {
  return rows.some((t) => 'feeCompetence' in t && t.feeCompetence !== undefined);
}

export interface GeneratedFees {
  /** Fee and employee receivables of the competence (cents). */
  generated: number;
  received: number;
  open: number;
  /** Part of `open` already past its due date. */
  overdue: number;
  count: number;
  /** Clients with a fee generated for the competence. */
  clientIds: Set<string>;
}

/** Receivables made by "Gerar honorários" for `competence`. */
export function generatedFees(rows: readonly Transaction[], competence: MonthKey, today: ISODate): GeneratedFees {
  const out: GeneratedFees = { generated: 0, received: 0, open: 0, overdue: 0, count: 0, clientIds: new Set() };
  for (const t of rows) {
    if (t.type !== 'income' || t.feeCompetence !== competence) continue;
    out.generated += t.amount;
    out.count++;
    if (t.paid) out.received += t.amount;
    else {
      out.open += t.amount;
      if (t.date < today) out.overdue += t.amount;
    }
    if (t.contactId && t.feeKind !== 'employees') out.clientIds.add(t.contactId);
  }
  return out;
}

function covers(fee: ClientFee | null, date: ISODate): boolean {
  return Boolean(fee && fee.startDate <= date && date <= fee.endDate);
}

/**
 * Active clients "Gerar honorários" would bill for `competence`: contract started and a fee period
 * in force at the end of the month. When the current period started after it, the previous
 * (annual, contiguous) period is assumed to be registered.
 */
export function billableClients(clients: readonly Client[], competence: MonthKey): Client[] {
  const end = endOfMonth(`${competence}-01`);
  return clients.filter((c) => {
    if (c.status !== 'active' || c.contractStartDate > end) return false;
    const current = c.currentFee;
    return covers(current, end) || covers(c.latestFee, end) || Boolean(current && current.startDate > end && current.index > 0);
  });
}

export interface ClientIncome {
  total: number;
  /** Clients with some income in the period. */
  clientIds: Set<string>;
}

/** Income of the given clients in a contacts report (receivables without a client stay out). */
export function clientIncome(report: ContactReportResponse | undefined, clientIds: ReadonlySet<string>): ClientIncome {
  const out: ClientIncome = { total: 0, clientIds: new Set() };
  for (const item of report?.items ?? []) {
    if (!item.contactId || !clientIds.has(item.contactId) || item.income <= 0) continue;
    out.total += item.income;
    out.clientIds.add(item.contactId);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Régua da competência
// ---------------------------------------------------------------------------

/** Where a client's fee of the competence stands. */
export type RulerStatus = 'atrasado' | 'aberto' | 'pago' | 'sem';

export interface RulerEntry {
  clientId: string;
  /** Nome fantasia, else razão social. */
  name: string;
  status: RulerStatus;
  /** Fee and employee charge of the competence (cents; 0 when not generated). */
  amount: number;
  /** Due date of the fee (null when not generated). */
  dueDate: ISODate | null;
  /** Days past the due date while open (0 otherwise). */
  daysLate: number;
}

const RULER_ORDER: Record<RulerStatus, number> = { atrasado: 0, aberto: 1, sem: 2, pago: 3 };

/**
 * One entry per client billed (or billable) for `competence`: paid, open, overdue or with no fee
 * generated. Overdue first (oldest due date first), then open by due date, then not generated and
 * paid by name — the order of what needs doing.
 */
export function competenceRuler(
  clients: readonly Client[],
  rows: readonly Transaction[],
  competence: MonthKey,
  today: ISODate,
): RulerEntry[] {
  const byClient = new Map<string, RulerEntry>();
  const names = new Map(clients.map((c) => [c.id, c.tradeName || c.name]));
  for (const t of rows) {
    if (t.type !== 'income' || t.feeCompetence !== competence || !t.contactId) continue;
    const entry = byClient.get(t.contactId) ?? {
      clientId: t.contactId,
      name: names.get(t.contactId) ?? t.contact?.name ?? 'Cliente',
      status: 'pago' as RulerStatus,
      amount: 0,
      dueDate: null,
      daysLate: 0,
    };
    entry.amount += t.amount;
    if (t.feeKind !== 'employees') entry.dueDate = t.date;
    if (!t.paid) {
      const late = t.date < today ? diffInDays(today, t.date) : 0;
      if (late > 0) {
        entry.status = 'atrasado';
        entry.daysLate = Math.max(entry.daysLate, late);
      } else if (entry.status !== 'atrasado') entry.status = 'aberto';
    }
    byClient.set(t.contactId, entry);
  }
  for (const c of billableClients(clients, competence)) {
    if (byClient.has(c.id)) continue;
    byClient.set(c.id, { clientId: c.id, name: c.tradeName || c.name, status: 'sem', amount: 0, dueDate: null, daysLate: 0 });
  }
  return [...byClient.values()].sort(
    (a, b) =>
      RULER_ORDER[a.status] - RULER_ORDER[b.status] ||
      (a.status === 'atrasado' || a.status === 'aberto' ? (a.dueDate ?? '').localeCompare(b.dueDate ?? '') : 0) ||
      a.name.localeCompare(b.name, 'pt-BR'),
  );
}
