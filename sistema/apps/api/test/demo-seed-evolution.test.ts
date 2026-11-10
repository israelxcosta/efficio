// The demo seed (CLI `db:seed` and the browser demo) carries the rework scenario (a "Retrabalho" category
// flagged as rework, corrections for Rota Sul, Pão Quente and Ju Prado on past days) and contracts spread
// over the year, so the client-base evolution has new clients and inactivations to show.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from '../src/db/demo-seed';
import { clientFor, createTestApp, resetDb } from './helpers';

let app: App;
// Relative to the real date, like the CLI and the browser demo (see demo-seed-phase3.test.ts).
const pinned = process.env.EFFINANCE_TODAY;
beforeAll(async () => {
  delete process.env.EFFINANCE_TODAY;
  app = await createTestApp();
});
afterAll(async () => {
  process.env.EFFINANCE_TODAY = pinned;
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
});

describe('demo seed: rework and the client-base evolution', () => {
  it('has rework for three clients and contracts started and ended along the year', async () => {
    await seedDemo(app.db);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
    const marina = clientFor(app, login.json().token);

    const categories = (await marina.get('/tasks/categories')).body;
    expect(categories.filter((c: any) => c.isRework).map((c: any) => [c.name, c.taskCount])).toEqual([['Retrabalho', 6]]);

    const report = (await marina.get('/reports/delinquency?months=12')).body;
    const byName = (name: string) => report.clients.find((c: any) => c.tradeName === name);
    expect(byName('Rota Sul')).toMatchObject({ reworkPenalty: 9, rework: { last90Days: 2, last12Months: 3 } });
    expect(byName('Pão Quente')).toMatchObject({ reworkPenalty: 5, rework: { last90Days: 1, last12Months: 2 } });
    expect(byName('Ju Prado Design')).toMatchObject({ reworkPenalty: 4, rework: { last90Days: 1, last12Months: 1 } });
    expect(byName('Tecnova')).toMatchObject({ reworkPenalty: 0, rework: { last90Days: 0, last12Months: 0 } });
    const rotaSul = (await marina.get(`/reports/clients/${byName('Rota Sul').contactId}/rework`)).body;
    expect(rotaSul.rework.latest.map((t: any) => t.title)).toEqual([
      'Retificar SPED Fiscal com CFOP errado',
      'Refazer folha dos motoristas: horas extras a menor',
      'Reenviar EFD-Reinf rejeitada',
    ]);

    const evolution = (await marina.get('/reports/evolution?months=12')).body;
    const months = evolution.months;
    const total = (key: string) => months.reduce((acc: number, m: any) => acc + m[key], 0);
    expect(months).toHaveLength(12);
    expect(total('newClients')).toBe(4); // 11, 10, 9 and 1 months ago
    expect(total('churnedClients')).toBe(2); // 6 and 2 months ago
    expect(months.map((m: any) => m.newClients)).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(months.map((m: any) => m.churnedClients)).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]);
    expect(months.at(-1)).toMatchObject({ partial: true, activeClients: 8 });
    expect(months.every((m: any) => m.recurringFees > 0)).toBe(true);
    // Fees are generated for the 10 competences before the current one, due the month after each (the
    // current month may have received nothing yet on its first days).
    expect(months.slice(2).every((m: any) => m.billed > 0)).toBe(true);
    expect(months.slice(2, -1).every((m: any) => m.received > 0)).toBe(true);
    expect(evolution.comparison.metrics.newClients).toMatchObject({ current: 0, previous: 1, diff: -1 });
  });
});
