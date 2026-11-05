# Dashboards proporcionais (Painel financeiro e Início) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os dois painéis passam a usar um sistema único de tamanhos (S/M/L), uma faixa de números com comparação, a anatomia única de card com a linha do achado, StatusCards com barra empilhada no lugar das roscas, gráficos com domínio redondo e o modo Personalizar no financeiro, proporcionais em 1440, 1024 e 375.

**Architecture:** Regras puras novas em `components/charts/chart-scale.ts` (domínio, barra empilhada, minigráfico), `features/dashboard/layout/layout.ts` (largura proporcional em 2 colunas), `features/dashboard/kpi-logic.ts`, `features/dashboard/widgets/insight-lines.ts` e `features/tasks/dashboard-logic.ts` (achados, cabeçalhos de status, mês decorrido), todas com vitest. Componentes compartilhados (`MetricStrip`, `StackBar`, `Sparkline`, `EmptyState framed`) são usados pelos dois painéis; os cards existentes trocam só o corpo onde a spec manda.

**Tech Stack:** React 19, Tailwind v4 (container queries `@[1000px]`, `@[560px]`), Recharts, TanStack Query, vitest (`renderToStaticMarkup` para testes de marcação).

**Spec:** `docs/dashboards-redesign.md` (capturas de referência em `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/dash-audit/`).

## Global Constraints

- Só tokens existentes (`bg-data`, `bg-data/45`, `bg-danger`, `bg-warning`, `bg-border-strong`, `text-fg`, `text-muted`, `text-subtle`, `text-danger`, `text-success`, `--app-chart-*`); sem degradê, vidro, ícone em quadrado colorido; sombra só em menus/popovers.
- Linha de 96px (88px abaixo de 4 colunas), espaço de 16px; alturas padrão S/M/L = 208/320/432px (192/296/400px em 2 e 1 coluna), sempre por `heightForRows`.
- Colunas pela largura do contêiner: ≥ 1000px = 4 (financeiro) ou 12 (Início); 560–999px = 2; < 560px = 1 (`columnsForWidth`).
- Tipografia: título de card `text-title-sm` (16), achado e rodapé `text-caption` (12,5), linhas `text-body-sm` (14), piso `text-micro` (11), número `text-kpi` (24; 32px só em "Atrasadas" do Início).
- Tons de status: `danger` vencido/atrasado; `warning` 30 dias/pendências; `data` em dia/concluído; `dataSoft` (`bg-data/45`) 31–60 dias; `muted` pendente/sem data. Verde só em variação e resultado positivos.
- Nenhuma mudança na API ou em `packages/shared`; só dados que as respostas já trazem. Cliques continuam levando aos mesmos destinos.
- Sem rolagem lateral em 375/1024/1440; nenhuma rolagem dentro de card (listas cortam com "+ N …").
- UI em pt-BR, código em inglês. Antes de concluir cada tarefa: `pnpm typecheck && pnpm --filter @effinance/web test`. Commit só quando o usuário pedir (os passos "Commit" valem nesse caso).

## Review Focus

- **Layout salvo antes da mudança** (`v: 2` com células da arrumação antiga, Próximos 4×3 e Resultado visível por padrão): o quadro resolve sem sobreposição, o Resultado some só se o usuário não o ligou explicitamente, e "Organizar" aparece se sobrar vão (teste na Tarefa 2).
- **Card guardado com largura ímpar** (`c = 3`) num quadro de 2 colunas: aparece com 2; redimensionar em 2 colunas de 1 para 2 grava 4 e não grava 2 (teste na Tarefa 2).
- **Dados zerados ou vazios**: domínio sem dados, barra empilhada com total 0, minigráfico com 1 ponto e achados com listas vazias não mostram "NaN%", "0 de 0" nem caminho SVG inválido (testes nas Tarefas 1, 6 e 9).
- **Nomes longos na linha do achado** (cliente com 60+ caracteres): a linha trunca numa linha e leva `title` com o texto inteiro, sem aumentar o cabeçalho (teste na Tarefa 3).
- **Valores grandes no celular** (R$ 1.234.567,89 numa faixa de 343px): o valor aparece inteiro, sem `truncate` (teste na Tarefa 5 e captura na Tarefa 12).

---

### Task 1: Regras de gráfico (domínio, barra empilhada, minigráfico)

**Files:**
- Modify: `apps/web/src/components/charts/chart-scale.ts`
- Create: `apps/web/src/components/charts/stack-bar.tsx`, `apps/web/src/components/charts/sparkline.tsx`
- Test: `apps/web/src/components/charts/chart-scale.test.ts`

**Interfaces:**
- Produces:
  - `niceDomain(values: readonly number[], maxTicks?: number /* 5 */): { domain: [number, number]; ticks: number[] }` — passos `m × 10ⁿ`, `m ∈ {1, 2, 2.5, 5}`; candidatos com 3 a `maxTicks` marcas entre `floor(min/step)` e `ceil(max/step)` (min e max sempre incluem 0); escolhe o menor intervalo `hi − lo`, empate → mais marcas; negativo menor que ¼ do passo vira `lo = min × 1,25` sem marca negativa; tudo zero → `{ domain: [0, 100], ticks: [0, 100] }`.
  - `stackSegments(values: readonly number[]): { width: number; pct: number }[]` — `width` = fração exata (0–1); `pct` inteiros pelo maior resto, empate para o primeiro; total 0 → tudo 0.
  - `sparkPath(values: readonly number[], width: number, height: number, pad?: number /* 2 */): string` — `"M x y L x y …"`, 1 casa decimal no máximo; série plana na meia altura; menos de 2 pontos → `''`.
  - `StackBar({ segments: { value: number; className: string; label?: string }[]; marker?: { at: number; label: string }; size?: 'sm' | 'md'; className?: string })` — 6px (`sm`) ou 10px (`md`), raio cheio, 2px entre segmentos (`stackSegments` para larguras), marca de 2px com rótulo `text-micro` abaixo; `aria-hidden` (o texto ao lado carrega os números).
  - `Sparkline({ values: number[]; tone?: 'data' | 'neutral'; width?: number /* 96 */; height?: number /* 32 */ })` — `<svg aria-hidden>` com `sparkPath`, traço 1,5px (`--app-data` ou `--app-chart-expense-strong`) e ponto de 3px no último valor; nada com menos de 2 pontos.

- [ ] **Step 1: Escrever os testes que falham** em `chart-scale.test.ts`:
  - `niceDomain([40000, -3000, 50000, 60000, 70000, 410000])` → `{ domain: [-3750, 500000], ticks: [0, 250000, 500000] }`.
  - `niceDomain([-150000, 200000])` → `{ domain: [-200000, 200000], ticks: [-200000, -100000, 0, 100000, 200000] }`.
  - `niceDomain([1800000, 1350000])` → `{ domain: [0, 2000000], ticks: [0, 500000, 1000000, 1500000, 2000000] }`.
  - `niceDomain([])` e `niceDomain([0, 0])` → `{ domain: [0, 100], ticks: [0, 100] }`.
  - `stackSegments([2, 21, 5]).map((s) => s.pct)` → `[7, 75, 18]`; `widths` ≈ `[2/28, 21/28, 5/28]` (`toBeCloseTo`, 4 casas).
  - `stackSegments([1, 1, 1]).map((s) => s.pct)` → `[34, 33, 33]`; `stackSegments([0, 0])` → `[{ width: 0, pct: 0 }, { width: 0, pct: 0 }]`.
  - `sparkPath([0, 50, 100], 100, 20)` → `'M2 18 L50 10 L98 2'`; `sparkPath([5, 5], 100, 20)` → `'M2 10 L98 10'`; `sparkPath([5], 100, 20)` → `''`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/components/charts/chart-scale.test.ts` → FAIL (funções inexistentes).
- [ ] **Step 3: Implementar** as três funções em `chart-scale.ts` e os componentes `StackBar` e `Sparkline` (sem Recharts; SVG e `span` com `style.width`).
- [ ] **Step 4: Rodar e ver passar** (mesmo comando) → PASS.
- [ ] **Step 5: Commit** `feat(charts): domínio redondo, barra empilhada e minigráfico`.

---

### Task 2: Quadro proporcional e arranjo padrão novo

**Files:**
- Modify: `apps/web/src/features/dashboard/layout/layout.ts` (`displaySpan`, `commitCols`)
- Modify: `apps/web/src/features/dashboard/layout/widget-grid.tsx:246` (chamada de `commitCols` com `cols`)
- Modify: `apps/web/src/features/dashboard/layout/specs.ts` (ordem, tamanhos, presets, `resultado-mensal` oculto)
- Test: `apps/web/src/features/dashboard/layout/layout.test.ts`

**Interfaces:**
- Produces:
  - `displaySpan(c: number, cols: number): number` — 4 colunas: `min(c, 4)`; 2 colunas: `c ≤ 2 → 1`, senão `2`; 1 coluna: `1`.
  - `commitCols(stored: number, displayed: number, next: number, cols: BoardCols): number` — `next === displayed` → `stored`; em 2 colunas → `next × 2`; senão `next`.
- Valores de `specs.ts` (padrão · mín · máx · presets), na ordem do array: `inadimplencia` 2×3 · 1×3 · 4×5 · [2×3, 2×4]; `clientes-devedores` 2×3 · 1×3 · 4×7 · [2×3, 2×4, 2×5]; `honorarios-mes` **4×2 · 2×2** · 4×5 · [4×2, 2×3] (`defaultFor: 'business'`); `proximos-vencimentos` 4×3 · 2×3 · 4×7 · [4×3, 4×4, 2×4]; `fatura-cartao` (oculto, sem mudança); `fluxo-caixa` 2×4 · 2×3 · 4×7 · [2×4, 2×5, 4×5]; `saude` (oculto); `saldo-contas` 2×4 · 1×3 · 2×7 · [1×4, 2×4, 2×5]; `projecao-caixa` 4×4 · 2×4 · 4×7 · [2×4, 4×4, 4×5]; `insights` 4×2 · 1×2 · 4×4 · [1×2, 2×2, 4×2]; `carteira-clientes`, `vigencias-honorarios`, `cadastro-incompleto` (como hoje); `resumo-periodo` 2×4 · 2×3 · 4×5 · [2×3, 2×4]; `despesas-categoria` como hoje; `resultado-mensal` **2×4 · 2×3** · 4×6 · [2×4, 4×3], **`defaultHidden: true`**; `receitas-categoria`, `evolucao`, `composicao` (como hoje); `gastos-fixos`, `receitas-fixas` como hoje; `metas` (oculto). Atualizar o comentário do topo com a ordem da spec §7.2.

- [ ] **Step 1: Escrever/atualizar os testes que falham** em `layout.test.ts`:
  - `displaySpan(2, 2)` → `1`; `displaySpan(1, 2)` → `1`; `displaySpan(3, 2)` → `2`; `displaySpan(4, 2)` → `2`; `displaySpan(4, 1)` → `1`; `displaySpan(3, 4)` → `3`.
  - `commitCols(4, 2, 2, 2)` → `4`; `commitCols(4, 2, 1, 2)` → `2`; `commitCols(3, 2, 1, 2)` → `2`; `commitCols(2, 1, 2, 2)` → `4`; `commitCols(2, 2, 3, 4)` → `3` (substitui as expectativas antigas de 3 argumentos).
  - Arranjo padrão empresarial (4 colunas, `emptyLayout()`): `inadimplencia {0,0}`, `clientes-devedores {2,0}`, `honorarios-mes {0,3}`, `proximos-vencimentos {0,5}`, `fluxo-caixa {0,8}`, `saldo-contas {2,8}`, `projecao-caixa {0,12}`, `insights {0,16}`, `carteira-clientes {0,18}`, `vigencias-honorarios {2,18}`, `resumo-periodo {0,22}`, `despesas-categoria {2,22}`, `gastos-fixos {0,26}`, `receitas-fixas {2,26}`; sem `resultado-mensal`.
  - Pessoal: `proximos-vencimentos {0,3}`, `fluxo-caixa {0,6}`, `projecao-caixa {0,10}`, `insights {0,14}`, `resumo-periodo {0,16}`, `gastos-fixos {0,20}`, `receitas-fixas {2,20}`.
  - `holes(…, 4)` e `holes(resolveBoard(emptyLayout(), WIDGET_SPECS, kind, 2), 2)` → `0` nos dois tipos; em 2 colunas `clientes-devedores` fica em `{ x: 1, y: 0 }` com `c = 1`.
  - Review Focus (layout salvo): `cells[4]` = `{ 'proximos-vencimentos': {0,3}, 'fluxo-caixa': {0,6}, 'resultado-mensal': {0,20} }` e `visible = {}` → `expectValid(items, 4)` e nenhum item `resultado-mensal`; com `visible: { 'resultado-mensal': true }` → item em `{0,20}` com `c = 2, r = 4`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/dashboard/layout/layout.test.ts` → FAIL (spans e células antigas).
- [ ] **Step 3: Implementar** `displaySpan`/`commitCols`, passar `cols` em `widget-grid.tsx` e reescrever `specs.ts` com os valores acima.
- [ ] **Step 4: Rodar e ver passar** (mesmo comando + `layout-store.test.ts`) → PASS.
- [ ] **Step 5: Commit** `feat(dashboard): largura proporcional em 2 colunas e arranjo padrão por fileiras`.

---

### Task 3: Anatomia do card e estado vazio sem moldura dupla

**Files:**
- Modify: `apps/web/src/components/ui/empty-state.tsx` (prop `framed`)
- Modify: `apps/web/src/features/dashboard/widgets/shared.tsx` (`BodyEmpty` com `framed={false}`)
- Modify: `apps/web/src/features/dashboard/layout/widget-card.tsx` (linha do achado com `title`)
- Modify: `apps/web/src/components/ui/card.tsx` (`CardHeader` em `text-title-sm`)
- Test: `apps/web/src/features/dashboard/layout/widget-card.test.tsx` (novo)

**Interfaces:**
- Produces:
  - `EmptyState({ …, framed?: boolean /* true */ })` — `framed={false}`: sem borda tracejada nem quadrado do ícone (ícone 20px `text-subtle`), título `text-body-sm` 600, descrição `text-caption` muted, centrado.
  - `WidgetCard` sem mudança de props; quando `subtitle` é string, o `<p>` leva `title={subtitle}` e `truncate`. O nome da prop continua `subtitle` (é a linha do achado).

- [ ] **Step 1: Escrever os testes que falham** (`renderToStaticMarkup`):
  - `<BodyEmpty title="Nada por aqui" />` não contém `border-dashed`; `<EmptyState title="Nada por aqui" />` contém `border-dashed`.
  - `<WidgetCard title="Clientes devedores" subtitle={'Construtora Alicerce Engenharia e Participações Societárias Ltda concentra 84% do vencido'}>…</WidgetCard>` contém `title="Construtora Alicerce Engenharia e Participações Societárias Ltda concentra 84% do vencido"` e a classe `truncate` no mesmo elemento.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/dashboard/layout/widget-card.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** `framed`, `BodyEmpty`, o `title` da linha do achado e o tamanho de `CardHeader`.
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** `feat(ui): estado vazio sem moldura dentro de cards e linha do achado truncada`.

---

### Task 4: Modo Personalizar no painel financeiro

**Files:**
- Modify: `apps/web/src/features/dashboard/layout/widget-card.tsx` (`WidgetChrome.editing`; chrome e `headerProps` só em edição)
- Modify: `apps/web/src/features/dashboard/layout/widget-grid.tsx` (prop `editing`; canto de redimensionar e arrastar só em edição; `border-border-strong` nos cards em edição)
- Modify: `apps/web/src/features/dashboard/pages/dashboard.tsx` (estado `editing`, cabeçalho, Esc, `?personalizar=1`, aviso ao leitor de tela)
- Test: `apps/web/src/features/dashboard/layout/widget-card.test.tsx`

**Interfaces:**
- Consumes: `WidgetCard` da Tarefa 3.
- Produces:
  - `interface WidgetChrome { …; editing: boolean }`.
  - `DashboardBoard({ …, editing: boolean })`.
  - Cabeçalho da página: fora da edição, botão "Personalizar" (`id={CUSTOMIZE_BUTTON_ID}`, com o selo "N ocultos"); em edição, "Cards" (`id={CUSTOMIZE_BUTTON_ID}`, abre `CustomizeSheet`, mesmo selo), "Organizar" (só com `hasGaps`, comportamento atual) e "Concluir" (`variant="primary"`). Esc ou "Concluir" saem e devolvem o foco a "Personalizar". `?personalizar=1` → `editing = true` e a folha aberta. Ao entrar: região `aria-live` com "Modo de personalização. Use a alça de cada card para mover." Aba "Dashboard inteligente" sai da edição.

- [ ] **Step 1: Escrever os testes que falham**: com `WidgetChromeContext.Provider` e `editing: false`, o HTML de `<WidgetCard title="Fluxo de caixa">` não contém `Ocultar Fluxo de caixa` nem `cursor-grab`; com `editing: true`, contém `aria-label="Ocultar Fluxo de caixa"`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/dashboard/layout/widget-card.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** o estado e as condições acima; `onPointerDown` do cabeçalho e o canto (`MoveDiagonal2`) só existem com `editing`; o contexto continua fornecido fora da edição (para `useWidgetResizing`).
- [ ] **Step 4: Rodar e ver passar**; conferir à mão no demo: arrastar, teclado na alça, ocultar com "Desfazer", "Organizar" e "Restaurar layout padrão" dentro do modo.
- [ ] **Step 5: Commit** `feat(dashboard): modo Personalizar com controles dos cards só em edição`.

---

### Task 5: `MetricStrip` e faixa de topo do financeiro

**Files:**
- Create: `apps/web/src/components/ui/metric-strip.tsx`
- Create: `apps/web/src/features/dashboard/kpi-logic.ts`
- Modify: `apps/web/src/components/ui/kpi-card.tsx` (usa `changeParts`)
- Modify: `apps/web/src/features/dashboard/pages/dashboard.tsx` (`DashboardKpis` vira `MetricStrip`)
- Test: `apps/web/src/features/dashboard/kpi-logic.test.ts`, `apps/web/src/components/ui/metric-strip.test.tsx`

**Interfaces:**
- Consumes: `Sparkline` (Tarefa 1).
- Produces:
  - `interface MetricCell { key: string; label: string; info?: string; value: ReactNode; footer?: ReactNode; href?: string; aria?: string; spark?: { values: number[]; tone: 'data' | 'neutral' }; hero?: boolean; loading?: boolean }`.
  - `MetricStrip({ cells: MetricCell[]; medium?: 2 | 3; className?: string })` — um `Card @container`; `@[1000px]`: uma fileira (célula `hero` com 1,3 fração), divisores verticais; `@[560px]`: `medium` por fileira; abaixo: cada célula vira linha (rótulo + rodapé à esquerda, valor `text-[20px]` inteiro à direita, sem `truncate`). Valor alinhado à esquerda nas larguras maiores, minigráfico à direita do valor.
  - `changeParts(change: number | null | undefined, unit: 'percent' | 'pp', invert?: boolean): { text: string; tone: 'success' | 'danger' | 'muted'; up: boolean } | null` (a lógica de cor e texto que hoje está dentro de `KpiCard`).
  - `monthlySeries(monthly: readonly MonthSummary[], key: 'income' | 'expense' | 'net'): number[]`.
  - `marginText(s: MonthSummary, p: MonthSummary): string`.
  - `netWorthText(b: DashboardResponse['balances']): string`.
  - Células: Receitas (`spark` income, `data`), Despesas (`spark` expense, `neutral`, `invert`), Resultado (valor `summary.net`, vermelho se < 0; `spark` net; rodapé `marginText`), Patrimônio (rodapé `netWorthText`; `info` termina com "Sem histórico de saldo para comparar."); hrefs atuais.

- [ ] **Step 1: Escrever os testes que falham**:
  - `changeParts(0.2, 'percent')` → `{ text: '+20,0%', tone: 'success', up: true }`; `changeParts(0.2, 'percent', true)` → tone `'danger'`; `changeParts(-0.022, 'percent', true)` → `{ text: '-2,2%', tone: 'success', up: false }`; `changeParts(0.0001, 'percent')` → tone `'muted'`; `changeParts(0.176, 'pp')` → `{ text: '+17,6 p.p.', … }`; `changeParts(null, 'percent')` → `null`.
  - `monthlySeries([{…income: 100, expense: 40, net: 60}, {…income: 200, expense: 50, net: 150}], 'net')` → `[60, 150]`.
  - `marginText({ savingsRate: 0.226 }, { savingsRate: 0.05 })` → `'margem 22,6% · +17,6 p.p. vs mês anterior'`; anterior `null` → `'margem 22,6%'`; atual `null` → `'sem receitas no mês'`.
  - `netWorthText({ accounts: 6465386, investments: 4500000, cardDebt: 0, netWorth: 10965386 })` → `` `Em contas ${formatBRL(6465386)} · investido ${formatBRL(4500000)}` ``; com `cardDebt: 120000` acrescenta `` ` · cartão −${formatBRL(120000)}` ``.
  - Review Focus (celular): `renderToStaticMarkup(<MetricStrip cells={[{ key: 'p', label: 'Patrimônio', value: formatBRL(123456789) }]} />)` contém o texto inteiro de `formatBRL(123456789)` e o elemento do valor não tem a classe `truncate`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/dashboard/kpi-logic.test.ts src/components/ui/metric-strip.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** `kpi-logic.ts`, `MetricStrip`, `KpiCard` sobre `changeParts` e a faixa nova em `dashboard.tsx` (esqueletos com `loading`).
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** `feat(dashboard): faixa de números com minigráfico e comparação`.

---

### Task 6: Linhas do achado do financeiro

**Files:**
- Create: `apps/web/src/features/dashboard/widgets/insight-lines.ts`
- Modify: `receivables-widgets.tsx`, `cashflow-card.tsx`, `overview-widgets.tsx`, `projection-widget.tsx`, `clients-widgets.tsx`, `analysis-widgets.tsx`, `planning-widgets.tsx` (só o `subtitle` de cada `WidgetCard`; o texto descritivo atual vai para `info` quando não houver)
- Test: `apps/web/src/features/dashboard/widgets/insight-lines.test.ts`

**Interfaces:**
- Produces (todas retornam `null` sem dados, e o card cai no texto curto de hoje):
  - `cashflowInsight(rows: readonly { receita: number; despesa: number }[], unit: { many: string }): string | null`.
  - `debtorsInsight(debtors: readonly { name: string; amount: number }[]): string | null`.
  - `upcomingInsight(t: DashboardResponse['upcomingTotals']): string | null`.
  - `categoryInsight(items: readonly { name: string; amount: number }[], noun: 'despesas' | 'receitas'): string | null`.
  - `projectionInsight(s: Pick<ProjectionSummary, 'today' | 'milestones' | 'negativeFrom'>): string | null`.
  - `fixedInsight(paid: number, total: number): string | null`.
  - `feesMonthInsight(planned: number, generated: number, received: number): string | null`.
  - `summaryInsight(s: MonthSummary): string | null`.
  - `agingInsight(buckets: readonly { label: string; amount: number }[]): string | null`.
  - `balancesInsight(total: number, count: number): string | null`.
  - `portfolioInsight(active: number, averageTicket: number | null): string | null`.

- [ ] **Step 1: Escrever os testes que falham**:
  - `agingInsight([{ label: 'Até 30 dias', amount: 563000 }, { label: '31 a 60 dias', amount: 17000 }, { label: 'Acima de 60 dias', amount: 68000 }])` → `'Maior faixa: até 30 dias (87%)'`; tudo zero → `null`.
  - `balancesInsight(6465386, 4)` → `` `${formatBRL(6465386)} em 4 contas` ``; `(1000, 1)` → `` `${formatBRL(1000)} em 1 conta` ``; `(0, 0)` → `null`.
  - `portfolioInsight(8, 163714)` → `` `8 ativos · ticket médio ${formatBRL(163714)}` ``; ticket `null` → `'8 ativos'`; `0` ativos → `null`.
  - `cashflowInsight` com 6 linhas, 5 com receita > despesa, `{ many: 'meses' }` → `'Receitas acima das despesas em 5 de 6 meses'`; com 1 de 6 → `'Despesas acima das receitas em 5 de 6 meses'`; `[]` → `null`.
  - `debtorsInsight([{ name: 'Transportadora Rota Sul Ltda', amount: 545000 }, { name: 'Juliana Prado', amount: 103000 }])` → `'Transportadora Rota Sul Ltda concentra 84% do vencido'`; um só → `'Transportadora Rota Sul Ltda tem todo o vencido'`; `[]` → `null`.
  - `upcomingInsight({ expenseCount: 4, expense: 349990, incomeCount: 21, income: 1256500 })` → `` `A pagar ${formatBRL(349990)} (4) · a receber ${formatBRL(1256500)} (21)` ``; tudo zero → `null`.
  - `categoryInsight([{ name: 'Pessoal', amount: 910000 }, { name: 'Ocupação', amount: 227990 }, { name: 'Outros', amount: 248810 }], 'despesas')` → `'Pessoal soma 66% das despesas'`.
  - `projectionInsight({ today: 6465386, milestones: [{ dias: 90, date: '2027-02-03', saldo: 4161416 }], negativeFrom: null })` → `'De R$ 64,7 mil hoje a R$ 41,6 mil em 90 dias'`; com `negativeFrom: '2027-01-12'` → `'Fica negativo em 12/01'`.
  - `fixedInsight(960000, 1291990)` → `` `74% pago · falta ${formatBRL(331990)}` ``; `fixedInsight(0, 0)` → `null`.
  - `feesMonthInsight(1146000, 1256500, 0)` → `'110% do previsto gerado · 0% recebido'`; previsto 0 → `'Nada previsto pelas vigências'`.
  - `summaryInsight({ income: 1792360, paidIncome: 535860, expense: 1386800, paidExpense: 1036810 })` → `'30% das receitas recebidas · 75% das despesas pagas'`; receitas 0 → só a parte das despesas.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/dashboard/widgets/insight-lines.test.ts` → FAIL.
- [ ] **Step 3: Implementar** e ligar nos cards (Insights e Vigências mantêm o texto atual, que já é achado; ver a tabela da spec §7.3). Janelas diferentes do mês entram como prefixo (`'Próximos 15 dias · '`, `'Hoje · '`, `'Próximos 90 dias · '`) no card, não na função.
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** `feat(dashboard): linha do achado nos cards do financeiro`.

---

### Task 7: Resumo do período em bullets e Honorários do mês em faixa

**Files:**
- Modify: `apps/web/src/features/dashboard/widgets/analysis-widgets.tsx` (`SummaryWidget`/`SummaryBox`; remover `SideMonths`, `StatPill` e as constantes de altura que só serviam a eles)
- Modify: `apps/web/src/features/dashboard/widgets/clients-widgets.tsx` (`FeesMonthWidget`)
- Modify: `apps/web/src/features/dashboard/widgets/trend-math.ts` (`summaryBar`)
- Test: `apps/web/src/features/dashboard/widgets/trend-math.test.ts`

**Interfaces:**
- Consumes: `StackBar` (Tarefa 1), `changeParts` (Tarefa 5), `summaryInsight`/`feesMonthInsight` (Tarefa 6).
- Produces: `summaryBar(total: number, paid: number, previousTotal: number): { paid: number; open: number; marker: number | null }` — frações de `scale = max(total, previousTotal, 1)`; `marker = previousTotal / scale`, `null` quando `previousTotal = 0`.
- Resumo: dois blocos (Receitas, Despesas) com rótulo, total 18px e `changeParts` vs mês anterior; barra de 10px com o pago sólido (`bg-data` nas receitas, `bg-chart-expense-strong` nas despesas), o aberto hachurado e a marca "mês anterior"; legenda "Recebido R$ X · 30%" / "A receber R$ Y" (no passado, "Em aberto"); rodapé atual (saldo do mês · eficiência).
- Honorários do mês (4×2): 3 colunas Previsto · Gerado (barra contra o previsto, marca em 100%, "110%") · Recebido (barra contra o gerado, "0%"); coluna final com Em aberto e Sem honorário gerado; abaixo de `@lg` (512px), três linhas e a coluna final vai para o rodapé.

- [ ] **Step 1: Escrever os testes que falham**: `summaryBar(1792360, 535860, 1493600)` → `paid ≈ 0.299`, `open ≈ 0.701`, `marker ≈ 0.833` (`toBeCloseTo`, 3 casas); `summaryBar(100, 100, 400)` → `{ paid: 0.25, open: 0, marker: 1 }`; `summaryBar(0, 0, 0)` → `{ paid: 0, open: 0, marker: null }`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/dashboard/widgets/trend-math.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `summaryBar` e os dois corpos.
- [ ] **Step 4: Rodar e ver passar**; conferir no demo os dois cards em 2×4/4×2 e 2×3.
- [ ] **Step 5: Commit** `feat(dashboard): resumo em bullets e honorários do mês em faixa`.

---

### Task 8: Gráficos e listas do financeiro (domínio, projeção, linhas de uma altura, devedores)

**Files:**
- Modify: `apps/web/src/features/dashboard/components/cashflow-card.tsx`, `apps/web/src/features/dashboard/widgets/analysis-widgets.tsx` (`MonthlyResultWidget`): `YAxis domain/ticks` de `niceDomain`
- Modify: `apps/web/src/components/charts/chart-scale.ts` (`projectionTiles`), `apps/web/src/features/dashboard/widgets/projection-widget.tsx`
- Modify: `apps/web/src/features/transactions/components/transaction-row.tsx` (densidade `line`), `receivables-widgets.tsx` (`UpcomingWidget`), `planning-widgets.tsx` (fixos)
- Modify: `receivables-widgets.tsx` (`DebtorsWidget`: % do vencido por linha e rodapé)
- Test: `apps/web/src/components/charts/chart-scale.test.ts`, `apps/web/src/features/transactions/components/transaction-row.test.tsx` (novo)

**Interfaces:**
- Consumes: `niceDomain` (Tarefa 1), `debtorsInsight`/`upcomingInsight`/`fixedInsight` (Tarefa 6).
- Produces:
  - `projectionTiles(s: ProjectionSummary): { key: 'worst' | 30 | 60 | 90; date: ISODate; saldo: number }[]` — os marcos e, antes deles, "worst" só quando a data ou o saldo diferem dos do último marco.
  - `TransactionRow({ …, density?: 'default' | 'compact' | 'line' })` — `line`: uma linha de 44px (estado, descrição + contato em `text-muted` na mesma linha, vencimento com o texto relativo, valor, "⋯"); sem o chip "+ Empregados" (fica no menu) e sem a coluna de conta.
  - Devedores: cada linha mostra `NN%` do vencido ao lado do valor; rodapé `"{n} clientes · {formatBRL(total)}"` (ou o aviso de truncado que já existe).
  - Projeção: `ReferenceLine` no saldo de hoje (`stroke var(--app-border-strong)`, tracejada).

- [ ] **Step 1: Escrever os testes que falham**:
  - `projectionTiles` com `worst = { date: '2027-02-03', saldo: 4161416 }` e marcos 30/60/90 com o de 90 igual → 3 itens `[30, 60, 90]`; com `worst = { date: '2027-01-20', saldo: 3900000 }` → 4 itens começando por `'worst'`; `worst = null` → só os marcos.
  - `renderToStaticMarkup(<TransactionRow tx={feeTx} density="line" />)` (fixture com `feeKind: 'employees'`, dentro de `QueryClientProvider` e `TooltipProvider`) não contém `Empregados` fora do menu (`aria-label="+ Empregados` ausente) e não contém `Sem conta`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/components/charts/chart-scale.test.ts src/features/transactions/components/transaction-row.test.tsx` → FAIL.
- [ ] **Step 3: Implementar**; Fluxo e Resultado passam `domain` e `ticks` de `niceDomain` ao `YAxis` (sem `tickCount`); Próximos e fixos usam `density="line"`.
- [ ] **Step 4: Rodar e ver passar**; no demo, Resultado (se ligado) não mostra −2,5k e Próximos mostra ~5 linhas em 4×3.
- [ ] **Step 5: Commit** `feat(dashboard): eixos redondos, projeção sem repetição e listas de uma linha`.

---

### Task 9: Regras do Início (tons, cabeçalhos de status, mês decorrido, achados)

**Files:**
- Modify: `apps/web/src/features/tasks/dashboard-logic.ts`
- Modify: `apps/web/src/features/tasks/components/band-list.tsx` (só os mapas `COUNT_TONE` e `STROKE` com as chaves novas) e `apps/web/src/features/tasks/components/dashboard-cards.tsx` (os `tone: 'success'` passados a `SegmentBar` viram `'data'`), para o typecheck passar
- Test: `apps/web/src/features/tasks/dashboard-logic.test.ts`

**Interfaces:**
- Produces:
  - `BandTone = 'danger' | 'warning' | 'data' | 'dataSoft' | 'muted'` (sai `'success'`); `BAND_DOT.dataSoft = 'bg-data/45'`.
  - Tons novos: `documentBands` ok → `data`; `conventionBands` within60 → `dataSoft`, ok → `data`; `taskStatusBands` pending → `muted`, concluded → `data`; `overviewBands` upToDate → `data`; `feeBands` sem mudança.
  - `progressSegments(s: { done: number; overdue: number; pending: number }): { value: number; tone: BandTone }[]` — ordem concluído (`data`), atrasado (`danger`), pendente (`muted`); `pending` aqui é o pendente **não** atrasado.
  - `progressHeadline(done: number, total: number): { value: string; label: string }`.
  - `severityHeadline<K extends string>(bands: Band<K>[]): { value: string; label: string; tone: BandTone }`.
  - `monthElapsed(today: ISODate, month: MonthKey): number` (0–1).
  - `flowInsight(days: ReturnType<typeof flowDays>): string`.
  - `agendaInsight(upcoming: readonly { name: string; legalDueDate: ISODate }[], today: ISODate): string`.
  - `assigneeInsight(rows: readonly { label: string; open: number; overdue: number }[]): string | null`.
  - `processInsight(rows: TaskDashboardResponse['processes']): string | null`.

- [ ] **Step 1: Escrever/atualizar os testes que falham** (`TODAY = '2026-11-04'`):
  - Tons: `documentBands(docs).map((b) => b.tone)` → `['danger', 'warning', 'data']`; `conventionBands(...)` → `['danger', 'warning', 'dataSoft', 'data', 'muted']`; `taskStatusBands(...).bands.map((b) => b.tone)` → `['danger', 'muted', 'data']`; `overviewBands(...)` → `['danger', 'warning', 'data']` (atualiza as expectativas atuais).
  - `progressSegments({ done: 5, overdue: 2, pending: 21 })` → `[{ value: 5, tone: 'data' }, { value: 2, tone: 'danger' }, { value: 21, tone: 'muted' }]`.
  - `progressHeadline(5, 28)` → `{ value: '18%', label: '5 de 28 concluídas' }`; `progressHeadline(0, 0)` → `{ value: '0%', label: 'nada na competência' }`.
  - `severityHeadline(documentBands({ counts: { overdue: 1, within30: 1, ok: 0, noDate: 0 } }))` → `{ value: '1', label: 'vencidos', tone: 'danger' }`; `severityHeadline(overviewBands({ attention: 0, pending: 8, upToDate: 0 }))` → `{ value: '8', label: 'pendências', tone: 'warning' }`; `documentBands` com `{ overdue: 0, within30: 0, ok: 4, noDate: 0 }` → `{ value: '100%', label: 'em dia', tone: 'data' }`; tudo zero → `{ value: '0', label: 'nenhum cadastrado', tone: 'muted' }`.
  - `monthElapsed('2026-11-05', '2026-11')` ≈ `5/30`; `('2026-11-05', '2026-10')` → `1`; `('2026-11-05', '2026-12')` → `0`.
  - `flowInsight(flowDays([{ date: '2026-11-04', recurring: 1, standalone: 0 }, { date: '2026-11-10', recurring: 3, standalone: 1 }], TODAY))` → `'5 em aberto em 7 dias · pico ter 10 (4)'`; pico hoje → `'… · pico hoje (n)'`; vazio → `'Nada em aberto nos próximos 7 dias'`.
  - `agendaInsight([], TODAY)` → `'Nenhum prazo legal até 10/11'`; com `[{ name: 'DCTFWeb', legalDueDate: '2026-11-07' }, { name: 'EFD-Reinf', legalDueDate: '2026-11-09' }]` → `'2 prazos legais até 10/11 · próximo: DCTFWeb em 07/11'`.
  - `assigneeInsight([{ label: 'Ana Paula Ribeiro', open: 18, overdue: 2 }, { label: 'Marina Costa', open: 4, overdue: 1 }])` → `'Ana R. concentra 80% · 3 atrasadas'`; sem atrasadas → sem o trecho final; `[]` ou total 0 → `null`.
  - `processInsight` com um departamento (done 2, pending 16, overdue 0) → `'2 de 18 concluídas'`; com dois (Fiscal 16 pendentes, Pessoal 3) → `'… · mais pendências: Fiscal (16)'`; `[]` → `null`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/dashboard-logic.test.ts` → FAIL.
- [ ] **Step 3: Implementar** (datas com `addDays`/`dayOfWeek` de `@effinance/shared`, nome com `shortName` de `./due`).
- [ ] **Step 4: Rodar e ver passar** → PASS (e `pnpm typecheck` para os usos de `'success'` que sumiram).
- [ ] **Step 5: Commit** `feat(gestao): tons de status, cabeçalhos e achados do Início`.

---

### Task 10: StatusCard e cards do Início

**Files:**
- Modify: `apps/web/src/features/tasks/components/band-list.tsx` (`StatusSummary`; `BandList` com `%` e variante `dense` de 32px; remover `MiniDonut`; `SegmentBar` usa `StackBar`)
- Modify: `apps/web/src/features/tasks/components/dashboard-cards.tsx` (todos os cards da spec §8.3)
- Modify: `apps/web/src/features/tasks/pages/home.tsx` (`MyTasks`, `ByAssignee`: linha do achado)
- Test: `apps/web/src/features/tasks/components/band-list.test.tsx` (novo)

**Interfaces:**
- Consumes: `StackBar` (Tarefa 1); tudo da Tarefa 9; `BodyEmpty` sem moldura (Tarefa 3).
- Produces:
  - `StatusSummary({ hero?: { value: string; label: string; tone?: BandTone }; segments: { value: number; tone: BandTone }[]; marker?: { at: number; label: string } })` — herói `text-kpi` (tom só se `danger`/`warning`) + rótulo `text-caption`, depois `StackBar size="md"`.
  - `BandList({ …, total?: number; dense?: boolean })` — com `total`, cada faixa mostra `NN%` (`stackSegments`) antes da contagem; `dense` = linhas de 32px sem dica.
  - Situação das tarefas: `hero = progressHeadline`, segmentos `progressSegments`, `marker = { at: monthElapsed(today, month), label: 'dia N' }`, linha do achado "Competência de {mês} · N atrasadas", (i) diz que "Atrasadas" do topo conta todas as abertas.
  - Pendências fiscais: bloco esquerdo como a Situação (sem a contagem central de rosca); barras da lista: concluído `data`, pendente `muted`, atrasado `danger`.
  - Visão geral dos clientes: `hero = severityHeadline`, barra de distribuição.
  - Certificados, Laudos, Convenções (`dense`), Honorários próximos: `StatusSummary` sem herói + `BandList`; rodapé "Ver todos" nos quatro quando houver itens (Convenções → `/tarefas/cadastros?aba=sindicatos`; Honorários → `onList({ kind: 'fees', band: null })`).
  - Processos por departamento: barra `progressSegments` por linha; legenda Concluídas (data) / Atrasadas (danger) / Pendentes (cinza).
  - Fluxo de tarefas por dia: barras até `max-w-10`, rótulo de fim de semana `text-subtle`; Agenda e Por responsável com os achados; Cadastro incompleto sem o "+ N clientes" quando há o rodapé "Ver todos".

- [ ] **Step 1: Escrever os testes que falham** (`renderToStaticMarkup`):
  - `<StatusSummary hero={{ value: '18%', label: '5 de 28 concluídas' }} segments={progressSegments({ done: 5, overdue: 2, pending: 21 })} marker={{ at: 5 / 30, label: 'dia 5' }} />` contém `18%`, `5 de 28 concluídas`, `dia 5` e não contém `<circle`.
  - `<BandList bands={documentBands(docs)} total={8} … />` contém `25%` para 2 de 8 vencidos e o botão da faixa vazia com `disabled`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/components/band-list.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** os componentes e trocar o corpo dos cards (os cliques e as folhas de lista ficam como estão).
- [ ] **Step 4: Rodar e ver passar**; `rg "MiniDonut" apps/web/src` → nada.
- [ ] **Step 5: Commit** `feat(gestao): StatusCards com barra empilhada no Início`.

---

### Task 11: Grade do Início (alturas S/M/L, ordem nova, faixa de topo)

**Files:**
- Create: `apps/web/src/features/tasks/components/dash-slot.tsx`
- Modify: `apps/web/src/features/tasks/pages/home.tsx` (`Section`, ordem dos cards, `HomeSummary` sobre `MetricStrip`)
- Test: `apps/web/src/features/tasks/components/dash-slot.test.ts` (novo)

**Interfaces:**
- Consumes: `columnsForWidth`, `heightForRows` (`features/dashboard/layout/layout.ts`); `MetricStrip` (Tarefa 5).
- Produces:
  - `interface SlotSpan { wide: 3 | 4 | 6 | 8 | 12; medium: 1 | 2 }`.
  - `slotColumns(span: SlotSpan, cols: BoardCols): number` — 4 → `span.wide` (em 12 colunas); 2 → `span.medium`; 1 → `1`.
  - `DashColsContext` (`React.Context<BoardCols>`, padrão `4`) e `useDashCols(): BoardCols`; a página mede o contêiner com `useElementSize` e fornece `columnsForWidth(width)`, como no financeiro.
  - `DashSlot({ rows: 2 | 3 | 4; span: SlotSpan; mediumRows?: 2 | 3 | 4; children })` — `style={{ height: heightForRows(rows, cols), gridColumn: \`span ${slotColumns(span, cols)}\` }}` com `cols = useDashCols()`; `mediumRows` vale em 2 colunas.
  - Grade de cada seção: `grid gap-4`, 12 colunas em 4, 2 em 2, 1 em 1; página `gap-6`.
  - Ordem e tamanhos (spec §8.2): Minhas tarefas `{8, 2}` L; Situação `{4, 2}` L (`mediumRows: 3`); Fluxo por dia `{6, 1}` M; Agenda `{6, 1}` M; Por responsável `{6, 1}` M; Processos `{6, 1}` M; Certificados, Laudos, Convenções, Honorários `{3, 1}` M (sem Honorários: `{4, 1}` e Convenções `{4, 2}`); Pendências fiscais `{8, 2}` L; Visão geral `{4, 2}` L (`mediumRows: 3`); Cadastro incompleto `{12, 2}` M.
  - `HomeSummary` vira `MetricStrip` com `medium={3}` e a célula "Atrasadas" `hero`; rodapés em uma linha com `title`; "Concluídas em {mês}" com a barra no prazo × com atraso e "NN% no prazo".

- [ ] **Step 1: Escrever os testes que falham**: `slotColumns({ wide: 8, medium: 2 }, 4)` → `8`; `(…, 2)` → `2`; `(…, 1)` → `1`; `slotColumns({ wide: 3, medium: 1 }, 2)` → `1`; `heightForRows(3, 2)` → `296` (contrato usado pelo slot).
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/components/dash-slot.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `DashSlot`, o contexto de colunas e a página; remover as classes `h-[…rem]` e `lg:col-span-*` dos cards.
- [ ] **Step 4: Rodar e ver passar**; capturas 1440/1024/375 do Início sem rolagem lateral e com as alturas iguais por fileira.
- [ ] **Step 5: Commit** `feat(gestao): grade do Início com alturas padronizadas`.

---

### Task 12: "Atualizado às…", verificação final e documentação

**Files:**
- Create: `apps/web/src/lib/updated-label.ts`
- Modify: `apps/web/src/features/dashboard/pages/dashboard.tsx` (`FindingLine`), `apps/web/src/features/tasks/pages/home.tsx` (descrição do `PageHeader`)
- Modify: `docs/design-system.md` (§3: `MetricStrip`, `StackBar`, `Sparkline`, `StatusSummary`, `DashSlot`, `EmptyState framed`; §4 Dashboard: tamanhos S/M/L, 2 colunas proporcionais, modo Personalizar; nova §6 "Proporção dos painéis" resumindo a spec), `docs/tarefas-ui.md` §6 (aponta para `docs/dashboards-redesign.md`)
- Test: `apps/web/src/lib/updated-label.test.ts`

**Interfaces:**
- Produces: `updatedLabel(updatedAt: number, now: number): string` — `< 60 s` → `'atualizado agora'`; `< 60 min` → `'atualizado há N min'`; senão `'atualizado às HH:MM'` no fuso `TASK_TIME_ZONE`; `updatedAt = 0` → `''`. As páginas usam `dataUpdatedAt` de `useDashboard`/`useTaskHome` e acrescentam `' · ' + label` (recalculado a cada minuto).

- [ ] **Step 1: Escrever os testes que falham**: `updatedLabel(t, t + 30_000)` → `'atualizado agora'`; `(t, t + 5 * 60_000)` → `'atualizado há 5 min'`; `updatedLabel(Date.parse('2026-11-05T17:32:00Z'), Date.parse('2026-11-05T19:40:00Z'))` → `'atualizado às 14:32'`; `updatedLabel(0, t)` → `''`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/lib/updated-label.test.ts` → FAIL.
- [ ] **Step 3: Implementar** e ligar nas duas páginas.
- [ ] **Step 4: Verificação completa:**
  - `pnpm typecheck && pnpm --filter @effinance/web test` → sem erros.
  - Demo (`vite --mode demo --port 5199`), capturas de página inteira em 1440, 1024 e 375 dos dois painéis; conferir: fileiras com alturas iguais; 1024 com cards lado a lado; 375 sem valor cortado nem rolagem lateral; nenhum `<circle` de rosca no Início; Resultado não aparece por padrão; modo Personalizar entra e sai.
  - Em `apps/web`: `node ~/.claude/skills/design-taste-frontend/scripts/lint.mjs --app src/features/dashboard src/features/tasks src/components` → 0 FAIL (falsos positivos conhecidos na §5 do design system).
  - Checklist da spec §12 marcado.
- [ ] **Step 5: Atualizar a documentação** (arquivos acima) e **Commit** `docs: proporção dos painéis no design system`.
