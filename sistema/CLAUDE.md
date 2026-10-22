# Efficio — Sistema financeiro (base Effinance)

Sistema financeiro da empresa (pt-BR): clientes com honorários, fornecedores, contas a pagar/receber
e relatórios. Construído sobre o Effinance (pacotes `@effinance/*` mantidos). Monorepo pnpm:

- `packages/shared` — contrato: schemas Zod (`schemas.ts`), tipos de resposta (`types.ts`),
  catálogos (`constants.ts`: bancos, bandeiras, ícones, cores) e utilitários (datas, dinheiro,
  CPF/CNPJ, fatura, recorrência). **Altere o contrato primeiro.**
- `apps/api` — Fastify 5 + Drizzle + PostgreSQL. Ver `docs/api.md`.
- `apps/web` — React 19 + Vite + Tailwind v4 + TanStack Query. Ver `docs/design-system.md`.
  `--mode demo` (`src/demo/`) roda as rotas da API no navegador sobre PGlite: mantenha os módulos
  de `apps/api/src/modules` livres de imports exclusivos do Node (exceto `lib/password`, trocado por alias).

## Visão geral do código

Escritório de contabilidade: o web (React) fala com a API (Fastify) sob `/api`; cada requisição de
domínio roda numa transação com RLS do espaço (`workspace_id`) e dados pessoais cifrados por campo.
O demo roda os mesmos módulos da API no navegador sobre PGlite.

**Stack**: TypeScript, pnpm, Fastify 5, Drizzle, PostgreSQL 16 (RLS), React 19, Vite, Tailwind v4,
TanStack Query, Recharts, Zod.
**Estrutura**: `packages/shared` (contrato) → `apps/api` (módulos por domínio, migrações em
`drizzle/`) e `apps/web` (`features/<domínio>`, design system em `components/`).

Mapa detalhado (módulos, fluxo de uma requisição, armadilhas e onde mexer para cada tarefa):
[docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Agentes por função (`.claude/agents/`)

- `backend-senior` — API, banco, regras financeiras, testes de integração.
- `frontend-specialist` — telas, componentes, formulários, gráficos.
- `ui-saas-designer` — tokens, componentes e revisão visual (estilo Graniq em azul-marinho).

Segurança (auditoria + correção com teste de regressão, um por linguagem/camada):

- `security-node-api` — TypeScript/Node (Fastify): auth, sessões, MFA, tenancy, cripto, webhooks.
- `security-react-web` — TypeScript/React/HTML/CSS: XSS, CSP, tokens, redirects, estados de permissão.
- `security-postgres-sql` — SQL/PostgreSQL/Drizzle: RLS, papéis, migrações, cripto em repouso.
- `security-infra-supply-chain` — Docker/YAML/pnpm/AWS: dependências, segredos, deploy.

## Regras

- Dinheiro em centavos inteiros; datas de calendário como `YYYY-MM-DD`.
- Clientes e fornecedores são `contacts` com `kind`; cliente com lançamentos não pode ser excluído
  (só inativado). Vigências de honorários são anuais a partir do início do contrato (`feePeriod`).
  Ver `docs/api.md` → "Clientes, honorários e fornecedores".
- Toda query do backend filtra pelo espaço (`workspace_id`); o RLS é a segunda barreira. Tabelas
  financeiras só são acessíveis dentro de `withTenant`/`req.db` (o login da API não tem acesso direto).
- UI em pt-BR; código em inglês.
- Antes de concluir: `pnpm typecheck && pnpm test` (API precisa de Postgres; veja README).
- Migração nova: reinicie o `vite --mode demo`, senão o demo no navegador não a aplica.
