# Evolução da carteira, score v2 e retrabalho: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relatórios › aba "Evolução" (clientes novos, encerrados, base, honorário mensal recorrente,
faturado e recebido, ticket médio, mês a mês e contra o mês anterior), linha de clientes ativos no
Fluxo de caixa do painel, gráfico e score da inadimplência revistos e score com retrabalho
(categoria de tarefa com "Conta como retrabalho").

**Architecture:** O agente de backend já entregou (sem commit, em 10/11) a migração 0020, o flag
`isRework`, `utils/rework.ts` (`clientScore`), `utils/evolution.ts`, `GET /reports/evolution` e
`GET /reports/clients/:id/rework`. Este plano parte disso: as tarefas 1 a 5 são os **deltas** de
contrato e API que a spec ainda pede (A1–A7 da §9); as tarefas 6 a 12 são o web, com a lógica em
módulos puros testados e componentes de apresentação testados por `renderToStaticMarkup`.

**Tech Stack:** TypeScript, Zod, Fastify 5, Drizzle, PostgreSQL 16, React 19, Vite, Tailwind v4,
TanStack Query, Recharts, Vitest.

**Spec:** `docs/projeto-melhorias-dashboards.md` (§4 Evolução, §5 inadimplência e score, §6
retrabalho, §9 alinhamento com a API). Base visual: `docs/design-system.md`.

## Global Constraints

- Dinheiro em centavos inteiros; datas de calendário `YYYY-MM-DD`; meses `YYYY-MM`.
- UI em pt-BR, código em inglês. **Contrato primeiro** (tarefas 1 e 2 antes das que o consomem).
- Toda consulta filtra por `workspace_id`; rotas de relatório ficam no plugin com `financeOnly`.
- Módulos de `apps/api/src/modules` sem imports exclusivos do Node (o demo os roda no navegador).
- Migração nova: reiniciar o `vite --mode demo` para o demo aplicá-la.
- Só tokens do design system; sem degradê; animações ≤ 200ms; nada rola dentro de card; sem rolagem
  lateral em 375/1024/1440.
- Score: janela fixa de **12 meses** (`SCORE_WINDOW_MONTHS = 12`); gravidade `g(d)` = 0 / 0,25 (1–5
  dias) / 0,5 (6–15) / 0,75 (16–30) / 1 (> 30); em aberto −50 cada, até −250; retrabalho **−40 por
  tarefa em 90 dias e −10 por tarefa de 91 dias a 12 meses, até −200**; faixas 800/600/400.
- Rótulo do risco `baixo`: **"Baixo risco"** (era "Bom pagador").
- Copy fixa: `SCORE_HELP` (spec §5.3) e o texto do checkbox (spec §6.1), sem alterar palavras.
- Antes de concluir: `pnpm typecheck && pnpm test` (API precisa de Postgres; veja README).
- Commits só quando o usuário ou o coordenador pedir; os passos "Commit" marcam o ponto de corte.

## Review Focus

1. **Mês parcial na evolução**: o mês corrente (`partial`) não compara "Recebido" em % e mostra "até
   hoje"; o faturado compara normalmente. Teste na tarefa 10.
2. **Primeiro mês da janela**: a API corta o mês anterior (`months.slice(1)`); a linha mais antiga da
   tabela mostra "—" nas variações e a ponte desse mês diz que não há mês anterior na janela. Testes
   nas tarefas 10 e 11.
3. **Cliente sem vigência**: conta em `activeClients`, fora de `clientsWithFee`; `averageFee` 0 vira
   "—" na tela. Teste na tarefa 10.
4. **Período da inadimplência ≠ janela do score**: com `months=6` o score continua sobre 12 meses e
   bate com o do relatório do cliente. Testes nas tarefas 4 e 9.
5. **Usuário financeiro sem a permissão `tasks`**: `title: null` nos retrabalhos e nenhum link
   "Abrir tarefa". Testes nas tarefas 3 e 9.

---

## Mapa de arquivos

| Arquivo | Responsabilidade | Tarefa |
| --- | --- | --- |
| `packages/shared/src/utils/delinquency.ts`, `utils/rework.ts`, `constants.ts` | Score v2, pesos do retrabalho, rótulos | 1 |
| `packages/shared/src/types.ts` | `DelinquencyMonth`, `EvolutionMonth`, `ReworkTask` | 2 |
| `apps/api/src/modules/reports/rework.ts` | Títulos sem permissão; testes com os pesos novos | 3 |
| `apps/api/src/modules/reports/delinquency.ts` | Score de 12 meses e quebra mensal | 4 |
| `packages/shared/src/utils/evolution.ts`, `apps/api/src/modules/reports/evolution.ts` | Listas de quem entrou e saiu | 5 |
| `apps/web/src/features/tasks/components/registry-sheets.tsx`, `pages/registry.tsx`, `pages/task-reports.tsx`, `api.ts` | Checkbox, selo, invalidação | 6 |
| `apps/web/src/features/reports/delinquency-view.ts` | Lógica pura da inadimplência | 7 |
| `apps/web/src/features/reports/components/delinquency-*.tsx` | Tela da inadimplência | 8 |
| `apps/web/src/features/reports/client-report/*`, `pages/client-report.tsx`, `api.ts` | Relatório do cliente | 9 |
| `apps/web/src/features/reports/evolution/evolution-logic.ts` (novo) | Lógica pura da evolução | 10 |
| `apps/web/src/features/reports/evolution/*.tsx` (novo), `pages/reports.tsx`, `api.ts` | Aba Evolução | 11 |
| `apps/web/src/features/dashboard/components/cashflow-card.tsx`, `layout/{types,layout}.ts`, `widgets/insight-lines.ts`, `widgets/clients-widgets.tsx` | Linha no Fluxo de caixa, Carteira | 12 |
| `docs/design-system.md`, `docs/api.md`, spec | Documentação | 13 |

Tarefas 1 a 5: **agente de backend** (já é dono desses arquivos agora). Tarefas 6, 7 e 10 podem
começar sobre o contrato atual; 8, 9, 11 e 12 dependem dos deltas. Ordem: 1 → 2 → (3, 4, 5 ‖ 6, 7,
10) → 8, 9, 11, 12 → 13.

## O que a API precisa (resumo para o agente de backend)

Já feito (manter): migração 0020 e `isRework`; `reworkByClient`, `reworkWindows`, `clientScore`;
`GET /reports/clients/:id/rework`; `DelinquencyClient.{paymentScore, reworkPenalty, rework}`;
`GET /reports/evolution?months=1..36` com `comparison`; semente do demo. Falta:

- **A1** pesos do retrabalho 40 / 10 / 200 (tarefa 1).
- **A2** score v2 com `punctuality` e `openPenalty` (tarefa 1).
- **A3** score da inadimplência sobre 12 meses fixos (tarefa 4).
- **A4** quebra mensal da inadimplência (tarefas 2 e 4).
- **A5** `newList`/`churnedList` na evolução (tarefas 2 e 5).
- **A6** `ReworkTask.title` nulo sem a permissão `tasks` (tarefas 2 e 3).
- **A7** rótulos `activeClients` e `recurringFees` (tarefa 1).

---

### Task 1 [contrato]: Score v2, pesos do retrabalho e rótulos

**Files:**
- Modify: `packages/shared/src/utils/delinquency.ts`, `packages/shared/src/utils/rework.ts:13-16`, `packages/shared/src/constants.ts` (`DELINQUENCY_RISK_LABELS.baixo`, `EVOLUTION_METRIC_LABELS`)
- Test: `packages/shared/test/utils.test.ts` (`describe('delinquency score')`), `packages/shared/test/evolution-rework.test.ts`

**Interfaces:**
- Produces:
  - `SCORE_WINDOW_MONTHS = 12`, `OPEN_PENALTY = 50`, `OPEN_PENALTY_MAX = 250`; `lateSeverity(daysLate: number): number`
  - `DelinquencyScore` + `punctuality: number; openPenalty: number` (`punctuality` arredondado; `score` = arredondamento de `1000 × (1 − taxa grave) − openPenalty`, 0..1000)
  - `REWORK_PENALTY_RECENT = 40`, `REWORK_PENALTY_OLDER = 10`, `REWORK_PENALTY_MAX = 200` (assinaturas de `reworkPenalty` e `clientScore` iguais; `ClientScore` herda os campos novos)
  - `DELINQUENCY_RISK_LABELS.baixo = 'Baixo risco'`; `EVOLUTION_METRIC_LABELS.activeClients = 'Clientes ativos'`, `.recurringFees = 'Honorário mensal recorrente'`

- [ ] **Step 1: Write the failing tests** (substituem `penalizes long delays…`, `flags a client…` e `takes 4 points per rework…`)

```ts
const months = (n: number, daysLate: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ monthsAgo: i, daysLate: daysLate(i) }));

it('grades a delay by how long it was', () => {
  expect([0, 1, 5, 6, 15, 16, 30, 31, 184].map(lateSeverity)).toEqual([0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1, 1]);
});
it('starts a client without history at 800, low risk', () => {
  expect(delinquencyScore([], 0)).toEqual({ probability: 0.2, score: 800, risk: 'baixo', lowHistory: true, punctuality: 800, openPenalty: 0 });
});
it('separates short delays from long ones', () => {
  expect(delinquencyScore(months(12, () => 0), 0).score).toBe(916);
  expect(delinquencyScore(months(12, () => 5), 0)).toMatchObject({ score: 771, risk: 'moderado' });
  expect(delinquencyScore(months(12, () => 45), 0)).toMatchObject({ score: 337, risk: 'critico' });
  expect(delinquencyScore(months(8, (i) => (i === 3 ? 18 : 0)), 0)).toMatchObject({ score: 855, risk: 'baixo' });
  expect(delinquencyScore(months(12, () => 5), 0).probability).toBeCloseTo(delinquencyScore(months(12, () => 45), 0).probability);
});
it('takes 50 per open item, up to 250', () => {
  expect(delinquencyScore(months(12, () => 5), 2)).toMatchObject({ score: 671, openPenalty: 100 });
  expect(delinquencyScore(months(12, () => 0), 8)).toMatchObject({ score: 666, openPenalty: 250 });
  expect(delinquencyScore(months(10, (i) => (i < 8 ? 30 * (8 - i) : 0)), 8).risk).toBe('critico');
});
// evolution-rework.test.ts
it('takes 40 per rework in 90 days and 10 per older one in 12 months, up to 200', () => {
  expect(reworkPenalty({ last90Days: 3, last12Months: 3 })).toBe(120);
  expect(reworkPenalty({ last90Days: 2, last12Months: 3 })).toBe(90);
  expect(reworkPenalty({ last90Days: 0, last12Months: 4 })).toBe(40);
  expect(reworkPenalty({ last90Days: 6, last12Months: 6 })).toBe(200);
});
it('a punctual client with 3 rework tasks drops to "Atenção"', () => {
  expect(clientScore(months(12, () => 0), 0, { last90Days: 3, last12Months: 3 })).toMatchObject({ paymentScore: 916, punctuality: 916, reworkPenalty: 120, score: 796, risk: 'moderado' });
});
```

Também: `DELINQUENCY_RISK_LABELS.baixo === 'Baixo risco'`; manter `weighs recent delays more…` e `maps scores to risk bands`.
- [ ] **Step 2: Run** `pnpm --filter @effinance/shared test` → FAIL.
- [ ] **Step 3: Implement** `lateSeverity` e o novo `delinquencyScore` (spec §5.2: a chance continua `(Σ w·[d>0] + 1) / (Σ w + 5)`; a taxa grave usa `Σ w·g(d)`); constantes do retrabalho; rótulos; comentários dos arquivos.
- [ ] **Step 4: Run** `pnpm --filter @effinance/shared test` → PASS; `pnpm -r typecheck`.
- [ ] **Step 5: Commit** — `feat(shared): score v2 e pesos do retrabalho`

### Task 2 [contrato]: Campos novos

**Files:**
- Modify: `packages/shared/src/types.ts` (`DelinquencyMonth`, `EvolutionMonth`, `ReworkTask`)
- Test: compila em `pnpm -r typecheck` (tipos sem lógica); os testes de comportamento estão nas tarefas 3, 4 e 5

**Interfaces:**
- Produces:
  - `DelinquencyMonth` + `onTimeCount: number; paidLateCount: number; openLateCount: number; onTimeAmount: number; paidLateAmount: number; openLateAmount: number; paidLateAvgDays: number | null; partial: boolean` (`lateCount` = `paidLateCount + openLateCount`; os campos atuais ficam)
  - `EvolutionClientRef { id: string; name: string; fee: number }`; `EvolutionChurnRef extends EvolutionClientRef { reason: InactivationReason }` (`fee` = honorário em `asOf` do mês anterior)
  - `EvolutionMonth` + `newList: EvolutionClientRef[]; churnedList: EvolutionChurnRef[]` (por nome)
  - `ReworkTask.title: string | null` (null sem a permissão `tasks`)

- [ ] **Step 1:** Escrever os tipos com JSDoc das definições da spec §4.2 e §5.1.
- [ ] **Step 2: Run** `pnpm -r typecheck` → aponta API, demo e fixturas web sem os campos (preencher com zeros/listas vazias onde for fixtura).
- [ ] **Step 3: Commit** — `feat(shared): campos da quebra mensal, das listas da evolução e título opcional`

### Task 3 [API]: Retrabalho com os pesos novos e títulos protegidos

**Files:**
- Modify: `apps/api/src/modules/reports/rework.ts`, `apps/api/src/modules/reports/routes.ts`, `apps/api/src/modules/reports/delinquency.ts` (passa a permissão), `docs/api.md`
- Test: `apps/api/test/rework.test.ts`

**Interfaces:**
- Consumes: tarefa 1 (pesos), tarefa 2 (`title: string | null`)
- Produces: `reworkByClient(db, workspaceId, today, clientId?, canReadTasks = true)`; `clientRework(db, workspaceId, clientId, canReadTasks: boolean)`; nas rotas, `canReadTasks = can(req.access, 'tasks')`

- [ ] **Step 1: Write the failing tests** — atualizar as expectativas atuais de penalidade (`penalty: 10` → `90` para 2 recentes + 1 antiga; `penalty: 20` com 6 recentes → `200`; `reworkPenalty: 10` → `90`, `20` → `200`) e acrescentar `it('hides task titles without the tasks permission')`: membro com `finance` e sem `tasks` → `GET /reports/clients/:id/rework` e a linha da inadimplência trazem `latest[0].title === null`, com `last90Days` e `category.name` preenchidos.
- [ ] **Step 2: Run** `pnpm --filter api test -- rework` → FAIL.
- [ ] **Step 3: Implement** o parâmetro e o `null`; `docs/api.md` (pesos e títulos).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(api): retrabalho com pesos 40/10/200 e títulos só com permissão de tarefas`

### Task 4 [API]: Inadimplência v2

**Files:**
- Modify: `apps/api/src/modules/reports/delinquency.ts`, `docs/api.md` (seção "Relatório de inadimplência")
- Test: `apps/api/test/delinquency.test.ts`

**Interfaces:**
- Consumes: `clientScore` com score v2 (tarefa 1), `SCORE_WINDOW_MONTHS`; campos da tarefa 2
- Produces: a consulta busca `max(q.months, 12)` meses; o **score** usa só os recebíveis dos últimos 12 meses (e os em aberto vencidos) qualquer que seja `q.months`; contagens, `monthly` e `summary` continuam no período. Por mês, os campos da tarefa 2 (`paidLateAvgDays` = média só dos pagos com atraso, 1 casa; `partial` = mês corrente).

- [ ] **Step 1: Write the failing tests**
  - `it('scores over 12 months whatever the period')`: cliente com atrasos de 40 dias há 8–10 meses e em dia nos últimos 6 → `months=6` e `months=12` devolvem o mesmo `score` e `punctuality`; `dueCount` difere.
  - `it('splits each month into on time, paid late and open late')`: mês com 1 no prazo, 1 pago 10 dias depois e 1 vencido em aberto → `{ onTimeCount: 1, paidLateCount: 1, openLateCount: 1, lateCount: 2, paidLateAvgDays: 10 }`; só o mês corrente tem `partial: true`.
  - Atualizar as expectativas de score de `measures each client…` para a fórmula v2.
- [ ] **Step 2: Run** `pnpm --filter api test -- delinquency` → FAIL.
- [ ] **Step 3: Implement**; documentar no `docs/api.md` (fórmula v2, janela fixa, campos novos).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(api): inadimplência com score de 12 meses e quebra mensal`

### Task 5 [API]: Quem entrou e quem saiu na evolução

**Files:**
- Modify: `packages/shared/src/utils/evolution.ts` (`clientBaseEvolution`), `apps/api/src/modules/reports/evolution.ts`, `docs/api.md`
- Test: `packages/shared/test/evolution-rework.test.ts`, `apps/api/test/reports-evolution.test.ts`

**Interfaces:**
- Consumes: tipos da tarefa 2; `getClientContacts` (nomes decifrados em lote)
- Produces: `EvolutionClient` + `name: string; inactivationReason: InactivationReason | null`; cada mês com `newList` (honorário em `asOf`) e `churnedList` (honorário em `asOf` do mês anterior, `reason`), ordenadas por nome

- [ ] **Step 1: Write the failing tests** — no cenário de `reports-evolution.test.ts` (hoje 2026-10-20): `months[1].newList` = os 2 contratos de setembro em ordem alfabética, com `fee` da vigência de 30/09 (0 para quem não tem); `months[2].churnedList` = o cliente inativado em outubro, com `fee` da vigência de 30/09 e o `reason` gravado; no puro, `it('keeps the fee bridge identity')`: em todo mês depois do primeiro, `anterior.recurringFees + Σ newList.fee − Σ churnedList.fee + reajustes === recurringFees`, com `reajustes` = soma das mudanças de vigência de quem ficou.
- [ ] **Step 2: Run** `pnpm --filter @effinance/shared test -- evolution && pnpm --filter api test -- reports-evolution` → FAIL.
- [ ] **Step 3: Implement** (uma leitura de nomes com os ids que aparecem nas listas); `docs/api.md`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(api): evolução com quem entrou e quem saiu`

### Task 6: Checkbox "Conta como retrabalho" e selo

**Files:**
- Modify: `apps/web/src/features/tasks/components/registry-sheets.tsx:161-239`, `apps/web/src/features/tasks/pages/registry.tsx:297-370`, `apps/web/src/features/tasks/pages/task-reports.tsx` (`PunctualityBlock` de categoria), `apps/web/src/features/tasks/api.ts:307` (`useSaveTaskCategory`)
- Test: `apps/web/src/features/tasks/components/registry-sheets.test.tsx` (novo)

**Interfaces:**
- Consumes: `TaskCategory.isRework`, `taskCategoryInputSchema.isRework` (opcional na API; o formulário sempre envia)
- Produces: `ReworkField({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void })` e `ReworkBadge()` exportados de `registry-sheets.tsx`

- [ ] **Step 1: Write the failing test** (`renderToStaticMarkup`, como `my-area-cards.test.tsx`):

```ts
it('explains what marking a category as rework does', () => {
  const html = wrap(<ReworkField checked onChange={() => {}} />);
  expect(html).toContain('Conta como retrabalho');
  expect(html).toContain('−40 pontos por tarefa nos últimos 90 dias e −10 pelas de até 12 meses (até −200)');
  expect(html).toMatch(/role="checkbox"[^>]*aria-checked="true"/);
});
it('labels rework categories', () => {
  expect(wrap(<ReworkBadge />)).toContain('Retrabalho');
});
```

- [ ] **Step 2: Run** `pnpm --filter web test -- registry-sheets` → FAIL.
- [ ] **Step 3: Implement**: `ReworkField` (`Checkbox` + `<label>` + descrição da spec §6.1) depois de "Cor" no `TaskCategorySheet` (estado `isRework`, sempre no `safeParse`); `ReworkBadge` (`Badge tone="warning"`) ao lado do nome na lista de categorias e no ranking "Por categoria"; `useSaveTaskCategory` invalida também `['reports']`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(web): categoria com "Conta como retrabalho"`

### Task 7: Lógica pura da inadimplência

**Files:**
- Modify: `apps/web/src/features/reports/delinquency-view.ts`
- Test: `apps/web/src/features/reports/delinquency-view.test.ts`

**Interfaces:**
- Consumes: `DelinquencyClient` (com `rework`, `punctuality`, `openPenalty`, `reworkPenalty`), `DelinquencyMonth` (tarefa 2)
- Produces:
  - `reworkText(count: number): string | null`
  - `scoreParts(s: { punctuality: number; openPenalty: number; reworkPenalty: number; score: number }): string`
  - `type BarMode = 'count' | 'amount'`; `interface MonthBar { month: MonthKey; label: string; onTime: number; paidLate: number; openLate: number; rate: number | null; partial: boolean }`; `monthBars(monthly: readonly DelinquencyMonth[], mode: BarMode): MonthBar[]` (`label` = `formatMonthKey(month, 'short')`, com " · parcial" no corrente; `rate` nulo no parcial e sem vencimentos)
  - `lateTrend(monthly: readonly DelinquencyMonth[]): { recent: number; previous: number } | null` (Σ atrasados ÷ Σ vencidos dos últimos 3 meses completos × os 3 anteriores; null sem os 6)
  - `riskBands(clients): Record<DelinquencyRisk, { count: number; openAmount: number }>`; `reworkSummary(clients): { clients: number; tasks: number }` (por `rework.last90Days`)
  - `type ClientScope = 'active' | 'all'`; `scopeClients(clients, scope)` (`active` tira inativos sem valor em aberto)

- [ ] **Step 1: Write the failing tests**

```ts
expect(reworkText(0)).toBeNull();
expect(reworkText(1)).toBe('1 retrabalho em 90 dias');
expect(reworkText(3)).toBe('3 retrabalhos em 90 dias');
expect(scoreParts({ punctuality: 608, openPenalty: 100, reworkPenalty: 90, score: 418 })).toBe('Pontualidade 608 · em aberto −100 · retrabalho −90 = 418');
expect(scoreParts({ punctuality: 916, openPenalty: 0, reworkPenalty: 0, score: 916 })).toBe('Pontualidade 916');
expect(monthBars([oct, nov], 'count')).toEqual([
  { month: '2026-10', label: 'Out/26', onTime: 6, paidLate: 2, openLate: 1, rate: 0.3333333333333333, partial: false },
  { month: '2026-11', label: 'Nov/26 · parcial', onTime: 1, paidLate: 0, openLate: 0, rate: null, partial: true },
]);
expect(monthBars([oct], 'amount')[0]).toMatchObject({ onTime: oct.onTimeAmount, paidLate: oct.paidLateAmount, openLate: oct.openLateAmount });
expect(lateTrend(sixComplete)).toEqual({ previous: expect.closeTo(0.2667, 3), recent: expect.closeTo(0.4167, 3) });
expect(lateTrend(fiveComplete)).toBeNull();
expect(riskBands(clients).critico).toEqual({ count: 2, openAmount: 648000 });
expect(reworkSummary(clients)).toEqual({ clients: 3, tasks: 4 });
expect(scopeClients(clients, 'active').some((c) => c.status === 'inactive' && c.openAmount === 0)).toBe(false);
```

(`oct` = 6 no prazo, 2 pagos com atraso, 1 vencido em aberto; `sixComplete` = 6 meses completos com 20 vencidos cada e taxas 0,2 / 0,3 / 0,3 / 0,4 / 0,4 / 0,45, mais o corrente parcial; `clients` = linhas do demo: Rota Sul 545000 e Ju Prado 103000 em aberto, ambos críticos; retrabalho em 90 dias Rota Sul 2, Pão Quente 1, Ju Prado 1.)
- [ ] **Step 2: Run** `pnpm --filter web test -- delinquency-view` → FAIL.
- [ ] **Step 3: Implement** as funções.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(web): lógica da inadimplência v2`

### Task 8: Tela da inadimplência

**Files:**
- Modify: `apps/web/src/features/reports/components/delinquency-chart.tsx` (reescrita), `delinquency-gauges.tsx` (sai `Thermometer`, entra `PortfolioRiskCardView`; `RISK_TONE`), `delinquency-tab.tsx` (KPI com tendência, card novo, filtro), `delinquency-clients.tsx` (`SCORE_HELP`, `ScoreCell` exportado, retrabalho, filtro, celular, link do cliente sem `?meses`)
- Test: `apps/web/src/features/reports/components/delinquency-ui.test.tsx` (novo)

**Interfaces:**
- Consumes: tarefa 7; campos das tarefas 3 e 4
- Produces: `PortfolioRiskCardView({ clients, probability }: { clients: DelinquencyClient[]; probability: number })`, `ScoreCell({ client, compact? })`

- [ ] **Step 1: Write the failing tests**

```ts
it('shows the risk distribution without a gradient', () => {
  const html = wrap(<PortfolioRiskCardView clients={clients} probability={0.29} />);
  expect(html).toContain('2 de 10');
  expect(html).toContain('clientes em risco alto ou crítico');
  expect(html).not.toContain('linearGradient');
  expect(html).toContain('3 clientes com retrabalho (4 tarefas em 90 dias)');
  expect(html).toContain('cerca de 1 em cada 3 mensalidades');
});
it('says the rework next to the score and explains the parts', () => {
  const html = wrap(<ScoreCell client={{ ...client, rework: { last90Days: 3, last12Months: 3, latest: [] }, punctuality: 916, openPenalty: 0, reworkPenalty: 120, score: 796, risk: 'moderado' }} />);
  expect(html).toContain('3 retrabalhos em 90 dias');
  expect(html).toContain('Pontualidade 916 · retrabalho −120 = 796');
});
it('labels the low risk band as "Baixo risco"', () => {
  expect(wrap(<RiskBadge risk="baixo" />)).toContain('Baixo risco');
});
```

- [ ] **Step 2: Run** `pnpm --filter web test -- delinquency-ui` → FAIL.
- [ ] **Step 3: Implement** (spec §5.1 e §5.3): `BarChart` empilhado com `monthBars` (`SegmentedControl sm` Quantidade · Valor, estado local), `--app-data` / `--app-warning` / `stripeFill('danger')`, `LabelList` com a taxa, mês parcial com opacidade 0,6, `niceDomain`, tooltip da spec, achado por `lateTrend`; `RISK_TONE`: baixo neutro, moderado `warning`, alto `aging-3`, crítico `danger`; KPI "Taxa de atraso" com tendência; filtro `Ativos · Todos` (padrão Ativos); no celular o score vira a 5ª estatística da grade; `SCORE_HELP` com o texto da spec §5.3.
- [ ] **Step 4: Run** `pnpm --filter web test` → PASS; captura do demo em 1440 e 375 (`/relatorios?aba=inadimplencia`) sem rolagem lateral.
- [ ] **Step 5: Commit** — `feat(web): inadimplência com gráfico por situação, carteira por risco e score v2`

### Task 9: Relatório do cliente

**Files:**
- Modify: `apps/web/src/features/reports/client-report/client-report.ts`, `apps/web/src/features/reports/pages/client-report.tsx`, `apps/web/src/features/reports/api.ts`
- Create: `apps/web/src/features/reports/client-report/rework-card.tsx`
- Test: `apps/web/src/features/reports/client-report/client-report.test.ts`, `apps/web/src/features/reports/client-report/rework-card.test.tsx` (novo)

**Interfaces:**
- Consumes: `clientScore`, `SCORE_WINDOW_MONTHS` (tarefa 1); `ClientReworkResponse` (existe; `title` nulo da tarefa 3); `scoreParts` (tarefa 7)
- Produces:
  - `periodScore(receivables: readonly ClientReceivable[], today: ISODate, rework?: ReworkCounts): ClientScore` (sempre 12 meses)
  - `analyzeClient(receivables, today, rework?: ReworkCounts): ClientAnalysis` (`score: ClientScore`, `scoreMonths` = 12)
  - `ClientMonth` + `overdueAmount: number; upcomingAmount: number`
  - `useClientRework(contactId: string | undefined)` (`qk.report('client-rework', { contactId })`, carrega ao montar)
  - `ReworkCardView({ data, canOpen, loading }: { data: ClientReworkResponse | undefined; canOpen: boolean; loading: boolean })`

- [ ] **Step 1: Write the failing tests**

```ts
it('scores the last 12 months, like the delinquency row', () => {
  expect(periodScore(rs, '2026-11-10')).toEqual(periodScore(rs.filter((r) => r.dueDate >= '2025-12-01'), '2026-11-10'));
});
it('discounts rework', () => {
  const base = periodScore(onTimeYear, '2026-11-10');
  expect(periodScore(onTimeYear, '2026-11-10', { last90Days: 2, last12Months: 3 })).toMatchObject({ paymentScore: base.score, reworkPenalty: 90, score: base.score - 90 });
});
it('splits what is open in each month into overdue and upcoming', () => {
  expect(analyzeClient(rotaSul, '2026-11-10').months.find((m) => m.month === '2026-10')).toMatchObject({ overdueAmount: 545000, upcomingAmount: 0 });
});
// rework-card.test.tsx
it('shows both windows and opens the task when allowed', () => {
  const html = wrap(<ReworkCardView data={rework} canOpen loading={false} />);
  expect(html).toContain('2 em 90 dias · 3 em 12 meses');
  expect(html).toContain('href="/tarefas?tarefa=');
});
it('shows counts and categories without titles nor links when tasks are off limits', () => {
  const html = wrap(<ReworkCardView data={withoutTitles} canOpen={false} loading={false} />);
  expect(html).not.toContain('href="/tarefas');
  expect(html).toContain('Retrabalho');
});
it('says when there was no rework', () => {
  expect(wrap(<ReworkCardView data={none} canOpen loading={false} />)).toContain('Nenhum retrabalho nos últimos 12 meses');
});
```

- [ ] **Step 2: Run** `pnpm --filter web test -- client-report rework-card` → FAIL.
- [ ] **Step 3: Implement** (spec §5.4): `ScoreBlock` com "Score de 12 meses" e a composição em linhas; `ReworkCardView` ao lado de "Em aberto" (Vigências desce); `BilledChart` empilha o em aberto hachurado (vencido `danger`, a vencer cinza); 4 KPIs + `dl` compacto; `?meses` só para o link de volta; "Abrir tarefa" só com `usePermissions().can('tasks')`.
- [ ] **Step 4: Run** → PASS; captura de `/relatorios/cliente/<Rota Sul>` em 1440 e 375.
- [ ] **Step 5: Commit** — `feat(web): relatório do cliente com composição do score e retrabalho`

### Task 10: Lógica pura da evolução

**Files:**
- Create: `apps/web/src/features/reports/evolution/evolution-logic.ts`
- Test: `apps/web/src/features/reports/evolution/evolution-logic.test.ts`

**Interfaces:**
- Consumes: `EvolutionMonth` (com `newList`/`churnedList` da tarefa 2), `EVOLUTION_METRIC_LABELS`, `evolutionChange` (shared)
- Produces:
  - `signedCount(n: number): string` (`+4`, `−1`, `0`); `signedMoney(cents: number): string` (`+R$ 4.800,00`, `−R$ 300,00`, `R$ 0,00`)
  - `evolutionFinding(months: readonly EvolutionMonth[], ref: MonthKey): string`
  - `interface EvolutionKpi { key: 'activeClients' | 'recurringFees' | 'averageFee' | 'billed'; label: string; value: string; footer: string; trend: 'up' | 'down' | 'flat' }`; `evolutionKpis(months, ref): EvolutionKpi[]`
  - `interface BridgeRow { key: 'previous' | 'new' | 'adjustment' | 'churned' | 'current'; label: string; amount: number }`; `feeBridge(current: EvolutionMonth, previous: EvolutionMonth | undefined): BridgeRow[] | null` (null sem anterior)
  - `interface EvolutionRow { month: MonthKey; label: string; activeClients: number; newClients: number; churnedClients: number; netChange: number; recurringFees: number; feesChange: number | null; averageFee: number | null; billed: number; received: number; receivedShare: number | null; partial: boolean }`; `evolutionRows(months): EvolutionRow[]` (mais recente primeiro; o mais antigo com `feesChange: null`; `averageFee` null quando `clientsWithFee` = 0; `receivedShare` null com faturado 0)

- [ ] **Step 1: Write the failing tests** — fixtura `m` = os 3 meses de `apps/api/test/reports-evolution.test.ts` (ago, set, out/2026; out parcial, hoje 2026-10-20):

```ts
expect(signedCount(4)).toBe('+4'); expect(signedCount(-1)).toBe('−1'); expect(signedCount(0)).toBe('0');
expect(evolutionFinding(m, '2026-10')).toBe(`Outubro: −1 cliente (0 novos, 1 encerrado) · honorário mensal ${signedMoney(-30000)} (−15,8%) vs setembro`);
expect(evolutionFinding(m, '2026-09')).toBe(`Setembro: +2 clientes (2 novos, 0 encerrados) · honorário mensal ${signedMoney(30000)} (+18,8%) vs agosto`);
expect(evolutionFinding(flat, '2026-10')).toBe('Outubro: carteira estável em 3 clientes · honorário mensal igual a setembro');
expect(evolutionFinding(swap, '2026-10')).toMatch(/^Outubro: base igual a setembro \(1 novo, 1 encerrado\)/);
expect(evolutionFinding(m, '2026-08')).toBe(`Agosto: 2 clientes ativos · honorário mensal ${formatBRL(160000)}`);
expect(evolutionKpis(m, '2026-10').map((k) => [k.key, k.label, k.value, k.footer])).toEqual([
  ['activeClients', 'Clientes ativos', '3', '−1 vs setembro · 0 novos, 1 encerrado · parcial'],
  ['recurringFees', 'Honorário mensal recorrente', formatBRL(160000), `${signedMoney(-30000)} (−15,8%) vs setembro`],
  ['averageFee', 'Ticket médio', formatBRL(80000), '+26,3% vs setembro'],
  ['billed', 'Faturado', formatBRL(140000), `recebido ${formatBRL(159300)} até hoje · −12,5% vs setembro`],
]);
expect(evolutionKpis(m, '2026-09')[3].footer).toBe(`recebido ${formatBRL(110000)} (69%) · +3.100,0% vs agosto`);
expect(feeBridge(withLists.oct, withLists.sep)).toEqual([
  { key: 'previous', label: 'Base de setembro', amount: 100000 },
  { key: 'new', label: 'Novos (1)', amount: 200000 },
  { key: 'adjustment', label: 'Reajustes', amount: 10000 },
  { key: 'churned', label: 'Encerrados (0)', amount: 0 },
  { key: 'current', label: 'Base de outubro', amount: 310000 },
]);
expect(feeBridge(m[0], undefined)).toBeNull();
expect(evolutionRows(m).map((x) => [x.month, x.netChange, x.feesChange])).toEqual([['2026-10', -1, -30000], ['2026-09', 2, 30000], ['2026-08', 1, null]]);
expect(evolutionRows(m)[1].receivedShare).toBeCloseTo(0.6875);
expect(evolutionRows(noFees)[0].averageFee).toBeNull();
```

(`withLists` = meses sintéticos set/out com `recurringFees` 100000 → 310000, 1 novo de 200000 e nenhum encerrado; `flat`, `swap` e `noFees` derivados de `m`.)
- [ ] **Step 2: Run** `pnpm --filter web test -- evolution-logic` → FAIL.
- [ ] **Step 3: Implement** (mês por extenso com `formatMonthKey`; variações em % com uma casa, % recebido inteiro; no mês `partial` o rodapé do faturado diz "recebido … até hoje", sem %; `trend` pelo sinal da diferença; sem mês anterior, valor sem comparação).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(web): lógica da evolução da carteira`

### Task 11: Aba Evolução

**Files:**
- Create: `apps/web/src/features/reports/evolution/evolution-tab.tsx`, `evolution-charts.tsx`, `evolution-bridge.tsx`, `evolution-table.tsx`
- Modify: `apps/web/src/features/reports/pages/reports.tsx`, `apps/web/src/features/reports/api.ts`, `apps/web/src/features/reports/components/delinquency-tab.tsx` (o controle de meses vira `useReportMonths`)
- Test: `apps/web/src/features/reports/evolution/evolution-ui.test.tsx` (novo)

**Interfaces:**
- Consumes: tarefa 10; `GET /reports/evolution` (com as listas da tarefa 5)
- Produces:
  - `useEvolutionReport(p: EvolutionReportQuery, enabled?: boolean)` (`qk.report('evolution', p)`, `keepPreviousData`)
  - `useReportMonths(): [6 | 12 | 24, (m: 6 | 12 | 24) => void]` e `ReportMonthsControl({ ariaLabel }: { ariaLabel: string })` (substituem `useDelinquencyMonths`/`DelinquencyMonthsControl`); `useEvolutionRef(months: readonly EvolutionMonth[]): [MonthKey, (m: MonthKey) => void]` (`?ref=`, padrão o último mês; ref fora da janela volta ao último)
  - `EvolutionBridgeView({ current, previous })`, `EvolutionTableView({ rows, active, onPick })`, `EvolutionTab()`

- [ ] **Step 1: Write the failing tests**

```ts
it('builds the fee bridge with who came in and who left', () => {
  const html = wrap(<EvolutionBridgeView current={withLists.sepChurn} previous={withLists.aug} />);
  expect(html).toContain('Base de agosto');
  expect(html).toContain('Quem saiu');
  expect(html).toContain('Inadimplência'); // INACTIVATION_REASON_LABELS.default
});
it('says when nobody came in or left, and when there is no previous month', () => {
  expect(wrap(<EvolutionBridgeView current={still} previous={withLists.sep} />)).toContain('Nenhum cliente entrou ou saiu em outubro.');
  expect(wrap(<EvolutionBridgeView current={m[0]} previous={undefined} />)).toContain('Sem o mês anterior na janela');
});
it('renders a semantic month-by-month table, newest first, with signs', () => {
  const html = wrap(<EvolutionTableView rows={evolutionRows(m)} active="2026-10" onPick={() => {}} />);
  expect(html).toMatch(/<table[\s\S]*<th[^>]*>Mês<\/th>/);
  expect(html.indexOf('Out/26')).toBeLessThan(html.indexOf('Set/26'));
  expect(html).toContain('−1');
  expect(html).toContain('parcial');
});
```

- [ ] **Step 2: Run** `pnpm --filter web test -- evolution-ui` → FAIL.
- [ ] **Step 3: Implement** (spec §4.1 e §4.3): aba `evolucao` (ícone `TrendingUp`) depois de Visão geral; `DESCRIPTIONS.evolucao` = "Clientes, honorário mensal e faturamento mês a mês, comparados ao mês anterior."; cabeçalho com `ReportMonthsControl`; 4 `KpiCard compact` de `evolutionKpis`; "Carteira mês a mês" (`ComposedChart`, um eixo de contagem: barras `newClients` e `−churnedClients`, linha `stepAfter` de `activeClients`, rótulo no último ponto, achado `evolutionFinding`; clique no mês troca o `ref`); `EvolutionBridgeView` com "Quem entrou / Quem saiu" (até 5 + "+ N"); "Faturado, recebido e honorário mensal" (barras + linha tracejada de `recurringFees` no mesmo eixo, mês parcial hachurado); `EvolutionTableView` (linha ativa destacada, popover com nomes em Novos/Encerrados); esqueletos com `aria-busy`, `EmptyState` sem clientes, `ErrorState`; (i) com a limitação das reativações; impressão A4 paisagem; em 375 KPIs em lista e tabela como lista por mês.
- [ ] **Step 4: Run** `pnpm --filter web test` → PASS; captura de `/relatorios?aba=evolucao` em 1440 e 375.
- [ ] **Step 5: Commit** — `feat(web): aba Evolução nos relatórios`

### Task 12: Clientes ativos no Fluxo de caixa e variação na Carteira

**Files:**
- Modify: `apps/web/src/features/dashboard/components/cashflow-card.tsx`, `apps/web/src/features/dashboard/layout/types.ts:73-79`, `apps/web/src/features/dashboard/layout/layout.ts:21-35`, `apps/web/src/features/dashboard/widgets/insight-lines.ts:96-100`, `apps/web/src/features/dashboard/widgets/clients-widgets.tsx:288`
- Test: `apps/web/src/features/dashboard/components/cashflow-card.test.ts`, `apps/web/src/features/dashboard/layout/layout.test.ts`, `apps/web/src/features/dashboard/widgets/insight-lines.test.ts`

**Interfaces:**
- Consumes: `useEvolutionReport` (tarefa 11), `EvolutionMonth`, `EvolutionComparison`
- Produces:
  - `evolutionMonthsFor(month: MonthKey, current: MonthKey): number` (= `min(36, meses entre os dois + 6)`)
  - `withActiveClients<R extends { start: ISODate }>(rows: readonly R[], months: readonly EvolutionMonth[] | undefined): (R & { clientes: number | null })[]`
  - `DashboardPrefs.fluxoClientes: boolean` (padrão `true`; `PREF_VALUES.fluxoClientes = [true, false]`)
  - `portfolioInsight(active: number, averageTicket: number | null, change?: { diff: number; previous: MonthKey } | null): string | null`

- [ ] **Step 1: Write the failing tests**

```ts
expect(evolutionMonthsFor('2026-11', '2026-11')).toBe(6);
expect(evolutionMonthsFor('2026-05', '2026-11')).toBe(12);
expect(evolutionMonthsFor('2023-01', '2026-11')).toBe(36);
expect(withActiveClients([{ start: '2026-09-01' }, { start: '2026-10-01' }], m)).toEqual([{ start: '2026-09-01', clientes: 4 }, { start: '2026-10-01', clientes: 3 }]);
expect(withActiveClients([{ start: '2026-06-01' }], m)[0].clientes).toBeNull();
expect(withActiveClients([{ start: '2026-10-01' }], undefined)[0].clientes).toBeNull();
// layout.test.ts
expect(sanitizeLayout({ ...base, prefs: { fluxoClientes: false } }).prefs).toEqual({ fluxoClientes: false });
expect(sanitizeLayout({ ...base, prefs: { fluxoClientes: 'x' } }).prefs).toEqual({});
// insight-lines.test.ts
expect(portfolioInsight(8, 163714, { diff: 2, previous: '2026-10' })).toBe(`8 ativos · +2 vs outubro · ticket médio ${formatBRL(163714)}`);
expect(portfolioInsight(8, null, { diff: 0, previous: '2026-10' })).toBe('8 ativos · igual a outubro');
expect(portfolioInsight(8, 163714)).toBe(`8 ativos · ticket médio ${formatBRL(163714)}`);
```

- [ ] **Step 2: Run** `pnpm --filter web test -- cashflow-card layout insight-lines` → FAIL.
- [ ] **Step 3: Implement** (spec §4.5): no modo M, `useEvolutionReport({ months: evolutionMonthsFor(month, mêsCorrente) }, mode === 'M')` e `withActiveClients`; `Line dataKey="clientes"` no `YAxis yAxisId="clientes" orientation="right"` (inteiro, sem grade, sufixo "cl."), `--app-fg` 1,5px, rótulo no último ponto "N clientes"; chip "Clientes ativos (eixo direito)" na legenda alterna `fluxoClientes`; some nos modos D/S/A, com a preferência desligada ou sem nenhum ativo; tooltip "Clientes ativos 10 (+4)"; Carteira com `portfolioInsight(…, { diff: comparison.metrics.activeClients.diff, previous: comparison.previous })` (de `useEvolutionReport({ months: 1 })`) e rodapé "Ver evolução →" para `/relatorios?aba=evolucao`.
- [ ] **Step 4: Run** `pnpm --filter web test` → PASS; captura do painel em 1440 e 375.
- [ ] **Step 5: Commit** — `feat(web): clientes ativos no Fluxo de caixa e variação na Carteira`

### Task 13: Documentação e conferência final

**Files:**
- Modify: `docs/design-system.md` (§3: `PortfolioRiskCard`, gráfico "Como cada mês foi pago", ponte do honorário, a única exceção de eixo duplo no Fluxo de caixa; §4 Relatórios: aba Evolução), `docs/api.md` (conferir as seções das tarefas 3–5), `docs/projeto-melhorias-dashboards.md` (status "onda 1 implementada")

- [ ] **Step 1:** `pnpm typecheck && pnpm test` → tudo PASS.
- [ ] **Step 2:** Reiniciar o `vite --mode demo`; capturas em 1440, 1024 e 375 de `/relatorios?aba=evolucao`, `/relatorios?aba=inadimplencia`, `/relatorios/cliente/<Rota Sul>`, `/financeiro` e `/tarefas/cadastros?aba=categorias` (Sheet aberto): sem rolagem lateral; Rota Sul com "2 retrabalhos em 90 dias" e fora de "Crítico"; checkbox no Sheet.
- [ ] **Step 3:** Atualizar os documentos.
- [ ] **Step 4: Commit** — `docs: evolução, score v2 e retrabalho`
