// Month-by-month evolution of the client base (GET /reports/evolution): new contracts, inactivations,
// the active base at the end of each month and the monthly fees in force on that day. Pure and
// unit-tested; the API adds what was billed and received (SQL aggregates).

import { EVOLUTION_METRICS } from '../constants';
import type { InactivationReason } from '../constants';
import type { ClientBaseMonth, EvolutionChange, EvolutionChurnRef, EvolutionClientRef, EvolutionComparison, EvolutionMonth } from '../types';
import { addMonthKey, minISO, monthRange, type ISODate, type MonthKey } from './dates';
import { feePeriodIndexAt } from './fees';

export interface EvolutionClient {
  id: string;
  /** As listed: trade name, else the legal name. */
  name: string;
  contractStartDate: ISODate;
  /** Inactivation date (null while active). A reactivation clears it, so it reads as never inactivated. */
  inactivatedAt: ISODate | null;
  inactivationReason: InactivationReason | null;
}

export interface EvolutionFee {
  clientId: string;
  /** 0-based fee period (vigência) of the client's contract. */
  periodIndex: number;
  /** Monthly fee of the period, cents. */
  amount: number;
}

/** Active on `day`: the contract started and the client was not inactivated on or before it. */
function activeOn(client: EvolutionClient, day: ISODate): boolean {
  return client.contractStartDate <= day && (client.inactivatedAt === null || client.inactivatedAt > day);
}

const within = (day: ISODate | null, from: ISODate, to: ISODate) => day !== null && day >= from && day <= to;

/**
 * Months `from`…`to` (inclusive). Each month counts up to `asOf` = its last day, or `today` in the
 * current month (`partial`): contract starts and inactivations dated after it wait for their day. A
 * client inactivated on a day is out of that day's base, so the base always moves by the net change.
 * The fee of an active client is the one of the period containing `asOf` (`feePeriodIndexAt`); without
 * a registered period the client stays in the base and out of the fees and the average.
 * `newList` carries each new client's fee in that base (0 when not in it), `churnedList` the fee the
 * churned one had at the end of the previous month, so previous + Σ new − Σ churned + adjustments
 * (renewals, periods gained or lost) = recurringFees. Lists by name.
 */
export function clientBaseEvolution(input: {
  clients: readonly EvolutionClient[];
  fees: readonly EvolutionFee[];
  from: MonthKey;
  to: MonthKey;
  today: ISODate;
}): ClientBaseMonth[] {
  const { clients, today } = input;
  const feeOf = new Map(input.fees.map((f) => [`${f.clientId}:${f.periodIndex}`, f.amount]));
  /** The fee in the base of `day` (undefined: not active, or active without a registered period). */
  const feeOn = (client: EvolutionClient, day: ISODate) =>
    activeOn(client, day) ? feeOf.get(`${client.id}:${feePeriodIndexAt(client.contractStartDate, day)}`) : undefined;
  const byName = (a: EvolutionClientRef, b: EvolutionClientRef) => a.name.localeCompare(b.name, 'pt-BR');
  const months: ClientBaseMonth[] = [];
  for (let month = input.from; month <= input.to; month = addMonthKey(month, 1)) {
    const range = monthRange(month);
    const asOf = minISO(range.to, today);
    const previousEnd = monthRange(addMonthKey(month, -1)).to;
    const newList: EvolutionClientRef[] = [];
    const churnedList: EvolutionChurnRef[] = [];
    let activeClients = 0;
    let recurringFees = 0;
    let clientsWithFee = 0;
    for (const client of clients) {
      const fee = feeOn(client, asOf);
      if (within(client.contractStartDate, range.from, asOf)) newList.push({ id: client.id, name: client.name, fee: fee ?? 0 });
      if (within(client.inactivatedAt, range.from, asOf)) {
        churnedList.push({ id: client.id, name: client.name, fee: feeOn(client, previousEnd) ?? 0, reason: client.inactivationReason ?? 'other' });
      }
      if (!activeOn(client, asOf)) continue;
      activeClients += 1;
      if (fee === undefined) continue;
      recurringFees += fee;
      clientsWithFee += 1;
    }
    months.push({
      month,
      asOf,
      partial: range.to > today,
      newClients: newList.length,
      churnedClients: churnedList.length,
      activeClients,
      netChange: newList.length - churnedList.length,
      recurringFees,
      clientsWithFee,
      averageFee: clientsWithFee > 0 ? Math.round(recurringFees / clientsWithFee) : 0,
      newList: newList.sort(byName),
      churnedList: churnedList.sort(byName),
    });
  }
  return months;
}

/** Absolute and relative change; the relative one over |previous| (null when previous is 0). */
export function evolutionChange(current: number, previous: number): EvolutionChange {
  const diff = current - previous;
  return { current, previous, diff, diffPercent: previous === 0 ? null : diff / Math.abs(previous) };
}

/** Every metric of `current` against `previous` (the month before it). */
export function evolutionComparison(current: EvolutionMonth, previous: EvolutionMonth): EvolutionComparison {
  const metrics = Object.fromEntries(
    EVOLUTION_METRICS.map((metric) => [metric, evolutionChange(current[metric], previous[metric])]),
  ) as EvolutionComparison['metrics'];
  return { current: current.month, previous: previous.month, metrics };
}
