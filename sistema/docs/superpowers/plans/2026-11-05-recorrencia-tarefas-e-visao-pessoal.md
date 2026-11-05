# Recorrência em qualquer tarefa e visão pessoal (`/tasks/me/overview`) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** toda tarefa pode ter `recurrence` (reaproveitando `recurring_tasks` e a geração com marcador) e a
área do usuário ganha um endpoint agregado com produtividade, próximos vencimentos, carga por dia da semana,
comparação com o departamento e insights em texto.

**Architecture:** uma tarefa com recorrência vira uma recorrente de **origem `task`** (`recurring_tasks.origin`),
com um cliente ou interna (`internal`), cujas ocorrências são linhas de `tasks` marcadas com
`occurrence_origin = 'task'` e **listadas como tarefas** (não agregadas, fora da auditoria e dos blocos de
obrigações). A agenda compartilhada (`utils/tasks.ts`) ganha diária, semanal com vários dias, "a cada N",
início/fim por data e a regra "pular dia não útil". O overview é um serviço novo (`overview.ts`) em SQL
agregado; os textos saem de um construtor puro (`overview-insights.ts`).

**Tech Stack:** Fastify 5, Drizzle, PostgreSQL 16 (RLS), Zod 4, Vitest.

**Spec:** pedido do usuário (itens 1 e 2) repassado pelo coordenador; referência visual do Effy
(`view-perfil`, `renderProfileHome`).

## Global Constraints

- Contrato primeiro (`packages/shared`), mudanças aditivas; `RECURRENCE_PERIODS` (6, cadastro) não muda.
- `workspace_id` em toda query; serviços novos entram em `test/tasks-scope.test.ts`; rota nova em `MEMBER_ROUTES`.
- Migração 0019 reexecutável, sem `CONCURRENTLY` (PGlite); backfill por espaço (FORCE RLS).
- Texto livre cifrado por campo (descrição da série: AAD `recurring_tasks:description`; da ocorrência: `tasks:description`).
- Escritas exigem assinatura com escrita (402, já em `taskGuards`).
- `apps/web` só o mínimo para compilar.

## Decisões

1. Permissão: qualquer membro cria/edita/encerra recorrência de origem `task` quando a série (antes e depois
   da mudança) é dele (responsável) ou do departamento dele; senão `registry`. Recorrentes do cadastro
   (regime, vários clientes, grupos) seguem só por `/tasks/recurring` com `registry`; via tarefa → 422.
2. Auditoria e blocos de obrigação (início `obligations`, dashboard fiscal/processos/visão de clientes,
   calendário agregado) contam **só origem `registry`**; ocorrências de tarefa (com cliente ou internas)
   aparecem como tarefas (lista, "Minhas", calendário, relatórios, totais).
3. Edição: `PATCH /tasks/:id` com `applyTo: 'occurrence'` (padrão, compatível) ou `'series'`; `recurrence`
   (objeto) implica série; `recurrence: null` encerra a série nesta ocorrência. Datas sempre travadas.
4. Lista sem filtro de data: ocorrências de tarefa abertas aparecem se a data de trabalho ≤ hoje + 7 ou se
   são a próxima aberta da série (uma diária não inunda a lista).
5. Reabertura com motivo (registro de auditoria) só para ocorrências do cadastro.
6. Comparação com o departamento: `average` nulo com menos de 3 membros (revelaria um colega).

## Review Focus

- Mudar a regra de uma série diária/semanal pela tarefa aberta: a própria tarefa não pode virar "cancelada"
  (re-chaveia para o novo período quando ele está livre).
- Trocar o cliente de uma série (inclusive para interna e de volta) sem violar `tasks_occurrence_uq`.
- Interna sem cliente não duplica com dois pedidos simultâneos (índice único parcial + `ON CONFLICT`).
- "Após N vezes" com N grande e anual (teto de iterações) e fim antes da primeira ocorrência (422).
- Testes que reexecutam 0014/0017 precisam reexecutar 0019 no fim.

---

### Task 1: Contrato e agenda compartilhada

**Files:** `packages/shared/src/{constants,schemas,types}.ts`, `utils/tasks.ts`, `test/tasks.test.ts`.

- [ ] Testes (falham): diária a cada N com "pular"; semanal seg/qua/sex a cada 2 semanas; mensal a cada 3
  meses a partir do início; `startDate`/`endDate`; `seriesEndDate` para "após N vezes"; `competenceOfPeriod`
  com chave por data; schema recusa semanal sem dias, `skip` na mensal, intervalo na anual, fim sem data.
- [ ] Implementar `RECURRENCE_FREQUENCIES`, `RECURRENCE_NON_BUSINESS_DAY_RULES`, `RECURRENCE_ENDS`,
  `RECURRENCE_ORIGINS`, `TASK_RECURRENCE_APPLY_TO`, `TASK_INSIGHT_*`; `RecurringSchedule` com `interval`,
  `weekdays`, `startDate`, `endDate`; `taskRecurrenceInputSchema`, `taskMyOverviewQuerySchema`;
  tipos `TaskRecurrence`, `TaskMyOverviewResponse`.
- [ ] `pnpm --filter @effinance/shared test` verde.

### Task 2: Banco (0019) e geração

**Files:** `apps/api/src/db/schema.ts`, `drizzle/0019_task_recurrence.sql` (+ journal/snapshot),
`modules/tasks/generation.ts`, `task-rows.ts`, `test/tasks-phase2-db.test.ts`, `test/tasks-0017-db.test.ts`.

- [ ] Colunas novas, CHECKs, índice único parcial das internas, gatilho com as colunas novas, backfill.
- [ ] Geração de internas, cópia de origem/prioridade/horário/descrição, limites por data.

### Task 3: Recorrência pela tarefa

**Files:** `modules/tasks/task-recurrence.ts` (novo), `service.ts`, `recurring.ts`, `registry.ts`,
`test/tasks-task-recurrence.test.ts` (novo).

- [ ] Criar com recorrência (cliente e interna), converter avulsa, editar série (regra, cliente, responsável),
  encerrar, excluir série intocada, permissões (membro: sua/departamento; outro departamento 403; cadastro 422).

### Task 4: Listas, início, dashboard, calendário, auditoria, busca

- [ ] Predicados `AGGREGATED_SQL`/`ROW_SQL`/visibilidade; auditoria sem origem `task`; testes de regressão.

### Task 5: `GET /tasks/me/overview`

**Files:** `modules/tasks/overview.ts`, `overview-insights.ts`, `routes.ts`, `test/tasks-overview.test.ts`,
`test/tasks-scope.test.ts`, `test/tasks-security.test.ts`, `docs/api.md`.

- [ ] Produtividade (mês e 6 meses), próximos 14 dias, carga por dia da semana, comparação (≥ 3 membros),
  insights; sem dados individuais de outras pessoas.
- [ ] `pnpm typecheck && pnpm test` verdes.
