# Efficio — Sistema financeiro

Sistema financeiro da Efficio Contabilidade, construído sobre a base do
[Effinance](https://github.com/israelxcosta/effinance): **clientes** (empresas atendidas, com
importação dos dados da Receita Federal, regime tributário, anexo do Simples, início do contrato e
inativação com data e motivo), **honorários** por vigência anual com taxa por empregado,
**fornecedores**, contas a pagar/receber com parcelas, recorrências e lançamentos fixos, contas e
cartões, extrato, transferências e investimentos, e relatórios com insights. Visual SaaS clean
(inspirado no Graniq, em azul-marinho).

> Os pacotes continuam com o escopo `@effinance/*` e os papéis do banco com o prefixo
> `effinance_` (nomes internos herdados da base; a marca visível é Efficio).

## Stack

| Camada    | Tecnologias |
| --------- | ----------- |
| Frontend  | React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query, React Router, react-hook-form + Zod, Radix UI, Recharts, lucide |
| Backend   | Node.js 22, Fastify 5, Zod (type provider), Drizzle ORM, PostgreSQL 16 (Row Level Security), sessões com refresh token rotativo, 2FA, criptografia de envelope (AWS KMS) |
| Contrato  | `packages/shared` — schemas Zod, tipos de resposta e regras (datas, dinheiro, fatura, recorrência) usados pelos dois lados |
| Testes    | Vitest (unitários no shared, integração da API contra Postgres real) |

## Estrutura

```
apps/
  api/         Fastify + Drizzle (rotas em /api)
  web/         SPA React (Vite, porta 5173, proxy /api → 3333)
packages/
  shared/      contrato compartilhado
docs/
  api.md             endpoints e regras de negócio
  deploy-aws.md      produção na AWS (RDS, KMS, ECS, CloudFront, WAF, SES, Mercado Pago)
  design-system.md   tokens, componentes e padrões de tela
.claude/agents/      agentes por função (backend, frontend, UI designer)
```

## Rodando localmente

Pré-requisitos: Node 22.12+, pnpm 10.34.5+ (`corepack enable` usa a versão fixada em
`package.json#packageManager`), PostgreSQL 16 (ou Docker).

```bash
pnpm install

# banco (opção Docker)
docker compose up -d db

# configuração da API
cp apps/api/.env.example apps/api/.env

# migrações + dados de demonstração
pnpm db:migrate
pnpm db:seed          # demo@efficio.app / demo12345 — a empresa "Efficio Contabilidade"
                      # (único espaço da conta demo, plano Empresa ativo)

# API (3333) + Web (5173)
pnpm dev
```

Acesse http://localhost:5173.

## Ambiente de testes (sem servidor)

`pnpm --filter @effinance/web build:demo` gera em `apps/web/dist-demo` uma versão estática e completa
do sistema: as mesmas rotas e regras da API rodam no navegador sobre o PGlite (PostgreSQL em
WebAssembly). Cada navegador ganha sua própria base, salva no IndexedDB e já preenchida com os dados
de demonstração; o login vem preenchido com a conta demo e um aviso permite restaurar os dados.

O escritório "Efficio Contabilidade" (a empresa criada com a conta demo, seu único espaço) traz
honorários gerados para os 10 meses anteriores, cada cliente com seu dia de vencimento (5, 10, 15 ou
20), "+ Empregados" em alguns clientes, clientes que pagam em dia (Tecnova, Sorriso Pleno e Pão
Quente com desconto por pontualidade de 5%, 3% e 2%), clientes que atrasam (alguns pagos com juros e
multa) e um cliente com 6 meses em aberto. A competência atual fica livre para testar **Contas a
receber → Gerar honorários**. Ao mudar esses dados, aumente `SEED_VERSION` em
`apps/web/src/demo/server.ts` para que navegadores com dados antigos recriem a base.

A pasta pode ser publicada em qualquer hospedagem estática (Netlify, Vercel, GitHub Pages, S3).
Para testar localmente: `pnpm --filter @effinance/web dev:demo`.

Para produção use a API real (Node + PostgreSQL): ela é a fonte da verdade, com autenticação por
cookie httpOnly e dados no servidor.

## Scripts

| Comando           | O que faz |
| ----------------- | --------- |
| `pnpm dev`        | API e Web em modo watch |
| `pnpm typecheck`  | checagem de tipos em todos os pacotes |
| `pnpm test`       | testes (a API usa o banco `effinance_test` e conecta com o papel de privilégio mínimo `effinance_api_test`, criado pelo setup) |
| `pnpm build`      | build de produção (API em `apps/api/dist`, Web em `apps/web/dist`) |
| `pnpm --filter @effinance/web build:demo` | build estático de testes, sem servidor (`apps/web/dist-demo`) |
| `pnpm db:migrate` | aplica as migrações do Drizzle |
| `pnpm db:seed`    | cria/recria o usuário de demonstração com dados realistas |

## Funcionalidades

### Empresa (Efficio)

- **Clientes** (`/clientes`): lista com resumo (clientes ativos, soma dos honorários vigentes,
  clientes sem vigência atual e inativos), busca por razão social, fantasia ou CNPJ e filtros por
  situação e regime. Em cada linha: **consultar**, **editar**, **honorários**, **inativar/reativar**
  e **excluir** — a exclusão é bloqueada quando há qualquer lançamento vinculado ao cliente.
- **Cadastro do cliente** com **Importar da Receita** (BrasilAPI): razão social, nome fantasia,
  abertura, CNAE, e-mail, telefone, endereço, Simples/MEI e sócios (o administrador vira sugestão de
  responsável). Campos de regime tributário, anexo do Simples (quando Simples Nacional), início do
  contrato e contatos do responsável.
- **Inativação** pede a data e o motivo: transferência de contabilidade, encerramento de contrato,
  encerramento da empresa, inadimplência ou outro (com observação).
- **Honorários**: janela com o honorário vigente em destaque, a lista simples de vigências e o botão
  **+ Nova vigência**. Cada vigência dura 1 ano; a primeira começa na data de início do contrato e as
  seguintes emendam ano a ano. Cada uma tem honorário mensal, taxa por empregado e, opcionalmente,
  **desconto por pontualidade** (%): ao confirmar o recebimento até o vencimento, o desconto vira
  uma despesa paga vinculada ("Despesas financeiras › Descontos concedidos").
- **Vencimento por cliente**: cada cliente tem o dia de vencimento do honorário (padrão 10), no mês
  seguinte à competência; dia 31 em mês curto vira o último dia.
- **Fornecedores** (`/fornecedores`) com nome, CPF/CNPJ, endereço, e-mail e telefone.
- Contas a receber se vinculam ao cliente e contas a pagar ao fornecedor (seletores agrupados).
- **Somente empresarial**: o cadastro cria a empresa do usuário (nome informado ou "Minha
  empresa"), com categorias empresariais (Honorários, Pessoal, Impostos e taxas, Ocupação,
  Tecnologia, Administrativo, Marketing, Despesas financeiras...) e a conta "Caixa".

### Base financeira

1. **Categorias e subcategorias** de receitas e despesas, com ícone e cor.
2. **Contas**: corrente, poupança, carteira, benefício, investimento; saldo atual e previsto.
3. **Cartões de crédito**: banco (ícones dos principais bancos), bandeira, limite, dia de
   fechamento e vencimento; faturas por mês, limite usado/disponível e pagamento de fatura.
4. **Metas** com aportes, progresso e quanto guardar por mês até o prazo.
5. **Clientes e fornecedores** (ver acima).
6. **Extrato** diário, semanal ou mensal por conta (ou todas), com saldo inicial, saldo após cada
   lançamento e saldo previsto.
7. **Contas a pagar** e **8. contas a receber**: valor, categoria/subcategoria, vencimento,
   descrição, observação, contato, conta de pagamento, 👍 pago / 👎 pendente (padrão), recorrência
   semanal/mensal/semestral/anual, parcelamento e lançamento fixo mensal (gerado mês a mês nos
   relatórios e projeções).
9. **Transferências** entre contas, **aplicações e resgates** em contas de investimento (saldo
   investido somado à parte).
10. **Relatórios**: visão geral com insights, evolução e projeção por categoria, totais e evolução
    por contato, comparação entre períodos, fluxo de caixa realizado × previsto, saúde financeira.

## SaaS e segurança

- **Assinantes (workspaces)**: cada conta nasce com a sua empresa e pode criar outras empresas e
  convidar membros como Editor ou Leitor; a última empresa da conta não pode ser excluída (para sair
  de vez, exclua a conta). Todo dado financeiro pertence a um workspace.
- **Isolamento no banco**: PostgreSQL compartilhado com **Row Level Security** forçado nas tabelas
  financeiras. Cada requisição roda numa transação com o papel `effinance_app` e o workspace ativo
  fixado em `app.workspace_id`; mesmo uma consulta sem filtro não enxerga outro assinante. O login
  da API não tem acesso direto às tabelas financeiras (veja `docs/deploy-aws.md`).
- **Criptografia**: CPF/CNPJ, e-mail, telefone, endereço e observações de contatos, observações de
  lançamentos e metas são cifrados por campo (AES-256-GCM) com uma chave por workspace, protegida
  pelo AWS KMS em produção (`KEY_PROVIDER=aws`) ou por `ENCRYPTION_MASTER_KEY` em desenvolvimento.
  CPF/CNPJ continua pesquisável por igualdade (índice cego HMAC). Excluir um workspace destrói a
  chave. O segredo do 2FA é cifrado com a chave mestra.
- **Sessões**: access token de 15 min e refresh token rotativo (cookie `httpOnly` restrito a
  `/api/auth`) com detecção de reuso; logout, troca de senha e "encerrar sessão" revogam no
  servidor. 2FA por aplicativo autenticador com códigos de recuperação. Recuperação de senha por
  e-mail com link de uso único.
- **Proteções**: CSP restritiva e HSTS, verificação de origem e de JSON em toda escrita (CSRF),
  rate limit (Redis opcional para várias instâncias), log de auditoria sem dados pessoais.
- **Assinaturas**: Mercado Pago (assinaturas recorrentes); webhooks com assinatura HMAC verificada
  e status sempre reconsultado na API do Mercado Pago. Teste grátis de 14 dias; sem assinatura
  válida o espaço fica somente leitura (`402`). Em desenvolvimento e na demo, `BILLING_PROVIDER=fake`.
- **LGPD**: aceite dos termos no cadastro, exportação completa dos dados (JSON) e exclusão da conta
  e dos espaços.

- **Infraestrutura (AWS)**: RDS Multi-AZ cifrado com KMS, TLS obrigatório (`verify-full`) e PITR;
  login da API separado do dono do schema (migrações); chave KMS de dados com *encryption context*
  obrigatório e uso restrito às roles da aplicação; execution role ≠ task role; segredos só no
  Secrets Manager; WAF com regras gerenciadas e rate limit; CloudFront com CSP/HSTS e origem
  inacessível por fora. Passo a passo em [`docs/deploy-aws.md`](docs/deploy-aws.md).
- **Imagem da API** (`apps/api/Dockerfile`): base fixada por digest, multi-stage, só dependências
  de produção vindas do lockfile, usuário não root (`10001`), código somente leitura, `tini`, sem
  npm nem seed de demonstração, CA do RDS fixada por checksum.
- **Cadeia de suprimentos**: pnpm fixado por versão + hash, `--frozen-lockfile`, só o `esbuild`
  pode rodar script de instalação (`strictDepBuilds`), versões novas só depois de 24 h
  (`minimumReleaseAge`), bloqueio de perda de proveniência (`trustPolicy`) e de dependências
  transitivas de git/tarball (`pnpm-workspace.yaml`). O CI (`.github/workflows/ci.yml`) roda
  typecheck, testes, builds, `pnpm audit`, gitleaks no histórico inteiro e o build da imagem, com
  actions fixadas por SHA e token somente leitura.
- **Segredos**: nada versionado (`.env` ignorado; `apps/api/.env.example` só com valores de
  desenvolvimento e instruções para gerar segredos fortes). Em produção, `src/env.ts` recusa o
  provedor de cobrança `fake` e exige chave de criptografia.

> Se um `pnpm install`/`pnpm add` falhar com `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, a versão tem
> menos de 24 h. Espere ou, para um patch de segurança urgente, adicione o pacote a
> `minimumReleaseAgeExclude` no `pnpm-workspace.yaml` (revisado no PR).
