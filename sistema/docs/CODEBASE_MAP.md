---
last_mapped: 2026-10-22T21:16:14Z
total_files: 403
total_tokens: 745532
---

# Mapa do código — Efficio

> Gerado com o Cartographer. Última leitura: 22/10/2026 21:16 UTC. Tokens estimados (~4 caracteres
> por token; a rede bloqueou o download do tokenizer). Os snapshots gerados em `apps/api/drizzle/meta`
> (~180 mil tokens) não foram lidos.
>
> No momento do mapeamento estavam em andamento: 16 dos 22 widgets do dashboard (ainda "Em
> construção"), a aba "Inadimplência" dos relatórios, os cards da tela de Clientes e a geração de
> honorários (`/fee-charges`). Confira o `git log` antes de confiar nesses trechos.

## Visão geral

Sistema financeiro de um escritório de contabilidade (marca **Efficio**) construído sobre a base
**Effinance** (escopo `@effinance/*`, papéis `effinance_*`, cookies e chaves `effinance.*` mantidos
de propósito). Monorepo pnpm com três pacotes:

```mermaid
graph TB
    subgraph Navegador
        Web["apps/web<br/>React 19 · Vite · Tailwind v4<br/>TanStack Query · Recharts · Radix"]
        Demo["modo demo (vite --mode demo)<br/>rotas reais da API sobre PGlite/IndexedDB"]
    end
    subgraph Servidor
        API["apps/api<br/>Fastify 5 · Drizzle · Zod"]
        Tenant["tenantRoutes / inTenant<br/>transação RLS por requisição"]
    end
    subgraph Dados
        PG[("PostgreSQL 16<br/>RLS forçado em 13 tabelas")]
        KMS[["KeyProvider<br/>local ou AWS KMS"]]
        Redis[("Redis opcional<br/>rate limit")]
    end
    Shared["packages/shared<br/>contrato: Zod, tipos, utilitários"]
    Ext["Mercado Pago · Pluggy · BrasilAPI · SES"]

    Web -->|"/api + cookies"| API
    Web -.->|demo| Demo
    Demo -->|mesmos módulos| Tenant
    API --> Tenant --> PG
    API --> KMS
    API --> Redis
    API --> Ext
    Shared --> Web
    Shared --> API
```

## Estrutura de pastas

```
sistema/
├── packages/shared/src/        contrato compartilhado (sem build; exporta o TS direto)
│   ├── constants.ts            enums + rótulos pt-BR (tipos, regimes, juros/multa, riscos…)
│   ├── schemas.ts              Zod de entrada (transações, clientes, relatórios, honorários…)
│   ├── types.ts                tipos de resposta (Transaction, DashboardResponse, Delinquency…)
│   ├── saas.ts                 espaços, papéis, planos, assinatura, auth/MFA
│   ├── integrations.ts         importação OFX/CSV e Open Finance
│   └── utils/                  datas, dinheiro, documentos, fatura, recorrência, vigências,
│                               juros/multa (late-fees) e score de inadimplência (delinquency)
├── apps/api/
│   ├── drizzle/0000…0013*.sql  migrações (0004+ escritas à mão, reexecutáveis, rodam no PGlite)
│   ├── src/app.ts, server.ts   montagem do Fastify, hooks globais, árvore de rotas
│   ├── src/routes.ts           domainRoutes (tenantRoutes) e scopedRoutes (inTenant)
│   ├── src/setup.ts, env.ts    providers (e-mail, cobrança, Open Finance, CNPJ) e env validado
│   ├── src/db/                 schema.ts, client, migrate, retention, backfill, seed, demo-seed
│   ├── src/lib/                auth, tenant, crypto (cifra por campo, keyring), errors, sql, clock
│   ├── src/modules/<domínio>/  routes.ts + service.ts por domínio (ver "Módulos da API")
│   └── test/                   integração com Postgres real (vitest, um arquivo por vez)
├── apps/web/src/
│   ├── app/                    router (browser; hash no demo) e providers
│   ├── components/ui|charts|layout   design system, gráficos e casca do app
│   ├── features/<domínio>/     api.ts (hooks) + pages/ + sheets/dialogs
│   ├── demo/                   servidor da API no navegador (PGlite) e testes do demo
│   ├── lib/                    cliente da API, query keys, tema, mês ativo, CSP, URLs seguras
│   └── styles/index.css        tokens claro/escuro e escala de texto compacta
├── docs/                       api.md, design-system.md, deploy-aws.md, este mapa
└── .claude/agents/             agentes de função (backend, frontend, design, 4 de segurança)
```

## Contrato compartilhado (`packages/shared`)

- **Regra do repositório:** altere o contrato primeiro; mudanças aditivas.
- **Dinheiro** é inteiro em centavos (`amountSchema` > 0; `signedAmountSchema` aceita negativo).
  Formatação só nas bordas (`formatBRL`, `formatCompactBRL`, `Money`, `MoneyInput`).
- **Datas** são strings `YYYY-MM-DD` com aritmética UTC (`utils/dates.ts`); meses `YYYY-MM`
  (`MonthKey`); semana começa no domingo. `todayISO()` usa o fuso local.
- **Clientes e fornecedores** são `contacts` com `kind`. Cliente exige CNPJ, regime e início de
  contrato; o anexo do Simples só existe no Simples Nacional.
- **Vigências de honorários** são anuais a partir do início do contrato (`utils/fees.ts`:
  `feePeriod`, `feePeriodIndexAt`; 29/02 cai em 28/02).
- **Fatura do cartão** é identificada pelo mês de vencimento; compra no dia do fechamento vai para a
  próxima (`utils/invoice.ts`).
- **Juros e multa** (`utils/late-fees.ts`): sugestão de 2% + 1% a.m. pro rata.
- **Score de inadimplência** (`utils/delinquency.ts`): probabilidade
  `(atrasos ponderados + 1)/(total ponderado + 5)`, peso `0,5^(meses/6)`; score
  `1000×(1−p) − até 150 (média de dias, 60+ = tudo) − 60 por recebível vencido em aberto`;
  faixas ≥800 Bom pagador, ≥600 Atenção, ≥400 Risco alto, <400 Crítico.
- **Geração de honorários** (em andamento): `generateFeesSchema`, `feeEmployeesSchema`,
  `FEE_CATEGORY` (Serviços Prestados / Honorários contábeis | Folha de pagamento) e os campos
  `feeCompetence`, `feeKind`, `feeOf`, `employees` em `Transaction`.
- **Tarefas**: seções "Tasks" de `constants.ts` (estados `todo…canceled` com rótulos pt-BR,
  prioridades, escopos, situações, grupos de prazo, periodicidades, regra de dia não útil),
  `schemas.ts` e `types.ts` (`Task`, `TaskDetail`, `TaskListResponse`, `TaskHomeResponse`,
  `TaskOptionsResponse`…) e `utils/tasks.ts` (atrasada, `dueBucketOf`, `dateInTimeZone`, dias úteis
  com `HolidayCalendar`, agenda das recorrentes). Contrato das fases 2–4 (recorrentes, auditoria,
  fluxos, relatórios, anotações) já escrito, sem API ainda — ver `docs/api.md` → "Tarefas".

## API (`apps/api`)

### Ciclo de uma requisição

```mermaid
sequenceDiagram
    participant C as Cliente (web)
    participant F as Fastify (hooks globais)
    participant A as authenticate
    participant T as tenantRoutes
    participant DB as PostgreSQL (RLS)
    C->>F: POST /api/... (cookie effinance_token, X-Workspace-Id)
    F->>F: helmet, CORS, CSRF (Origin + JSON), no-store
    F->>A: JWT de acesso (15 min) → loadAccess (membro + sessão viva)
    A-->>F: 409 workspace_mismatch se o espaço do header divergir
    F->>T: assertCanWrite (viewer 403, assinatura 402)
    T->>T: getCipher(workspace) ANTES de abrir a transação
    T->>DB: BEGIN; set_config(role=effinance_app, app.workspace_id, statement_timeout=15s)
    T->>DB: handler(req.db, req.workspaceId, ...)
    DB-->>T: COMMIT
    T-->>C: resposta só depois do COMMIT
```

- `authRoutes`, `workspaceRoutes`, `inviteRoutes` e `billingRoutes` rodam na conexão do sistema
  (`app.db`), com checagens explícitas.
- `scopedRoutes` (imports, open-finance, cnpj) usam `tenantGuards` + `inTenant`, porque chamam
  provedores externos entre fases (nunca com transação aberta). `tasks` também fica em
  `scopedRoutes`, com guardas próprios (`modules/tasks/access.ts`: todo membro escreve, `viewer`
  inclusive; cadastros e exclusões só `owner`/`editor`): lê os membros na conexão do sistema e
  depois trabalha numa transação de tenant (`runTasks`).
- Erros: `AppError` (404, 409, 422, 401, 403, 429, 402); Zod vira 400 `validation_error`;
  violações únicas/FK do Postgres viram 409 amigável (`UNIQUE_CONFLICTS` em `lib/errors.ts`).

### Módulos da API

| Módulo | Rotas (sob `/api`) | Pontos principais |
|---|---|---|
| `common` | — | `get*OrThrow` (sempre por id + workspace), `validateTransactionRefs` |
| `auth` | `/auth/*` | registro, login, refresh rotativo (reuso revoga a família), TOTP, recuperação, troca de espaço |
| `workspaces` | `/workspaces`, `/invites` | membros e papéis, convites (hash do token), exportação LGPD, exclusão com crypto-shredding |
| `billing` | `/billing/*` | planos, checkout Mercado Pago, webhooks assinados e idempotentes, status calculado na leitura |
| `categories` | `/categories` | árvore de 2 níveis; padrões pessoal e empresarial (`defaults.ts`) |
| `accounts` | `/accounts` | saldo = inicial + realizado; projetado até o fim do mês |
| `credit-cards` | `/credit-cards` | faturas, limite usado, pagamento integral (`card_payment`), `listInvoicesToPay` |
| `goals` | `/goals` | metas e aportes (notas cifradas) |
| `contacts` | `/contacts` | fornecedores; busca por nome ou CPF/CNPJ (índice cego) |
| `clients` | `/clients`, `/cnpj/:cnpj` | clientes, inativação, vigências, resumo (`byRegime`, `averageFee`), BrasilAPI |
| `transactions` | `/transactions` | parcelas, séries (`ensureMaterialized`), divisão por categoria, pago/juros/multa (`setPaid`) |
| `transfers` | `/transfers` | transferência/aplicação/resgate (`deriveTransferKind`) |
| `statement` | `/statement` | extrato por data efetiva com saldo corrente |
| `dashboard` | `/dashboard` | payload único: resumo, 6 meses, categorias, vencimentos (50 + totais), faturas a pagar, saúde, insights |
| `reports` | `/reports/*` | overview, categories, contacts, comparison, cashflow, delinquency |
| `fee-charges` | `/fee-charges/*` | gerar honorários da competência (vigência do fim do mês, `ON CONFLICT`) e "+ Empregados" |
| `search` | `/search` | lançamentos, contas, categorias, contatos; ordena pela distância de hoje |
| `imports` | `/imports` | OFX/CSV: prévia, duplicados, sugestão de categoria, lote com desfazer |
| `open-finance` | `/open-finance/*` | Pluggy ou provedor simulado, vínculo de contas, sync incremental, webhooks |
| `tasks` | `/tasks/*` | fase 1: departamentos (um por membro), categorias, tarefas (departamento derivado do responsável, conclusão com quem/quando, atrasada derivada), subtarefas, comentários, responsável por cliente × departamento, lista com resumo e página de início (`home.ts`); descrição e comentários cifrados (`encrypted-text.ts`, `TaskContext.cipher`); toda consulta filtra por espaço (`test/tasks-scope.test.ts`); fases 2–4 só no contrato |

### Dados, segurança e migrações

- **Tenancy:** `workspace_id` em toda tabela financeira, RLS `ENABLE + FORCE` com a política
  `workspace_id = current_setting('app.workspace_id')` (sem valor = nenhuma linha). Referências
  entre tabelas são **FKs compostas** `(workspace_id, x_id)`; todo pai tem `unique(workspace_id, id)`.
- **Papéis:** o dono das tabelas migra; `effinance_app` (NOLOGIN, sem BYPASSRLS) só tem DML nas 20
  tabelas de tenant (13 financeiras + 7 de tarefas); o login da API é membro dele e tem privilégios mínimos nas tabelas de identidade
  (`test/db-roles.ts`). Consultas comuns em tabelas financeiras fora de `withTenant` falham.
- **Criptografia por campo:** AES-256-GCM com chave por espaço (embrulhada pelo KeyProvider), AAD
  `workspace:tabela:coluna`, valor `v1.<iv>.<ct>`. Cifrados: dados pessoais de contatos (documento,
  e-mail, telefone, endereço, responsável…), notas de lançamentos/séries/metas, descrição e
  comentários de tarefas (0013), ids do Open Finance. Busca exata por índice cego (HMAC). Nomes,
  títulos de tarefas e descrições de lançamentos ficam em claro (são pesquisáveis). Campo novo
  cifrado: migração limpa `encryption_backfilled_at` e o backfill (`db/backfill.ts`) cifra o legado.
- **Migrações:** 0000 inicial · 0001 divisão · 0002 espaços · 0003 RLS · 0004 integridade de tenant ·
  0005 importação/Open Finance · 0006 tombstones · 0007 clientes e vigências · 0008 juros e multa ·
  0009 geração de honorários · 0010 vencimento por cliente e desconto por pontualidade · 0011
  tarefas (fase 1) · 0012 reforço de tarefas (só clientes, nomes na exclusão da conta, CHECKs, índices) ·
  0013 descrição e comentários de tarefas cifrados (CHECK de formato `NOT VALID` + backfill). Escritas
  para rodar duas vezes e também no PGlite.
- **Relógio:** `lib/clock.today()` respeita `EFFINANCE_TODAY` fora de produção; os testes fixam
  2026-10-20. Tarefas usam `todayIn('America/Sao_Paulo')` (o dia do escritório, não o do servidor
  UTC) e `now()`, que `EFFINANCE_NOW` fixa nos testes. Tokens, sessões e trials usam o relógio real.

## Web (`apps/web`)

### Inicialização e demo

- `main.tsx` → `Providers` (tema, QueryClient, tooltips, `AuthProvider`) → router. Normal usa
  `createBrowserRouter`; o demo usa `createHashRouter` (página estática única).
- `lib/api.ts` prefixa `/api`, manda `X-Workspace-Id`, renova a sessão uma vez em 401 (single-flight)
  e, no demo, troca o `fetch` por `demo/fetch.ts`.
- **Demo:** `demo/server.ts` abre PGlite em `idb://effinance-demo`, aplica `apps/api/drizzle/*.sql`
  (via `import.meta.glob`), configura uma chave mestre pública, roda `seedDemo` (marcador
  `SEED_VERSION`) e registra os módulos reais da API num roteador falso (`fake-fastify.ts`).
  `demo.test.ts` roda tudo isso no Node.

### Funcionalidades

| Pasta | Rota | Resumo |
|---|---|---|
| `tasks` | `/`, `/tarefas`, `/tarefas/clientes`, `/tarefas/cadastros` | Gestão de tarefas (fase 1), a página inicial de todos: Início por departamento, Tarefas (lista agrupada por prazo e quadro; filtros na URL, `url-state.ts`), Clientes em leitura com responsável por departamento, Cadastros (departamentos, categorias, equipe). `TaskSheet` abre por `?tarefa=`/`?nova=1` sobre qualquer página da Gestão (`gestao-layout.tsx`); concluir/mover com "Desfazer" (`use-task-status.ts`) |
| `dashboard` | `/financeiro` | faixa de KPIs + quadro único de widgets com posição livre (arrastar, redimensionar, "Organizar"); aba "Dashboard inteligente". Sem widgets de tarefas |
| `transactions` | `/contas-a-pagar`, `/contas-a-receber` | listas, `TransactionSheet`, ações centrais (`useTransactionActions`), confirmação com juros/multa |
| `statement` | `/extrato` | extrato diário com saldo; links vindos do fluxo de caixa |
| `accounts`, `cards`, `goals` | `/contas`, `/cartoes`, `/metas` | cadastros, faturas, aportes |
| `clients`, `contacts` | `/clientes`, `/fornecedores` | clientes (CNPJ, regime, vigências, inativação) e fornecedores |
| `reports` | `/relatorios?aba=`, `/relatorios/cliente/:id` | overview, categorias, contatos, comparação, fluxo de caixa, inadimplência; relatório financeiro de um cliente (`client-report/`) |
| `imports`, `open-finance` | (sheets) | importação OFX/CSV e conexões bancárias |
| `settings`, `auth`, `workspaces`, `billing`, `legal` | `/configuracoes`, `/login`… | perfil, segurança/MFA, membros, assinatura, privacidade |
| `fee-charges` | (em Contas a receber) | (em andamento) gerar honorários e "+ Empregados" |

### Sistema de widgets do dashboard (`features/dashboard/layout`)

- `specs.ts` define cada widget: grupo (só organiza a lista de "Personalizar"), título, tamanho
  padrão/mín./máx. (colunas × linhas de 96 px) e presets. A ordem do array é o arranjo padrão
  (primeiro espaço livre a 4 colunas, sem buracos); `catalog.tsx` liga cada id ao componente (o
  tipo `Record` quebra o build se faltar um).
- `layout.ts` (regras puras, testadas): `resolveBoard` monta o quadro de 4, 2 ou 1 coluna a partir
  de `layout.cells` (célula de cada card visível por largura; sem células, segue o padrão ou o
  quadro mais largo); `moveItem`/`resizeItem` empurram para baixo o que for coberto (1 coluna é
  lista), `nudgeItem` (setas) troca de lugar com o card no caminho, `arrange` é o "Organizar",
  `setWidgetVisible` põe card novo no primeiro espaço livre; `sanitizeLayout` limpa o que vem do
  `localStorage` e migra o formato v1 (ordem por seção + `collapsed`) para células.
- `layout-store.ts` guarda tamanhos, células, ocultos e preferências em `localStorage`
  (`effinance.dashboardLayout.v1:<espaço>:<usuário>`, objeto `v: 2`), sempre saneado na leitura
  (precisa do tipo do espaço, que define os cards visíveis por padrão).
- `widget-grid.tsx`: colunas pela largura da página (medida em `pages/dashboard.tsx`, que também
  mostra "Organizar"), cards em posição absoluta, arrastar com prévia (destino tracejado, cards
  empurrados), canto para redimensionar (selo "C × R", setas, Esc cancela), ocultar com desfazer.
- `widget-card.tsx`: `WidgetCard` (cabeçalho fixo, corpo que ocupa o resto), `FitList` (corta a
  lista pelo espaço real com "+ N"), `useWidgetResizing`. Gráficos usam `ChartBox`.
- `alerts.tsx`: ponto vermelho no card que exige atenção.

## Convenções

- UI em pt-BR, código e comentários em inglês; arquivos em kebab-case; uma pasta por feature.
- Toda consulta do backend filtra pelo espaço (`workspace_id`), com RLS como segunda barreira.
- Formulários de criação/edição em `Sheet`; telas com estados de carregando, vazio, erro e sucesso.
- Só tokens de cor (`text-muted`, `bg-surface`, `var(--app-*)`); cores de usuário passam por `useTone()`.
- Cards de indicador: número principal à direita, rótulo e linhas secundárias à esquerda.
- Antes de concluir: `pnpm typecheck && pnpm test` (API precisa de Postgres em localhost).

## Armadilhas

1. **Migrações novas e o demo em desenvolvimento:** o `import.meta.glob` das migrações só enxerga
   arquivos novos depois de reiniciar o `vite --mode demo` (a pasta da API fica fora da raiz
   observada). Sintoma: "Não foi possível conectar ao servidor." e "column … does not exist".
2. Nova tabela de tenant exige `unique(workspace_id, id)`, RLS + política, grants só de DML, índice
   para cada FK e entrada em `test/db-roles.ts`, senão o teste de catálogo falha.
3. Nome de constraint única mapeado em `UNIQUE_CONFLICTS` vira mensagem amigável: não renomeie.
4. `apps/api/src/modules` não pode importar módulos só do Node (exceto `lib/password`, trocado por
   alias no demo); migrações não podem usar `CONCURRENTLY` (PGlite).
5. `cn()` estende o tailwind-merge com `text-micro…text-kpi`; sem isso, tamanho e cor se anulam.
6. `d.overdue.count` (dashboard) exclui compras no cartão; `summary.overdueCount` de
   `/transactions` inclui cada compra de fatura vencida.
7. `getCipher` deve ser chamado antes de abrir a transação de tenant (o papel de tenant não lê
   `workspaces`; o PGlite tem uma conexão só). `inTenant` já faz isso e entrega a cifra ao callback
   (`(tx, cipher)`); no módulo de tarefas ela chega em `TaskContext.cipher`.
8. Rótulos de risco e algumas chaves de gráfico são em português (`baixo`, `critico`, `saldo`).
9. **Financeiro só para administradores** (`owner`/`editor`): módulo financeiro novo chama
   `financeOnly(app)` (`lib/finance-access.ts`) no início do plugin (depois de `tenantGuards`, se
   houver); `viewer` recebe 403 até em leituras. Dado financeiro em módulo aberto (ex.: honorários em
   `/clients`) é omitido com `canAccessFinance(req.access)`. Todo módulo novo precisa entrar em
   `FINANCE_MODULES` ou `OPEN_MODULES` de `apps/api/test/finance-access.test.ts`.
10. **Tarefas fora do `financeOnly`**: o módulo `tasks` não passa por `tenant-routes`/`tenantGuards`
    (que barram `viewer`); usa `taskGuards` + `requireTaskAdmin` por rota. Rotas estáticas
    (`/tasks/departments`…) são registradas antes de `/tasks/:id`: o roteador do demo pega o primeiro
    que casar.
11. **Drizzle não qualifica colunas num `select` de uma tabela só**: numa subconsulta correlacionada,
    escreva a coluna externa por extenso (`task_categories.id`), senão `"id"` vira o da subconsulta.

12. **Duas áreas no web**: Gestão (`/`, `/tarefas/*`, todos) e Financeiro (rotas de sempre, painel em
    `/financeiro`, só `owner`/`editor`). `areaOf` (`components/layout/nav.ts`) decide a área; as rotas
    financeiras ficam dentro do `FinanceGate` (`app/routes.tsx`), que mostra "Acesso restrito" ao
    colaborador sem montar a página. Consulta financeira montada fora dessas páginas (shell, sino, ⌘K)
    precisa de `enabled: canAccessFinance`, senão o colaborador recebe 403. Rótulos de papel na tela:
    `features/auth/roles.ts` (Proprietário, Administrador, Colaborador).

## Guia de navegação

- **Novo endpoint:** schema e tipos em `packages/shared` → `apps/api/src/modules/<x>/service.ts` e
  `routes.ts` → registrar em `src/routes.ts` → teste em `apps/api/test/` → linha em `docs/api.md`.
- **Nova coluna/tabela:** `src/db/schema.ts` → `pnpm --filter @effinance/api db:generate` →
  reescrever o SQL no padrão reexecutável → rodar API e `apps/web` `vitest run src/demo`.
- **Nova tela:** `features/<x>/api.ts` (hooks com `qk`) + `pages/` → rota em `app/routes.tsx` (financeira: dentro do `FinanceGate`) →
  item em `components/layout/nav.ts`.
- **Novo widget do dashboard:** id em `layout/types.ts` → spec em `layout/specs.ts` → componente em
  `features/dashboard/widgets/` usando `WidgetCard` → entrada em `layout/catalog.tsx`.
- **Mexer em autenticação/sessão:** `apps/api/src/lib/auth.ts`, `modules/auth/`, e no web
  `features/auth/auth-context.tsx` e `lib/api.ts`.
