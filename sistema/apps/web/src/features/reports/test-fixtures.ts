// Rows of the delinquency report for the tests of the pure helpers and of the components.
import type { DelinquencyClient } from '@effinance/shared';

export function client(patch: Partial<DelinquencyClient>): DelinquencyClient {
  return {
    contactId: patch.name ?? 'x',
    name: 'Cliente',
    tradeName: null,
    document: null,
    responsibleName: null,
    phone: null,
    status: 'active',
    dueCount: 12,
    onTimeCount: 12,
    lateCount: 0,
    openCount: 0,
    openAmount: 0,
    avgDaysLate: null,
    maxDaysLate: 0,
    interestCount: 0,
    fineCount: 0,
    interestTotal: 0,
    fineTotal: 0,
    probability: 0.1,
    score: 900,
    risk: 'baixo',
    lowHistory: false,
    paymentScore: patch.score ?? 900,
    punctuality: patch.score ?? 900,
    openPenalty: 0,
    reworkPenalty: 0,
    rework: { last90Days: 0, last12Months: 0, latest: [] },
    overdue: [],
    ...patch,
  };
}

/** The demo rows (spec §6.1): open amounts and rework in 90 days. */
export const demoClients: DelinquencyClient[] = [
  client({ name: 'Transportadora Rota Sul Ltda', tradeName: 'Rota Sul', risk: 'critico', score: 164, openAmount: 545000, openCount: 2, rework: { last90Days: 2, last12Months: 3, latest: [] } }),
  client({ name: 'Juliana Prado Design', tradeName: 'Ju Prado Design', risk: 'critico', score: 0, openAmount: 103000, openCount: 6, rework: { last90Days: 1, last12Months: 1, latest: [] } }),
  client({ name: 'Padaria Pão Quente Ltda', tradeName: 'Pão Quente', risk: 'moderado', score: 700, rework: { last90Days: 1, last12Months: 2, latest: [] } }),
  client({ name: 'Construtora Alicerce', tradeName: 'Alicerce', risk: 'baixo' }),
  client({ name: 'Farmácia Vida Saudável', tradeName: 'Vida Saudável', risk: 'baixo' }),
  client({ name: 'Instituto Aprender', risk: 'baixo' }),
  client({ name: 'Tecnova', risk: 'baixo' }),
  client({ name: 'Sorriso Pleno', risk: 'baixo' }),
  client({ name: 'Arte & Forma', risk: 'baixo', status: 'inactive' }),
  client({ name: 'Bom Preço', risk: 'baixo', status: 'inactive', openAmount: 0 }),
];
