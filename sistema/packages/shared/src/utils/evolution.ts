// Month-by-month evolution of the client base (GET /reports/evolution): new contracts, inactivations,
// the active base at the end of each month and the monthly fees in force on that day. Pure and
// unit-tested; the API adds what was billed and received (SQL aggregates).

import { EVOLUTION_METRICS } from '../constants';
import type { ClientBaseMonth, EvolutionChange, EvolutionComparison, EvolutionMonth } from '../types';
import { addMonthKey, minISO, monthRange, type ISODate, type MonthKey } from './dates';
import { feePeriodIndexAt } from './fees';

export interface EvolutionClient {
  id: string;
  contractStartDate: ISODate;
  /** Inactivation date (null while active). A reactivation clears it, so it reads as never inactivated. */
  inactivatedAt: ISODate | null;
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
  const months: ClientBaseMonth[] = [];
  for (let month = input.from; month <= input.to; month = addMonthKey(month, 1)) {
    const range = monthRange(month);
    const asOf = minISO(range.to, today);
    let newClients = 0;
    let churnedClients = 0;
    let activeClients = 0;
    let recurringFees = 0;
    let clientsWithFee = 0;
    for (const client of clients) {
      if (within(client.contractStartDate, range.from, asOf)) newClients += 1;
      if (within(client.inactivatedAt, range.from, asOf)) churnedClients += 1;
      if (!activeOn(client, asOf)) continue;
      activeClients += 1;
      const amount = feeOf.get(`${client.id}:${feePeriodIndexAt(client.contractStartDate, asOf)}`);
      if (amount === undefined) continue;
      recurringFees += amount;
      clientsWithFee += 1;
    }
    months.push({
      month,
      asOf,
      partial: range.to > today,
      newClients,
      churnedClients,
      activeClients,
      netChange: newClients - churnedClients,
      recurringFees,
      clientsWithFee,
      averageFee: clientsWithFee > 0 ? Math.round(recurringFees / clientsWithFee) : 0,
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
