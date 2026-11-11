// Months of the evolution report used by the tests: `m` mirrors the scenario of
// apps/api/test/reports-evolution.test.ts (today 2026-10-20, October partial).
import type { EvolutionMonth } from '@effinance/shared';

export function evolutionMonth(patch: Partial<EvolutionMonth> & Pick<EvolutionMonth, 'month'>): EvolutionMonth {
  const newList = patch.newList ?? [];
  const churnedList = patch.churnedList ?? [];
  return {
    asOf: `${patch.month}-28`,
    partial: false,
    newClients: newList.length,
    churnedClients: churnedList.length,
    activeClients: 0,
    netChange: newList.length - churnedList.length,
    recurringFees: 0,
    clientsWithFee: 0,
    averageFee: 0,
    billed: 0,
    received: 0,
    ...patch,
    newList,
    churnedList,
  };
}

export const m: EvolutionMonth[] = [
  evolutionMonth({
    month: '2026-08',
    asOf: '2026-08-31',
    activeClients: 2,
    recurringFees: 160_000,
    clientsWithFee: 2,
    averageFee: 80_000,
    newList: [{ id: 'august', name: 'Agosto', fee: 50_000 }],
    billed: 5_000,
    received: 5_000,
  }),
  evolutionMonth({
    month: '2026-09',
    asOf: '2026-09-30',
    activeClients: 4,
    recurringFees: 190_000,
    clientsWithFee: 3,
    averageFee: 63_333,
    newList: [
      { id: 'leaving', name: 'Saiu', fee: 30_000 },
      { id: 'no-fee', name: 'Sem vigência', fee: 0 },
    ],
    billed: 160_000,
    received: 110_000,
  }),
  evolutionMonth({
    month: '2026-10',
    asOf: '2026-10-20',
    partial: true,
    activeClients: 3,
    recurringFees: 160_000,
    clientsWithFee: 2,
    averageFee: 80_000,
    churnedList: [{ id: 'leaving', name: 'Saiu', fee: 30_000, reason: 'contract_end' }],
    billed: 140_000,
    received: 159_300,
  }),
];

/** Synthetic months with the lists: one new client of 2 000,00 and a renewal of 100,00 in October. */
export const withLists = {
  aug: evolutionMonth({ month: '2026-08', activeClients: 3, recurringFees: 150_000, clientsWithFee: 3, averageFee: 50_000 }),
  sep: evolutionMonth({ month: '2026-09', activeClients: 2, recurringFees: 100_000, clientsWithFee: 2, averageFee: 50_000 }),
  oct: evolutionMonth({
    month: '2026-10',
    activeClients: 3,
    recurringFees: 310_000,
    clientsWithFee: 3,
    averageFee: 103_333,
    newList: [{ id: 'big', name: 'Grande Cliente', fee: 200_000 }],
  }),
  /** September after August with one client leaving for default. */
  sepChurn: evolutionMonth({
    month: '2026-09',
    activeClients: 2,
    recurringFees: 100_000,
    clientsWithFee: 2,
    averageFee: 50_000,
    churnedList: [{ id: 'gone', name: 'Devedora', fee: 50_000, reason: 'default' }],
  }),
};

/** October with nobody coming in or out, after `withLists.sep`. */
export const still = evolutionMonth({ month: '2026-10', activeClients: 2, recurringFees: 100_000, clientsWithFee: 2, averageFee: 50_000 });
