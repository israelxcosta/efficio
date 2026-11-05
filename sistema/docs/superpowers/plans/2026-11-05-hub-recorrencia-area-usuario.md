# Hub de tarefas, repetição em toda tarefa, Minha área e Auditoria enxuta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na Gestão de tarefas, o trilho fica com 5 itens e um hub de ícones (Ver e Criar) no cabeçalho de Tarefas, Auditoria, Recorrentes e Processos; toda tarefa ganha "Não se repete / Repete"; o avatar abre Minha área (com o menu de conta); a Auditoria perde legendas e alinha colunas.

**Architecture:** Só `apps/web`. A navegação muda em `components/layout/nav.ts` (`place`, `activeOn`, `railItemsFor`, `hostsTaskSheets`) e num componente novo `TasksHub`. A repetição usa o contrato que o backend publicou em `packages/shared` (`taskRecurrenceInputSchema`, `TaskDetail.recurrence: TaskRecurrence`, `TaskOccurrenceRef.origin`, `applyTo`) e a agenda compartilhada (`firstScheduledOccurrence`, `occurrencesInCompetence`) para a prévia. Minha área é uma rota comum (`/minha-area`) montada no `GestaoLayout`, alimentada por `GET /tasks/me/overview` (`TaskMyOverviewResponse`) e por endpoints que já existem. Textos e regras saem de funções puras testadas com vitest; componentes têm uma parte de apresentação sem hooks, testada com `renderToStaticMarkup` (o padrão de `audit-occurrence-row.test.tsx`).

**Tech Stack:** React 19, React Router, TanStack Query, Tailwind v4 (container queries), Radix (Tooltip, Popover, DropdownMenu), lucide-react 1.60, vitest.

**Spec:** `docs/tarefas-ui.md`, revisão 4: §0 (itens 19 a 22), §2.2, §2.4, §2.5, §2.8, §2.9, §5.3, §7.1, §7.3, §9.4, §10.1, §10.2, §10.6, §11.1 a §11.4, §11.7, §11.8, §12.1, §15.4, §16, §17, §18 (itens 20 a 27). Contrato do backend: `docs/superpowers/plans/2026-11-05-recorrencia-tarefas-e-visao-pessoal.md`.

## Global Constraints

- Só tokens existentes (`text-muted`, `text-subtle`, `text-danger`, `text-warning`, `text-success`, `bg-data`, `bg-bg-subtle`, `bg-primary-soft`, `ring-primary`…); sem degradê, vidro ou ícone em quadrado colorido (`design-system.md` §5).
- UI em pt-BR, código em inglês; os textos visíveis e `aria-label`s são os da spec, palavra por palavra.
- 375px sem rolagem horizontal da página; áreas de toque de 40px em `pointer-coarse`; transições de 150ms; nenhuma lista com rolagem interna.
- Hub: itens de 36×36 (`size-9`, 40 em `pointer-coarse`), ícone de 16px, tooltip `side="bottom"` `delay={150}`; Criar oculto abaixo de 640px (`max-sm:hidden`).
- Ícones do hub: Ver = `List`, `SquareKanban`, `CalendarDays`, `ClipboardCheck`, `Repeat`, `Layers`, `Workflow`; Criar = `Plus`, `CalendarPlus`, `CalendarSync`, `GitBranchPlus`.
- `AUDIT_ROW_GRID` = `'@4xl:grid @4xl:grid-cols-[minmax(0,1fr)_8.5rem_10.5rem_9rem_6.5rem] @6xl:grid-cols-[minmax(0,1fr)_7rem_8.5rem_10.5rem_9rem_7rem_8rem]'` (literal).
- O contrato é do backend: se um tipo citado aqui não existir em `@effinance/shared` quando a tarefa começar, pare e avise; não crie tipos paralelos.
- Antes de concluir cada tarefa: `pnpm --filter @effinance/web typecheck` e os testes da tarefa; no fim, `pnpm typecheck && pnpm test`. Commit só quando o usuário pedir.

## Review Focus

- Página do hub oculta para a pessoa (`page.audit`, `page.recurring`, `page.processes` desligada): o ícone some do hub e a URL continua mostrando Acesso restrito — `pagePermissionOf` precisa cobrir as páginas que saíram do trilho (teste na Task 1).
- Item Tarefas ativo em `/tarefas/auditoria`, `/tarefas/recorrentes?visao=regimes` e `/tarefas/processos/…`, mas não em `/tarefas/clientes`, `/tarefas/relatorios` nem `/tarefas/auditoriax` (teste na Task 1).
- Regra de repetição nos cantos: dia 31 em fevereiro vira 28; semanal cujo "Começa em" não é um dos dias escolhidos muda o vencimento e mostra o aviso; "Após 3 vezes" corta a prévia; "Termina em" antes do início dá o erro (testes na Task 6).
- "Só esta" numa ocorrência de repetição nunca manda `applyTo: 'series'` nem campos de série; "Esta e as próximas" manda `applyTo: 'series'` em todo PATCH (teste na Task 8).
- Minha área de um membro sem departamento e de um administrador vindo do Financeiro: card de departamento vazio com o texto da spec, sem segmentado no calendário, sem média em Seu ritmo, trilho do Financeiro mantido (`areaOf('/minha-area') === 'common'`) e `?tarefa=` abrindo por cima da página (testes nas Tasks 10 e 11).

---

### Task 1: Trilho de 5 itens e Tarefas ativo nas páginas do hub

**Files:**
- Modify: `apps/web/src/components/layout/nav.ts`
- Modify: `apps/web/src/components/layout/sidebar.tsx` (usar `railItemsFor`; `SidebarLink` recebe `activeOn`)
- Modify: `apps/web/src/components/layout/mobile-nav.tsx` (barra inferior com `isActivePath`; "Mais" com `railItemsFor`)
- Test: `apps/web/src/components/layout/nav.test.ts`, `apps/web/src/features/phase3-logic.test.ts`, `apps/web/src/app/routes.test.tsx` (deve continuar passando sem mudança)

**Interfaces:**
- Produces:
  - `NavItem.place?: 'rail' | 'hub'` (padrão `rail`) e `NavItem.activeOn?: string[]`.
  - `GESTAO_NAV_ITEMS` na ordem `/`, `/tarefas`, `/tarefas/clientes`, `/tarefas/relatorios`, `/tarefas/cadastros`, `/tarefas/auditoria` (hub), `/tarefas/recorrentes` (hub), `/tarefas/processos` (hub); `keywords` de §2.2; Tarefas com `activeOn: ['/tarefas/auditoria', '/tarefas/recorrentes', '/tarefas/processos']`.
  - `railItemsFor(area: Area, can?: (key: PermissionKey) => boolean): NavItem[]` — `navItemsFor` sem `place: 'hub'`.
  - `isActivePath(pathname: string, item: Pick<NavItem, 'to' | 'end' | 'activeOn'>): boolean` — `end` exato **ou** algum `activeOn` com `underPath`.

- [ ] **Step 1: Escrever os testes que falham** em `nav.test.ts`:
  - `railItemsFor('gestao').map((i) => i.short ?? i.label)` → `['Início', 'Tarefas', 'Clientes', 'Relatórios', 'Cadastros']`.
  - `GESTAO_NAV_ITEMS.map((i) => i.to)` → a ordem acima; `GESTAO_NAV_ITEMS.filter((i) => i.mobile).map((i) => i.label)` → `['Início', 'Tarefas', 'Clientes']`.
  - Com `tarefas = GESTAO_NAV_ITEMS[1]`: `isActivePath('/tarefas/auditoria', tarefas)`, `('/tarefas/recorrentes', …)`, `('/tarefas/processos/x', …)` → `true`; `('/tarefas/clientes', …)`, `('/tarefas/relatorios', …)`, `('/tarefas/auditoriax', …)` → `false`; `('/tarefas', …)` → `true`.
  - Em `phase3-logic.test.ts`: `railItemsFor('gestao', () => false).map((i) => i.to)` → `['/', '/tarefas']`; `navItemsFor('gestao', canOwner).map((i) => i.to)` contém `'/tarefas/auditoria'`, `'/tarefas/recorrentes'` e `'/tarefas/processos'` (⌘K); `pagePermissionOf('/tarefas/recorrentes')` → `'page.recurring'`; `pagePermissionOf('/tarefas/processos')` → `'page.processes'`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/components/layout/nav.test.ts src/features/phase3-logic.test.ts` → FAIL (`railItemsFor` inexistente, ordem antiga).
- [ ] **Step 3: Implementar** em `nav.ts`; `Sidebar` e o "Mais" do `MobileNav` passam a `railItemsFor(area, can)`; a barra inferior troca `NavLink end` por `Link` com a classe e o `aria-current` de `isActivePath(pathname, i)`.
- [ ] **Step 4: Rodar e ver passar:** o mesmo comando e `src/app/routes.test.tsx` → PASS; `pnpm --filter @effinance/web typecheck` sem erros.
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Gestão: trilho com 5 itens e Tarefas ativo nas páginas do hub"`.

### Task 2: Itens do hub (funções puras)

**Files:**
- Modify: `apps/web/src/features/tasks/task-hub.ts`
- Modify: `apps/web/src/components/layout/mobile-nav.tsx` (`TaskCreate` sem "Grupo por regime")
- Test: `apps/web/src/features/tasks/task-hub.test.ts`

**Interfaces:**
- Consumes: `writeTaskFilters`, `TaskView` (`../url-state`); `PermissionKey`, `PagePermissionKey` (`@effinance/shared`).
- Produces:
  - `type HubViewId = 'list' | 'board' | 'calendar' | 'audit' | 'recurring' | 'regimes' | 'processes'`.
  - `interface HubViewItem { id: HubViewId; label: string; group: 'views' | 'pages' }` — labels: Lista, Quadro, Calendário, Auditoria mensal, Tarefas recorrentes, Grupos por regime, Processos.
  - `hubViewItems(can: (key: PermissionKey) => boolean): HubViewItem[]` — `audit` pede `page.audit`; `recurring` e `regimes`, `page.recurring`; `processes`, `page.processes`.
  - `activeHubView(pathname: string, params: URLSearchParams, currentView?: TaskView): HubViewId | null` — compara em minúsculas; em `/tarefas`, `currentView` (senão `list`).
  - `hubViewHref(id: HubViewId, pathname: string, params: URLSearchParams): string` — em `/tarefas`, `writeTaskFilters(params, { view })` sem `tarefa`, `nova`, `recorrente`, `periodo`; fora, `/tarefas?visao=lista|quadro|calendario`; páginas: `/tarefas/auditoria`, `/tarefas/recorrentes`, `/tarefas/recorrentes?visao=regimes`, `/tarefas/processos`.
  - `type CreateActionId = 'task' | 'appointment' | 'recurring' | 'process'`; `createActions(can)` com labels "Nova tarefa", "Novo compromisso", "Nova tarefa recorrente", "Novo processo" (sai `regimeGroup`; `recurring` continua exigindo `registry` e `page.recurring`).

- [ ] **Step 1: Escrever os testes que falham** em `task-hub.test.ts` (o `can` de hoje, por papel):
  - `hubViewItems(can('owner')).map((i) => i.id)` → `['list', 'board', 'calendar', 'audit', 'recurring', 'regimes', 'processes']`; `can('viewer', { 'page.audit': false })` sem `audit`; `can('viewer', { 'page.recurring': false })` sem `recurring` e `regimes`.
  - `activeHubView('/tarefas', new URLSearchParams(), 'board')` → `'board'`; `('/tarefas/auditoria', …)` → `'audit'`; `('/tarefas/recorrentes', new URLSearchParams('visao=regimes'))` → `'regimes'`; `('/TAREFAS/Processos', …)` → `'processes'`; `('/tarefas/clientes', …)` → `null`.
  - `new URL(hubViewHref('board', '/tarefas', new URLSearchParams('escopo=todas&cliente=<uuid>&tarefa=<uuid>&pagina=3')), 'http://x').searchParams`: `visao` = `quadro`, `escopo` = `todas`, `cliente` mantido, sem `tarefa` e sem `pagina`.
  - `hubViewHref('calendar', '/tarefas/auditoria', new URLSearchParams('competencia=2026-10'))` → `'/tarefas?visao=calendario'`; `hubViewHref('regimes', '/tarefas', …)` → `'/tarefas/recorrentes?visao=regimes'`.
  - `createActions(can('owner')).map((a) => a.id)` → `['task', 'appointment', 'recurring', 'process']`; `viewer` → `['task', 'appointment', 'process']`; `editor` com `page.recurring: false` → sem `recurring`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/task-hub.test.ts` → FAIL.
- [ ] **Step 3: Implementar** em `task-hub.ts`; no `TaskCreate` do celular, apagar o item "Grupo por regime".
- [ ] **Step 4: Rodar e ver passar** + typecheck.
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Tarefas: itens do hub (Ver e Criar)"`.

### Task 3: `TasksHub` nos quatro cabeçalhos

**Files:**
- Create: `apps/web/src/features/tasks/components/tasks-hub.tsx`
- Delete: `apps/web/src/features/tasks/components/task-create-hub.tsx`
- Modify: `apps/web/src/features/tasks/pages/tasks.tsx`, `components/task-filters.tsx` (sai a Visualização, desktop e celular), `pages/recurring.tsx` (sai o segmentado de visão, "Ver no calendário", "Nova tarefa recorrente" e o `⋯`; `h1` pela visão), `pages/processes.tsx` (descrição curta; "Novo modelo" no `CardHeader` de modelos; sai "Criar processo avulso"), `pages/audit.tsx` (sem `description`; `PeriodNavigator` vai para `AuditToolbar`, depois da Visão), `apps/web/src/components/layout/mobile-nav.tsx` (ícones do "+" de `CREATE_ICONS`)
- Test: `apps/web/src/features/tasks/components/tasks-hub.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`hubViewItems`, `activeHubView`, `hubViewHref`, `createActions`); `useTaskSheetLinks().newTask`, `useTaskActions()` (`openTemplatePicker`, `openFlowBuilder`); `writeTaskView`, `taskViewKey`.
- Produces:
  - `HUB_VIEW_ICONS: Record<HubViewId, LucideIcon>` e `CREATE_ICONS: Record<CreateActionId, LucideIcon>` (os da Global Constraints).
  - `TasksHubView(props: { views: HubViewItem[]; active: HubViewId | null; hrefOf: (id: HubViewId) => string; replaceViews: boolean; onViewChosen?: (v: TaskView) => void; creates: CreateAction[]; onCreate: (id: 'task' | 'appointment' | 'recurring') => void; onApplyTemplate: () => void; onAdHocProcess: () => void })` — sem hooks de dados.
  - `TasksHub({ currentView, onViewChosen }: { currentView?: TaskView; onViewChosen?: (v: TaskView) => void })`.

- [ ] **Step 1: Escrever os testes que falham** (`renderToStaticMarkup` em `MemoryRouter` + `TooltipProvider`, com `views` de `owner` e `active: 'audit'`):
  - contém `aria-label="Páginas de tarefas"` e os 7 `aria-label`s da spec, cada um uma vez; exatamente um `aria-current="page"`, no link com `href="/tarefas/auditoria"`.
  - contém `role="group"` com `aria-label="Criar"` e os `aria-label`s "Nova tarefa", "Novo compromisso", "Nova tarefa recorrente", "Novo processo"; o grupo tem a classe `max-sm:hidden`.
  - sem texto visível de rótulo: `html.replace(/="[^"]*"/g, '')` não contém "Auditoria mensal" nem "Nova tarefa".
  - com `views` só do grupo `views`, não há `data-hub-divider`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/components/tasks-hub.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** conforme §2.9 (trilho `rounded-md bg-bg-subtle p-1`, ativo `bg-surface text-fg shadow-xs`, filete `data-hub-divider`; Criar com `WriteGate`, Novo processo como `DropdownMenu w-72 align="end"` com os dois itens e as descrições da spec). Em Tarefas: `PageHeader actions={<TasksHub currentView={filters.view} onViewChosen={(v) => writeTaskView(viewKey, { scope: filters.scope, view: v })} />} actionsClassName="max-sm:w-full"`; links de visão em `/tarefas` com `replace`. Aplicar "O que sai dos cabeçalhos" de §2.9 nas outras três páginas.
- [ ] **Step 4: Verificar:** o teste PASS; typecheck; `rg -n "TaskCreateHub|Ver no calendário\" |Criar processo avulso" apps/web/src/features/tasks/pages` sem resultado em cabeçalhos; no demo (`pnpm --filter @effinance/web dev:demo`), trocar entre as 4 páginas pelo hub em 1440 e 375 (Ver em largura total, sem Criar).
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Tarefas: hub de ícones nos cabeçalhos de Tarefas, Auditoria, Recorrentes e Processos"`.

### Task 4: Auditoria enxuta — funções puras

**Files:**
- Modify: `apps/web/src/features/tasks/audit-logic.ts` (apagar `auditHeadline`)
- Test: `apps/web/src/features/tasks/audit-list.test.ts`

**Interfaces:**
- Consumes: `isPendingCell`, `shortDate`, `shortName`, `daysText`, `DueInfo`.
- Produces:
  - `clientNextTarget(cells: Pick<OccurrenceCell, 'status' | 'targetDate'>[]): ISODate | null` — a menor meta entre as pendentes.
  - `clientDeadlineNote(c: Pick<AuditClientRow, 'overduePending' | 'targetMissedPending'>): DueInfo | null`.
  - `obligationDeadlineDetail(cell: Pick<OccurrenceCell, 'status' | 'targetDate' | 'legalDueDate'>, today: ISODate): DueInfo | null`.
  - `situationException(cell: Pick<OccurrenceCell, 'status'>): { text: string; className: string } | null`.
  - `stackedMeta(cell: Pick<OccurrenceCell, 'status' | 'targetDate' | 'legalDueDate' | 'assignee'>, lead: AuditRowLead, sameDates: boolean, today: ISODate): { text: string; alert: DueInfo | null }`.

- [ ] **Step 1: Escrever os testes que falham** (`TODAY = '2026-10-28'`, `makeCell`):
  - `clientNextTarget([pendente 2026-11-07, pendente 2026-11-03, concluída 2026-10-20])` → `'2026-11-03'`; só concluídas → `null`.
  - `clientDeadlineNote({ overduePending: 2, targetMissedPending: 1 })` → `{ text: '2 atrasadas', tone: 'danger' }`; `(1, 0)` → `'1 atrasada'`; `(0, 1)` → `{ text: '1 fora da meta', tone: 'warning' }`; `(0, 0)` → `null`.
  - `obligationDeadlineDetail`: pendente, legal 2026-10-26 → `{ text: 'Prazo legal venceu há 2 dias', tone: 'danger' }`; legal 2026-10-28 → `{ text: 'Prazo legal hoje', tone: 'warning-strong' }`; meta 2026-10-25 e legal 2026-11-05 → `{ text: 'Fora da meta · legal 05/11', tone: 'warning' }`; meta 2026-11-03 e legal 2026-11-05 → `{ text: 'legal 05/11', tone: 'muted' }`; meta = legal = 2026-11-05 → `null`; concluída com meta antes do legal → `{ text: 'legal 05/11', tone: 'muted' }`; concluída com meta = legal → `null`.
  - `situationException`: `waiting_client` → `{ text: 'Aguardando', className: 'text-muted' }`; `canceled` → `{ text: 'Cancelada', className: 'text-subtle' }`; `todo`, `in_progress`, `done` → `null`.
  - `stackedMeta(pendente de "Juliana Martins", meta 2026-11-03, 'obligation', true, TODAY)` → `{ text: 'Juliana M. · meta 03/11', alert: null }`; sem responsável → texto começa com "Sem responsável"; `'client'` com `sameDates` → `{ text: 'Juliana M.', alert: null }`; `'client'` sem `sameDates` e legal vencido → `alert.tone === 'danger'`.
  - Apagar os testes de `auditHeadline`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/audit-list.test.ts` → FAIL.
- [ ] **Step 3: Implementar** em `audit-logic.ts` (o alerta de `stackedMeta` só com tom `danger`, `warning` ou `warning-strong`).
- [ ] **Step 4: Rodar e ver passar** + typecheck.
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Auditoria: textos curtos de prazo, alerta e exceção"`.

### Task 5: Auditoria enxuta — telas

**Files:**
- Modify: `apps/web/src/features/tasks/components/audit-occurrence-row.tsx` (grade nova; Situação só com exceção; Prazo linha 2; Empilhado de até 3 linhas; `AuditColumnsHeader` por visão; novo `AuditClientRowView`)
- Modify: `apps/web/src/features/tasks/pages/audit.tsx` (resumo A3–A5, barra A6, barra do card e cabeçalho único A7–A8 nas duas visões, linha do cliente A9, subtítulo da tarefa A10, vazios A14)
- Test: `apps/web/src/features/tasks/components/audit-occurrence-row.test.tsx`

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - `AUDIT_ROW_GRID` (Global Constraints).
  - `AuditColumnsHeader({ view }: { view: AuditView })` — 1ª coluna "Cliente" (`client`) ou "Tarefa recorrente" (`task`), com `pl-9`.
  - `AuditClientRowView({ client, cells, today, expanded, regionId }: { client: AuditClientRow; cells: OccurrenceCell[]; today: ISODate; expanded: boolean; regionId: string })` — o conteúdo do botão da linha do cliente (seta, nome, cadeado, regime, Prazo, "7/9" e barra, Conclusão), sem hooks.

- [ ] **Step 1: Escrever os testes que falham** (helper `col()` do arquivo):
  - `AuditOccurrenceRowView` com célula `todo`: `col(html, 'situation')` não contém "A fazer"; com `waiting_client` contém "Aguardando"; com a concluída atrasada contém "2 dias de atraso" e não contém "Concluída".
  - `lead="obligation"`, pendente com legal vencido há 2 dias: `col(html, 'deadline')` contém "Prazo legal venceu há 2 dias" e não contém "Meta em".
  - `todo`: `col(html, 'stacked-situation')` vazio; concluída: contém "Concluída em 22/10".
  - `AuditColumnsHeader view="client"` começa por "Cliente"; `view="task"`, por "Tarefa recorrente".
  - `AuditClientRowView` (7 de 9 concluídas, 2 atrasadas, próxima meta 2026-11-07, CNPJ `12345678000190`): contém "7/9", "2 atrasadas", "07/11" e não contém "12.345.678"; com `monthConcludedAt: '2026-10-27T17:32:00Z'`, `col(html, 'concluded-at')` contém "27/10, 14:32".
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/components/audit-occurrence-row.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** §11.8 (A3 a A14). A barra do card de Por cliente: "40 clientes" + Expandir todos e, abaixo (a partir de `@4xl`), `AuditColumnsHeader`; a `ul` com `aria-describedby` para o `span sr-only` de §11.4. Por tarefa ganha a mesma barra ("12 tarefas recorrentes", Expandir todas). As regiões abertas perdem o cabeçalho próprio.
- [ ] **Step 4: Verificar:** testes PASS; typecheck; `rg -n "navegam|Pendências atrasadas|da competência|padrão: " apps/web/src/features/tasks/pages/audit.tsx` sem resultado; capturas das duas visões em 1440, 1280, 1024, 768 e 375 (um cabeçalho por cartão; linha-mãe e linhas abertas nos mesmos trilhos; nenhuma rolagem lateral).
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Auditoria: menos legenda e colunas alinhadas nas duas visões"`.

### Task 6: Repetição — regras puras

**Files:**
- Create: `apps/web/src/features/tasks/repeat-rules.ts`
- Test: `apps/web/src/features/tasks/repeat-rules.test.ts`

**Interfaces:**
- Consumes (`@effinance/shared`): `taskRecurrenceInputSchema`, `TaskRecurrenceInput`, `TaskRecurrence`, `TaskDetail`, `RecurrenceFrequency`, `RECURRENCE_FREQUENCY_LABELS`, `RECURRENCE_INTERVAL_UNITS`, `RecurringSchedule`, `firstScheduledOccurrence`, `occurrencesInCompetence`, `formatDateBR`.
- Produces:
  - `interface RepeatForm { frequency: RecurrenceFrequency; interval: string; weekdays: number[]; dueDay: string; dueMonth: string; skipNonBusiness: boolean; nonBusinessDayRule: 'anticipate' | 'postpone' | 'keep'; ends: 'never' | 'date' | 'count'; endDate: ISODate | ''; count: string; targetDaysBefore: string; referenceOffset: string; touched: { weekdays: boolean; dueDay: boolean; dueMonth: boolean } }`.
  - `defaultRepeatForm(start: ISODate): RepeatForm` — Mensal, a cada 1, dia da semana/dia/mês do início, só dias úteis, Antecipar, Nunca, meta 0, referência 0.
  - `withStartDate(form: RepeatForm, start: ISODate): RepeatForm` — atualiza só o que não está em `touched`.
  - `scheduleOf(form: RepeatForm, start: ISODate): RecurringSchedule`.
  - `toRecurrenceInput(form: RepeatForm, start: ISODate): TaskRecurrenceInput` (`skipNonBusiness` → `skip`/`keep` na Diária e na Semanal; o segmentado nas outras).
  - `repeatErrors(form: RepeatForm, start: ISODate | ''): Partial<Record<'startDate' | 'interval' | 'weekdays' | 'endDate' | 'count' | 'targetDaysBefore', string>>` — pelo schema do contrato, mensagens com ponto final, mais "Informe quando começa." sem início.
  - `nextDates(form: RepeatForm, start: ISODate, count?: number): ISODate[]` — a primeira de `firstScheduledOccurrence` e as seguintes por `occurrencesInCompetence` (prazo legal), respeitando o término; padrão 3.
  - `repeatSummary(form: RepeatForm, start: ISODate, today: ISODate): string` e `repeatSummaryOf(rule: TaskRecurrence, today: ISODate): string` (a mesma frase a partir de `rule.upcoming`).
  - `firstDateNotice(form: RepeatForm, start: ISODate): string | null`.
  - `repeatShortText(rule: Pick<TaskRecurrence, 'frequency' | 'interval' | 'weekdays' | 'dueDay' | 'nonBusinessDayRule'>): string`.
  - `repeatFormOf(rule: TaskRecurrence): RepeatForm`.
  - `type RepeatMode = 'convert' | 'ended' | 'series' | 'registry' | 'hidden'`; `repeatModeOf(task: Pick<TaskDetail, 'kind' | 'occurrence' | 'recurrence'>): RepeatMode` — `flow` → `hidden`; `occurrence.origin === 'registry'` → `registry`; `recurrence?.active` → `series`; ocorrência de origem `task` sem série ativa → `ended`; o resto → `convert`.

- [ ] **Step 1: Escrever os testes que falham** (`TODAY = '2026-11-05'`, quinta):
  - `defaultRepeatForm('2026-11-10')` → `frequency: 'monthly'`, `weekdays: [2]`, `dueDay: '10'`, `dueMonth: '11'`.
  - `withStartDate(form com touched.weekdays = true e weekdays [1, 3], '2026-11-12')` mantém `[1, 3]` e muda `dueDay` para `'12'`.
  - Semanal seg e qua a partir de 2026-11-10 (terça): `nextDates` → `['2026-11-11', '2026-11-16', '2026-11-18']`; `firstDateNotice` → `'Esta tarefa passa a vencer em 11/11 (qua), o primeiro dia da regra.'`; `repeatSummary` começa por `'Toda semana na segunda e na quarta · próximas: 11/11, 16/11 e 18/11'`.
  - Mensal dia 31 a partir de 2027-01-31: `nextDates(…, 2)` contém `'2027-02-26'` (28/02/2027 é domingo; antecipa para sexta) e o resumo contém "em fevereiro, dia 28".
  - Diária só dias úteis a partir de 2026-11-13 (sexta): `nextDates` → `['2026-11-13', '2026-11-16', '2026-11-17']`.
  - Mensal com `ends: 'count'`, `count: '2'`: `nextDates(…, 3)` tem 2 datas e o resumo termina em "· 2 vezes."
  - `repeatErrors` semanal sem dias → `{ weekdays: 'Escolha ao menos um dia da semana.' }`; `interval: '0'` → `'Use de 1 a 99.'`; `ends: 'date'` antes do início → `{ endDate: 'O término deve ser depois do início.' }`; `count: '501'` → `'Use de 1 a 500 vezes.'`; início vazio → `{ startDate: 'Informe quando começa.' }`.
  - `toRecurrenceInput(diária com skipNonBusiness false)` tem `nonBusinessDayRule: 'keep'`; mensal com `interval: '1'` passa em `taskRecurrenceInputSchema.safeParse`.
  - `repeatShortText`: semanal `[1]` → `'toda segunda'`; semanal `[1, 3]` a cada 2 → `'a cada 2 semanas'`; diária `skip` → `'todo dia útil'`; mensal dia 10 → `'todo dia 10'`; trimestral → `'trimestral'`.
  - `repeatModeOf`: `kind: 'flow'` → `'hidden'`; `occurrence.origin: 'registry'` → `'registry'`; `recurrence.active: true` → `'series'`; `occurrence.origin: 'task'` com `recurrence: null` → `'ended'`; avulsa → `'convert'`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/repeat-rules.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `repeat-rules.ts` reaproveitando `dueRuleHint`, `shortMonthsWarning` e os nomes de mês de `recurring-rules.ts`; dia da semana abreviado como em `previewLines` ("(qua)").
- [ ] **Step 4: Rodar e ver passar** + typecheck.
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Tarefas: regras da repetição (prévia, resumo e validação)"`.

### Task 7: `RepeatField` e criar tarefa que se repete

**Files:**
- Create: `apps/web/src/features/tasks/components/recurrence-fields.tsx` (`DueDayField`, `AnchorMonthField`, `NonBusinessField`, saídos de `recurring-sheet.tsx`)
- Create: `apps/web/src/features/tasks/components/repeat-field.tsx`
- Modify: `apps/web/src/features/tasks/components/recurring-sheet.tsx` (usar os campos extraídos), `components/task-sheet.tsx` (`NewTaskSheet` e `TaskProperties`: prop `dueLabel?: string`)
- Test: `apps/web/src/features/tasks/components/repeat-field.test.tsx`

**Interfaces:**
- Consumes: Task 6; `useCreateTask` (o `TaskInput` já aceita `recurrence`).
- Produces:
  - `RepeatFieldView(props: { on: boolean; onToggle: (on: boolean) => void; form: RepeatForm; onForm: (f: RepeatForm) => void; start: ISODate | ''; today: ISODate; errors: ReturnType<typeof repeatErrors>; readOnly: boolean; canRegistry: boolean; footer?: ReactNode })` — o segmentado e o bloco de §9.4, sem hooks.
  - `NewTaskValues` ganha `repeat: { on: boolean; form: RepeatForm }`.

- [ ] **Step 1: Escrever os testes que falham** (`renderToStaticMarkup`):
  - `on: false`: há o `radiogroup` "Repetição" com "Não se repete" marcado (`aria-checked="true"`) e nenhum campo "Frequência".
  - `on: true`, Semanal: 7 botões com `aria-pressed` e `aria-label` "Segunda-feira" … "Domingo"; o de terça `aria-pressed="true"` para início em 2026-11-10; há o campo "A cada" com o sufixo "semana".
  - `on: true`, Anual: sem "A cada"; há "Mês".
  - `canRegistry: false`: sem o link "Recorrente para vários clientes"; `true`: com ele.
  - o resumo está num elemento com `aria-live="polite"`; com início 2026-11-10 e Semanal seg/qua, há o aviso "Esta tarefa passa a vencer em 11/11 (qua), o primeiro dia da regra."
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/components/repeat-field.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** o bloco de §9.4 (controles e textos da tabela; "Meta e referência" recolhido). No `NewTaskSheet`: ligar "Repete" sem vencimento põe hoje no vencimento; `TaskProperties dueLabel="Começa em"`; no envio, `repeatErrors` (erros inline) e `recurrence: toRecurrenceInput(form, dueDate)`; toast `Tarefa criada. Repete ${repeatShortText(...)}.`. Extrair os três campos do `recurring-sheet.tsx` sem mudar o comportamento do cadastro.
- [ ] **Step 4: Verificar:** testes PASS (inclusive os de `recurring-sheet` que já existirem); typecheck; no demo, criar "Reunião semanal" seg/qua às 09:00 e ver a primeira ocorrência abrir no Sheet.
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Tarefas: Não se repete / Repete ao criar tarefa"`.

### Task 8: Repetição no detalhe e nas linhas

**Files:**
- Modify: `apps/web/src/features/tasks/components/task-sheet.tsx` (`TaskDetailBody`, `TaskProperties`, `useAutosave`, `SavedStamp`)
- Modify: `apps/web/src/features/tasks/components/task-row.tsx` (subtítulo com `Repeat` e a frequência)
- Modify: `apps/web/src/features/tasks/occurrence.ts` (`groupListItems`: juntar as seguidas da mesma série nos grupos `next7Days` e `later`)
- Test: `apps/web/src/features/tasks/repeat-rules.test.ts`, `apps/web/src/features/tasks/tasks-logic.test.ts`

**Interfaces:**
- Consumes: Task 6 (`repeatModeOf`, `repeatFormOf`, `repeatSummaryOf`, `toRecurrenceInput`); Task 7 (`RepeatFieldView`); `useUpdateTask` (`PATCH` com `recurrence` e `applyTo`).
- Produces:
  - `type ApplyScope = 'occurrence' | 'series'`; `patchFor(scope: ApplyScope, mode: RepeatMode, patch: TaskUpdateInput): TaskUpdateInput | null` em `repeat-rules.ts` — em `series` com escopo `series`, acrescenta `applyTo: 'series'`; com escopo `occurrence`, devolve `null` quando o patch tem `title`, `clientId`, `categoryId`, `startTime` ou `endTime` (a tela não envia); nas outras tarefas, o patch como veio.
  - `seriesLockedFields(scope: ApplyScope): Set<TaskLockedField>` — `occurrence`: título, cliente, categoria, horário, início e vencimento; `series`: início e vencimento.
  - `ListItem` ganha, nas tarefas, `more?: { count: number; until: ISODate }`.

- [ ] **Step 1: Escrever os testes que falham:**
  - `patchFor('occurrence', 'series', { priority: 'high' })` → `{ priority: 'high' }`; `patchFor('occurrence', 'series', { title: 'X' })` → `null`; `patchFor('series', 'series', { title: 'X' })` → `{ title: 'X', applyTo: 'series' }`; `patchFor('series', 'convert', { title: 'X' })` → `{ title: 'X' }`.
  - `seriesLockedFields('occurrence').has('title')` → `true`; `seriesLockedFields('series').has('title')` → `false`, `.has('dueDate')` → `true`.
  - Em `tasks-logic.test.ts`: `groupListItems` com 4 ocorrências da mesma série (`occurrence.origin: 'task'`, mesmo `recurringTaskId`) em 07, 10, 11 e 12/11 (hoje 05/11) e uma avulsa entre elas: no grupo `next7Days`, a série vira 1 item com `more: { count: 3, until: '2026-11-12' }` quando as linhas são seguidas, e a avulsa fica; duas da mesma série em `overdue` continuam 2 itens.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/repeat-rules.test.ts src/features/tasks/tasks-logic.test.ts` → FAIL.
- [ ] **Step 3: Implementar** a tabela "Detalhe" e o "Só esta ou esta e as próximas" de §9.4: `convert` e `ended` (bloco + **Repetir**/**Cancelar**; toast com **Desfazer** que envia `recurrence: null`), `series` (linha da regra, **Editar repetição** com **Salvar repetição**, "Não se repete" com o `ConfirmDialog` da spec), `registry` (desabilitado com "Vem da tarefa recorrente."), `hidden`. O segmentado de escopo só em `series` com `canEdit`; o autosave passa por `patchFor`; o `SavedStamp` diz "Salvo nesta e nas próximas" no escopo `series`. Na `TaskRow`, `Repeat` 12px e `RECURRENCE_FREQUENCY_LABELS[occurrence.period].toLowerCase()` quando `occurrence?.origin === 'task'`, e "+3 até 12/11" (`text-subtle`) com `more`.
- [ ] **Step 4: Verificar:** testes PASS; typecheck; no demo: repetir uma avulsa (e desfazer), editar a regra de uma série, mudar a prioridade "só esta" e o nome "esta e as próximas", parar de repetir; uma ocorrência de DCTFWeb mostra o controle desabilitado.
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Tarefas: repetição no detalhe (só esta / esta e as próximas) e nas linhas"`.

### Task 9: Recorrentes com as duas origens

Depende do item 23 de §18 (`GET /tasks/recurring` com `origin`). Sem ele, faça só a parte "sem dados" (o filtro Tipo não aparece) e pare.

**Files:**
- Modify: `apps/web/src/features/tasks/recurring-rules.ts` (`tipo` na URL; texto do Prazo), `pages/recurring.tsx` (filtro Tipo; linha de repetição; clique abre a tarefa), `api.ts` (`useRecurringTasks` com `origin`)
- Test: `apps/web/src/features/tasks/phase2-logic.test.ts`

**Interfaces:**
- Consumes: os campos do item 23 (origem, alvo, responsável, regra, `canEdit`, próxima ocorrência); `repeatShortText` (Task 6).
- Produces:
  - `RecurringFilters.kind: '' | 'obligations' | 'repetitions'` (`tipo=obrigacoes|repeticoes`), lido e escrito por `parseRecurringFilters`/`writeRecurringFilters` e contado em `recurringFilterCount`.
  - `recurringDeadlineText(r): { line1: string; line2: string }` — obrigação: como hoje ("Dia 20", "meta 5 dias antes · antecipa · ref. mês anterior"); repetição: `repeatShortText` com a inicial maiúscula ("Toda segunda") e "termina em 12/2026", "12 vezes" ou "meta 2 dias antes".

- [ ] **Step 1: Escrever os testes que falham:** `parseRecurringFilters(new URLSearchParams('tipo=repeticoes')).kind` → `'repetitions'`; valor inválido → `''`; `recurringFilterCount` conta o Tipo; `recurringDeadlineText` de uma repetição semanal `[1]` com `ends: 'count'`, `count: 12` → `{ line1: 'Toda segunda', line2: '12 vezes' }`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/phase2-logic.test.ts` → FAIL.
- [ ] **Step 3: Implementar** §10.1 (Tipo; descrição sem o `ADMIN_ONLY_REASON`) e a linha de repetição de §10.2 (clique e "Abrir tarefa" → `?tarefa=<próxima>`; "Parar de repetir" com `canEdit`).
- [ ] **Step 4: Verificar:** testes PASS; typecheck; no demo, Tipo › Repetições lista a "Reunião semanal" e o clique abre a próxima ocorrência.
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Recorrentes: obrigações e repetições na mesma página"`.

### Task 10: Minha área — rota, avatar, menu de conta, "Mais" e ⌘K

**Files:**
- Modify: `apps/web/src/components/layout/nav.ts` (`MY_AREA_ITEM`, `hostsTaskSheets`)
- Modify: `apps/web/src/app/routes.tsx` (`minha-area` dentro do grupo do `GestaoLayout`)
- Modify: `apps/web/src/features/tasks/task-links.ts`, `components/occurrence-row.tsx` (`hostsTaskSheets` no lugar de `areaOf(...) === 'gestao'`)
- Create: `apps/web/src/components/layout/account-menu.tsx` (`AccountMenu`, com o `WorkspaceSheet`)
- Modify: `apps/web/src/components/layout/sidebar.tsx` (avatar vira `AvatarLink`; sai o `DropdownMenu` e o `WorkspaceSheet` daqui), `mobile-nav.tsx` (linha Minha área no topo do "Mais"), `command-palette.tsx` (Minha área e Grupos por regime em "Ir para")
- Create: `apps/web/src/features/tasks/pages/my-area.tsx` (esqueleto com o cabeçalho; os cards vêm na Task 12)
- Test: `apps/web/src/components/layout/nav.test.ts`, `apps/web/src/app/routes.test.tsx`, `apps/web/src/components/layout/account-menu.test.tsx`

**Interfaces:**
- Produces:
  - `MY_AREA_ITEM: NavItem = { to: '/minha-area', label: 'Minha área', icon: CircleUserRound, keywords: 'perfil eu meu painel anotacoes calendario conta sair tema' }`.
  - `hostsTaskSheets(pathname: string): boolean` — `areaOf(pathname) === 'gestao'` ou o caminho de rota é `/minha-area`.
  - `AvatarLink({ name, userId, photoVersion, active, badge }: { name: string; userId: string; photoVersion: string | null; active: boolean; badge: ReactNode })` em `sidebar.tsx`, exportado.
  - `AccountMenuView({ name, email, workspace, kindLabel, themeLabel, onTheme, onSettings, onLogout, workspaceItems }: …)` sem hooks, e `AccountMenu()` que liga `useAuth`, `useTheme` e `WorkspaceMenuItems`.

- [ ] **Step 1: Escrever os testes que falham:**
  - `areaOf('/minha-area')` → `'common'`; `hostsTaskSheets('/minha-area')`, `('/Minha-Area')` e `('/tarefas/auditoria')` → `true`; `('/configuracoes')` e `('/extrato')` → `false`.
  - Em `routes.test.tsx`: o grupo do `GestaoLayout` contém `'minha-area'`.
  - `renderToStaticMarkup(<MemoryRouter><TooltipProvider><AvatarLink name="Marina Costa" … active /></TooltipProvider></MemoryRouter>)` contém `href="/minha-area"`, `aria-label="Minha área — Marina Costa"` e `aria-current="page"`; com `active: false`, sem `aria-current`.
  - `AccountMenuView` aberto (`defaultOpen` no `DropdownMenu`, ou o conteúdo renderizado à parte): contém "Conta", o e-mail, "Espaço atual:", "Nova empresa", "Tema escuro", "Configurações" e "Sair"; o gatilho tem `aria-label="Conta e espaço: Efficio Contabilidade"`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/components/layout src/app/routes.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** §2.2 (avatar), §2.4 (linha do "Mais"), §2.8 (⌘K) e o cabeçalho de §15.4 (saudação provisória "Olá, Marina" até a Task 11; **Editar perfil**; `AccountMenu`); `document.title` "Minha área · Efficio".
- [ ] **Step 4: Verificar:** testes PASS; typecheck; no demo, como administrador no Financeiro: clicar no avatar abre Minha área com o trilho do Financeiro; trocar de espaço, tema e sair pelo menu de conta; no celular, a linha Minha área no "Mais".
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Minha área: o avatar abre a página do usuário com o menu de conta"`.

### Task 11: Minha área — funções puras

**Files:**
- Create: `apps/web/src/features/tasks/my-area-logic.ts`
- Test: `apps/web/src/features/tasks/my-area-logic.test.ts`
- Modify: `apps/web/src/features/tasks/test-fixtures.ts` (`makeOverview(patch?: Partial<TaskMyOverviewResponse>): TaskMyOverviewResponse`)

**Interfaces:**
- Consumes: `TaskMyOverviewResponse`, `TaskInsight`, `TaskInsightKey` (`@effinance/shared`); `tasksHref` (`./url-state`); `MetricCell` (`@/components/ui/metric-strip`).
- Produces:
  - `greeting(hour: number, name: string): string` — "Bom dia, Marina" (0–11), "Boa tarde, Marina" (12–17), "Boa noite, Marina" (18–23); o primeiro nome.
  - `officeHour(now: Date): number` — hora em `America/Sao_Paulo`.
  - `myAreaDescription(today: ISODate, roleLabel: string, department: string | null, updated: string): string`.
  - `myMetricCells(o: TaskMyOverviewResponse, appointmentsToday: { count: number; next: string | null }): MetricCell[]` — as 4 células de §15.4, com `href`, `hero` na primeira e `tone: 'danger'` quando há atrasadas.
  - `appointmentsToday(o: TaskMyOverviewResponse): { count: number; next: string | null }` — `upcoming.tasks` de hoje com `startTime`, o próximo pelo horário.
  - `INSIGHT_ICONS: Record<TaskInsightKey, LucideIcon>`; `insightHref(link: TaskInsight['link']): string | null`.
  - `insightsFinding(insights: TaskInsight[]): string` — "2 pedem atenção" / "1 pede atenção" / "Tudo em dia".
  - `rhythmFinding(o: TaskMyOverviewResponse, monthName: string, prevMonthName: string): string`.
  - `groupMineByClient(tasks: Task[], occurrences: RecurringOccurrence[]): { key: string; label: string; items: ListItem[] }[]` — "Obrigações" primeiro (as ocorrências agregadas), clientes por quantidade desc e nome, "Interna" por último.

- [ ] **Step 1: Escrever os testes que falham:**
  - `greeting(11, 'Marina Costa')` → `'Bom dia, Marina'`; `(12, …)` → `'Boa tarde, Marina'`; `(18, …)` → `'Boa noite, Marina'`.
  - `officeHour(new Date('2026-11-05T02:30:00Z'))` → `23`.
  - `myAreaDescription('2026-11-05', 'Colaborador', 'Fiscal', 'atualizado às 14:32')` → `'Quarta-feira, 5 de novembro · Colaborador · Fiscal · atualizado às 14:32'`; sem departamento, sem o trecho.
  - `myMetricCells(makeOverview({ open: { overdue: 2, oldestOverdue: { …, dueDate: '2026-10-30' }, dueToday: 3, next7Days: 8, … }, productivity: { concluded: 12, onTimeRate: 92, trend: [..., { month: '2026-10', concluded: 18, … }, { month: '2026-11', … }] } }), { count: 2, next: '14:00' })`: rótulos `['Atrasadas', 'Hoje', 'Próximos 7 dias', 'Concluídas em novembro']`; rodapés `'a mais antiga venceu há 6 dias'`, `'2 compromissos · próximo às 14:00'`, `'até 12/11'`, `'92% no prazo · outubro: 18'`; `href` da primeira `'/tarefas?escopo=minhas&situacao=atrasadas'`; sem atrasadas, rodapé `'nada atrasado'` e sem `tone`.
  - `insightHref({ situation: 'waiting' })` → `'/tarefas?escopo=minhas&situacao=aguardando'`; `({ dueDate: '2026-11-06' })` → `'/tarefas?escopo=minhas&vencimento=2026-11-06'`; `({ dueBucket: 'overdue' })` → `'/tarefas?escopo=minhas&situacao=atrasadas'`; `({ dueBucket: 'next7Days' })` → `'/tarefas?escopo=minhas'`; `null` → `null`.
  - `insightsFinding` com tons `danger`, `warning`, `info` → `'2 pedem atenção'`; só `success` → `'Tudo em dia'`.
  - `groupMineByClient`: duas tarefas de "Bravo", uma de "Alfa", uma interna e uma ocorrência agregada → labels `['Obrigações', 'Bravo', 'Alfa', 'Interna']`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/my-area-logic.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `my-area-logic.ts` (datas com `longDay`, `shortDate`, `daysText`).
- [ ] **Step 4: Rodar e ver passar** + typecheck.
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Minha área: saudação, números, insights e agrupamentos"`.

### Task 12: Minha área — página e cards

**Files:**
- Modify: `apps/web/src/features/tasks/pages/my-area.tsx`
- Create: `apps/web/src/features/tasks/components/my-area-cards.tsx` (`MyTasksCard`, `ForYouCard`, `RhythmCard`, `MyDepartmentCard`, `NotesCard`, `ClientsPendingCard`, `RecentCommentsCard`, cada um com uma `…View` sem hooks)
- Modify: `apps/web/src/features/tasks/api.ts` (`useMyOverview(month?: MonthKey)` → `GET /tasks/me/overview`), `apps/web/src/lib/query-keys.ts` (`taskMyOverview`), `features/tasks/task-actions.tsx` (`editNote(note: TaskNote)`)
- Test: `apps/web/src/features/tasks/components/my-area-cards.test.tsx`

**Interfaces:**
- Consumes: Task 11; `useTasks({ scope: 'mine', situation: 'open', page: 1, pageSize: 50 })`, `useTaskHome(undefined)`, `useTaskNotes()`, `useTaskActivity()`; `WidgetCard`, `FitList`, `MetricStrip`, `StackBar`, `DashSlot`, `columnsForWidth`; `clientPendingRanking`; `progressSegments`, `progressHeadline`.
- Produces: as `…View` com props de dados prontos, por exemplo `ForYouCardView({ insights }: { insights: TaskInsight[] })`, `MyDepartmentCardView({ home, canRegistry, today }: { home: TaskHomeResponse | undefined; canRegistry: boolean; today: ISODate })`, `RhythmCardView({ overview, monthName, prevMonthName }: …)`.

- [ ] **Step 1: Escrever os testes que falham** (`renderToStaticMarkup` em `MemoryRouter` + `TooltipProvider`):
  - `ForYouCardView` com um insight `overdue`/`danger` com `link` e um `allClear`/`success` sem `link`: um `a` com `href="/tarefas?escopo=minhas&situacao=atrasadas"` e o texto da API; o `allClear` não é link; o ícone do `danger` tem `text-danger`.
  - `MyDepartmentCardView` com `home.view === 'mine'`: contém "Você ainda não está em um departamento."; com `canRegistry`, o link `href="/tarefas/cadastros?aba=equipe"` e "Definir em Cadastros".
  - `RhythmCardView` com `comparison.average: null`: contém "Você: 92% no prazo" e não contém "média do".
  - `NotesCardView` sem anotações: "Nenhuma anotação" e o botão "Nova anotação".
  - `RecentCommentsCardView` vazio: "Nenhum comentário nos últimos 5 dias."
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/components/my-area-cards.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** a faixa e a grade de §15.4 (spans: Minhas tarefas `{ wide: 8, medium: 2 }`, Para você 4/1, Calendário 4/1 com um marcador até a Task 13, Seu ritmo 4/1, Meu departamento 4/1, Anotações, Clientes e Comentários 4/1 com Comentários `medium: 2`; linhas L = 4, M = 3), os estados da tabela "Estados e larguras", a saudação com `greeting(officeHour(new Date()), user.name)` e a descrição com `useUpdatedLabel`.
- [ ] **Step 4: Verificar:** testes PASS; typecheck; capturas em 1440, 1024, 768 e 375 como colaborador com departamento, colaborador sem departamento e administrador: sem rolagem lateral, faixa em 4 linhas a 375, `?tarefa=` abrindo por cima.
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Minha área: números, tarefas, insights, ritmo, departamento, anotações e comentários"`.

### Task 13: `MiniCalendar`

**Files:**
- Create: `apps/web/src/features/tasks/mini-calendar-logic.ts`, `apps/web/src/features/tasks/components/mini-calendar.tsx`
- Modify: `apps/web/src/features/tasks/pages/my-area.tsx` (card Calendário; `calendario` e `calendario-escopo` na URL)
- Test: `apps/web/src/features/tasks/mini-calendar-logic.test.ts`

**Interfaces:**
- Consumes: `calendarWeeks`, `itemsByDay`, `CalendarItem` (`./calendar-logic`); `nationalHolidayName`, `isTaskOverdue` (`@effinance/shared`); `useTaskCalendar`.
- Produces:
  - `type DayMarker = 'none' | 'open' | 'overdue' | 'done'`; `dayMarker(items: CalendarItem[], today: ISODate): DayMarker`.
  - `dayLabel(date: ISODate, items: CalendarItem[], today: ISODate): string` — "6 de novembro, quinta-feira: 3 tarefas, 1 atrasada" e ", feriado: Finados".
  - `miniCalendarMove(key: string, index: number, total: number): { index: number } | { month: -1 | 1 } | null` — ← → ±1, ↑ ↓ ±7, Home/End início/fim da semana (linha de 7), PageUp/PageDown mês.
  - `MiniCalendar({ month, scope, today, onMonth }: { month: MonthKey; scope: 'mine' | 'department'; today: ISODate; onMonth: (m: MonthKey) => void })`.

- [ ] **Step 1: Escrever os testes que falham:**
  - `dayMarker([])` → `'none'`; uma tarefa aberta vencida antes de hoje → `'overdue'`; aberta no futuro → `'open'`; só concluídas → `'done'`.
  - `dayLabel('2026-11-02', [], '2026-11-05')` → `'2 de novembro, segunda-feira: nenhuma tarefa, feriado: Finados'`; com 3 itens, 1 atrasado → `'…: 3 tarefas, 1 atrasada'`.
  - `miniCalendarMove('ArrowDown', 3, 42)` → `{ index: 10 }`; `('Home', 10, 42)` → `{ index: 7 }`; `('End', 10, 42)` → `{ index: 13 }`; `('PageUp', 10, 42)` → `{ month: -1 }`; `('ArrowLeft', 0, 42)` → `{ index: 0 }`; `('a', 0, 42)` → `null`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/mini-calendar-logic.test.ts` → FAIL.
- [ ] **Step 3: Implementar** a grade, as marcas, o popover do dia e **Novo compromisso** (`?nova=1&horario=1&prazo=<dia>`) de §15.4; segmentado Minhas/Departamento no cabeçalho do card (oculto sem departamento).
- [ ] **Step 4: Verificar:** testes PASS; typecheck; no demo, navegar com o teclado (setas, PageUp/PageDown, Enter, Esc) e criar um compromisso pelo popover; 375 sem rolagem lateral (dias de ~43px).
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Minha área: minicalendário com compromisso no dia"`.

### Task 14: Documentação e verificação final

**Files:**
- Modify: `docs/design-system.md` (tabela de componentes: `TasksHub`, `RepeatField`, `AccountMenu`, `MiniCalendar`; padrão "hub de ícones")
- Modify: `docs/tarefas-ui.md` (§19, marcar os itens da Revisão 4 feitos)

- [ ] **Step 1:** Rodar `node ~/.claude/skills/design-taste-frontend/scripts/lint.mjs --app apps/web/src/features/tasks apps/web/src/components/layout` → 0 FAIL novo.
- [ ] **Step 2:** Capturas (`inspect.mjs --app`) em 1440, 1024, 768 e 375 de Tarefas, Auditoria (duas visões), Recorrentes, Grupos por regime, Processos, Minha área e o `TaskSheet` com Repete, como administrador e como colaborador: nenhuma rolagem horizontal; hub sempre no mesmo lugar; Criar oculto a 375.
- [ ] **Step 3:** `pnpm typecheck && pnpm test` → PASS.
- [ ] **Step 4:** Atualizar os dois documentos.
- [ ] **Step 5: Commit** (quando autorizado): `git commit -m "Docs: componentes da revisão 4 no design system"`.

---

## O que a API precisa (para o agente de backend)

Conferido com o contrato já publicado em `packages/shared` (`taskRecurrenceInputSchema`, `TaskRecurrence`,
`TaskOccurrenceRef.origin`, `TASK_RECURRENCE_APPLY_TO`, `TaskMyOverviewResponse`, `TaskInsight.link`). O que
está lá serve como está; abaixo, o que a tela ainda pede ou precisa confirmar.

1. **Recorrentes com as duas origens** (Task 9): `GET /tasks/recurring?origin=registry|task|all` (padrão
   `registry`, para nada mudar até a tela pedir). Itens de origem `task` com: `origin`, o alvo (`client:
   TaskClientRef | null`, null = interna), o responsável (`assignee`), a regra no formato de `TaskRecurrence`
   (`frequency`, `interval`, `weekdays`, `dueDay`, `dueMonth`, `ends`, `endDate`, `count`,
   `targetDaysBefore`, `nonBusinessDayRule`), `canEdit`, o progresso do mês como hoje (`month`) e
   `nextTaskId` (a próxima ocorrência em aberto; sem ela, a última). `summary` com as contagens por origem.
2. **Sem retroativo**: uma regra com `startDate` no passado não gera ocorrências com data anterior a hoje,
   além da própria tarefa (a primeira). Se a regra da API for outra, avisar, porque a tela mostraria várias
   atrasadas de uma vez.
3. **A primeira data**: com `recurrence`, o vencimento da tarefa vira `firstScheduledOccurrence` a partir do
   `startDate` (a tela já avisa antes de salvar). Confirmar que `POST /tasks` e o `PATCH` de conversão
   devolvem o `TaskDetail` com esse vencimento e com `recurrence` preenchida.
4. **Desfazer "Repetir"**: `PATCH { recurrence: null }` logo depois de converter (a série só tem esta
   ocorrência e nada foi trabalhado) deveria devolver a tarefa a avulsa (`kind: 'standalone'`,
   `occurrence: null`, série apagada). Em qualquer outro caso, encerra a série nesta ocorrência, como já
   está; aí o `TaskDetail` vem com `recurrence: null` ou `active: false` (a tela trata os dois como "Não se
   repete · Parou de repetir.", modo `ended`).
5. **Reativar**: numa ocorrência de série encerrada, `PATCH { recurrence }` volta a repetir (a tela oferece
   "Repete" de novo). Confirmar se reaproveita a série ou cria outra (a tela não depende disso).
6. **`applyTo`**: a tela manda `applyTo: 'series'` em todo PATCH feito no escopo "Esta e as próximas" e
   nunca manda `title`, `clientId`, `categoryId`, `startTime` ou `endTime` no escopo "Só esta". Um 422 nesses
   casos é bug da tela; a mensagem pode ser técnica.
7. **`lockedFields`** das ocorrências de origem `task`: a tela calcula os travados pelo escopo
   (`seriesLockedFields`); basta a API manter `startDate` e `dueDate` sempre travados.
8. **`GET /tasks/me/overview`**: usado como está (`open`, `productivity` com `trend` e `rateChange`,
   `upcoming.tasks` com `startTime`, `comparison`, `insights` com `link`). `workload` fica sem uso nesta
   revisão. Pedido pequeno: os `insights` com `link` de `situation` usam os valores de `TASK_SITUATIONS`
   (`overdue`, `waiting`…), que a tela converte para a URL.
9. **Nada novo** para o hub, a Auditoria enxuta, o calendário (`GET /tasks/calendar` com `scope=mine|department`),
   as anotações, a atividade e o Início do departamento (`GET /tasks/home` sem `departmentId`).
