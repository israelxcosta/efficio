# Auditoria em colunas (Por tarefa e Por cliente) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As linhas de ocorrência da Auditoria mensal mostram Departamento, Responsável, Prazo, Situação, Data de conclusão e Concluída por em colunas (nas duas visões), e o controle de situação concluído mostra só o ✓ verde, sem iniciais.

**Architecture:** Um componente novo, `AuditOccurrenceRow` (`lead: 'client' | 'obligation'`), substitui `AccordionCellRow` e `ClientObligationRow`; uma constante de grade compartilhada alinha a linha da tarefa (Por tarefa) com as linhas de cliente. Textos e datas saem de funções puras em `audit-logic.ts`, testadas com vitest.

**Tech Stack:** React 19, Tailwind v4 (container queries `@4xl`/`@6xl`), vitest.

**Spec:** `docs/tarefas-ui.md` §3.2 e §11.2 a §11.4 (e §11.7).

## Global Constraints

- Só tokens existentes (`text-success`, `text-warning`, `text-danger`, `text-muted`, `text-subtle`, `text-brand-text`, `bg-success-soft`, `bg-data`, `bg-bg-subtle`); sem gradientes.
- Grade Largo: `@6xl:grid-cols-[minmax(0,1fr)_7rem_8.5rem_9rem_11rem_7.5rem_8rem]`; Médio: `@4xl:grid-cols-[minmax(0,1fr)_8.5rem_9rem_11rem_7.5rem]`; `gap-3`; abaixo de `@4xl`, `flex`.
- Linhas e linha da tarefa com o mesmo padding lateral: `px-2 @lg:px-3`; indentação `@lg:pl-10` dentro da 1ª coluna; regiões abertas sem margem/padding lateral.
- Os dois Cards: `Card @container overflow-hidden` com `ul p-1.5` dentro (sem `p-1.5` no Card).
- Textos: "Concluída", "2 dias de atraso" / "1 dia de atraso", "05/11, 07:45" (outro ano "05/11/25, 07:45"), aria-label "…: Concluída por Marina Costa em 05/11/2026 às 07:45, 2 dias após o prazo legal".
- Sem rolagem lateral em nenhuma largura. UI em pt-BR, código em inglês.
- Antes de concluir: `pnpm typecheck && pnpm test`. Commit só quando o usuário pedir.

## Review Focus

- Concluída sem `concludedBy` ou sem `concludedAt` (dados antigos): "—" em Concluída por, data em branco, sem quebrar o aria-label.
- Conclusão perto da meia-noite: o atraso usa o dia no fuso do escritório (`dateInTimeZone`), não UTC.
- Conclusão otimista (agora e você) antes da resposta do servidor: colunas e atraso aparecem na hora.
- Ocorrência com datas diferentes das da tarefa (ajuste do cliente): em Por tarefa, a linha 2 do Prazo aparece só nela.
- 1280px: as duas visões caem no nível Largo (contêiner de 1156px); 1024 no Médio; 375 sem rolagem lateral.

---

### Task 1: Textos e datas da conclusão (`audit-logic.ts`)

**Files:**
- Modify: `apps/web/src/features/tasks/audit-logic.ts` (remover `concludedInitials`; mudar `cellSituationText`; novas funções; receber `cellTip` de `components/matrix-cell.tsx`)
- Modify: `apps/web/src/features/tasks/components/matrix-cell.tsx` (importar `cellTip` de `../audit-logic`)
- Modify: `apps/web/src/features/tasks/components/occurrence-sheet.tsx` (import de `cellTip`)
- Test: `apps/web/src/features/tasks/audit-list.test.ts`, `apps/web/src/features/tasks/phase2-logic.test.ts` (remover o teste de `concludedInitials`)

**Interfaces:**
- Produces:
  - `conclusionDelayDays(cell: Pick<OccurrenceCell, 'status' | 'concludedAt' | 'legalDueDate'>): number | null` — dias entre o prazo legal e o dia da conclusão no fuso do escritório; `null` se não concluída, sem data ou no prazo.
  - `conclusionDelayText(days: number): string` — "1 dia de atraso", "2 dias de atraso".
  - `concludedAtText(concludedAt: string, today: ISODate, withTime?: boolean): string` — "05/11, 07:45", "05/11/25, 07:45", "05/11" (sem hora).
  - `cellSituationText(cell, today): string` — o rótulo: "A fazer", "Em andamento", "Aguardando cliente", "Concluída", "Cancelada".
  - `cellConclusionLine(cell, today, withTime?: boolean): string | null` — "Concluída em 05/11, 07:45 · Marina C." (Empilhado); `null` se não concluída.
  - `cellTip(cell: OccurrenceCell, department: string | null): string` — como hoje e, com atraso, ", 2 dias após o prazo legal".
  - `sameDeadlines(cell: Pick<OccurrenceCell, 'targetDate' | 'legalDueDate'>, column: Pick<AuditColumn, 'targetDate' | 'legalDueDate'>): boolean`.

- [ ] **Step 1: Escrever os testes que falham** em `audit-list.test.ts` (com `makeCell`, `TODAY = '2026-10-28'`):
  - `cellSituationText(done com concludedBy)` → `'Concluída'` (troca a expectativa atual "Concluída por Marina S. em 27/10").
  - `conclusionDelayDays({ status: 'done', legalDueDate: '2026-10-20', concludedAt: '2026-10-22T13:00:00Z' })` → `2`; no dia do prazo → `null`; `'2026-10-21T02:30:00Z'` (23:30 de 20/10 em São Paulo) → `null`; `concludedAt: null` → `null`.
  - `conclusionDelayText(1)` → `'1 dia de atraso'`; `(2)` → `'2 dias de atraso'`.
  - `concludedAtText('2026-10-27T10:45:00Z', TODAY)` → `'27/10, 07:45'`; com `withTime = false` → `'27/10'`; `'2025-10-27T10:45:00Z'` → `'27/10/25, 07:45'`.
  - `cellConclusionLine(done, Marina Souza, 27/10 07:45)` → `'Concluída em 27/10, 07:45 · Marina S.'`; sem `concludedBy` → `'Concluída em 27/10, 07:45'`; pendente → `null`.
  - `cellTip(done, atrasada 2 dias)` termina em `', 2 dias após o prazo legal'`; no prazo, sem esse trecho.
  - `sameDeadlines` igual → `true`; meta diferente → `false`.
- [ ] **Step 2: Rodar e ver falhar:** `pnpm --filter @effinance/web exec vitest run src/features/tasks/audit-list.test.ts` → FAIL (funções inexistentes, expectativa de `cellSituationText`).
- [ ] **Step 3: Implementar** em `audit-logic.ts` com `dateInTimeZone` e `diffInDays` (`@effinance/shared`), `shortDate` e `shortName` (`./due`), e a hora com `Intl.DateTimeFormat('pt-BR', { timeZone: TASK_TIME_ZONE, hour: '2-digit', minute: '2-digit' })`. Mover `cellTip` para cá; apagar `concludedInitials` e o teste dele em `phase2-logic.test.ts`.
- [ ] **Step 4: Rodar e ver passar:** o mesmo comando → PASS; `pnpm --filter @effinance/web typecheck` sem erros.
- [ ] **Step 5: Commit** (quando autorizado): `git add apps/web/src/features/tasks && git commit -m "Auditoria: textos de conclusão e atraso"`.

### Task 2: Controle concluído sem iniciais (`matrix-cell.tsx`)

**Files:**
- Modify: `apps/web/src/features/tasks/components/matrix-cell.tsx` (`CellButton`; novo `OccurrenceStatusGlyph`)
- Modify: `apps/web/src/features/tasks/pages/audit.tsx` (apagar `ReadOnlyCell`)
- Modify: `apps/web/src/features/tasks/components/occurrence-sheet.tsx` (célula de leitura)

**Interfaces:**
- Consumes: `cellTip` (Task 1), `TaskStatusGlyph` de `components/task-status.tsx`.
- Produces: `OccurrenceStatusGlyph({ cell, large, label }: { cell: OccurrenceCell; large?: boolean; label: string })` — o mesmo visual do controle num `span role="img" aria-label={label}`, para quem não tem `canWriteTasks`.

- [ ] **Step 1:** Em `CellButton`, o estado `done` passa a `rounded-full bg-success-soft text-success` com `<TaskStatusGlyph status="done" className="size-4" />`, no mesmo `w-8`/`w-10` dos outros estados (sair `w-[52px]`, `w-[60px]` e o `concludedInitials`). Extrair o miolo visual para reaproveitar em `OccurrenceStatusGlyph`.
- [ ] **Step 2:** Trocar `ReadOnlyCell` (audit.tsx) e o "✓"/"·" do `occurrence-sheet.tsx` por `OccurrenceStatusGlyph` com `label={cellTip(...)}`.
- [ ] **Step 3: Verificar:** `pnpm --filter @effinance/web typecheck && pnpm --filter @effinance/web test` → PASS; no demo (`pnpm --filter @effinance/web dev:demo`), auditoria e `RecurringOccurrenceSheet`: concluída mostra só o ✓ verde de 40px; o leitor de tela/tooltip diz "Concluída por {nome completo} em …".
- [ ] **Step 4: Commit** (quando autorizado): `git commit -m "Auditoria: controle concluído só com o ✓"`.

### Task 3: `AuditOccurrenceRow` e cabeçalho de colunas

**Files:**
- Create: `apps/web/src/features/tasks/components/audit-occurrence-row.tsx`
- Modify: `apps/web/src/features/tasks/pages/audit.tsx` (usar nas duas visões; apagar `AccordionCellRow` e `ClientObligationRow`)

**Interfaces:**
- Consumes: Task 1 e Task 2; `useCellStatus`, `useTaskSheetLinks`, `changeContext` (mover para o arquivo novo ou receber `onChange`/`onReopen` por props).
- Produces:
  - `AUDIT_ROW_GRID = '@4xl:grid @4xl:grid-cols-[minmax(0,1fr)_8.5rem_9rem_11rem_7.5rem] @6xl:grid-cols-[minmax(0,1fr)_7rem_8.5rem_9rem_11rem_7.5rem_8rem]'` (literal, para o Tailwind gerar as classes).
  - `AuditColumnsHeader({ lead }: { lead: 'client' | 'obligation' })` — `aria-hidden`, `hidden @4xl:grid`, rótulos de §11.2 ("Departamento" só `@6xl`; "Data de conclusão" e "Concluída por" `@6xl`, "Conclusão" só no Médio).
  - `AuditOccurrenceRow({ lead, cell, column, client, data, today, monthName, announce, dimmed })`.

- [ ] **Step 1:** Montar a linha conforme §11.2: 1ª coluna (`@lg:pl-10`, nome-botão, cadeado/regime ou período; no Médio, em `obligation`, o departamento no subtítulo), Departamento (`hidden @6xl:block`), Responsável, Prazo (linha 2 por `lead` e `sameDeadlines`), Situação (controle + rótulo `STATUS_TEXT_CLASS` + `conclusionDelayText` em `text-xs font-medium text-warning`), Data de conclusão e Concluída por (`hidden @6xl:*`, `aria-hidden`), Conclusão (`hidden @4xl:block @6xl:hidden`, `aria-hidden`). Empilhado: as linhas de §11.2 com `@4xl:hidden`, controle à direita, a hora `hidden @sm:inline`.
- [ ] **Step 2:** Em `AuditClientList`, região sem `@lg:pl-10`, com `AuditColumnsHeader lead="obligation"` e `AuditOccurrenceRow lead="obligation"`.
- [ ] **Step 3: Verificar:** typecheck e testes PASS; capturas da visão Por cliente em 1440, 1280, 1024, 768 e 375: colunas da spec, sem rolagem lateral, atraso em âmbar por escrito, data sem cor.
- [ ] **Step 4: Commit** (quando autorizado): `git commit -m "Auditoria: linha de ocorrência em colunas"`.

### Task 4: Por tarefa alinhado à grade

**Files:**
- Modify: `apps/web/src/features/tasks/pages/audit.tsx` (`TaskAccordion`)

**Interfaces:**
- Consumes: `AUDIT_ROW_GRID`, `AuditColumnsHeader`, `AuditOccurrenceRow` (Task 3); `groupDeadlineInfo`, `deadlineTip` (`../occurrence`).

- [ ] **Step 1:** Card como o de Por cliente (`Card @container overflow-hidden` + `ul p-1.5`). Linha da tarefa: sai `NeutralIcon(Repeat)` e o `ChevronDown`; entra a seta `ChevronRight` de 28px à esquerda (a de `AuditClientList`); `px-2 @lg:px-3`; a partir de `@4xl`, `AUDIT_ROW_GRID` com nome em `@4xl:col-span-2 @6xl:col-span-3`, meta + `groupDeadlineInfo(col, today, true)` alinhados à esquerda no trilho Prazo, "1/3" + barra no trilho Situação; abaixo de `@4xl`, o `flex` de hoje. `aria-label` "Folha de pagamento: 1 de 3 concluídas, prazo legal hoje. Mostrar clientes.".
- [ ] **Step 2:** Aberta: `li` com `rounded-lg bg-surface-muted/50`; região sem `@sm:ml-8`; `AuditColumnsHeader lead="client"` e `AuditOccurrenceRow lead="client"`.
- [ ] **Step 3: Verificar:** `pnpm typecheck && pnpm test` PASS; capturas em 1440, 1280, 1024, 768 e 375: a meta da tarefa em cima da coluna Prazo, "1/3" em cima da Situação, nomes de cliente alinhados ao nome da tarefa, sem rolagem lateral; ninguém com iniciais no controle.
- [ ] **Step 4: Commit** (quando autorizado): `git commit -m "Auditoria: Por tarefa alinhado às colunas"`.
