# Effinance — API

Base: `/api` (o Vite faz proxy de `/api` → `http://localhost:3333` em desenvolvimento).
Autenticação: access token JWT de 15 min no cookie httpOnly `effinance_token` (definido no
login/registro/refresh) **ou** `Authorization: Bearer <token>`; renovação com o refresh token do cookie
`effinance_refresh` em `POST /api/auth/refresh` (veja "Autenticação e sessões"). Rotas públicas:
`/api/health`, `/api/auth/{register,login,mfa/verify,refresh,logout,password/forgot,password/reset}`,
`/api/invites/:token` (prévia), `/api/billing/plans` e os webhooks do Mercado Pago e do Open Finance
(este autenticado pelo segredo no caminho). Corpos e queries são validados pelos schemas de `@effinance/shared`
(`schemas.ts`); respostas seguem `types.ts`.

Valores monetários: **centavos inteiros**. Datas: `YYYY-MM-DD`. Meses: `YYYY-MM`.
Erros: `{ error, message, details? }` com status HTTP adequado (400, 401, 402, 403, 404, 409, 415,
422, 429, 500).

| Método | Rota | Entrada | Resposta |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{ status: 'ok' }` |
| POST | `/api/auth/register` | `registerSchema` (`companyName` opcional) | `AuthResponse` (201) — cria a empresa (`business`, "Minha empresa" se em branco) com categorias empresariais e a conta "Caixa" |
| POST | `/api/auth/login` | `loginSchema` | `AuthResponse` |
| POST | `/api/auth/logout` | — | 204 |
| GET | `/api/auth/me` | — | `MeResponse` (usuário com `photoUpdatedAt` + workspace ativo com `permissions` efetivas + lista) |
| PUT | `/api/auth/me` | `updateProfileSchema` | `MeUser` |
| GET | `/api/categories` | `categoryQuerySchema` | `CategoryWithChildren[]` |
| POST | `/api/categories` | `categoryInputSchema` | `Category` (201) |
| PUT | `/api/categories/:id` | `categoryUpdateSchema` | `Category` |
| DELETE | `/api/categories/:id` | — | 204 (409 se houver lançamentos → arquivar) |
| GET | `/api/accounts` | `accountQuerySchema` | `Account[]` |
| GET | `/api/accounts/:id` | — | `Account` |
| POST | `/api/accounts` | `accountInputSchema` | `Account` (201) |
| PUT | `/api/accounts/:id` | `accountInputSchema` | `Account` |
| DELETE | `/api/accounts/:id` | — | 204 (409 se houver lançamentos → arquivar) |
| GET | `/api/credit-cards` | `accountQuerySchema` | `CreditCard[]` |
| POST | `/api/credit-cards` | `creditCardInputSchema` | `CreditCard` (201) |
| PUT | `/api/credit-cards/:id` | `creditCardInputSchema` | `CreditCard` |
| DELETE | `/api/credit-cards/:id` | — | 204 (409 se houver lançamentos) |
| GET | `/api/credit-cards/:id/invoices?from=YYYY-MM&to=YYYY-MM` | — | `InvoiceSummary[]` |
| GET | `/api/credit-cards/:id/invoices/:month` | — | `Invoice` |
| POST | `/api/credit-cards/:id/invoices/:month/pay` | `payInvoiceSchema` | `Invoice` |
| GET | `/api/goals` | — | `Goal[]` |
| POST | `/api/goals` | `goalInputSchema` | `Goal` (201) |
| PUT | `/api/goals/:id` | `goalInputSchema` | `Goal` |
| DELETE | `/api/goals/:id` | — | 204 |
| GET | `/api/goals/:id/contributions` | — | `GoalContribution[]` |
| POST | `/api/goals/:id/contributions` | `goalContributionInputSchema` | `GoalContribution` (201) |
| DELETE | `/api/goals/:id/contributions/:contributionId` | — | 204 |
| GET | `/api/contacts` | `contactQuerySchema` (`kind`: `client` \| `supplier`; sem `kind` = ambos, para seletores) | `Paginated<Contact>` |
| GET | `/api/contacts/:id` | — | `Contact` (só fornecedores) |
| POST | `/api/contacts` | `contactInputSchema` | `Contact` (201) — cria um fornecedor |
| PUT | `/api/contacts/:id` | `contactInputSchema` | `Contact` (só fornecedores; cliente → 404) |
| DELETE | `/api/contacts/:id` | — | 204 (lançamentos ficam sem fornecedor; séries deixam de apontar para ele) |
| GET | `/api/clients` | `clientQuerySchema` (`search`, `status`: `active` \| `inactive` \| `all`, `taxRegime`) | `ClientListResponse` (página + `summary`; sem honorários para `viewer`) |
| GET | `/api/clients/:id` | — | `Client` |
| POST | `/api/clients` | `clientInputSchema` (inclui `feeDueDay` 1–31, padrão 10) | `Client` (201); 409 se o CNPJ já é cliente |
| PUT | `/api/clients/:id` | `clientInputSchema` | `Client` (o novo `feeDueDay` vale para os próximos honorários gerados) |
| DELETE | `/api/clients/:id` | — | 204; **409 se há lançamentos ou séries vinculados** |
| POST | `/api/clients/:id/inactivate` | `clientInactivationSchema` (`date`, `reason`, `notes`) | `Client`; 409 se já inativo |
| POST | `/api/clients/:id/reactivate` | — | `Client` |
| GET | `/api/clients/:id/fees` | — | `ClientFeesResponse` (`current`, `items` mais recente primeiro, `next`) — permissão `finance` (`403` sem ela, como as escritas de vigência) |
| POST | `/api/clients/:id/fees` | `clientFeeInputSchema` (`amount`, `employeeFee`, `discountBps` 0–9999, padrão 0) | `ClientFee` (201) — próxima vigência |
| PUT | `/api/clients/:id/fees/:feeId` | `clientFeeInputSchema` | `ClientFee` |
| DELETE | `/api/clients/:id/fees/:feeId` | — | 204; 422 se não for a vigência mais recente |
| GET | `/api/cnpj/:cnpj` | `cnpjParamsSchema` (14 dígitos válidos) | `CnpjLookupResult`; 404 não encontrado, 502 Receita indisponível, 503 desabilitado — quem cadastra: `finance`, `registry` ou `office` (fase 3; 403 sem nenhuma) |
| GET | `/api/transactions` | `transactionQuerySchema` (inclui `origin`: `manual` \| `file` \| `open_finance`) | `TransactionListResponse` |
| GET | `/api/transactions/:id` | — | `Transaction` |
| POST | `/api/transactions` | `transactionInputSchema` | `Transaction[]` (201) — todas as ocorrências criadas (e todas as partes, se dividido) |
| PUT | `/api/transactions/:id?scope=one\|future\|all` | `transactionUpdateSchema` | `Transaction` |
| PATCH | `/api/transactions/:id/paid` | `setPaidSchema` (`paid`, `paidAt`, `accountId`, `interest`, `fine`, `discount`) | `Transaction` — juros, multa e desconto viram lançamentos vinculados (veja "Juros e multa" e "Desconto por pontualidade") |
| DELETE | `/api/transactions/:id?scope=one\|future\|all` | — | 204 |
| POST | `/api/transactions/:id/anticipate` | `anticipateInstallmentsSchema` | `Transaction[]` — parcelas antecipadas |
| POST | `/api/fee-charges/generate` | `generateFeesSchema` (`competence`, `dryRun`) | `GenerateFeesResponse` (201 se criou algo; 200 na simulação ou sem novidades) — cada item com `dueDate` (dia do cliente) e `discountBps` |
| POST | `/api/fee-charges/:id/employees` | `feeEmployeesSchema` (`employees`, `dryRun`) | `FeeEmployeesResponse`; 422 se não for honorário gerado, sem taxa por empregado ou já recebido |
| GET | `/api/transfers` | `transferQuerySchema` | `Paginated<Transaction>` |
| POST | `/api/transfers` | `transferInputSchema` | `Transaction` (201) — `transferKind` derivado (aplicação/resgate) |
| PUT | `/api/transfers/:id` | `transferInputSchema` | `Transaction` |
| DELETE | `/api/transfers/:id` | — | 204 |
| GET | `/api/statement` | `statementQuerySchema` | `StatementResponse` |
| GET | `/api/dashboard?month=YYYY-MM` | `dashboardQuerySchema` | `DashboardResponse` |
| GET | `/api/reports/overview` | `overviewReportQuerySchema` | `OverviewReportResponse` |
| GET | `/api/reports/categories` | `categoryReportQuerySchema` | `CategoryReportResponse` |
| GET | `/api/reports/contacts` | `contactReportQuerySchema` | `ContactReportResponse` |
| GET | `/api/reports/comparison` | `comparisonReportQuerySchema` | `ComparisonReportResponse` |
| GET | `/api/reports/cashflow` | `cashflowReportQuerySchema` | `CashflowReportResponse` |
| GET | `/api/reports/delinquency?months=3..24` | `delinquencyReportQuerySchema` (padrão 12) | `DelinquencyReportResponse` — veja "Relatório de inadimplência" |
| GET | `/api/reports/evolution?months=1..36` | `evolutionReportQuerySchema` (padrão 12) | `EvolutionReportResponse` — veja "Evolução da base de clientes" |
| GET | `/api/reports/clients/:id/rework` | — | `ClientReworkResponse` — retrabalho do cliente (veja "Retrabalho"); 404 fora do espaço ou se não for cliente |
| GET | `/api/search?q=` | `searchQuerySchema` | `SearchResponse` — descrição, nomes e CPF/CNPJ exato; sem `finance`, só clientes em `contacts` (listas financeiras vazias); `tasks`, `recurringTasks` e `unions` (fase 3) para todos; acessos de clientes nunca |

## Regras de negócio

- **Saldo da conta** = saldo inicial + receitas pagas − despesas pagas ± transferências pagas
  (data efetiva = `paidAt` quando pago, senão `date`). Compras no cartão **não** afetam contas; o
  pagamento da fatura é uma transferência `card_payment` que sai da conta.
- **Saldo em contas** soma contas não-investimento com `includeInTotal`; **investimentos** somam à
  parte. Transferir para conta de investimento = `investment` (aplicação); o inverso = `redemption`.
- **Parcelado**: N lançamentos criados de uma vez (`installmentNumber/Total`); com
  `installmentAmountMode = total` o valor é dividido e os centavos restantes vão para a 1ª parcela.
- **Antecipação de parcelas** (`count` opcional, padrão todas; `date` opcional, padrão hoje): move as
  últimas `count` parcelas pendentes posteriores a esta para `date`. No cartão, entram na fatura que
  recebe compras feitas nessa data (a fatura aberta atual). Só para `installment`; 422 se não houver
  parcelas futuras pendentes.
- **Recorrente**: frequência semanal/mensal/semestral/anual, com quantidade definida (`recurring`).
  Sem quantidade (vazio ou 0 na interface) vira `fixed`.
- **Divisão por categoria** (`splits`, 2–10 partes): o valor é distribuído entre categorias e a soma
  das partes deve ser igual ao total. Cria uma transação (ou série) por parte, com os mesmos dados
  (data, conta, status, repetição) e um `splitGroupId` em comum; relatórios por categoria somam cada
  parte na sua categoria. Cada parte pode ser editada ou excluída individualmente.
- **Fixa** (`fixed`): série sem fim na frequência escolhida (mensal por padrão). Séries sem fim são
  materializadas sob demanda até o fim do
  período consultado (mínimo hoje + 12 meses; teto hoje + 5 anos), então aparecem em extratos,
  relatórios e projeções de qualquer mês.
- **Escopo de edição/exclusão** em séries: `one` (só esta), `future` (esta e as próximas), `all`.
  Edição: ocorrências já pagas não são alteradas por `future`/`all`. Exclusão: `future` remove esta e
  as próximas pendentes e encerra a série (anteriores ficam no histórico); `all` remove a série
  inteira, inclusive as pagas.
- **Vencido**: pendente com data anterior a hoje; compras no cartão só vencem quando a fatura
  delas vence (não pela data da compra).
- **Fatura**: identificada pelo mês de vencimento. Compra entra na primeira fatura cujo fechamento é
  posterior à data da compra. Pagar a fatura marca as compras como pagas e cria a transferência.
- **Dashboard** (`GET /dashboard`): `upcoming` traz até 50 pendentes (vencidos e próximos 15 dias,
  sem compras no cartão, mais antigos primeiro) e `upcomingTotals` conta e soma todos eles por tipo
  (a lista é cortada, os totais não). `overdue` são despesas vencidas fora do cartão. `invoicesToPay`
  lista as faturas de cartão fechadas ou vencidas ainda em aberto (até 3 meses antes da atual),
  pelo vencimento mais antigo.
- **Relatórios por competência** (categorias, contatos, comparação, visão geral) usam `date` e
  incluem compras no cartão; **fluxo de caixa** usa a data efetiva e só movimentos de contas, com
  faturas pendentes projetadas no vencimento.

## Juros e multa

- Confirmar um lançamento depois do vencimento (`PATCH /transactions/:id/paid` com `paid: true` e
  `paidAt > date`) aceita `interest` (juros) e `fine` (multa) em centavos. Cada valor > 0 vira um
  lançamento **pago** próprio, do mesmo tipo, conta (a do pagamento), contato e categoria, datado no
  pagamento, com `lateFeeOf` = o original e `lateFeeKind` = `interest` | `fine`, descrição
  "Juros — …" / "Multa — …". Saldos, extratos e relatórios não precisam de regra nova: são receitas
  (ou despesas) comuns. O original expõe a soma em `lateFees: { interest, fine }` (`null` sem nenhum).
  Sugestão da interface (`suggestLateFees` no contrato): multa de 2% + juros de 1% a.m. pro rata.
- Enviar `interest` ou `fine` de novo **substitui** o par (o ausente vale 0; os dois 0 removem).
  Confirmar de novo **sem** enviar move os vinculados para a nova data/conta; se a nova data não é
  depois do vencimento, eles são removidos. O mesmo vale para a edição (`PUT`): reabrir, pagar em dia
  ou mover para o cartão remove; mudar data de pagamento, conta, contato ou categoria acompanha.
- 422: juros/multa com `paid: false`, pagamento até o vencimento, transferência, compra no cartão ou
  lançamento que já é de juros/multa. Um lançamento de juros/multa não é reaberto sozinho (422 —
  reabra o original ou exclua-o). Excluir o original (qualquer escopo de série) leva os vinculados
  (FK em cascata).

## Desconto por pontualidade

- A vigência do honorário pode oferecer desconto para pagamento até o vencimento
  (`client_fees.discount_bps`, pontos-base: 500 = 5%; 0 = nenhum). "Gerar honorários" copia o valor
  para cada honorário gerado (`Transaction.feeDiscountBps`, `null` sem desconto); a cobrança de
  empregados não tem desconto. Utilitários do contrato: `discountAmount(amount, bps)`,
  `earnsDiscount(dueDate, paidAt)` e `formatBps(bps)`.
- Confirmar uma **receita** até o vencimento (`PATCH /transactions/:id/paid` com `paid: true` e
  `paidAt <= date`) aceita `discount` (centavos, até o valor do lançamento). O desconto vira uma
  **despesa paga** própria vinculada ao recebível (`discountOf` = o recebível), descrição
  "Desconto — <descrição>", mesma conta (a do pagamento), contato e forma de pagamento, datada no
  pagamento, categoria **Despesas financeiras / Descontos concedidos** (procurada pelo nome sem
  diferenciar maiúsculas e criada quando falta; espaços empresariais já nascem com ela). O recebível
  expõe o valor em `discount` (`null` sem desconto). Saldo, extrato e relatórios ficam certos sem
  regra nova: entra o valor cheio e sai o desconto.
- Enviar `discount` de novo **substitui**; `0` remove. Sem enviar, o desconto acompanha o pagamento
  como juros/multa: reabrir, re-datar o pagamento para depois do vencimento (ou antecipar o
  vencimento para antes do pagamento) ou mover para o cartão remove; mudar data de pagamento, conta
  ou contato acompanha. Um por recebível (índice único parcial).
- 422 (mensagens em pt-BR): desconto com `paid: false`; em despesa, transferência, compra no cartão
  ou lançamento de juros/multa ("vale só para contas a receber"); recebimento depois do vencimento;
  valor maior que o lançamento; junto com juros/multa > 0. A linha de desconto não é reaberta
  sozinha nem recebe juros/multa/desconto (422 — reabra o original ou exclua-a). Excluir o recebível
  leva o desconto (FK em cascata).

## Relatório de inadimplência

`GET /reports/delinquency?months=N` (3–24, padrão 12): período = do dia 1 do mês `hoje − (N−1)`
até hoje (`from`, `to`). **Recebíveis** = receitas vinculadas a um cliente (`contacts.kind =
'client'`), fora do cartão, sem os lançamentos de juros/multa. Entram no período os recebíveis com
vencimento no período que estão pagos ou já venceram (vencendo hoje ainda não é atraso); os
**em aberto vencidos** entram sempre, mesmo antes do período.

- **Dias de atraso**: pago → `paidAt − date`; em aberto → `hoje − date` (nunca negativo).
  **Atrasado** = dias > 0.
- Por cliente (`clients`, mais valor em aberto primeiro, depois pior score e nome): `dueCount`,
  `onTimeCount`, `lateCount` (do período), `openCount`/`openAmount` (em aberto vencidos, qualquer
  data), `avgDaysLate` (média dos atrasados, 1 casa; `null` sem atraso), `maxDaysLate`,
  `interestCount`/`fineCount` e `interestTotal`/`fineTotal` (pagamentos do período com juros/multa),
  `overdue` (em aberto vencidos, mais antigo primeiro: `id`, `description`, `date`, `amount`,
  `daysLate`, `competence` dos honorários gerados) e dados para a cobrança (`name`, `tradeName`,
  `document`, `responsibleName`, `phone` = do responsável, senão da empresa, `status`).
- `monthly`: por mês de vencimento, `dueCount`, `lateCount`, `lateRate`, `avgDaysLate`,
  `dueAmount`, `lateAmount`. `summary`: os mesmos totais do período, `openCount`/`openAmount`/
  `openClients`, `interestTotal`/`fineTotal`, `paidWithFeesCount`, `probability` (média das
  probabilidades ponderada por `dueCount`) e `clientsAtRisk` (risco `alto` ou `critico`).
- **Score v2 de pagamento** (`delinquencyScore` em `packages/shared/src/utils/delinquency.ts`, testado
  no contrato com os valores da spec `docs/projeto-melhorias-dashboards.md` §5.2): sempre sobre os
  recebíveis dos **últimos 12 meses** (`SCORE_WINDOW_MONTHS`, mais os em aberto vencidos), qualquer que
  seja `months` (a consulta busca `max(months, 12)` meses; contagens, `monthly` e `summary` continuam no
  período). Peso `w = 0,5^(meses atrás / 6)`; gravidade `lateSeverity(d)` = 0 no prazo · 0,25 (1–5 dias)
  · 0,5 (6–15) · 0,75 (16–30) · 1 (> 30). `probability = (Σ w·[atrasou] + 1) / (Σ w + 5)` (a chance de
  atrasar, qualquer atraso igual; sem histórico = 20%). `punctuality = 1000 × (1 − (Σ w·g + 1) / (Σ w +
  5))` (sem histórico = 800). `openPenalty = min(250, 50 × em aberto vencidos)`. `paymentScore =
  punctuality − openPenalty`, arredondado, 0..1000. `lowHistory` = menos de 3 recebíveis na janela.
- **Score do cliente** (`clientScore` em `packages/shared/src/utils/rework.ts`, o mesmo para API e web):
  `score = punctuality − openPenalty − reworkPenalty`, arredondado e limitado a 0..1000, com a
  penalidade de retrabalho (veja "Retrabalho": 40 pontos por retrabalho nos últimos 90 dias + 10 por
  retrabalho entre 90 dias e 12 meses, no máximo 200). Faixas (`riskOf`, sobre o `score` final): ≥ 800
  `baixo` ("Baixo risco"), ≥ 600 `moderado`, ≥ 400 `alto`, abaixo `critico`. Cada linha traz
  `punctuality`, `openPenalty`, `paymentScore`, `reworkPenalty` e `rework` (`ClientRework`: contagens e
  as 5 últimas tarefas de retrabalho dos 12 meses). Um cliente com linhas só na janela do score (nada
  vencido nem em aberto no período) não é listado.
- `monthly` também quebra cada mês em `onTimeCount`/`paidLateCount`/`openLateCount` (pago até o
  vencimento · pago depois · vencido em aberto; somam `dueCount`), os três valores, `paidLateAvgDays`
  (média dos pagos com atraso, 1 casa) e `partial` (mês corrente). `summary.reworkCount` (retrabalhos
  em 90 dias dos clientes do relatório) e `summary.reworkClients` (quantos têm algum).
- **Relatório do cliente** (web, `/relatorios/cliente/:id`, botão em cada linha; `?meses=` só para o
  link de volta à inadimplência): lê todos os lançamentos de receita do cliente em
  `GET /transactions?contactId=&type=income` (páginas de 200) e calcula no navegador
  (`features/reports/client-report/client-report.ts`, testado) o histórico, pontualidade, faixas de
  atraso, mapa de pagamentos, ano a ano e o score da linha (`periodScore`). O retrabalho do cliente
  vem ao lado do histórico, em `GET /reports/clients/:id/rework` (carrega com a página, chave
  `['reports', 'client-rework', …]`); para o score bater com a linha, `periodScore` usa sempre a
  janela fixa de 12 meses (`SCORE_WINDOW_MONTHS`) e passa as contagens a `clientScore`. Salvar ou
  excluir uma categoria de tarefa invalida `['reports']` (o "Conta como retrabalho" muda o score).
- Consultas: um SELECT com junção em `contacts` e a soma dos juros/multa de cada linha por
  subconsulta correlacionada (índice parcial em `late_fee_of`) — sem listas de ids, que estourariam
  o limite de parâmetros num escritório grande; os dados de contato vêm decifrados em lotes.

## Evolução da base de clientes

`GET /reports/evolution?months=N` (1–36, padrão 12; só `finance`): os últimos N meses, o atual incluído,
no fuso do escritório (`America/Sao_Paulo`: o "hoje" é `todayIn`). Valores em centavos. Cada mês
(`EvolutionMonth`, o mais antigo primeiro) conta até `asOf` = último dia do mês, ou hoje no mês atual
(`partial: true`):

- `newClients`: clientes com **início de contrato** (`contractStartDate`) no mês, até `asOf` (contrato
  que começa depois de hoje espera o dia). `newList` (por nome: `id`, `name` = nome fantasia, senão a
  razão social, `fee` = honorário com que entra na base do `asOf`, 0 sem vigência ou se já saiu).
- `churnedClients`: clientes com **data de inativação** (`inactivatedAt`) no mês, até `asOf`;
  `churnedList` (por nome, com `reason` = `inactivationReason` e `fee` = o honorário que tinham no fim do
  mês anterior). Ponte do honorário: `anterior + Σ newList.fee − Σ churnedList.fee + reajustes =
  recurringFees` (reajustes = vigência nova, cliente que ganhou ou perdeu vigência). A data
  sempre existe para um inativo (`contacts_inactivation_chk`: inativo ⇔ data e motivo). Limite: a
  reativação apaga a data (não há histórico de inativações), então quem saiu e voltou aparece como
  ativo desde o início do contrato.
- `activeClients`: base no `asOf` — contrato iniciado e não inativado até esse dia (inativado no dia
  já não conta). Assim a base sempre anda pela variação: `activeClients = anterior + netChange`.
- `netChange = newClients − churnedClients`.
- `recurringFees`: soma do honorário mensal (`client_fees.amount`, sem taxa por empregado e sem
  desconto) da vigência que contém o `asOf` (`feePeriodIndexAt`; 29/02 cai em 28/02), só da base
  ativa; `clientsWithFee` = ativos com essa vigência cadastrada (renovação pendente fica na base e
  fora dos honorários); `averageFee` (ticket médio) = `round(recurringFees / clientsWithFee)`, 0 sem
  nenhum (a mesma regra de `summary.averageFee` em `/clients`).
- `billed` (faturado): recebíveis de clientes (receitas com `contacts.kind = 'client'`, fora do cartão,
  sem as linhas de juros/multa) com **vencimento** no mês, pagos ou não.
- `received` (recebido): pelo **dia do pagamento** (`coalesce(paidAt, date)`) no mês — receitas pagas de
  clientes (recebíveis e suas linhas de juros/multa) menos os descontos por pontualidade concedidos
  (despesas pagas com `discountOf`): o que entrou de fato.

`comparison` (`EvolutionComparison`): o mês atual contra o anterior em cada métrica de
`EVOLUTION_METRICS` (rótulos em `EVOLUTION_METRIC_LABELS`: "Clientes ativos", "Honorário mensal
recorrente", "Ticket médio"…): `current`, `previous`, `diff` e `diffPercent`
= `diff / |previous|` (0,25 = +25%; `null` quando o anterior é 0). O mês anterior é calculado mesmo com
`months = 1`. O mês atual é parcial (recebido até hoje; faturado do mês inteiro). Regras puras e testadas
em `packages/shared/src/utils/evolution.ts` (`clientBaseEvolution`, `evolutionChange`,
`evolutionComparison`); a API lê os clientes e as vigências do espaço (uma linha por cliente e por ano de
contrato) e soma faturado/recebido em SQL (`GROUP BY` mês). Antes, materializa as séries sem fim até o
fim do mês atual, como os demais relatórios.

## Retrabalho

Categoria de tarefa com `isRework: true` (migração 0020; cadastro e edição com `registry`, como as demais
categorias). No `POST`/`PUT /tasks/categories`, `isRework` é opcional: ausente na criação = `false`;
ausente na edição mantém o valor gravado (formulários antigos não apagam a marca).

- **Retrabalho de um cliente** = tarefas com o cliente numa categoria de retrabalho, contadas pelo **dia
  em que foram abertas** (`created_at` no fuso `America/Sao_Paulo`). Não contam tarefas canceladas
  (abertas por engano), internas (sem cliente) nem ocorrências de recorrentes (geradas, não são
  incidentes — inclusive a "recorrência em qualquer tarefa").
- **Janelas** (`reworkWindows(hoje)`, hoje incluído): `last90Days` = abertas a partir de `hoje − 89`;
  `last12Months` = a partir de `hoje − 12 meses + 1 dia` (inclui as dos 90 dias).
- **Penalidade** (`reworkPenalty`): `min(200, 40 × last90Days + 10 × (last12Months − last90Days))`, na
  escala 0..1000 do score (spec §6.2: 3 retrabalhos em 90 dias levam um cliente pontual de 916 a 796).
  Os pesos são decisão de produto e podem ser ajustados pelo usuário/escritório em
  `packages/shared/src/utils/rework.ts` (`REWORK_PENALTY_RECENT`, `REWORK_PENALTY_OLDER`,
  `REWORK_PENALTY_MAX`) — a mesma regra vale para API e web.
- `ClientRework` = contagens + `latest` (até 5, mais recente primeiro: `id`, `title`, `date` de abertura,
  `status`, `dueDate`, `category`). `title` é `null` para quem não pode ler tarefas (`clientRework(…,
  canReadTasks)`); hoje nenhuma chave de permissão restringe a leitura de tarefas (todo membro as lê),
  então a rota sempre manda o título — quando existir uma chave assim, é ela que a rota passa. Vai em cada linha do relatório de inadimplência e em
  `GET /reports/clients/:id/rework` (`ClientReworkResponse`: `contactId`, `today`, `windows`, `penalty`,
  `rework`), que o relatório do cliente lê ao lado do histórico (`/transactions`).
- Consultas (`modules/reports/rework.ts`): contagens por `GROUP BY` e as últimas por `row_number()` por
  cliente, sempre com `workspace_id` (teste de escopo em `test/reports-scope.test.ts`); usa o índice
  `tasks_category_idx`.

## Gerar honorários e "+ Empregados"

- **Competência** `M` (`YYYY-MM`): o honorário de `M` vence no **dia de vencimento do cliente**
  (`feeDueDay`, padrão 10; dia 31 em mês curto vira o último dia) de `M+1` — o que vence em 10/11 é
  de 10/2026. `POST /fee-charges/generate` percorre os clientes por nome de exibição (fantasia, senão
  razão social) e cria, para cada um, uma receita a receber: valor = `amount` da vigência que contém
  o **último dia de `M`**; sem conta, boleto, "Honorários ref. MM/AAAA - <cliente>", categoria
  **Serviços Prestados / Honorários contábeis**, `feeKind: 'fee'`, `feeCompetence: M` e
  `feeDiscountBps` = desconto da vigência (`null` se 0). A resposta não tem mais um `dueDate` geral:
  cada item de `created` traz `dueDate` e `discountBps`. Mudar o `feeDueDay` do cliente vale para as
  próximas gerações (os honorários já gerados mantêm a data).
- Fica de fora, com motivo (`skipped`): `already_generated` (já existe o honorário do cliente em
  `M`), `not_started` (contrato começa depois do fim de `M`), `inactive` (inativado antes do dia 1º
  de `M`; inativado durante `M` ainda é cobrado), `no_current_fee` (sem vigência cadastrada para
  `M`, ex.: reajuste pendente). `dryRun: true` calcula sem gravar nada (nem categorias;
  `transactionId: null`). Um `dueDay` antigo no corpo é ignorado.
- Concorrência: as escritas de honorários do espaço são serializadas por um advisory lock da
  transação e o insert usa `ON CONFLICT DO NOTHING` no índice único `(workspace_id, contact_id,
  fee_competence) WHERE fee_kind = 'fee'` — quem perde a corrida volta como `already_generated`.
  Editar um honorário para outro cliente que já tem o da competência dá 409.
- **Categorias**: "Serviços Prestados" (receita) e as subcategorias "Honorários contábeis" e "Folha
  de pagamento" são procuradas pelo nome sem diferenciar maiúsculas (uma ativa primeiro) e criadas
  quando faltam. Espaços empresariais já nascem com elas (+ "13º honorário" e "Serviços avulsos").
- **+ Empregados** (`POST /fee-charges/:id/employees`, `:id` = honorário gerado): `amount =
  employees × employeeFee` da mesma vigência usada na competência; cria (ou substitui) uma receita
  "Folha de pagamento ref. MM/AAAA - <cliente> (N empregados)" com o vencimento, cliente e
  competência do honorário, categoria **Serviços Prestados / Folha de pagamento**, `feeKind:
  'employees'`, `feeOf` = o honorário, `employees` = N. `employees: 0` remove. 422: `:id` não é
  honorário gerado, taxa por empregado 0 ("Cadastre a taxa por empregado no honorário do cliente"),
  sem vigência na competência, ou cobrança já recebida (alterar/remover; reenviar o mesmo N é aceito).
  `dryRun` devolve só `rate` e `amount`. Mudar o vencimento ou o cliente do honorário leva junto a
  cobrança de empregados em aberto; excluir o honorário a exclui (cascata).

## Clientes, honorários e fornecedores

- **Contatos** têm `kind`: `supplier` (fornecedor, `/contacts`) ou `client` (empresa atendida,
  `/clients`). Os dois aparecem nos seletores de lançamentos (`contactId`), então contas a receber se
  vinculam ao cliente e contas a pagar ao fornecedor; relatórios por contato valem para ambos.
- **Cliente** = empresa: CNPJ obrigatório e único por espaço (índice cego, índice único parcial),
  razão social, nome fantasia, abertura, CNAE, contatos da empresa e do **responsável** (nome, e-mail
  e telefone cifrados), **regime tributário** (Simples Nacional, MEI, Lucro Presumido, Lucro Real,
  Imune/Isenta, Outro), **anexo do Simples** (I–V, obrigatório só no Simples; descartado nos demais)
  e **data de início do contrato** (obrigatória), e o **dia de vencimento do honorário**
  (`feeDueDay`, 1–31, padrão 10; no mês seguinte à competência).
- **Importar da Receita** (`GET /cnpj/:cnpj`): consulta a BrasilAPI (dados públicos da Receita
  Federal) **fora** da transação do banco e devolve os dados normalizados para o formulário — nada é
  gravado. A Receita só informa as opções pelo Simples/MEI; Presumido/Real e o anexo são escolhidos
  pelo usuário. O sócio administrador vira sugestão de responsável. `CNPJ_PROVIDER`: `brasilapi`
  (padrão), `fake` (testes; recusado em produção) ou `disabled`. No build demo o navegador chama a
  BrasilAPI direto (CSP do demo libera `connect-src https://brasilapi.com.br`).
- **Inativação**: pede data (≥ início do contrato) e motivo — transferência de contabilidade,
  encerramento de contrato, encerramento da empresa, inadimplência ou outro (este exige
  observação, cifrada). Reativar limpa os três campos. Depois da data de inativação não há honorário
  vigente nem nova vigência.
- **Exclusão** só sem vínculos: com qualquer lançamento (`transactions.contact_id`) ou série
  (`recurrences.template.contactId`) do cliente a API responde 409 — use a inativação. Tarefas do
  cliente também impedem (409 "possui tarefas vinculadas"; FK sem cascata). As vigências e os
  ocorrências de recorrentes dependem dele (a exclusão é recusada com tarefas).
- **Honorários** (`client_fees`): uma linha por **vigência de 1 ano**, com honorário mensal, taxa
  por empregado (centavos) e desconto por pontualidade (`discountBps`, pontos-base; veja "Desconto
  por pontualidade"). Só o índice da vigência é gravado; as datas derivam do início do
  contrato (`feePeriod` no contrato: a 1ª começa no início do contrato, as seguintes emendam ano a
  ano; 29/02 vira 28/02 nos anos não bissextos). Alterar o início do contrato reposiciona todas. "+"
  cria sempre a próxima vigência; só a mais recente pode ser excluída. **Vigente** = a vigência que
  contém hoje; sem ela (nova ou vencida) o cliente entra em `summary.withoutCurrentFee`
  ("reajuste pendente" na tela).
- **Resumo da lista** (`GET /clients` → `summary`, sempre do espaço inteiro, independente dos
  filtros): `active`, `inactive`, `monthlyFees` (soma dos honorários vigentes), `withoutCurrentFee`,
  `byRegime` (clientes **ativos** por regime tributário, todos os regimes presentes, zero quando não
  há) e `averageFee` (= `monthlyFees` ÷ ativos **com** honorário vigente, arredondado; 0 sem nenhum).
- **Honorários são financeiros**: `/clients/:id/fees*` responde `403` a `viewer`, e para ele
  `currentFee`/`latestFee` e os totais `monthlyFees`/`withoutCurrentFee`/`averageFee` vêm `null`
  (veja "Permissões e assinatura").

---

# SaaS: workspaces, segurança e assinaturas

Contrato em `packages/shared/src/saas.ts`.

## Modelo de isolamento

- **Workspace = assinante (tenant).** Todo dado financeiro (categorias, contas, cartões, metas e
  aportes, contatos, séries e lançamentos) pertence a um workspace (`workspace_id`). **Somente
  empresarial**: o cadastro cria a empresa do usuário (`kind: 'business'`, nome `companyName` ou
  "Minha empresa", categorias empresariais e a conta "Caixa"), e `POST /workspaces` cria empresas
  (`kind` padrão `business`; `family` ainda é aceito por compatibilidade). Espaços `personal` e
  `family` antigos continuam funcionando. Um usuário pode participar de vários workspaces com papel
  `owner`, `editor` ou `viewer`; a sessão abre no último usado, senão no mais antigo do qual é
  proprietário.
- **Row Level Security (PostgreSQL)**: as tabelas de domínio têm `ENABLE` + `FORCE ROW LEVEL
  SECURITY` com a política `workspace_id = current_setting('app.workspace_id')::uuid`. Cada
  requisição autenticada roda numa transação que executa `SET LOCAL ROLE effinance_app` (papel sem
  `BYPASSRLS`, nunca dono das tabelas) e `set_config('app.workspace_id', <ativo>, true)`. Um bug que
  esqueça o filtro na aplicação não vaza dados de outro assinante. Os filtros explícitos continuam
  (defesa em profundidade).
- **Criptografia de envelope**: cada workspace tem uma chave de dados (AES-256) própria, gerada e
  protegida pelo AWS KMS (`KEY_PROVIDER=aws`; em desenvolvimento, `local` com
  `ENCRYPTION_MASTER_KEY`). Campos sensíveis são gravados cifrados com AES-256-GCM (AAD =
  workspace + tabela + coluna): contatos (CPF/CNPJ, e-mail, telefone, endereço completo,
  observações), observações de lançamentos e metas, descrição e comentários de tarefas (0013),
  descrições de recorrentes, etapas e modelos, motivos do histórico, anotações pessoais, nomes e
  conteúdo dos anexos (0014), segredo TOTP do usuário (chave mestra). CPF/CNPJ
  tem índice cego (HMAC) para busca exata. Excluir o workspace apaga a chave (crypto-shredding).
- **Em trânsito e em repouso**: TLS obrigatório (`DATABASE_SSL=verify-full` com o CA do RDS);
  RDS com armazenamento e snapshots criptografados pelo KMS e backups com PITR.

## Autenticação e sessões

- Access token JWT curto (15 min) em cookie httpOnly `effinance_token` (path `/api`); refresh token
  opaco (30 dias) em cookie httpOnly `effinance_refresh` (path `/api/auth`), guardado como hash em
  `sessions`, **rotacionado a cada uso** e com detecção de reuso (revoga a família). A sessão dura no
  máximo 90 dias, mesmo renovada. Logout, troca de senha e "encerrar sessão" revogam no servidor;
  trocar a senha também invalida links de redefinição pendentes.
- 2FA por TOTP (aplicativo autenticador) com códigos de recuperação de uso único (PBKDF2). Cada
  código é consumido de forma atômica (sem reuso em requisições simultâneas). Ativar exige `password`
  em `/auth/mfa/enable`, salvo login feito há menos de 15 min (`422` pede a senha).
- Recuperação de senha por e-mail: link `${APP_URL}/redefinir-senha#token=…` (o token fica no
  fragmento, fora de logs e do `Referer`), uso único, 30 min, guardado como hash.
- Senhas: scrypt; novas senhas com 10+ caracteres, letras e números.
- Limites (429): por IP em login/2FA/recuperação/convites/exportação/checkout/webhook (Redis
  opcional via `REDIS_URL` para múltiplas instâncias); por conta, 10 falhas de código 2FA a cada
  15 min e 5 e-mails de redefinição por hora (a resposta continua 204); 20 convites por workspace por
  hora; até 10 workspaces próprios por usuário.
- CSP restritiva e `Cache-Control: no-store` nas respostas da API; requisições que alteram dados
  exigem JSON e origem permitida (CSRF).
- Cabeçalho opcional `X-Workspace-Id`: o web envia o workspace exibido; uma gravação (fora de
  `/api/auth/`) para outro workspace → `409 workspace_mismatch` (outra aba trocou a sessão).
- Conflitos de unicidade/integridade (convite pendente repetido, dono único) → `409`.
- Log de auditoria (login, 2FA, membros, assinatura, exportação, exclusões) sem dados pessoais; os
  logs da aplicação removem parâmetros SQL, CPF em buscas, tokens no caminho e e-mails.

## Permissões e assinatura

- `viewer` só lê; `editor` altera dados financeiros; `owner` também gerencia membros, assinatura e
  exclusão. Violação → `403 forbidden`.
- **Fase 3: permissões por pessoa** (spec §13.10): o papel dá o padrão e cada membro pode ter ajustes
  (chaves ligadas/desligadas). Toda guarda abaixo passou a conferir uma **chave** — `finance` no lugar
  de "owner/editor", `members` no lugar de "owner" em membros e convites, `registry`/`deleteRegistry`/
  `deleteTasks` no módulo de tarefas — com **padrões idênticos** ao comportamento anterior. Assinatura,
  renomear/excluir o espaço, exportação LGPD e o log de auditoria continuam só do `owner`. Ver
  "Fase 3 → Permissões por pessoa".
- **Financeiro só para administradores** (provisório, sem migração de papéis): administrador =
  `owner` ou `editor`; `viewer` (na interface, "Colaborador") **não lê nem grava nada financeiro**:
  `403 forbidden` com a mensagem "O financeiro é restrito aos administradores do espaço." — inclusive
  em leituras. Guard único `financeOnly(app)` (`apps/api/src/lib/finance-access.ts`, lista de papéis
  permitidos; sem `req.access` nega), chamado no início de cada plugin financeiro (depois de
  `tenantGuards` nos montados fora de `tenant-routes`): toda rota nova do módulo já nasce protegida, e
  o demo usa o mesmo guard. O teste `test/finance-access.test.ts` percorre a árvore real de rotas:
  todo módulo precisa estar classificado como financeiro ou aberto.
  - **Módulos financeiros (403 para `viewer`)**: `/accounts`, `/categories`, `/credit-cards`,
    `/goals`, `/transactions`, `/transfers`, `/statement`, `/dashboard`, `/reports/*`,
    `/fee-charges/*`, `/imports`, `/open-finance/*` (exceto o webhook público) e as vigências de
    honorários `/clients/:id/fees*`.
  - **Abertos a todos os membros** (cada um com suas regras de escrita/proprietário): `/auth`,
    `/workspaces`, `/invites`, `/billing` (inalterado: assinatura do espaço, gestão só do `owner`),
    `/contacts`, `/clients`, `/cnpj`, `/search` e o módulo de tarefas.
  - **Dados financeiros em módulos abertos** somem para `viewer`: em `GET /clients` e
    `GET /clients/:id` (e nas respostas de escrita de clientes), `currentFee`, `latestFee`,
    `feeDueDay` (vencimento do honorário) e `notes` (observações) vêm `null` (`withoutFees`) e, no
    `summary`, `monthlyFees`, `withoutCurrentFee` e `averageFee` vêm `null` (as vigências nem são
    lidas); `transactionCount`, contagens e `byRegime` continuam. `GET /search` devolve
    `transactions`, `accounts` e `categories` vazios (as tabelas nem são consultadas) e, em
    `contacts`, só clientes (fornecedores são do financeiro e nem são consultados), com `notes`
    `null`. Fornecedores (`/contacts`) não expõem totais financeiros.
  - **Tarefas** (`/tasks/*`): todos os membros trabalham, `viewer` inclusive — criar, editar,
    concluir/reabrir, comentar, anexar, mexer em subtarefas, marcar ocorrências e a auditoria, aplicar
    modelos de processo e manter as próprias anotações. Cadastros do módulo (departamentos,
    departamento do membro, categorias, grupos por regime, tarefas recorrentes, modelos de
    processo) e exclusões ficam com `owner`/`editor`. Ver "Tarefas → Permissões".
  - Mudança de papel vale na próxima requisição (o papel é relido a cada requisição).
- Gravações exigem assinatura válida: `trialing` (14 dias, sem cartão), `active` ou `past_due` dentro
  da carência de 7 dias. Fora disso → `402 subscription_required` (leitura e exportação continuam).
  **Com a cobrança desativada (`BILLING_ENABLED = false`, o padrão atual) não há `402`**: veja
  "Cobrança desativada (implantação futura)".
- Limite de membros por plano ao convidar.

## Endpoints novos

| Método | Rota | Entrada | Resposta |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `registerSchema` (com `acceptTerms`, `companyName` opcional) | `AuthResponse` (201) — cria a empresa do usuário em teste |
| POST | `/api/auth/login` | `loginSchema` | `AuthResponse` ou `MfaChallengeResponse` |
| POST | `/api/auth/mfa/verify` | `mfaVerifySchema` | `AuthResponse` |
| POST | `/api/auth/refresh` | — (cookie) | 204 |
| POST | `/api/auth/logout` | — | 204 (revoga a sessão) |
| GET | `/api/auth/me` | — | `MeResponse` |
| PUT | `/api/auth/me` | `updateProfileSchema` | `MeUser` |
| DELETE | `/api/auth/me` | `deleteAccountSchema` | 204 — exclui a conta e os workspaces em que é o único proprietário |
| POST | `/api/auth/password` | `changePasswordSchema` | 204 — revoga as outras sessões |
| POST | `/api/auth/password/forgot` | `forgotPasswordSchema` | 204 (sempre) |
| POST | `/api/auth/password/reset` | `resetPasswordSchema` | 204 |
| GET | `/api/auth/sessions` | — | `SessionInfo[]` |
| DELETE | `/api/auth/sessions/:id` | — | 204 |
| POST | `/api/auth/mfa/setup` | — | `MfaSetupResponse` |
| POST | `/api/auth/mfa/enable` | `mfaCodeSchema` | `MfaEnableResponse` |
| POST | `/api/auth/mfa/disable` | `mfaCodeSchema` | 204 |
| POST | `/api/auth/switch-workspace` | `switchWorkspaceSchema` | `MeResponse` |
| GET | `/api/workspaces` | — | `WorkspaceSummary[]` |
| POST | `/api/workspaces` | `workspaceInputSchema` | `WorkspaceSummary` (201, em teste) |
| PUT | `/api/workspaces/current` | `workspaceUpdateSchema` | `WorkspaceSummary` (owner) |
| DELETE | `/api/workspaces/current` | `deleteWorkspaceSchema` | 204 (owner; cancela assinatura e destrói a chave); 422 se for o último espaço do qual é proprietário |
| GET | `/api/workspaces/current/members` | — | `Member[]` |
| PATCH | `/api/workspaces/current/members/:userId` | `memberRoleSchema` | `Member` (`members`; ninguém concede o que não tem) |
| GET | `/api/workspaces/current/members/:userId/permissions` | — | `MemberPermissions` (`members`; fase 3) |
| PUT | `/api/workspaces/current/members/:userId/permissions` | `memberPermissionsInputSchema` (`role?`, `overrides`) | `MemberPermissions` (`members`; 402 sem assinatura; fase 3) |
| DELETE | `/api/workspaces/current/members/:userId` | — | 204 (`members` remove; membro pode sair) |
| GET | `/api/workspaces/current/invites` | — | `Invite[]` (`members`) |
| POST | `/api/workspaces/current/invites` | `inviteInputSchema` | `Invite` (201, `members`; o papel convidado não pode dar o que quem convida não tem) |
| DELETE | `/api/workspaces/current/invites/:id` | — | 204 (`members`) |
| GET | `/api/invites/:token` | — | `InvitePreview` (público) |
| POST | `/api/invites/:token/accept` | — | `MeResponse` (e-mail do convite = e-mail logado) |
| GET | `/api/workspaces/current/export` | — | JSON com todos os dados decifrados (owner, LGPD) — inclui, na fase 3, os acessos dos clientes decifrados e a foto de quem exporta |
| GET | `/api/workspaces/current/audit` | `auditQuerySchema` | `Paginated<AuditLogEntry>` (owner) |
| GET | `/api/billing/plans` | — | `Plan[]` |
| GET | `/api/billing/subscription` | — | `Subscription` |
| POST | `/api/billing/checkout` | `checkoutSchema` | `CheckoutResponse` (owner) — `404` com a cobrança desativada |
| POST | `/api/billing/cancel` | — | `Subscription` (owner; cancela ao fim do período) — `404` com a cobrança desativada |
| POST | `/api/billing/webhooks/mercadopago` | notificação MP | 200 (assinatura `x-signature` verificada, idempotente) — `404` com a cobrança desativada |
| POST | `/api/billing/dev/activate` | `checkoutSchema` | `Subscription` — só com `BILLING_PROVIDER=fake` (dev/demo); `404` com a cobrança desativada |

## Detalhes de implementação

- **Fronteira de tenant**: as rotas financeiras são montadas por `lib/tenant-routes.ts`, que autentica,
  verifica permissão de escrita (papel + assinatura) e abre a transação RLS exposta como `req.db`.
  Os serviços recebem `(db, workspaceId, …)`. Workspaces, membros, convites, sessões e assinaturas
  não ficam sob RLS: são acessados pelo login da API, com checagem explícita de papel.
- **Busca com dados cifrados**: observações não são pesquisáveis (a busca de lançamentos usa só a
  descrição). Contatos: busca parcial por nome ou exata por CPF/CNPJ (índice cego); e-mail e
  telefone não são pesquisáveis. Tarefas: a busca (`GET /tasks?search=` e `GET /search`) é só pelo
  título (e o nome das recorrentes); descrições, comentários, anotações e anexos são cifrados.
- **Limite de membros**: plano pago → `maxMembers` do plano; em teste → 1 (pessoal), 5 (família),
  15 (empresa). Membros + convites pendentes acima do limite → `422`. Convites pedem assinatura
  com escrita liberada (`402`).
- **Regras de exclusão**: o último espaço do qual o usuário é proprietário não pode ser excluído
  (`422` "Mantenha ao menos uma empresa; para sair de vez, exclua sua conta em Privacidade" — ser
  membro de outra empresa não conta); um espaço pessoal antigo só sai junto com a conta (`422`); o
  proprietário não pode sair do próprio espaço (`422`); excluir/sair troca a sessão para outro
  espaço do usuário.
- **Convite**: `POST /invites/:token/accept` exige o mesmo e-mail do convite (`403` caso contrário),
  vale 7 dias e uso único; o token só existe no link (guardado como SHA-256).
- **Assinatura**: o checkout grava `pending` (o teste continua valendo até acabar); cancelar mantém
  o acesso até `currentPeriodEnd`. `POST /billing/dev/activate` responde `404` fora do provedor fake.
- **Refresh**: um token já rotacionado reapresentado em até 10 s (requisições simultâneas da mesma
  aba) recebe `204` sem novos cookies; depois disso é tratado como roubo e revoga a sessão inteira.
  Se o membro foi removido do workspace da sessão, o refresh troca para outro workspace dele.
- **Corpo vazio**: `Content-Type: application/json` com corpo vazio é aceito como "sem corpo".
- **Dados legados**: `db:migrate` gera as chaves dos workspaces migrados e cifra campos ainda em
  texto puro (idempotente). A demo faz o mesmo ao abrir uma base antiga do IndexedDB. Uma migração
  que passa a cifrar um campo limpa `workspaces.encryption_backfilled_at` para que o backfill confira
  todos os espaços de novo (0013: descrição e comentários de tarefas).
- **Demo (PGlite)**: mesmas rotas e serviços, inclusive RLS e criptografia (chave mestra fixa e
  pública da demo), sessão no `localStorage` e provedor de pagamento fake.

## Cobrança desativada (implantação futura)

`BILLING_ENABLED` (`packages/shared/src/saas.ts`) está `false`: os planos pagos ficam para uma
implantação futura, sem apagar o código de cobrança. A API lê o valor de `platform.billingEnabled`
(padrão: a constante; `lib/platform.ts` → `billingEnabled()`). Enquanto desligado:

- `SubscriptionSummary` (`GET /auth/me`, `GET /workspaces`, `GET /billing/subscription`, exportação)
  informa `status: 'active'`, `canWrite: true`, `trialEndsAt` e `currentPeriodEnd` `null` e
  `cancelAtPeriodEnd: false` (`planCode` é o gravado, em geral `null`). Nenhuma rota responde
  `402 subscription_required`, o teste não expira e os webhooks do Open Finance sincronizam. A linha
  de `subscriptions` continua nascendo `trialing`: só o resumo é reescrito
  (`modules/billing/entitlements.ts` → `summarizeSubscription`).
- `POST /billing/checkout`, `/billing/cancel`, `/billing/dev/activate` e
  `/billing/webhooks/mercadopago` respondem `404 not_found` (nada vai para `billing_events`).
  `GET /billing/plans` e `GET /billing/subscription` continuam (a tela de membros lê `memberCount` e
  `maxMembers`; o limite de membros segue o do teste por tipo de espaço). Excluir conta ou espaço
  ainda cancela no provedor uma assinatura paga que exista.
- Religar: `BILLING_ENABLED = true` (API e web leem a mesma constante). Espaços criados com a
  cobrança desligada têm `trial_ends_at` vencido: renove-o antes, senão ficam somente leitura na hora.
- Testes: `test/billing-disabled.test.ts` injeta `billingEnabled: false`; as suítes do caminho ligado
  (cobrança, `402`, teste expirado) usam `createTestApp({ billingEnabled: true })`.

## Mercado Pago (assinaturas)

`POST /preapproval` com `external_reference = workspaceId`, `payer_email`, `auto_recurring`
(valor e frequência do plano, BRL) e `back_url` → o usuário paga no `init_point`. Webhooks
`subscription_preapproval` / `subscription_authorized_payment` / `payment`: valida `x-signature`
(HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com `MP_WEBHOOK_SECRET`), grava
o evento (idempotência) e consulta `GET /preapproval/:id` para obter o status oficial:
`authorized → active`, `paused → past_due`, `cancelled → canceled`, `pending → pending`.

---

# Importação de extratos/faturas e Open Finance

Contrato em `packages/shared/src/integrations.ts`. Lançamentos importados são lançamentos comuns
(aparecem em extrato, fatura, relatórios e podem ser editados), marcados em `Transaction` com
`origin` (`manual` | `file` | `open_finance`) e `importBatchId` (lote que os criou).

## Endpoints

Autenticados (sessão), no workspace ativo. Todas as rotas (leituras inclusive) exigem papel
`editor`/`owner` (`403`; financeiro só para administradores, veja "Permissões e assinatura") e as
mutações também assinatura com escrita (`402`). Montados por `lib/tenant-scope.ts` (mesmas
garantias de `tenant-routes`, em fases: transações RLS curtas e chamadas ao provedor entre elas).

| Método | Rota | Entrada | Resposta |
| --- | --- | --- | --- |
| POST | `/api/imports/preview` | `importPreviewSchema` | `ImportPreview` — nada é gravado |
| POST | `/api/imports` | `importCommitSchema` | `ImportCommitResponse` (201) |
| GET | `/api/imports?page&pageSize` | `importListQuerySchema` | `Paginated<ImportBatch>` (mais recentes primeiro) |
| DELETE | `/api/imports/:id` | — | 204 — desfaz: remove os lançamentos restantes; o lote fica no histórico com `undoneAt` e `remainingCount` 0 (repetir é no-op) |
| GET | `/api/open-finance/status` | — | `OpenFinanceStatus` |
| POST | `/api/open-finance/connect-token` | `connectTokenSchema` | `ConnectTokenResponse` |
| GET | `/api/open-finance/dev/institutions` | — | `FakeInstitution[]` — **só** provedor `fake` (404 caso contrário) |
| POST | `/api/open-finance/dev/connect` | `fakeConnectSchema` | `FakeConnectResponse` (`{ itemId }`) — **só** provedor `fake` |
| POST | `/api/open-finance/connections` | `createConnectionSchema` | `BankConnection` (201; 200 se o item já existia: reconsentimento) |
| GET | `/api/open-finance/connections` | — | `BankConnection[]` |
| PUT | `/api/open-finance/connections/:id/accounts` | `linkAccountsSchema` | `BankConnection` |
| POST | `/api/open-finance/connections/:id/sync` | — | `SyncResult` |
| DELETE | `/api/open-finance/connections/:id` | — | 204 — revoga no provedor; lançamentos importados ficam |
| POST | `/api/open-finance/webhooks/:provider/:secret` | evento do agregador | `{ received, duplicate }` — **público**, autenticado pelo segredo do caminho |

Erros novos: `422` (arquivo inválido, mais de `MAX_IMPORT_ROWS` linhas, coluna do mapeamento
inexistente, estorno/crédito enviado para cartão, vínculo incompatível, `syncFrom` fora da janela,
conector que não é Open Finance), `409` (conta/cartão já alimentado por outra conexão), `502
provider_unavailable` (agregador não respondeu; detalhes só no log do servidor, sem ids).

## Importação de arquivos (OFX/CSV)

- **Parsers puros** (`modules/imports/{ofx,csv,parse}.ts`, sem APIs do Node; hashes via
  WebCrypto — a demo roda no navegador): OFX 1.x (SGML, tags sem fechamento) e 2.x (XML), extratos
  (`STMTRS`) e faturas (`CCSTMTRS`); `TRNAMT` com `.` ou `,`; `DTPOSTED` com hora/fuso (vale a data
  local do arquivo); `TRNTYPE` corrige valores positivos de saída; `NAME`/`MEMO` combinados;
  instituição (`ORG` ou código COMPE de `BANKID`/`FID`), `accountHint` (últimos 4 dígitos de
  `ACCTID`) e período (`DTSTART`/`DTEND` ou mín./máx. das datas).
- CSV: BOM, aspas (RFC 4180), delimitador (`;` `,` tab `|`) e cabeçalho detectados (linhas de
  preâmbulo antes do cabeçalho são puladas), linhas de saldo ignoradas, presets por nome de coluna
  (Nubank cartão `date,title,amount` com compras positivas → `invertSign`; Nubank conta
  `Data,Valor,Identificador,Descrição`; Inter, Itaú, BB, Bradesco, Santander, C6 —
  data/lançamento/histórico/descrição/título/valor/débito/crédito) e, sem cabeçalho, colunas
  deduzidas dos valores. Valores `R$ -1.234,56`, `(1.234,56)`, `1,234.56`, `-50`, `50,00-`,
  `50,00 D`. Datas nos formatos de `CSV_DATE_FORMATS`. Layout não reconhecido → prévia com
  `csvColumns`, `csvMapping: null` e `rows: []` (a UI pede o mapeamento).
- **Mudança aditiva no contrato**: `csvMappingSchema.idColumn` (opcional) — coluna com o id do
  banco (ex.: "Identificador"); se omitida, é detectada pelo cabeçalho.
- **externalId**: `fitid:<FITID>` (OFX) ou `id:<id do arquivo>` (CSV); ids repetidos no mesmo
  arquivo recebem `#n`. Sem id: `h:` + SHA-256 de `data|valor com sinal|descrição normalizada|n-ésima
  ocorrência idêntica` — o mesmo arquivo gera sempre os mesmos ids. Unicidade no banco por
  `(workspace, conta, externalId)` e `(workspace, cartão, externalId)`.
- **Prévia** (`ImportPreviewRow`): `duplicate` quando o externalId já existe no alvo
  (`duplicateKind: 'imported'`, nota "Já importado") ou há lançamento (de qualquer origem) com mesma
  data, tipo, valor e descrição normalizada (`duplicateKind: 'similar'`, "Possível duplicado…"; cada
  lançamento existente casa com uma linha só); `duplicateKind` é `null` nas demais (campo aditivo);
  `categoryId` sugerido pelo histórico do workspace (lançamento categorizado mais recente, do mesmo
  tipo, com descrição normalizada igual ou mesmo prefixo significativo — ex.: "UBER *TRIP 1234" ≈
  "UBER *TRIP 9876"; pode ser subcategoria; categorias arquivadas são ignoradas);
  `installment` ("PARC 02/10", "Parcela 2 de 10"; em cartão também "LOJA 02/10" no fim);
  `skip`+`note` para valor zero, duplicados, pagamento de fatura ("PAGAMENTO RECEBIDO",
  "PAGTO FATURA"…) e, em cartão, estornos/créditos. `totals` somam todas as linhas do arquivo.
- **Commit**: conta → receitas/despesas **pagas** com `paidAt = date` (meio de pagamento sugerido:
  Pix, boleto, débito automático, transferência, débito); cartão → compras **não pagas** com
  `invoiceMonth = target.invoiceMonth ?? fatura da data de compra`, `paymentMethod = credit_card`.
  Estornos/créditos em cartão são recusados (`422`, `details.rows`): a fatura soma só compras
  (`amount > 0`), então um crédito não tem representação coerente — ajuste a compra original.
  Pagamento de fatura vindo do extrato da conta é sugerido como `skip` (no Effinance ele é a
  transferência `card_payment` criada ao pagar a fatura). `categoryId` pode ser subcategoria
  (vira `categoryId` = pai + `subcategoryId`); tipo da categoria deve bater com a linha (`422`);
  posse de alvo e categorias verificada (`404`). externalIds já existentes no alvo (ou repetidos na
  requisição) não são criados e contam em `skipped` — reenviar o mesmo commit é idempotente (cria
  um lote com `createdCount = 0`). `ON CONFLICT DO NOTHING` nos índices únicos cobre corridas.
- **Lotes**: `remainingCount` = lançamentos do lote que ainda existem (editar não tira do lote;
  excluir tira). `createdByName` só para quem ainda é membro. **Desfazer** (`DELETE`) remove os
  lançamentos restantes (inclusive os editados) e **mantém o lote** na lista, com `undoneAt`
  preenchido e `remainingCount` 0 (rastreabilidade; campo aditivo `ImportBatch.undoneAt`); repetir
  o `DELETE` responde 204 sem efeito. Um arquivo desfeito pode ser importado de novo. Lote do Open
  Finance desfeito gera *tombstones* (abaixo).
- **Filtro por origem**: `GET /api/transactions?origin=manual|file|open_finance` (paginado no
  servidor; campo aditivo de `transactionQuerySchema`).
- **Limites**: `MAX_IMPORT_CONTENT_CHARS` (3 M caracteres) e `MAX_IMPORT_ROWS` (3000) por arquivo;
  corpo da prévia até `3 × MAX_IMPORT_CONTENT_CHARS + 64 KiB` (UTF-8 + JSON), do commit até 4 MiB;
  rate limit por IP: prévia 30/min, commit 20/min, desfazer 30/min.
- Auditoria: `import.created` (formato, alvo, criados, ignorados) e `import.undone` (origem,
  removidos) — sem valores, descrições ou nomes de arquivo.

## Open Finance (somente leitura)

- **Provedores** (`OpenFinanceProvider` em `modules/open-finance/providers/`): `PluggyProvider`
  (fetch puro, sem SDK; caminhos e campos conferidos no código do `pluggy-sdk` 0.92.0) e
  `FakeOpenFinanceProvider` (dev/testes/demo: Nubank, Itaú, BB, Inter, Bradesco, Santander, C6, cada
  um com conta corrente e cartão, ~400 dias de movimentos determinísticos por instituição/conta/dia —
  salário, aluguel, contas, Pix, compras, parcelas, estornos, pagamento de fatura; compras de
  ontem/hoje ficam pendentes). Configuração: `OPEN_FINANCE_PROVIDER` (`fake` | `pluggy` |
  `disabled`; padrão `fake` fora de produção e `disabled` em produção), `PLUGGY_CLIENT_ID`,
  `PLUGGY_CLIENT_SECRET`, `PLUGGY_SANDBOX`, `OPEN_FINANCE_WEBHOOK_SECRET`, `API_PUBLIC_URL`
  (ver `.env.example`).
- **Consentimento**: `connect-token` cria um token curto do widget com `clientUserId =
  workspaceId` e `webhookUrl = ${API_PUBLIC_URL}/api/open-finance/webhooks/pluggy/<segredo>` (só
  https); com `connectionId`, devolve `updateItemId` para reconsentimento. A chave de API do
  agregador nunca sai do servidor (cache em memória até 1 min antes de expirar; 401 renova uma vez).
- **Fluxo no web**: `connect-token` → widget (fake: `GET /dev/institutions` + `POST /dev/connect`,
  que devolve `FakeConnectResponse`) → `POST /connections` com o `itemId` → `PUT …/accounts` →
  `POST …/sync`. **Renovar consentimento**: `connect-token` com `connectionId` (o widget abre em
  modo atualização com `updateItemId`) → `POST /connections` com o **mesmo** `itemId` (responde
  `200` e atualiza status, consentimento e contas) → `POST …/sync`. Logo após o consentimento o
  item pode estar `syncing` e ainda sem contas; elas aparecem no próximo `POST …/sync` ou quando o
  webhook `item/updated` chegar.
- **Conexão**: `POST /connections` busca o item **no provedor** (nunca confia no cliente) e exige
  `item.clientUserId === workspaceId` — item de outro cliente ou inexistente → `404`. Fora de
  sandbox, exige `connector.isOpenFinance === true` e não-sandbox (`422`): sem raspagem com senha de
  banco. Grava a conexão e as contas/cartões da instituição (número mascarado `•••• 1234`, saldo,
  limite, bandeira, dias de fechamento/vencimento); reenviar o mesmo item atualiza (200).
- **Vínculo** (`PUT …/accounts`): `account`/`credit_card` (posse verificada; conta ↔ conta,
  cartão ↔ cartão), `new` (cria conta com banco do catálogo `BANKS` reconhecido pelo nome da
  instituição e ícone `landmark`, ou cartão com bandeira/limite/fechamento/vencimento da instituição
  e conta de pagamento padrão = conta vinculada da mesma conexão), `ignore` (desvincula). Cada
  conta/cartão local recebe de no máximo uma conta da instituição (`409`). `syncFrom` padrão
  `hoje − OPEN_FINANCE_DEFAULT_HISTORY_DAYS`, no máximo `OPEN_FINANCE_MAX_HISTORY_DAYS` atrás;
  trocar o destino ou o `syncFrom` relê o histórico (sem duplicar). Conta criada por `new`: na
  primeira sincronização o saldo inicial é ajustado para o saldo atual bater com o da instituição.
  O vínculo não sincroniza sozinho: chame `POST …/sync`.
- **Sincronização**: janela `max(syncFrom, min(última sync, transação mais recente vista) − 7
  dias)` até hoje; transações pendentes ignoradas; direção pelo campo `type` do provedor (DEBIT =
  saída; no cartão, compra) — nunca pelo sinal do valor, cuja convenção muda entre tipos de conta;
  compras em moeda estrangeira pelo valor na moeda da conta. Conta: saída = despesa, entrada =
  receita, pagas na data; débitos de pagamento de fatura são pulados. Cartão: compras na fatura do
  vencimento da *bill* do provedor quando conhecida, senão pela data de compra; pagamentos e
  estornos pulados. Dedupe por externalId = id da transação no provedor; valor/data alterados no
  banco atualizam o lançamento (`updated`; compras já pagas pela fatura não mudam). **Exclusões do
  usuário são respeitadas**: lançamento do Open Finance excluído à mão ou lote desfeito vira
  *tombstone* `(workspace, conta/cartão, externalId)` (`import_tombstones`) e não volta na próxima
  sincronização (que relê 7 dias); lançamento movido para outra conta/cartão também não é recriado
  na origem. Tombstones somem com a conta/cartão. Um lote
  `open_finance` por conta vinculada quando há lançamentos novos. Status da conexão vem do item
  (`UPDATED→active`, `UPDATING/MERGING→syncing`, `LOGIN_ERROR→login_error`,
  `WAITING_USER_INPUT/ACTION→waiting_user_input`, `OUTDATED→outdated`) com `statusDetail` fixo em
  pt-BR (nunca a mensagem do banco); item inexistente → `error` ("não existe mais…"). Sincronizações
  simultâneas da mesma conexão são serializadas (`SELECT … FOR UPDATE`).
- **Desconectar**: apaga o item no provedor (o agregador apaga os dados coletados; 404 = já
  apagado) e depois a conexão; lotes ficam sem `connectionId`, lançamentos permanecem. Excluir
  workspace (`DELETE /workspaces/current`) ou conta (`DELETE /auth/me`) revoga antes todos os itens
  dos workspaces excluídos (falha do provedor aborta a exclusão: tente de novo).
- **Webhook** `POST /api/open-finance/webhooks/pluggy/<segredo>` (o `:provider` precisa ser o
  configurado): segredo comparado em tempo constante (SHA-256 dos dois lados) → `401`; envelope
  validado (`event`, `eventId` ≤ 200, `itemId`) → `400`; idempotente por `(provider, eventId)`
  (`open_finance_events`, retenção 30 dias) → repetido responde `{ duplicate: true }` sem
  processar. Responde `200` imediatamente e processa depois (tarefas acompanhadas e aguardadas no
  `close` do app): o `itemId` só serve para rotear (HMAC no índice global → workspace/conexão); o
  item, as contas e as transações são **relidos do provedor** pela sincronização normal, que
  reconfere `clientUserId`. Falha no processamento fica no log (sem PII) e o evento sem
  `processed_at`; o próximo evento ou uma sincronização manual recupera (sincronização idempotente).
  Eventos: `item/*` e `transactions/*` → sincronizar; `item/deleted` → marca a conexão.
- **LGPD**: a exportação (`GET /workspaces/current/export`) inclui `bankConnections` (instituição,
  status, consentimento, contas mascaradas e vínculos) e `importBatches`, **sem** ids do provedor,
  índices cegos ou cursores; `externalId` dos lançamentos não é exportado.
- Auditoria: `open_finance.connected` (`metadata.reconnected`), `open_finance.synced` (`trigger`
  manual/webhook, contagens), `open_finance.disconnected` — sem ids do provedor.

## Banco (migrações 0005 e 0006)

- Tenant (RLS `ENABLE`+`FORCE`, política `USING`/`WITH CHECK`, `UNIQUE (workspace_id, id)`, FKs
  compostas, `GRANT SELECT, INSERT, UPDATE, DELETE` só para `effinance_app`): `import_batches`,
  `bank_connections` (`provider_item_id` cifrado com a chave do workspace + `provider_item_hash`,
  índice cego), `bank_connection_accounts` (`provider_account_id` cifrado + hash; vínculos com
  `ON DELETE SET NULL (coluna)`; um feed por conta/cartão local). `transactions` ganhou `origin`
  (CHECK), `import_batch_id` (FK composta, `SET NULL` só na coluna), `external_id` e os índices
  únicos parciais por conta/cartão.
- Globais (sem dados pessoais, fora do RLS, acessadas só pelo login da API): `platform_keys`
  (chaves aleatórias embrulhadas pelo `KeyProvider` — KMS em produção — `SELECT, INSERT`),
  `open_finance_items` (HMAC de `provider:itemId` com a chave de plataforma → workspace/conexão;
  apagado em cascata com a conexão; `SELECT, INSERT`) e `open_finance_events` (`SELECT, INSERT,
  UPDATE`). Um dump do banco não revela ids de item: o índice é um HMAC com chave protegida pelo KMS.
- 0006: `import_batches.undone_at` e `import_tombstones` (tenant, RLS, FKs compostas `ON DELETE
  CASCADE` para conta/cartão, CHECK de exatamente um destino, únicos parciais por destino).

## Banco (migração 0007)

- `contacts`: `kind` (contatos existentes viram `supplier`), colunas do cliente (`trade_name`,
  `opened_at`, `main_activity`, `responsible_*` cifrados, `tax_regime`, `simples_annex`,
  `contract_start_date`, `status`, `inactivated_at`, `inactivation_reason`, `inactivation_notes`
  cifrado) com CHECKs do contrato (cliente sempre com regime e início do contrato; anexo só no
  Simples; inativo ⇔ data e motivo) e índice único parcial `(workspace_id, document_hash)` para
  clientes.
- `client_fees` (tenant, RLS `ENABLE`+`FORCE`, `UNIQUE (workspace_id, id)`, FK composta para o
  cliente com `ON DELETE CASCADE`, único `(client_id, period_index)`, CHECKs de valor e índice).
- A exportação LGPD inclui os campos de cliente decifrados e `clientFees`.

## Banco (migrações 0008, 0009 e 0010)

- 0008 (juros e multa): `transactions.late_fee_of` (FK composta `(workspace_id, late_fee_of) →
  transactions(workspace_id, id)` `ON DELETE CASCADE`, índice parcial) e `late_fee_kind` (CHECK
  `interest` | `fine`; os dois juntos ou nenhum). Ganha também `UNIQUE (workspace_id, id)` em
  `transactions`, alvo das referências a si mesma — criado só se faltar (um re-run não o derruba,
  pois 0009 depende dele).
- 0009 (honorários gerados): `fee_competence` (CHECK `YYYY-MM`), `fee_kind` (CHECK `fee` |
  `employees`), `fee_of` (FK composta para o honorário, `ON DELETE CASCADE`) e `employees` (> 0).
  CHECK de consistência: tipo ⇔ competência; gerado é sempre receita; `fee_of` só (e sempre) na
  cobrança de empregados, junto com `employees`. Únicos parciais: `transactions_fee_competence_uq`
  `(workspace_id, contact_id, fee_competence) WHERE fee_kind = 'fee'` e `transactions_fee_of_uq`
  `(fee_of) WHERE fee_of IS NOT NULL` (equivale a `fee_kind = 'employees'` pelo CHECK e serve de
  índice da FK). Conflitos viram 409 com mensagem própria (`lib/errors.ts`).
- 0010 (vencimento por cliente e desconto): `contacts.fee_due_day` (CHECK 1–31; adicionada com
  `DEFAULT 10` e o default removido em seguida, então todo contato existente ficou com 10 por DDL —
  um `UPDATE` não veria linhas com o RLS forçado para o dono — e os novos fornecedores ficam `null`),
  `client_fees.discount_bps` (`NOT NULL DEFAULT 0`, CHECK 0–9999), `transactions.fee_discount_bps`
  (CHECK 1–9999 e só em `fee_kind = 'fee'`; 0 é gravado como `null`) e `transactions.discount_of`
  (FK composta `(workspace_id, discount_of) → transactions(workspace_id, id)` `ON DELETE CASCADE`,
  CHECK: só em despesa que não é juros/multa nem honorário gerado; único parcial
  `transactions_discount_of_uq (discount_of) WHERE discount_of IS NOT NULL`, que também serve à FK).
- As três são re-executáveis (`IF NOT EXISTS`, `DROP … IF EXISTS` antes de cada constraint) e rodam
  também no demo (PGlite).

---

# Tarefas (módulo Tarefas)

Gestão de tarefas do escritório (porte das regras do Effy). Especificação de UI:
`docs/tarefas-ui.md` (rev. 3). Contrato em `packages/shared`: constantes e rótulos em `constants.ts`
(`TASK_STATUSES`, `TASK_PRIORITIES`, `TASK_SCOPES`, `TASK_SITUATIONS`, `TASK_KINDS`,
`TASK_DUE_BUCKETS` — com `targetMissed`, "Fora da meta" —, `RECURRENCE_PERIODS` (6, do cadastro;
`RECURRENCE_FREQUENCIES` acrescenta `daily` para a recorrência de tarefas, com `RECURRENCE_ENDS`,
`RECURRENCE_ORIGINS`, `RECURRENCE_NON_BUSINESS_DAY_RULES` com `skip` e `TASK_RECURRENCE_APPLY_TO`),
`TASK_INSIGHT_KEYS`/`TASK_INSIGHT_TONES`, `MIN_DEPARTMENT_COMPARISON_MEMBERS`,
`RECURRENCE_PERIOD_MONTHS`, `WEEKDAY_LABELS`, `NON_BUSINESS_DAY_RULES`, `MAX_REFERENCE_OFFSET`,
`OCCURRENCE_STATUSES`, `OCCURRENCE_SITUATIONS`, `ASSIGNEE_SOURCES`, `FLOW_STEP_STATES`,
`TASK_EVENT_KINDS`, `TASK_ATTACHMENT_TYPES`/`TASK_ATTACHMENT_CONTENT_TYPES`, `MAX_ATTACHMENT_BYTES`,
`MAX_TASK_ATTACHMENT_BYTES`, `MAX_ATTACHMENTS_PER_TASK`, `TASK_TIME_ZONE`, cada um com os rótulos
pt-BR), schemas em `schemas.ts` e tipos em `types.ts` (seção "Tasks") e regras puras em
`utils/tasks.ts` (atrasada, fora da meta, grupos de prazo, fuso do escritório, **feriados nacionais**,
dias úteis, agenda das recorrentes, situação da ocorrência, nome de arquivo seguro).

**Fases.** A **fase 1** (núcleo: departamentos, categorias, tarefas avulsas, subtarefas, comentários,
lista, início) e a **fase 2** estão implementadas: tarefas recorrentes com
ocorrências geradas por cliente e competência, auditoria mensal, processos e modelos, relatórios e
exportação CSV, calendário, anotações pessoais, anexos, histórico (linha do tempo) da tarefa, busca
global com tarefas. A fase 3 da spec (sindicatos, dados fiscais e documentos do
cliente, escritório e contrato, permissões por pessoa, foto do perfil) está implementada: ver
"Fase 3" no fim deste documento.

## Permissões

- **Todos os membros** do espaço usam o módulo, inclusive `viewer` ("Colaborador"); cadastros e
  exclusões são dos **administradores** (`owner`/`editor`, os mesmos do financeiro). Violação → `403`
  "Somente os administradores do espaço podem fazer isso." (`TASK_ADMIN_MESSAGE`). **Fase 3**: cada
  linha "admin" abaixo é uma chave — cadastros `registry`, exclusão de cadastros `deleteRegistry`,
  excluir tarefa/processo e remover comentário/anexo de outra pessoa `deleteTasks`, reabrir ocorrência
  concluída por outra pessoa `reopenOthers`, salvar processo como modelo e o Início de outro
  departamento/"Todos" `registry` — com os mesmos padrões (owner/editor). Gravações exigem
  assinatura com escrita (`402`), como no resto da API; leituras continuam.
- **Matriz** (rota → quem; as linhas "serviço" são conferidas dentro do serviço, com a mensagem própria):

  | Ação | Colaborador | Administrador |
  | --- | --- | --- |
  | Ler tudo do módulo (lista, início, auditoria, recorrentes, processos, modelos, relatórios, CSV, calendário, histórico, anexos) | sim | sim |
  | Criar/editar/concluir/reabrir/cancelar tarefa avulsa e etapa de processo; subtarefas; comentar; anexar | sim | sim |
  | Mudar o estado de uma ocorrência (lista, sheet, matriz) e atribuí-la a alguém só naquela competência | sim | sim |
  | Reabrir ocorrência **concluída** (serviço) | só a que ele concluiu, com motivo | todas, com motivo |
  | Remover comentário / anexo (serviço) | os próprios | todos |
  | Aplicar modelo de processo; criar processo avulso | sim | sim |
  | Salvar processo avulso como modelo (`saveAsTemplate`, serviço) | não (403) | sim |
  | Anotações pessoais | as próprias | as próprias (nunca as de outro) |
  | Departamentos, departamento do membro, categorias, aplicar grupo padrão por regime | não | sim |
  | Tarefas recorrentes (criar, editar, excluir, gerar competência) | não | sim |
  | Repetir uma tarefa (`recurrence`, um cliente ou interna): criar, alterar a série, encerrar | as suas e as do seu departamento | todas (`registry`) |
  | Modelos de processo (criar, editar, excluir) | não | sim |
  | Excluir tarefa avulsa; excluir processo | não | sim |
  | Página de início de outro departamento ou de todos | não | sim |

- Implementação: o plugin `/tasks` fica em `scopedRoutes` com guardas próprios
  (`modules/tasks/access.ts`: `taskGuards` = autenticação + assinatura; `requireTaskAdmin` por rota) —
  independente do `financeOnly` e do `assertCanWrite` dos módulos financeiros. Cada requisição lê os
  membros (nomes e papéis) na conexão do sistema e trabalha numa transação de tenant (RLS); a resposta
  sai depois do COMMIT. O RLS continua só por espaço (uma política por tabela); o papel é checado na
  API. `test/tasks-security.test.ts` percorre a árvore real de rotas: toda rota nova precisa estar
  classificada (administrador ou membro).
- **Filtro por espaço em toda consulta**: todo SELECT/UPDATE/DELETE do módulo filtra por
  `workspace_id` do pedido — inclusive os UPDATE/DELETE por id depois da checagem de posse; o RLS é a
  segunda barreira. `test/tasks-scope.test.ts` roda **todos** os serviços exportados (registros,
  tarefas, início, recorrentes, auditoria, processos, relatórios/calendário, anexos, anotações) numa
  conexão de superusuário (sem RLS), captura cada SQL pelo logger do Drizzle e exige
  `workspace_id = <espaço>` (ou igualdade com uma tabela já filtrada, em joins e subconsultas) para
  toda tabela de tenant; também confere que outro escritório fica intacto, byte a byte.
- **Permissão por pessoa** (spec §13.10 e §18, item 11, fase 3): implementada — ver "Fase 3 →
  Permissões por pessoa"; `test/tasks-security.test.ts` confere a chave de cada rota de administrador. Rótulos
  dos papéis no contrato (`MEMBER_ROLE_LABELS`/`MEMBER_ROLE_HINTS`, `saas.ts`): **Proprietário**,
  **Administrador** e **Colaborador** (os mesmos de `apps/web/src/features/auth/roles.ts`).
- O web sabe quem é administrador por `GET /auth/me` (`workspace.role`, e na fase 3
  `workspace.permissions`) e por `GET /tasks/options` (`me.isAdmin` — só para rótulos —, `me.canWrite`
  e, na fase 3, `me.permissions`); por registro, `TaskDetail.canReopen`, `TaskComment.canDelete`,
  `TaskAttachment.canDelete` e `OccurrenceCell.canReopen` (calculados pelas chaves).

## Endpoints

| Método | Rota | Entrada | Resposta | Quem |
| --- | --- | --- | --- | --- |
| GET | `/api/tasks/options` | — | `TaskOptionsResponse` (hoje, você, membros com departamento, departamentos, categorias, clientes) | todos |
| GET | `/api/tasks/clients` | — | `TaskClientOption[]` (clientes em leitura, sem honorários) | todos |
| GET | `/api/tasks/members` | — | `TaskMember[]` | todos |
| PUT | `/api/tasks/members/:userId/department` | `memberDepartmentSchema` | `TaskMember` | admin |
| GET | `/api/tasks/departments` | — | `TaskDepartment[]` (membros, em aberto, atrasadas, recorrentes ativas, total) | todos |
| POST | `/api/tasks/departments` | `taskDepartmentInputSchema` | `TaskDepartment` (201) | admin |
| PUT | `/api/tasks/departments/:id` | `taskDepartmentInputSchema` | `TaskDepartment` | admin |
| DELETE | `/api/tasks/departments/:id` | — | 204; 409 com membros, recorrentes ou tarefas (`details`) | admin |
| GET | `/api/tasks/categories` | — | `TaskCategory[]` (com `taskCount` e `isRework`) | todos |
| POST | `/api/tasks/categories` | `taskCategoryInputSchema` (`isRework` opcional, padrão `false`) | `TaskCategory` (201) | admin |
| PUT | `/api/tasks/categories/:id` | `taskCategoryInputSchema` (`isRework` ausente mantém o gravado) | `TaskCategory` | admin |
| DELETE | `/api/tasks/categories/:id` | — | 204 (tarefas, recorrentes e etapas ficam sem categoria) | admin |
| GET | `/api/tasks/home` | `taskHomeQuerySchema` (`departmentId` = id ou `all`, `month`) | `TaskHomeResponse` | todos (outro depto./`all`: admin) |
| GET | `/api/tasks/dashboard` | `taskDashboardQuerySchema` (= `taskHomeQuerySchema`) | `TaskDashboardResponse` (cards do dashboard do Effy) | todos (outro depto./`all`: admin; `fees` só `finance`, `incomplete` só `registry`) |
| GET | `/api/tasks/regime-groups` | — | `RegimeGroupsResponse` | todos |
| POST | `/api/tasks/regime-groups/:regime/apply` | `regimeGroupApplySchema` (`keys`, `departments`) | `RegimeGroupApplyResponse` | admin |
| GET | `/api/tasks/activity` | — | `TaskActivityItem[]` | todos |
| GET | `/api/tasks/me/overview` | `taskMyOverviewQuerySchema` (`month`) | `TaskMyOverviewResponse` (área pessoal: só os seus números e o agregado do departamento) | todos |
| GET | `/api/tasks/calendar` | `taskCalendarQuerySchema` (`from`, `to` ≤ 62 dias, escopo e filtros) | `TaskCalendarResponse` | todos |
| GET | `/api/tasks/reports` | `taskReportQuerySchema` (período ≤ 1 ano, filtros, página até 1000) | `TaskReportResponse` | todos |
| GET | `/api/tasks/reports/export.csv` | `taskReportExportQuerySchema` | `text/csv` (download, até 10 000 linhas) | todos |
| GET | `/api/tasks/audit` | `taskAuditQuerySchema` (`competence`, `taxRegime`, `departmentId`, `assigneeId`, `recurringTaskId`) | `AuditMatrixResponse` | todos |
| GET | `/api/tasks/recurring` | `recurringTaskQuerySchema` (`origin` = `registry` (padrão) \| `task` \| `all`) | `RecurringTaskListResponse` (itens com `origin`, `client`, `recurrence`, `nextTaskId`; `summary.byOrigin`) | todos |
| POST | `/api/tasks/recurring` | `recurringTaskInputSchema` | `RecurringTask` (201; gera as ocorrências da janela) | admin |
| POST | `/api/tasks/recurring/generate` | `recurringGenerateSchema` (`competence`) | `RecurringGenerateResponse` | admin |
| GET | `/api/tasks/recurring/:id` | `?month` | `RecurringTask` | todos |
| PUT | `/api/tasks/recurring/:id` | `recurringTaskInputSchema` (substitui tudo) | `RecurringTask` (ressincroniza as não iniciadas) | admin |
| DELETE | `/api/tasks/recurring/:id` | — | 204; 409 com histórico | admin |
| GET | `/api/tasks/recurring/:id/occurrences/:period` | `period` = `AAAA-MM` ou a segunda-feira `AAAA-MM-DD` da semanal | `RecurringOccurrenceDetail` | todos |
| GET | `/api/tasks/flows` | `taskFlowQuerySchema` (`status`, `clientId`) | `TaskFlow[]` (até 200, mais recentes) | todos |
| POST | `/api/tasks/flows` | `taskFlowInputSchema` | `TaskFlowCreatedResponse` (201) | todos (`saveAsTemplate`: admin) |
| GET | `/api/tasks/flows/:id` | — | `TaskFlow` | todos |
| DELETE | `/api/tasks/flows/:id` | — | 204 (as tarefas ficam) | admin |
| GET | `/api/tasks/flow-templates` | — | `FlowTemplate[]` | todos |
| POST | `/api/tasks/flow-templates` | `flowTemplateInputSchema` | `FlowTemplate` (201) | admin |
| GET | `/api/tasks/flow-templates/:id` | — | `FlowTemplate` | todos |
| PUT | `/api/tasks/flow-templates/:id` | `flowTemplateInputSchema` (substitui as etapas) | `FlowTemplate` | admin |
| DELETE | `/api/tasks/flow-templates/:id` | — | 204 (processos aplicados continuam) | admin |
| POST | `/api/tasks/flow-templates/:id/apply` | `applyFlowTemplateSchema` | `TaskFlowCreatedResponse` (201) | todos |
| GET | `/api/tasks/notes` | — | `TaskNote[]` (só as suas) | todos |
| POST | `/api/tasks/notes` | `taskNoteInputSchema` | `TaskNote` (201) | todos |
| PUT | `/api/tasks/notes/:id` | `taskNoteInputSchema` | `TaskNote` | dono |
| DELETE | `/api/tasks/notes/:id` | — | 204 | dono |
| GET | `/api/tasks` | `taskQuerySchema` | `TaskListResponse` | todos |
| POST | `/api/tasks` | `taskInputSchema` (+ `recurrence` opcional) | `TaskDetail` (201; com `recurrence`, a primeira ocorrência) | todos (repetir: sua/departamento ou `registry`) |
| GET | `/api/tasks/:id` | — | `TaskDetail` | todos |
| PATCH | `/api/tasks/:id` | `taskUpdateSchema` (só os campos enviados; `recurrence`, `applyTo`) | `TaskDetail` | todos (série: sua/departamento ou `registry`) |
| PATCH | `/api/tasks/:id/status` | `taskStatusInputSchema` (`status`, `reason`) | `TaskStatusChangeResponse` | todos (regras de reabertura) |
| DELETE | `/api/tasks/:id` | — | 204 (subtarefas, comentários, anexos e histórico juntos); 409 para ocorrência do cadastro; tarefa que se repete: a série inteira, se nada foi trabalhado (senão 409) | admin |
| GET | `/api/tasks/:id/history` | — | `TaskHistoryResponse` (até 500, mais recentes primeiro) | todos |
| POST | `/api/tasks/:id/subtasks` | `subtaskInputSchema` | `TaskSubtask` (201) | todos |
| PATCH | `/api/tasks/:id/subtasks/:subtaskId` | `subtaskUpdateSchema` (`title` e/ou `done`) | `TaskSubtask` | todos |
| DELETE | `/api/tasks/:id/subtasks/:subtaskId` | — | 204 | todos |
| POST | `/api/tasks/:id/comments` | `taskCommentInputSchema` | `TaskComment` (201) | todos |
| DELETE | `/api/tasks/:id/comments/:commentId` | — | 204 | autor ou admin |
| GET | `/api/tasks/:id/attachments` | — | `TaskAttachment[]` | todos |
| POST | `/api/tasks/:id/attachments` | `taskAttachmentInputSchema` (JSON, arquivo em base64; corpo até ~13,4 MB) | `TaskAttachment` (201) | todos |
| GET | `/api/tasks/:id/attachments/:attachmentId/download` | — | o arquivo (download) | todos |
| DELETE | `/api/tasks/:id/attachments/:attachmentId` | — | 204 | quem anexou ou admin |

Ids de outro espaço (tarefa, cliente, categoria, departamento) respondem 404; responsável que não é
membro do espaço → 422.

## Regras

- **Estados**: `todo` (A fazer), `in_progress` (Em andamento), `waiting_client` (Aguardando cliente),
  `done` (Concluída), `canceled` (Cancelada). Prioridades `low | medium | high | urgent` (padrão
  `medium`).
- **Atrasada é derivada**, nunca gravada: aberta (`todo`, `in_progress`, `waiting_client`) com
  vencimento antes de hoje. `Task.overdue` e `daysOverdue` vêm prontos. "Hoje" é a data no fuso do
  escritório (`America/Sao_Paulo`, `lib/clock.todayIn`), não a do servidor (UTC); `EFFINANCE_TODAY`
  fixa a data nos testes e `EFFINANCE_NOW` fixa o instante gravado nas conclusões (nunca em produção).
- **Departamento derivado do responsável** (Effy): o servidor grava o departamento do responsável;
  um `departmentId` enviado junto é ignorado. Sem responsável (ou responsável sem departamento), a
  tarefa fica na fila do `departmentId` enviado; tirar o responsável mantém o departamento em que
  estava. **Diferença deliberada**: quando um membro muda de departamento, as tarefas **abertas** dele
  vão junto (no Effy o departamento congelava ao salvar); as concluídas/canceladas ficam onde foram
  feitas. A **ocorrência** de uma recorrente pertence sempre ao departamento da recorrente (não segue
  o responsável nem a mudança de departamento do membro). Etapa de processo segue a regra da tarefa
  (departamento do responsável; sem responsável, o da etapa).
- **Um departamento por membro** (spec §1 e §13.4: "cada membro está em no máximo um departamento";
  marcar um membro num departamento o tira do atual). `PUT /tasks/departments/:id` com `memberIds` é a lista completa.
- **Conclusão** (`PATCH /tasks/:id/status`): na transição para `done` o servidor grava `completedAt`
  (instante) e `completedBy` (quem clicou — o usuário da sessão, não o responsável); repetir `done`
  não muda o registro; sair de `done` apaga os dois. **Reabrir**: `reopenStatus` diz para onde voltar
  (o estado aberto anterior à conclusão/cancelamento; `todo` sem histórico) — o web envia
  `{ status: task.reopenStatus }`. Qualquer transição é aceita (desfazer, mover no quadro), com
  `reason` opcional (vai para o histórico). Criar já concluída também grava quem/quando. O banco
  garante `done` ⇔ `completed_at` (CHECK). Exceções da fase 2: reabrir **ocorrência concluída**
  (auditoria) e reabrir **etapa de processo** com a seguinte já iniciada (ver as seções abaixo).
- **Horário** ("compromisso"): `startTime`/`endTime` `HH:MM` de parede (sem fuso), só com
  vencimento, término depois do início. Início ≤ vencimento. O PATCH confere de novo na tarefa
  resultante (422).
- **Autoria**: criação, conclusão e comentários guardam o usuário e o **nome no momento**
  (`*_name`); a resposta usa o nome atual enquanto a pessoa é membro e o gravado depois que sai (o
  histórico de um escritório não perde quem fez). Se a **conta** é excluída, o nome gravado vira
  "Usuário excluído" (gatilho da 0012). Comentário é texto simples (sem formatação; gravado
  cifrado), autor sempre da sessão.
- **Limites** (o detalhe devolve tudo de uma vez): até 100 subtarefas e 500 comentários por tarefa
  (`MAX_SUBTASKS_PER_TASK`/`MAX_COMMENTS_PER_TASK` em `modules/tasks/service.ts`; acima → 422);
  título 200, descrição e comentário 5000 caracteres (limite do contrato; no banco o texto é cifrado);
  `pageSize` até 200; na página de início, `mine` conta todas as abertas em SQL e carrega só as 20
  primeiras. Texto com caractere NUL → 400 (em toda a API: `fromDatabaseError` mapeia os SQLSTATE
  `22021`/`22P05`; na descrição e nos comentários, que o banco só vê cifrados, a API recusa antes de
  cifrar com a mesma resposta, `InvalidTextError`). Testes: `test/tasks-security.test.ts`
  (inventário de rotas de administrador, ids fora do escopo, campos do servidor, limites e nada
  financeiro ou cifrado para o colaborador).
- **Descrição e comentários cifrados** (migração 0013; política de privacidade §5, "observações"):
  gravados com a chave do espaço (AES-256-GCM, AAD `workspace:tabela:coluna` — `tasks:description` e
  `task_comments:text` —, formato `v1.<iv>.<ct>`; `modules/tasks/encrypted-text.ts`, cifra entregue
  pelo `inTenant` no `TaskContext.cipher`). Criar, editar (autosave), detalhe, comentar, atividade
  recente e a exportação LGPD devolvem o texto decifrado (o formato das respostas não mudou); a
  listagem não carrega a descrição. Título de tarefa e de subtarefa continuam em claro (busca e
  listas). Um texto cifrado copiado para outro espaço, tabela ou coluna não decifra (erro 500
  genérico, sem o conteúdo). Testes: `test/tasks-db.test.ts` ("encrypted (migration 0013)").
- **Membro removido do espaço**: as tarefas dele ficam sem responsável (`ON DELETE SET NULL
  (assignee_id)`, mantendo o departamento) e saem o departamento do membro e as responsabilidades por
  cliente (cascata).
- **Exclusões**: tarefa avulsa ou etapa (admin) leva subtarefas, comentários, anexos e histórico;
  ocorrência de recorrente não se exclui (409: cancela-se, ou ajusta-se a recorrente). Departamento só
  sem membros, recorrentes e tarefas (409 com `details: { members, recurring, tasks }`, mensagem "2
  membros, 1 tarefa recorrente e 12 tarefas ainda estão neste departamento. Mova-os antes de excluir."). Categoria: exclusão simples, tarefas ficam
  sem categoria. Nomes de departamento e categoria são únicos no espaço (sem diferenciar maiúsculas;
  409). Cliente com tarefas não é excluído (409).
- **Sem responsável por cliente** (migração 0017): a "carteira" (um membro por cliente × departamento,
  `task_client_responsibles`, rotas `/tasks/client-responsibles`) foi removida a pedido do escritório. A
  ocorrência de uma recorrente vai para o **responsável padrão** da recorrente (`assigneeSource: default`)
  ou, sem ele, fica na **fila do departamento** (sem responsável); atribuir à mão vale só naquela
  competência (`manual`). Na migração, as ocorrências que vinham da carteira e ainda estavam "A fazer"
  da competência atual em diante passaram ao responsável padrão (ou à fila); as demais mantiveram a
  pessoa, agora como `manual` (nada já trabalhado trocou de mãos; sem registro no histórico).

### Listagem (`GET /tasks`)

- Filtros (`taskQuerySchema`): `scope` (`mine` = responsável sou eu; `department` = departamento do
  meu membro, vazio sem departamento; `all`), `situation` (`open`, `overdue`, `waiting`, `done` =
  concluídas + canceladas, `all`), `status` exato, `clientId` (id ou `internal`), `assigneeId` (id ou
  `none`), `departmentId`, `categoryId`, `priority`, `kind` (`standalone`, `flow` = etapas de
  processo, `recurring` = ocorrências), `month` (mês de vencimento; prazo legal nas ocorrências),
  `dueDate`, `dueFrom`/`dueTo`, `dueBucket` (um grupo de prazo das abertas, pela **data de trabalho** —
  o vencimento, ou a meta na ocorrência: `overdue | targetMissed | today | next7Days | later |
  noDueDate`), `occurrences` (padrão `true`; `false` = só avulsas e etapas em tudo), `closedFrom` (quadro:
  concluídas/canceladas só a partir dessa data, pela conclusão), `search` (só o título: descrição e
  comentários são cifrados e não entram na busca), `page`/`pageSize` (até 200).
- **Ocorrências nunca vêm como linhas** de `items`: vêm agregadas por recorrente e período em
  `occurrences` (`RecurringOccurrence`: contagens no escopo e filtros pedidos — total, concluídas, com
  atraso, canceladas, em andamento, pendentes —, prazo legal e meta das abertas, atrasada, fora da
  meta, responsável padrão e os efetivos com quantas cada um tem; até 200 grupos) e **contam uma por
  cliente** no `summary`, nos `groups` e no `byStatus`. Sem filtro de data, entram as ocorrências até a
  **próxima** competência (as geradas com mais antecedência não incham "Em aberto"), e os grupos
  agregados são os abertos e os das últimas duas competências.
- Ordem: data de trabalho (sem vencimento por último), prioridade (urgente primeiro), título; em
  `situation=done`, a conclusão mais recente primeiro.
- `summary` (`TaskListSummary`) usa **os mesmos filtros, exceto a situação** (e `dueBucket`/
  `closedFrom`): atrasadas e a mais antiga (`TaskOverdueRef`, tarefa ou ocorrência), fora da meta
  (`targetMissed`), em aberto, vencem hoje / em 7 dias (pela data de trabalho), aguardando cliente,
  do mês (`month` ou o atual: que vencem no mês e quantas foram concluídas ou canceladas), em aberto
  por responsável e por cliente. `groups` conta as abertas por grupo de prazo com a situação aplicada;
  `byStatus` conta por estado com todos os filtros exceto a situação (cabeçalho das colunas do
  quadro, com atrasadas). `months`: meses com tarefas no escopo, mais o atual. `today` vem junto.

### Página de início (`GET /tasks/home`)

- Unidade: tarefas abertas (qualquer vencimento) mais as que vencem, foram concluídas ou canceladas no
  mês (`month`, padrão o atual), e **ocorrências** da competência do mês mais as abertas atrasadas de
  competências anteriores ou com prazo nos próximos 7 dias (uma por cliente) — de um departamento
  (padrão: o do membro), de todos (`all`, administradores) ou, para membro sem departamento, só as
  dele (`view: 'mine'`).
- `totals`: por estado, em aberto, atrasadas, **fora da meta** (e o prazo legal mais próximo entre
  elas, `targetMissedNextLegalDate`), vencem hoje (avulsas com vencimento hoje e ocorrências com meta
  hoje; `appointmentsToday` = compromissos), 7 dias, aguardando cliente, concluídas **no prazo** (dia
  da conclusão no fuso do escritório ≤ vencimento/prazo legal; sem vencimento conta no prazo) e **com
  atraso**, canceladas, e a divisão `standalone`/`recurring`. `oldestOverdue` (a mais antiga
  atrasada, com quem está). `byAssignee` (`TaskAssigneeStats`, ranking "quem concentra mais") e
  `byClient` (com algo em aberto). `mine`: o que está aberto com você em qualquer departamento —
  tarefas (até 20) e `occurrences` agregadas ("8 de 12 dos seus clientes"), até a próxima competência.
- `obligations` (`TaskObligations`, spec §6.5): as recorrentes do departamento na competência, por
  recorrente e período (atrasadas pendentes primeiro, depois pela meta, as completas por último), com o
  total, concluídas, canceladas, pendentes e pendentes atrasadas. Tudo em SQL agregado.

### Atividade (`GET /tasks/activity`)

Comentários dos **outros** nos últimos 5 dias em tarefas de que você é responsável ou criador, com
trecho de 80 caracteres (do texto decifrado), até 50 (Effy `atividadeRecente`).

## Tarefas recorrentes e ocorrências (fase 2)

Porte de `ObligationDef`/`ObligationCompany` do Effy, com as ocorrências **materializadas**: cada
ocorrência é uma linha de `tasks` (uma por recorrente, cliente e período), aberta no mesmo detalhe da
tarefa, com subtarefas, comentários, anexos e histórico. Serviços: `modules/tasks/recurring.ts`
(cadastro), `generation.ts` (geração, ressincronização, reatribuição), `occurrences.ts` (agregação e
células).

- **Cadastro** (`recurringTaskInputSchema`, administradores): nome, descrição (cifrada), departamento
  (obrigatório quando o espaço tem departamentos: 422 "Escolha o departamento."), categoria,
  responsável padrão, periodicidade (`weekly | monthly | bimonthly | quarterly | semiannual | annual`),
  **prazo legal obrigatório** (`dueDay`: dia 1–31, onde 31 vira o último dia dos meses curtos; na
  semanal, o dia da semana ISO 1–7, a spec usa segunda a sexta) e, de bimestral a anual, o mês-âncora
  `dueMonth`; meta interna `targetDaysBefore` (0–30; semanal 0–6); regra de dia não útil
  (`anticipate | postpone | keep`); competência de referência `referenceOffset` (0 = a mesma, 1 = a
  anterior — padrão —, até 12; semanal sempre 0); regimes e/ou clientes específicos (união), menos as
  **exceções** (`excludedClientIds`); `startCompetence` (padrão: a atual) e `endCompetence` (inclusive).
  Sem prazo legal nada é gerado: o schema recusa (400 "Informe o prazo legal").
- **Competência** = mês em que cai o prazo legal **nominal** (antes do ajuste de dia não útil): é a
  coluna da auditoria. Mensal e mais longas: um período por competência (`periodKey` = `AAAA-MM`).
  Semanal: um período por semana de segunda a domingo cujo dia do prazo cai no mês (`periodKey` = a
  segunda-feira `AAAA-MM-DD`). Bimestral/trimestral/semestral: o mês-âncora e a cada 2/3/6 meses; anual:
  o mês-âncora. **Referência** = competência − `referenceOffset` ("ref. 09/2026").
- **Prazos** (`utils/tasks.ts`, `occurrencesInCompetence`): prazo legal = dia nominal ajustado pela
  regra (só fins de semana e **feriados nacionais**: os fixos — Confraternização, Tiradentes, Dia do
  Trabalho, Independência, Aparecida, Finados, Proclamação, Consciência Negra a partir de 2024, Natal —
  e os móveis pela Páscoa: Carnaval segunda e terça, Sexta-feira Santa, Corpus Christi; Carnaval e
  Corpus Christi são pontos facultativos federais sem expediente bancário, por isso contam como não
  úteis nos prazos — §18, item 19d da spec pede a confirmação do escritório). A meta = prazo legal − N
  dias corridos, sempre antecipada para dia útil, nunca depois do prazo legal. `nationalHolidayName` dá
  o nome do feriado (a prévia do cadastro diz "20/11 é feriado"). Feriados estaduais e municipais não
  entram.
- **Geração idempotente**: `ensureOccurrences` calcula, por competência, as ocorrências que deveriam
  existir (clientes **ativos** na competência — início de contrato até ela, não inativados antes do seu
  primeiro dia — que se aplicam, dentro do início/encerramento) e insere só as que faltam, com
  `ON CONFLICT DO NOTHING` sobre `tasks_occurrence_uq` (dois pedidos ao mesmo tempo não duplicam).
  Roda ao ler uma competência (lista e início: duas competências antes e duas depois da atual;
  auditoria, calendário, relatórios e o detalhe da ocorrência: as competências pedidas), ao criar ou
  editar a recorrente e em `POST /tasks/recurring/generate` (administradores). Limites: de 24
  competências antes a 2 depois da atual (fora disso, 422); espaço sem assinatura com escrita não
  gera (lê o que existe). **Marcador de geração** (migração 0018): cada par recorrente × competência
  gerado fica em `task_generation_marks` com a versão de geração do espaço (`task_generation_state`) e a
  versão das regras do código (`GENERATION_RULES`); as leituras seguintes pulam os pares marcados (sem
  carregar clientes nem varrer as ocorrências existentes). Gatilhos do banco sobem a versão quando muda
  o que decide quais ocorrências existem: recorrente (inserção; prazo, periodicidade, regimes,
  competências), seus vínculos de clientes, e o tipo, regime, início de contrato, situação ou
  inativação de um cliente (inserção/edição) — então cliente novo do regime entra sozinho na leitura
  seguinte. A versão é lida antes dos dados: uma mudança confirmada no meio deixa a marca velha (gera de
  novo depois), nunca uma marca nova sobre dados velhos. Cada ocorrência gerada tem no histórico "criada" com origem `recurring` e o
  nome da recorrente, sem autor.
- **Responsável** da ocorrência: o padrão da recorrente (`default`), senão ninguém (fila do
  departamento). `PATCH /tasks/:id` com `assigneeId` numa ocorrência vale **só para ela**
  (`assignee_source = 'manual'`, nunca sobrescrito automaticamente). Os campos que vêm da recorrente
  ficam travados (`TaskDetail.lockedFields`: título, cliente, categoria, departamento, início,
  vencimento e horário; PATCH com eles → 422 "Este campo vem da tarefa recorrente…"); descrição,
  prioridade, responsável, estado, subtarefas, comentários e anexos funcionam como numa avulsa.
- **Situações derivadas** (`occurrenceSituationOf`, `OCCURRENCE_SITUATIONS`): não iniciada (`todo`),
  em andamento (`in_progress` ou `waiting_client`), **fora da meta** (aberta, meta antes de hoje e
  prazo legal hoje ou depois), **atrasada** (aberta com prazo legal antes de hoje), concluída **no
  prazo** / **com atraso** (dia da conclusão no fuso do escritório ≤ / > prazo legal; a meta não entra)
  e **cancelada** (conta à parte das concluídas). `Task.occurrence` traz recorrente, período,
  competência, referência, meta, fora da meta, origem do responsável e a situação.
- **Editar a recorrente** (`PUT`, substitui tudo) ressincroniza da competência atual em diante:
  - as ocorrências **abertas não iniciadas** (`todo`) seguem o cadastro: nome, departamento, categoria,
    prazos recalculados, referência e o responsável — menos o atribuído à mão naquela competência;
  - **em andamento** (em andamento, aguardando cliente) e **concluídas** não mudam;
  - as não iniciadas que **deixam de se aplicar** (cliente entrou nas **exceções** ou saiu dos regimes,
    recorrente **encerrada** antes da competência, período que deixou de existir) são **canceladas**,
    com o motivo no histórico ("A tarefa recorrente deixou de se aplicar a este cliente (exceção ou
    regime)", "…foi encerrada antes desta competência", "…mudou e esta ocorrência deixou de existir");
    as em andamento ficam;
  - uma ocorrência que **o sistema** cancelou e que volta a se aplicar (a exceção foi retirada) volta a
    "A fazer", com registro; um cancelamento feito por uma pessoa nunca é desfeito;
  - as que faltam são geradas.
- **Excluir** é recusado (409 "…já tem histórico… Defina \"Encerra em\"…") quando alguma ocorrência
  foi trabalhada (estado diferente de "A fazer", atribuída à mão, com comentários, anexos ou
  subtarefas); sem histórico, a recorrente sai com as ocorrências intocadas. Encerrar
  (`endCompetence`) é o "arquivar" da spec (§18): a lista filtra `status=active|ended|all`.
- **Lista** (`GET /tasks/recurring`): cada `RecurringTask` traz as regras, meses em que ocorre, clientes
  a que se aplica hoje (`clientCount`), a **distribuição** da competência atual (todas com o
  responsável padrão, ou "sem responsável"), ocorrências geradas e o
  progresso do mês pedido (total, concluídas, canceladas, em andamento, atrasadas, prazo legal e
  meta); filtros por mês, busca, periodicidade, departamento, responsável (padrão ou de alguma
  ocorrência do mês), regime e situação. `summary`: ativas, encerradas e as ocorrências do mês.
- **Ocorrência por cliente** (`GET /tasks/recurring/:id/occurrences/:period`,
  `RecurringOccurrenceDetail`): o agregado, a descrição decifrada e uma `OccurrenceCell` por cliente
  (com nome, razão social, CNPJ decifrado e regime).

## Recorrência em qualquer tarefa (migração 0019)

Toda tarefa pode se repetir: sem `recurrence`, um vencimento só (como sempre); com `recurrence`
(`taskRecurrenceInputSchema`), a regra escolhida. **Um motor só**: a tarefa vira uma tarefa recorrente de
**origem `task`** (`recurring_tasks.origin`; as do cadastro são `registry`) com **um cliente** (vínculo
`include`) ou **interna** (`internal`, uma ocorrência por período, `client_id` nulo), responsável padrão = o
da tarefa, departamento = o do responsável (ou a fila). As ocorrências são geradas por `ensureOccurrences`
com o marcador da 0018, como as do cadastro, e levam `occurrence_origin = 'task'`, a prioridade, o
horário e a descrição da série. Serviços: `modules/tasks/task-recurrence.ts` (série) e `service.ts`.

- **Regra** (`taskRecurrenceInputSchema`): `frequency` = `daily | weekly | monthly | bimonthly | quarterly |
  semiannual | annual`; `interval` "a cada N" dias/semanas/meses (só diária, semanal e mensal, 1–99,
  contado a partir do início); `weekdays` na semanal (ISO 1–7, um ou vários, cada dia uma ocorrência);
  `dueDay` (mensal em diante; padrão o dia do início) e `dueMonth` (bimestral em diante; padrão o mês do
  início); `startDate` (padrão: o vencimento da tarefa, senão hoje; no mínimo o 1º dia da competência
  anterior → 422 "A recorrência pode começar a partir de…"); `ends` = `never | date (endDate, inclusive) |
  count (1–500; o fim é calculado por `seriesEndDate` e gravado)`; regras de obrigação como no cadastro:
  `targetDaysBefore` (meta; 0 na diária, até 6 na semanal), `nonBusinessDayRule` (`anticipate | postpone |
  keep`, e `skip` = sem ocorrência em fim de semana/feriado, só diária e semanal, o padrão delas; nas demais
  o padrão é `anticipate`) e `referenceOffset` (0 na diária/semanal; padrão 0).
- **Agenda compartilhada** (`utils/tasks.ts`): `occurrencesInCompetence` com diária, semanal em dias
  escolhidos, "a cada N", limites `startDate`/`endDate` e `skip`; chave do período = a data nas diárias e
  semanais por dias (a semanal do cadastro continua com a segunda-feira) — `competenceOfPeriod`,
  `isDateKeyedSchedule`, `firstScheduledOccurrence`, `seriesEndDate`.
- **Criar** (`POST /tasks` com `recurrence`): a tarefa é a **primeira ocorrência** (vencimento = primeira data
  da regra a partir do início, que pode diferir do enviado); 422 "Essa recorrência não tem nenhuma
  ocorrência." e "O cliente ainda não está ativo em MM/AAAA." (cliente ativo na competência da primeira).
  As seguintes são geradas na janela (−2/+2 competências). **Sem retroativo**: nada com prazo antes de hoje é
  gerado para origem `task` (só a própria tarefa pode estar no passado).
- **Tornar repetível** (`PATCH` de uma tarefa sem recorrência com `recurrence`): a própria tarefa vira a
  primeira ocorrência (o vencimento passa à primeira data da regra; histórico "updated" com
  `recurrence`). Etapa de processo → 422 "Etapas de processo não se repetem.".
- **Só esta × esta e as próximas** (ocorrência de origem `task`): `applyTo: 'occurrence'` (padrão,
  compatível) altera só a ocorrência — descrição, prioridade, responsável (`manual`, "Atribuída só nesta
  ocorrência"); título, cliente, categoria, departamento, horário e datas → 422. `applyTo: 'series'` (ou
  enviar `recurrence`) altera a **série**: título, cliente, categoria, responsável, fila, prioridade,
  descrição e horário; a ocorrência editada recebe tudo na hora e as não iniciadas da competência atual em
  diante seguem (`syncOpenOccurrences`); em andamento e concluídas não mudam. **Datas** vêm sempre da regra
  (`startDate`/`dueDate` → 422). Troca de cliente (inclusive para interna e de volta) **move** as não
  iniciadas no lugar (sem cancelar e recriar). Regra nova: as não iniciadas cujo período deixou de existir
  são canceladas com motivo, as que faltam são geradas, e a ocorrência editada, se "A fazer", **muda para o
  período novo mais próximo** a partir do seu vencimento quando ele está livre (o `id` não muda).
- **Encerrar** (`recurrence: null`): a série termina nesta ocorrência (`ends: 'date'`); as não iniciadas
  depois dela são canceladas ("A recorrência foi encerrada antes desta data"). **Desfazer "Repetir"**: se a
  tarefa é a primeira ocorrência e nenhuma outra foi trabalhada, `recurrence: null` a devolve a **avulsa**
  (mesmo vencimento; série e ocorrências intocadas apagadas). Reativar: `recurrence` numa ocorrência da série
  encerrada reaproveita a série.
- **Excluir** (`DELETE /tasks/:id`, `deleteTasks`) numa ocorrência de origem `task`: a série inteira, se
  nenhuma ocorrência foi trabalhada (mesma regra de `DELETE /tasks/recurring/:id`); senão 409 "Esta tarefa
  se repete e já tem histórico…".
- **Permissão**: qualquer membro cria, altera a série ou encerra quando ela é **sua** (responsável) ou do
  **seu departamento**, antes e depois da mudança (passar a série para outro departamento é como criá-la
  lá); o resto exige `registry` → 403 "Você só pode repetir tarefas suas ou do seu departamento.". Ocorrência
  do **cadastro** com `recurrence`/`applyTo: 'series'` → 422 "Esta tarefa vem de uma tarefa recorrente do
  cadastro: altere-a em Recorrentes." `TaskDetail.recurrence.canEdit` diz se pode.
- **Resposta**: `Task.kind = 'recurring'` e `Task.occurrence.origin` (`registry | task`, `period` pode ser
  `daily`); `TaskDetail.recurrence: TaskRecurrence | null` (só origem `task`: a regra, `endDate` calculado,
  `active`, as 5 próximas datas, `occurrenceCount`, `canEdit`). `lockedFields` continua o da ocorrência (o
  modo `occurrence`). Reabrir uma ocorrência de origem `task` concluída segue a regra de qualquer tarefa (o
  registro de auditoria com motivo é só do cadastro).
- **Onde aparecem** (decisão): ocorrências de origem `task` são **tarefas** — na lista (`items`, nunca em
  `occurrences`), em "Minhas" do início, no calendário (`tasks`), nos relatórios e nos totais (contam como
  `recurring`). Sem filtro de data, a lista e "Minhas" mostram as dos **próximos 7 dias** e a **próxima em
  aberto** de cada série (`visibleSeriesSql`: uma diária não enche a lista com dois meses); com `month`/
  `dueFrom`/`dueTo`, todas do período. **Ficam fora da auditoria mensal** (com cliente ou internas: não são
  obrigação do cliente e uma diária criaria ~22 colunas por competência), dos blocos de obrigações
  (`obligations` do início; "Pendências fiscais", "Processos por departamento" e "Visão geral dos clientes"
  do dashboard), dos agregados `RecurringOccurrence` e dos grupos padrão por regime. A busca mostra só a
  próxima ocorrência em aberto de cada série; os resultados `recurringTasks` são do cadastro.
- **Lista de recorrentes** (`GET /tasks/recurring`): `origin=registry` (padrão, nada muda), `task` ou
  `all`; itens de origem `task` com `client` (null = interna), `recurrence` e `nextTaskId` (próxima
  ocorrência aberta; sem ela, a última). `summary.byOrigin` conta as ativas por origem. `GET/PUT/DELETE
  /tasks/recurring/:id` e o detalhe por cliente continuam só do cadastro (404 para origem `task`, que se
  gerencia pela tarefa).
- **Membro muda de departamento**: as séries de origem `task` dele seguem a regra das ocorrências (ficam no
  departamento da série).

## Área pessoal (`GET /tasks/me/overview`)

O que a área do usuário (clicar no avatar; `view-perfil` do Effy) precisa além do calendário
(`scope=mine|department`), das anotações, do início e do dashboard. Tudo em SQL agregado
(`modules/tasks/overview.ts`), unidades como no início (tarefas e ocorrências, uma por cliente). **Só os
números da pessoa** e, na comparação, o **agregado** do departamento — nunca o de um colega.

- `open`: o que está aberto com você agora, em qualquer departamento (horizonte e visibilidade de
  "Minhas"): total, atrasadas, vencem hoje/amanhã (data de trabalho), próximos 7 dias, fora da meta (e o
  prazo legal mais próximo), aguardando cliente, sem vencimento e a mais antiga atrasada.
- `productivity`: o que **você concluiu** (quem clicou em Concluir) no mês `month` (padrão: o atual), pelo
  dia da conclusão no fuso do escritório — no prazo (≤ vencimento/prazo legal; sem vencimento conta no
  prazo) × com atraso, `onTimeRate` 0–100, média de dias da criação à conclusão, `trend` dos 6 meses até o
  mês e `rateChange` (pontos contra o mês anterior). Filtra um intervalo de `completed_at` com
  `status = 'done'` literal (índice `tasks_completed_idx`).
- `upcoming`: hoje a hoje + 14 (as atrasadas estão em `open`): até 15 tarefas pela data de trabalho
  (com horário) e as ocorrências do cadastro agregadas; `total` em unidades.
- `workload`: por dia da semana (ISO 1–7, os sete): suas abertas pela data de trabalho nas próximas 4
  semanas (`due`, todas as ocorrências) e suas conclusões nas últimas 8 (`concluded`).
- `comparison`: você × a **média por membro** do seu departamento (membros atuais) no mês — concluídas,
  % no prazo (sobre todas as conclusões do departamento), abertas e atrasadas agora. Sem departamento,
  `null`; com menos de `MIN_DEPARTMENT_COMPARISON_MEMBERS` (3) membros, `average: null` (a média revelaria
  os números de um colega).
- `insights` (até 6, por urgência; `overview-insights.ts`, textos pt-BR prontos): atrasadas ("Você tem 2
  tarefas atrasadas; a mais antiga venceu há 10 dias."), vencem hoje, fora da meta, vencem amanhã ("3
  tarefas vencem amanhã."), % no prazo ("Você concluiu 92% no prazo este mês (23 de 25)." / "Só 60%…"),
  tendência (±10 pontos), departamento (acima da média em concluídas, ou mais atrasadas que a média),
  aguardando cliente, dia mais cheio da semana e "tudo em dia". `link` = filtro de "Minhas" na lista
  (`situation` com os valores de `TASK_SITUATIONS`, `dueBucket` ou `dueDate`).
- Testes: `test/tasks-overview.test.ts` (números, tendência, comparação com 2 e 3 membros, nada de outra
  pessoa na resposta, insights puros) e o roteiro de `test/tasks-scope.test.ts`.

## Auditoria mensal (fase 2)

Só as recorrentes do **cadastro** (origem `registry`); a recorrência de tarefas fica fora (ver acima).

Porte de `StatusMatrixEntry` + `AuditConclusion` + `monthlyAudit.service`, agora sobre as ocorrências
geradas (`modules/tasks/audit.ts`). `GET /tasks/audit?competence=` devolve a matriz cliente ×
recorrente: `columns` (um `RecurringOccurrence` por recorrente e período — a semanal tem uma coluna
por semana —, pela meta e depois pelo nome), `clients` (`AuditClientRow`: contagens, pendentes
atrasadas e fora da meta, e `monthConcludedAt`), `cells` (`OccurrenceCell`: id da tarefa, estado,
situação, responsável e origem, prazos, atrasada, fora da meta, quem concluiu e quando, no prazo e
`canReopen`) e `summary` (`AuditSummary`, **a competência inteira**, sem os filtros: concluídas, com
atraso, canceladas, pendentes, atrasadas, fora da meta, clientes com pendência, com atraso e com o mês
concluído, e por departamento). Filtros: regime, departamento, recorrente e responsável (os clientes
em que a pessoa responde por alguma célula, com todas as células deles). Ausência de célula = "Não
se aplica".

- **Mudar o estado** de uma célula é `PATCH /tasks/:id/status` (o mesmo endpoint das listas e do
  detalhe): o servidor grava quem concluiu e quando; qualquer membro marca a célula de um colega.
- **Mês concluído do cliente** é derivado: todas as ocorrências do cliente na competência concluídas
  (as canceladas não contam), com o instante da última conclusão. Reabrir uma célula (ou uma ocorrência
  nova gerada para ele) desfaz.
- **Reabrir uma ocorrência concluída**: só **quem concluiu** ou um **administrador** (403 "Só quem
  concluiu ou um administrador pode reabrir esta tarefa."), com **motivo** obrigatório (`reason`, até
  500 caracteres; 422 "Informe o motivo da reabertura.") — exceto o **desfazer** de quem concluiu em
  até 15 minutos (`UNDO_WINDOW_MS`). O motivo (cifrado), quem e quando ficam no histórico; conclusões e
  reaberturas nunca se apagam. Cancelada não é registro de conclusão: reabre-se livremente.

## Processos e modelos (fase 2)

Porte de `TaskFlow`/`TaskFlowStep`/`TaskFlowTemplate`/`TaskFlowTemplateStep` (`flows.ts` e
`flow-engine.ts`).

- **Modelos** são cadastro (administradores): etapas com título, descrição (cifrada), departamento,
  categoria, responsável, prioridade e prazo **relativo** em dias (0–365), até 30 etapas. Editar
  substitui as etapas (a ordem é a identidade, como no Effy); processos já aplicados são cópias e não
  mudam; excluir o modelo só tira a referência deles. A lista traz etapas, prazo total, departamentos e
  quantas vezes foi aplicado.
- **Aplicar** (todos): escolhe-se o cliente (e, opcional, o nome; padrão "Modelo · Cliente"); as etapas
  são copiadas com o cliente, e a **etapa 1 vira tarefa agora**, com vencimento hoje + N dias (fuso do
  escritório). **Processo avulso** (todos): etapas montadas na mão, com data absoluta ou prazo em dias,
  e um cliente por etapa se preciso; `saveAsTemplate` salva também como modelo (só administradores;
  prazos em dias).
- **Motor**: só a etapa ativa é tarefa (as demais não aparecem em lista nenhuma). Concluir a tarefa da
  etapa N grava a conclusão da etapa uma vez e **ativa a N+1** (idempotente: a etapa é travada
  `FOR UPDATE` e ativada uma vez), com vencimento = dia da conclusão no fuso do escritório + N dias; a
  resposta do PATCH traz `activated`. A tarefa da etapa é criada pelo autor do processo, "A fazer", no
  departamento do responsável (sem responsável, o da etapa). `Task.flow` = "Etapa 2/4";
  `TaskDetail.flowProgress` = o processo inteiro.
- **Reabrir uma etapa concluída** (qualquer saída de `done`, inclusive o desfazer): se a etapa seguinte
  **não foi iniciada** (tarefa "A fazer", sem comentários, anexos ou subtarefas), ela **volta a
  aguardar** — a tarefa dela é removida, o prazo calculado é limpo e o histórico da etapa reaberta diz
  "A etapa N (…) voltou a aguardar esta etapa" —, e a conclusão da etapa é apagada (concluir de novo
  conta o prazo da seguinte a partir do novo dia). Se a seguinte **já foi iniciada ou concluída**, a
  reabertura é recusada: **409** "Não é possível reabrir esta etapa: a etapa seguinte, “…”, já foi
  iniciada (concluída). Corrija pela etapa seguinte." (com `details.nextStep`).
- **Excluir processo** (administradores): saem as etapas; as tarefas já criadas continuam, sem vínculo.
  Excluir a tarefa de uma etapa deixa a etapa sem tarefa (o processo para ali). A lista
  (`GET /tasks/flows`) traz até 200 processos (`active`, `done` ou `all`; filtro por cliente).

## Histórico da tarefa (fase 2)

`task_events`, escrito pelos serviços (`events.ts`), lido em `GET /tasks/:id/history`
(`TaskHistoryResponse`, mais recentes primeiro, até 500, com o total). Tipos (`TASK_EVENT_KINDS`):
`created` (origem `manual`, `recurring` ou `flow` e `originName`: a recorrente ou o processo, sem autor
quando gerada), `updated` (`fields` alterados e `changes` com **antes/depois** de título, cliente e
categoria — pelo nome —, prioridade, início, vencimento e horário; a descrição aparece só em `fields`,
nunca o texto), `assigned` (de/para, com o motivo quando automático), `status` (de/para; cancelamento
automático com o motivo), `reopened` (de/para e o motivo), `commented`, `comment_removed`,
`attachment_added`/`attachment_removed` (o nome do arquivo) e `flow_step` (etapa `activated`,
`completed` ou `deactivated`, com o nome do processo). Edições do autosave pela mesma pessoa em até 5
minutos viram **uma** entrada (cada campo guarda o primeiro "antes" e o último "depois"; um campo que
volta ao valor inicial sai das mudanças). O texto livre (motivo, nome de arquivo, motivo automático) é
cifrado (`task_events.note`); `data` guarda só fatos estruturados (CHECK de 4000 caracteres).
`seq` (identidade) ordena as entradas gravadas no mesmo instante (a exportação LGPD devolve as entradas
nessa ordem, mas sem `seq`: a sequência é global e revelaria quantos eventos os outros espaços gravaram). Subtarefas não geram eventos (têm
seção própria). Tarefas anteriores à fase 2 não têm eventos (a tela mostra as linhas da fase 1).

## Anexos (fase 2)

Porte de `Attachment` + `fileSignature.js` + `zipLimit.js` (`attachments.ts`, `file-check.ts`).

- **No banco**: `task_attachments.content` (bytea) **cifrado** com a chave do espaço (AES-256-GCM, IV
  de 12 bytes + texto + tag de 16 bytes; AAD = espaço, tabela, coluna **e o id do anexo**: um conteúdo
  copiado para outra linha não decifra); o nome é cifrado como texto livre. Custo: a cifra do arquivo
  inteiro é feita pelo WebCrypto em memória (10 MB ≈ dezenas de ms, na API e no PGlite); o arquivo
  viaja em base64 no JSON (o CSRF exige JSON), com `bodyLimit` próprio na rota. Funciona no demo.
- **Limites**: 10 MB por arquivo, 50 MB e 50 arquivos por tarefa e **2 GB por espaço**
  (`MAX_WORKSPACE_ATTACHMENT_BYTES`; 422 "O escritório chegou ao limite de armazenamento de anexos…"),
  60 envios por minuto por IP. Os limites são conferidos sob um lock transacional por espaço
  (`pg_advisory_xact_lock`, liberado no COMMIT): dois envios simultâneos não passam juntos do limite.
- **Tipos** (`TASK_ATTACHMENT_TYPES`): PDF, PNG, JPEG, WEBP, DOC, XLS, DOCX, XLSX, XML, TXT, CSV e ZIP.
  O tipo declarado precisa estar na lista, a **extensão** precisa ser do tipo, e o conteúdo precisa ter
  a **assinatura** do tipo (`%PDF-`, PNG, JPEG, RIFF/WEBP, OLE2, ZIP); XML, TXT e CSV não podem ter
  NUL nem marcação HTML/SVG/script. ZIP, DOCX e XLSX são lidos pelo diretório central (nada é
  descomprimido): soma declarada até 100 MB, até 10 000 entradas, ZIP64 e arquivo corrompido recusados;
  DOCX/XLSX precisam de `[Content_Types].xml` e da pasta `word/` ou `xl/`. HTML disfarçado de PDF → 422
  "O conteúdo do arquivo não corresponde ao tipo informado."; SVG/HTML como tipo → 400.
- **Nome**: `sanitizeFileName` (sem caminho, sem caracteres de controle, aspas, reservados do Windows
  e marcas bidirecionais; até 255 caracteres preservando a extensão).
- **Download**: sempre `Content-Disposition: attachment` (nome ASCII e `filename*` UTF-8),
  `Content-Type` do tipo gravado (nunca HTML/SVG), `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox` e `Cache-Control: private, no-store`.
- Qualquer membro anexa; remover é de quem anexou ou de um administrador. Antivírus não há (§18, item
  10 da spec).

## Anotações pessoais (fase 2)

Porte de `UserNote` (`notes.ts`): título e texto (até 200 e 20 000 caracteres) **cifrados**; toda
consulta filtra pelo membro da sessão — a anotação de outra pessoa é "não encontrada", inclusive para
o proprietário —, e a exportação LGPD leva só as do solicitante. Até 500 por membro; saem com o
membro que deixa o espaço (cascata). Nenhum texto do contrato sugere guardar senhas.

## Calendário, relatórios e busca (fase 2)

- **Calendário** (`GET /tasks/calendar`, `TaskCalendarResponse`, spec §7.6): até 62 dias; avulsas e
  etapas pelo vencimento (compromissos primeiro no dia, até 1000 com `truncated`), ocorrências
  agregadas por recorrente e período no **dia da meta** ("DCTFWeb · 12/30") e `noDueDate` (abertas sem
  vencimento); escopo e filtros como a lista.
- **Relatórios** (`GET /tasks/reports`, `TaskReportResponse`, `insights.ts`): tarefas de todos os tipos
  (uma ocorrência por cliente) com vencimento (prazo legal) no período — sem vencimento, criadas nele
  —, até 1 ano (422). Tudo em SQL (GROUP BY): resumo (concluídas no prazo e com atraso, canceladas, em
  aberto, atrasadas, fora da meta), por estado, prioridade, departamento, responsável, categoria,
  cliente, tipo e **mês**, e a **produtividade** (conclusões no período por quem concluiu: no prazo,
  com atraso e a média de dias da criação à conclusão; filtra por intervalo de `completed_at` — os dias
  do escritório convertidos em instantes — servido pelo índice parcial `tasks_completed_idx`). Filtros: departamento, responsável, categoria,
  cliente, prioridade, tipo, estado e situação (`open`, `done` = só concluídas, `overdue`,
  **`doneLate`** = concluídas com atraso, `doneOnTime`). Detalhamento paginado (até 1000 por página).
- **CSV** (`GET /tasks/reports/export.csv`): os mesmos filtros, até 10 000 linhas (422 pede refinar),
  `;`, UTF-8 com BOM, CRLF, proteção contra fórmula (`'` antes de `= + - @`, tab e CR, `csv.ts`),
  colunas Tarefa, Tipo, Competência, Referência, Cliente, Departamento, Categoria, Responsável,
  Prioridade, Vencimento, Meta, Situação (Atrasada/Fora da meta/estado), Concluída em (data e hora em
  São Paulo), No prazo e Concluída por; `relatorio-tarefas-AAAA-MM-DD.csv` como download (30 por
  minuto por IP). O web gera Excel/PDF a partir do JSON se precisar.
- **Busca global** (`GET /search`, ⌘K, para todos os membros): `tasks` (avulsas e etapas pelo título,
  abertas primeiro e depois pela proximidade do vencimento, até 8; as ocorrências não aparecem uma a
  uma) e `recurringTasks` (pelo nome, até 5). Sem responsável na resposta (a busca roda na transação de
  tenant, que não lê os nomes dos membros).

## Grupos padrão por regime

Como no Effy, uma recorrente se aplica por regime. O catálogo (`packages/shared/src/regime-groups.ts`:
`REGIME_GROUP_ITEMS`, `regimeGroupItems`, `REGIME_GROUP_REGIMES`, `SUGGESTED_DEPARTMENTS`,
`matchSuggestedDepartment`) traz as obrigações padrão com departamento sugerido (Fiscal, Pessoal,
Contábil), periodicidade, dia do prazo legal, meta e regra de dia não útil:

- **Comuns** (Simples Nacional, Lucro Presumido, Lucro Real): folha de pagamento, eSocial (eventos
  periódicos), FGTS Digital, DCTFWeb, EFD-Reinf.
- **Simples Nacional**: PGDAS-D e DAS (dia 20, prorroga), DEFIS (31/03, ref. dezembro).
- **MEI**: DAS-MEI (dia 20), DASN-SIMEI (31/05).
- **Lucro Presumido / Real**: PIS/COFINS, EFD-Contribuições, EFD ICMS/IPI, ECD (junho), ECF (julho);
  IRPJ/CSLL trimestrais (Presumido) ou estimativa mensal (Real).

`GET /tasks/regime-groups` (todos): por regime, `clientCount` (clientes ativos do regime na competência
atual), os itens com o departamento que receberiam (`department.match`, pelo nome) e a recorrente já
criada (`recurringTask`, `applied`), `missing` e todas as recorrentes do espaço que se aplicam ao regime
(`recurring`, do catálogo ou feitas à mão). `POST /tasks/regime-groups/:regime/apply` (`registry`):
cria as que faltam (competência atual, sem responsável padrão = fila do departamento, `catalog_key`
gravada), acrescenta o regime à recorrente comum já criada para outro regime (`regimeAdded`, com
ressincronização), não mexe nas que já o têm (`unchanged`) e informa as encerradas (`ended`). Aplicar de
novo não duplica (chave única `recurring_tasks_catalog_key_uq`; corrida → 409 amigável). Item cujo nome
(`normalizeRecurringName`: sem acento, caixa e pontuação — "DAS-MEI" = "das mei") já existe numa
recorrente **feita à mão**, ativa e do mesmo regime, não é criado nem ganha o regime: volta em `skipped`
(`reason: 'handmade'`, com a recorrente existente), salvo se a chave vier em `force`. Na listagem, cada
item traz `state` (`applied`, `handmade` — "Já existe (feita à mão)", com `handmade` —, `ended`,
`missing`; `missing` conta só os que faltam).
`keys` restringe os itens; `departments` escolhe o departamento de cada sugestão — sem ele, um existente
com nome compatível, senão é criado com o nome sugerido (`departmentsCreated`); escritório sem
departamentos recebe recorrentes sem departamento. Depois disso as recorrentes geram todo mês para cada
cliente ativo do regime (cliente novo entra na leitura seguinte, ver o marcador de geração).
Testes: `test/tasks-regime-groups.test.ts`, `packages/shared/test/regime-groups.test.ts`.

## Dashboard da Gestão (`GET /tasks/dashboard`)

Os dados dos cards do dashboard do Effy num só payload (`TaskDashboardResponse`), em SQL agregado, com a
mesma regra de departamento do Início (`resolveView`: outro departamento ou `all` exige `registry`; sem
departamento, só os seus itens) e `month` (competência dos cards de tarefas, padrão a atual):

- `taskStatus` ("Situação das tarefas"): ocorrências da competência + avulsas/etapas com vencimento no
  mês — pendentes, concluídas (com canceladas) e atrasadas.
- `flow` ("Fluxo de tarefas por dia"): abertas por data de trabalho (meta nas ocorrências), hoje e os
  6 dias seguintes, recorrentes × avulsas (o Effy usava o prazo legal; aqui segue o calendário).
- `processes` ("Processos por departamento") e `fiscal` ("Pendências fiscais": `RecurringOccurrence`
  por recorrente, atrasadas primeiro, e os totais): concluídas, pendentes e vencidas da competência.
- `agenda`: recorrentes com prazo legal nos próximos 7 dias (competência atual e a próxima) e as já
  vencidas no mês com pendência.
- `clientsOverview` ("Visão geral dos clientes"): clientes ativos na competência em `attention`
  (ocorrência vencida em aberto), `pending` ou `upToDate`, com a lista.
- `certificates` / `documents` ("Certificados digitais" / "Laudos"): documentos dos clientes ativos em
  `overdue`, `within30`, `ok` (mais de 30 dias) e `noDate`, com a lista (até 500, por vencimento) para
  o drill-down por situação.
- `conventions`: a regra de `/deadlines` (`conventionDeadlines`), mais `noBaseMonth` e `total`.
- `fees` ("Honorários próximos de vencer", só `finance`; senão `null`): a última vigência cadastrada de
  cada cliente ativo que termina em até 30 dias (inclui as já vencidas) ou entre 31 e 60, com o valor.
- `incomplete` ("Cadastro incompleto", só `registry`; senão `null`): inscrição estadual (ou isenta),
  municipal, senha do contador, código de acesso (Simples/MEI), anexo (Simples) e certificado digital —
  só presença, nunca os valores cifrados (`CLIENT_COMPLETENESS_FIELDS`, `completenessFieldsOf`).

Testes: `test/tasks-dashboard.test.ts`.

## Banco (migração 0020)

- `task_categories.is_rework boolean not null default false`: categorias de retrabalho (veja
  "Retrabalho" em Contas/relatórios). Sem índice novo: as contagens leem `tasks` por
  `(workspace_id, category_id)` (`tasks_category_idx`). Reexecutável (`IF NOT EXISTS`) e roda no PGlite.

## Banco (migração 0019)

- `recurring_tasks`: `origin` (`registry` | `task`, nunca muda), `internal`, `repeat_interval`, `weekdays
  integer[]`, `start_date`/`end_date` (datas nominais, inclusive; as competências acompanham),
  `occurrence_limit`, `priority`, `start_time`/`end_time`. CHECKs: período `daily` e regra `skip` (só diária
  e semanal com dias), `recurring_tasks_recurrence_chk` (intervalo 1–99 só diária/semanal/mensal com
  início, dias 1–7 só na semanal, fim ≥ início, limite 1–500 com fim), `recurring_tasks_origin_chk` (linha do
  cadastro sem nada disso; de tarefa sem regimes e com início), prioridade e horário.
  `unique (workspace_id, id, origin)` para a FK abaixo.
- `tasks.occurrence_origin`: origem da série da ocorrência (nula fora de ocorrências), mantida igual à da
  série pela FK composta `tasks_recurring_origin_fk`; backfill `registry` por espaço (FORCE RLS). O
  `tasks_occurrence_chk` aceita ocorrência sem cliente só de origem `task`;
  `tasks_internal_occurrence_uq` (parcial) dá às internas a unicidade que `tasks_occurrence_uq` dá às demais
  (a geração usa `ON CONFLICT DO NOTHING` sem alvo).
- O gatilho de versão de geração passa a observar `internal`, `repeat_interval`, `weekdays`, `start_date` e
  `end_date`. Reexecutável e roda no PGlite; `tasks-phase2-db` e `tasks-0017-db` reexecutam a 0019 depois das
  migrações antigas que reaplicam os CHECKs anteriores.

## Banco (migrações 0017 e 0018)

- **0017**: remove `task_client_responsibles` (política, grants e FKs com a tabela); converte as
  ocorrências `assignee_source = 'client'` (por espaço, com `app.workspace_id`) e tira `client` do
  `tasks_occurrence_chk`. Reexecutável; roda no PGlite. Teste: `test/tasks-0017-db.test.ts`.
- **0018**: `task_generation_state` e `task_generation_marks` (tabelas de tenant: RLS ENABLE + FORCE,
  política padrão, só DML para `effinance_app`, FK composta da marca para a recorrente em cascata);
  gatilhos `task_generation_bump` (linha) e `task_generation_bump_links` (instrução, com tabela de
  transição) — invoker, `search_path` fixo, sem EXECUTE para PUBLIC; exclusões não sobem a versão (a
  cascata da exclusão do espaço não pode gravar), nem o `ON DELETE SET NULL` do criador/responsável
  padrão (a recorrente só dispara nas colunas de agenda/regimes/competências). `recurring_tasks.catalog_key`
  (CHECK de formato, único por espaço) e o índice parcial `tasks_completed_idx`. Testes:
  `test/tasks-generation.test.ts`, catálogo em `test/audit-db.test.ts`.

## Banco (migração 0011)

Tabelas de tenant (RLS `ENABLE`+`FORCE`, política única por espaço, `GRANT` só de DML ao
`effinance_app`, FKs compostas, índice para cada FK): `task_departments` (nome único sem diferenciar
maiúsculas), `task_department_members` (PK `(workspace_id, user_id)`: um departamento por membro;
FK para `workspace_members` em cascata), `task_categories` (ícone de `ICON_NAMES`, cor), `tasks`
(CHECKs de estado, prioridade, `reopen_status`, horário, datas e conclusão; FK do cliente sem cascata;
categoria e responsável `SET NULL` só na coluna; autoria → `users` `SET NULL` + nome gravado),
`task_subtasks` e `task_comments` (cascata com a tarefa) e `task_client_responsibles` (PK
`(workspace_id, client_id, department_id)`; cascata com cliente, departamento e membro). A FK
`(workspace_id, assignee_id) → workspace_members (workspace_id, user_id)` garante que só membros do
próprio espaço sejam responsáveis. Reexecutável e roda no PGlite. O login da API não tem acesso
direto às tabelas (só via `effinance_app`).

## Banco (migração 0012)

Reforço de segurança das tabelas de tarefas:

- **Só clientes**: coluna gerada `client_kind` (sempre `'client'`) em `tasks` e
  `task_client_responsibles`, com FK `(workspace_id, client_id, client_kind) → contacts (workspace_id,
  id, kind)`. Fornecedor não pode ser cliente de tarefa, e cliente com tarefas não vira fornecedor.
- **Eliminação LGPD**: gatilhos `BEFORE UPDATE` trocam `created_by_name`, `completed_by_name` e
  `author_name` por "Usuário excluído" quando o `ON DELETE SET NULL` de `users` limpa o id (exclusão
  da conta). Sair do espaço mantém o nome.
- **CHECKs** espelhando o contrato: descrição 1–5000 (substituído na 0013, quando a descrição passou a
  ser cifrada), nome de categoria 1–60, nomes gravados 1–120.
- **Índices** parciais das abertas por responsável e por departamento (mesmo predicado do
  `OPEN_SQL`) e de comentários recentes.

## Banco (migração 0013)

Descrição e comentários cifrados por campo (CWE-312):

- **CHECKs** `tasks_description_chk` e `task_comments_text_chk` trocam o tamanho 1–5000 (que recusaria
  o texto cifrado: 5000 caracteres viram até ~20 mil, ~27 mil com caracteres de 4 bytes) pelo
  **formato** `^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$` (texto em claro é recusado) e um **teto**
  de 28000 caracteres. O limite de 5000 continua no contrato (Zod). Criadas `NOT VALID`: linhas
  anteriores à migração ficam em claro até o backfill, e toda linha inserida ou alterada depois é
  conferida (um UPDATE numa linha legada antes do backfill falha com 23514).
- **Backfill**: a migração limpa `workspaces.encryption_backfilled_at` de todos os espaços (o dono
  das tabelas não enxerga as linhas de tarefas: RLS forçado), e o `backfillEncryption` — logo depois
  das migrações no `db:migrate` e na abertura do demo — cifra descrições e comentários em claro
  (`db/backfill.ts`; ignora o que já está cifrado). Depois, rode `VACUUM FULL tasks, task_comments`
  numa janela de manutenção (as versões antigas ficam em tuplas mortas, WAL e backups até expirarem).
- Reexecutável (`DROP … IF EXISTS` antes de cada constraint; rodar de novo só faz o backfill conferir
  outra vez) e roda no PGlite (sem `CONCURRENTLY`). Teste: `test/tasks-db.test.ts` reaplica a 0013
  sobre linhas legadas e roda o backfill.

## Banco (migração 0014)

Fase 2, escrita à mão, reexecutável (IF NOT EXISTS, DROP … IF EXISTS antes de cada constraint,
política e gatilho, CREATE OR REPLACE) e roda no PGlite (sem CONCURRENTLY). Mesmo padrão de tenant:
RLS `ENABLE`+`FORCE` com política única por espaço, `GRANT` só de DML ao `effinance_app` (catálogo em
`test/db-roles.ts`), FKs compostas `(workspace_id, …)` com `ON DELETE SET NULL (coluna)` onde a
referência pode sumir, índice para cada FK, CHECKs espelhando o contrato. Tabelas novas só recebem
dados cifrados pela API: não há backfill.

- `recurring_tasks`: cadastro (descrição cifrada; CHECKs de periodicidade, do prazo por periodicidade —
  semanal 1–7 sem mês, mensal 1–31, as demais com mês-âncora —, meta, referência, regimes de
  `TAX_REGIMES`, competências `AAAA-MM` e encerramento ≥ início). Departamento sem cascata (o
  departamento com recorrentes não é excluído), categoria e responsável padrão `SET NULL`.
- `recurring_task_clients`: clientes específicos (`include`) e exceções (`exclude`), PK
  `(workspace_id, recurring_task_id, client_id)`, só clientes (`client_kind` gerado), cascata com a
  recorrente e com o cliente.
- `tasks` ganha `recurring_task_id` (FK sem cascata), `competence`, `period_key`, `reference_month`,
  `target_date` e `assignee_source`; `tasks_occurrence_uq` = `(workspace_id, recurring_task_id,
  client_id, period_key)` (alvo do `ON CONFLICT` da geração; nulos nas avulsas) e
  `tasks_occurrence_chk` (avulsa: tudo nulo; ocorrência: cliente, prazo legal, meta ≤ prazo legal,
  competência, referência e período preenchidos e no formato). Índices por recorrente e competência.
- `task_flow_templates`/`task_flow_template_steps` (descrições cifradas; posição 1–30 única; prazo
  0–365; departamento, categoria e responsável `SET NULL`), `task_flows` (cliente sem cascata; modelo
  `SET NULL`) e `task_flow_steps` (cascata com o processo; `task_id` único e `SET NULL (task_id)`;
  CHECK de ativação/conclusão; descrição cifrada).
- `task_events`: histórico (`seq` identidade para a ordem, `kind` do contrato, `data` jsonb objeto até
  4000 caracteres, `note` cifrada; cascata com a tarefa).
- `task_attachments`: id gerado pela API (entra na AAD), nome cifrado, tipo da lista, tamanho 1 B–10 MB
  e `octet_length(content) = size_bytes + 28` (o conteúdo é sempre IV + cifra + tag), cascata com a
  tarefa.
- `task_notes`: título e texto cifrados (teto do texto: 81 000 caracteres de cifra), FK para
  `workspace_members` em cascata (sai com o membro).
- **LGPD**: gatilhos `BEFORE UPDATE` (como na 0012) trocam o nome gravado por "Usuário excluído"
  quando a exclusão da conta limpa o id: `recurring_tasks`, `task_flow_templates` e `task_flows`
  (`created_by_name`), `task_events` (`actor_name`) e `task_attachments` (`uploaded_by_name`).
  Exportação (`GET /workspaces/current/export`): todas as tabelas novas decifradas, anexos só com
  metadados (os arquivos se baixam um a um) e só as anotações do solicitante.
- Testes: `test/tasks-phase2-db.test.ts` (RLS, referências entre espaços, CHECKs e listas do
  contrato, ON DELETE, LGPD, exportação e reexecução da migração), além do catálogo em
  `test/audit-db.test.ts`.

## Diferenças deliberadas em relação ao Effy

- Departamento das tarefas abertas acompanha o membro quando ele muda de departamento; a recorrente
  tem departamento **escolhido** no cadastro (no Effy, derivado do responsável), e a ocorrência fica
  nele.
- Nomes de quem criou/concluiu/comentou/anexou ficam gravados (o Effy impedia excluir usuário com
  histórico; aqui o membro pode sair sem perder a autoria; se a conta for excluída, o nome vira
  "Usuário excluído" — LGPD).
- "Reabrir" volta ao estado anterior à conclusão (`reopenStatus`), como a spec pede.
- Excluir tarefa é de administrador (no Effy, a chave `delTasks`); criar/editar/concluir é de todos.
- **Ocorrências materializadas**: no Effy a matriz guardava só o estado (`StatusMatrixEntry`) e o
  front calculava o produto empresa × obrigação; aqui cada ocorrência é uma tarefa, com responsável
  por cliente, prazo legal, meta, comentários, anexos e histórico. A conclusão é o
  `completed_at/by` da tarefa (no Effy, `AuditConclusion`, regravada a cada nova conclusão).
- **Prazo legal obrigatório** (o Effy aceitava recorrente sem data-base), meta interna, regra de dia
  não útil com feriados nacionais, competência de referência, 6 periodicidades, exceções e
  vigência — novos.
- **Reabrir célula** só por quem concluiu ou administrador, com motivo (no Effy, qualquer um voltava o
  estado, e o registro de conclusão sumia).
- **Excluir recorrente com histórico** é recusado (o Effy apagava a auditoria em cascata): encerra-se.
- **Reabrir etapa de processo**: a seguinte não iniciada volta a aguardar; iniciada → 409 (no Effy,
  reabrir não fazia nada com a seguinte, e o prazo dela ficava congelado).
- **Anexos no banco e cifrados** (no Effy, disco do servidor), com assinatura conferida para todos os
  tipos (o Effy aceitava TXT/CSV sem conferir) e XML/ZIP novos.
- **Anotações cifradas** (no Effy, texto puro).
- Relatórios calculados no servidor em SQL (no Effy, o front agrupava `taskItems`); canceladas à parte
  das concluídas.

## Pendências

- **Fase 3**: ver "Fase 3 → Lacunas".
- **Um membro em mais de um departamento** não existe (spec rev. 3, §1: no máximo um; mantido).
- **Feriados estaduais e municipais** (por cidade do escritório) e a confirmação de Carnaval e Corpus
  Christi como dias não úteis (§18, item 19d).
- **Prazos "N-ésimo dia útil"** (ex.: folha no 5º dia útil, EFD-Contribuições no 10º dia útil) não são
  expressáveis: hoje é o dia do mês com a regra de dia não útil (o catálogo dos grupos por regime aproxima).
- **Voltar a ocorrência ao responsável automático** depois de atribuída à mão: não há ação própria
  (atribuir de novo ao responsável padrão deixa a origem `manual`).
- **Grupos por regime**: os prazos do catálogo são sugestões (dia usual; conferir a legislação vigente,
  ex.: DCTFWeb, EFD ICMS/IPI por UF); MEI com empregado não recebe as obrigações de empregador; aplicar
  não reabre recorrente encerrada (`ended`). O dashboard não filtra por regime (o Effy filtrava).
- **Excluir a tarefa de uma etapa** deixa o processo parado na etapa (sem tarefa); a tela pode oferecer
  excluir o processo.
- **Anexos**: antivírus e, se o volume crescer, armazenamento de objetos (S3 cifrado, já previsto em
  `docs/deploy-aws.md`) — §18, item 10.
- **Notificações persistentes** (atribuição, menção): o sino usa a atividade recente e as atrasadas.
- **Processos em andamento** (§12.1, §18 item 9): a API oferece a lista; o produto confirma se a tela a
  mostra.

---

# Fase 3: permissões, sindicatos, dados fiscais, escritório e foto

Especificação: `docs/tarefas-ui.md` rev. 3, §2.6, §6.10, §13.7–§13.10, §15.3 e §18 itens 11–18.
Contrato em `packages/shared`: `permissions.ts` (chaves, rótulos, padrões, `effectivePermissions`…),
seção "Phase 3" de `constants.ts` (tipos de documento, faixas de vencimento, campos de acesso, situações
do sindicato, tipos de chave Pix, tipos de bloco e limites do contrato), `schemas.ts`, `types.ts`,
`utils/deadlines.ts` (faixas e ciclo da convenção), `utils/contract.ts` (campos, números por extenso,
preenchimento) e `contract-template.ts`/`contract-watermark.ts` (modelo de fábrica). Testes unitários
em `packages/shared/test/phase3.test.ts`.

## Endpoints

| Método | Rota | Entrada | Resposta | Quem |
| --- | --- | --- | --- | --- |
| GET | `/api/workspaces/current/members/:userId/permissions` | — | `MemberPermissions` | `members` |
| PUT | `/api/workspaces/current/members/:userId/permissions` | `memberPermissionsInputSchema` | `MemberPermissions` | `members` (+ assinatura) |
| GET | `/api/unions` | `unionQuerySchema` (`search`, `status` active\|inactive\|all, `situation`, página) | `UnionListResponse` (ordem de urgência + `summary` do espaço) | todos |
| POST | `/api/unions` | `unionInputSchema` | `UnionDetail` (201) | `registry` |
| GET | `/api/unions/:id` | — | `UnionDetail` (convenções e clientes) | todos |
| PUT | `/api/unions/:id` | `unionInputSchema` (cadastro; `active`/`clientIds` ausentes = mantêm; **sem** ciclos) | `UnionDetail` | `registry` |
| PUT | `/api/unions/:id/conventions` | `unionConventionsInputSchema` (lista substitutiva) | `UnionDetail` | `registry` |
| PATCH | `/api/unions/:id/conventions/:year` | `unionConventionPublishSchema` (`published`) | `UnionDetail` | `registry` |
| DELETE | `/api/unions/:id` | — | 204 (ciclos e vínculos juntos; auditado) | `deleteRegistry` |
| GET | `/api/deadlines` | `deadlinesQuerySchema` (`kind` documents\|conventions) | `DeadlinesResponse` | todos |
| GET | `/api/deadlines/summary` | — | `DeadlinesSummary` (faixa do Início e sino) | todos |
| GET | `/api/deadlines/clients` | — | `ClientDocumentAlertsResponse` (filtro e subtítulo de Clientes da Gestão) | todos |
| GET | `/api/office/branding` | — | `OfficeBranding` (nome, logo e `registered`: escritório cadastrado, sem os dados pessoais de `GET /office`) | todos |
| GET | `/api/office` | — | `Office` (decifrado, com `missingForContract` e o resumo do contrato) | `office` |
| PUT | `/api/office` | `officeInputSchema` | `Office` (auditado) | `office` |
| PUT | `/api/office/logo` | `officeLogoInputSchema` (data URI, até 500 KB) | `OfficeBranding` | `office` |
| DELETE | `/api/office/logo` | — | 204 | `office` |
| GET | `/api/office/contract-template` | — | `ContractTemplateResponse` (o modelo em uso: próprio ou de fábrica) | `office` |
| PUT | `/api/office/contract-template` | `contractTemplateInputSchema` (ausente = mantém; `null` = fábrica; corpo até 3 MB) | `ContractTemplateResponse` (auditado sem o texto) | `office` |
| POST | `/api/office/contract-template/reset` | — | `ContractTemplateResponse` ("voltar ao modelo de fábrica", grava na hora) | `office` |
| GET | `/api/clients/:id/contract` | — | `ClientContractResponse` (blocos preenchidos + o que falta) | `finance` |
| POST | `/api/clients/:id/contract/issues` | — | 204 (registra a emissão: quem, quando, versão do modelo) | `finance` (+ assinatura) |
| POST | `/api/clients/:id/credentials/reveal` | `clientCredentialRevealSchema` (`field`) | `ClientCredentialReveal` (`no-store`) | `clientCredentials` |
| GET | `/api/clients/:id/credentials/views` | — | `ClientCredentialView[]` (até 50, mais recentes) | `clientCredentials` |
| PUT | `/api/profile/photo` | `profilePhotoInputSchema` (data URI, até 100 KB) | `ProfilePhotoResponse` | a própria pessoa |
| DELETE | `/api/profile/photo` | — | 204 | a própria pessoa |
| GET | `/api/profile/photos/:userId` | `?v=<photoUpdatedAt>` | a imagem (`image/png\|jpeg\|webp`, `private, max-age=300`) | você ou membros do seu espaço atual |

Mudanças aditivas em rotas existentes: `GET /auth/me` (e `switch-workspace`, `/workspaces`) trazem
`WorkspaceSummary.permissions` e `MeUser.photoUpdatedAt`; `GET /workspaces/current/members` traz
`permissionOverrides` e `photoUpdatedAt`; `GET /tasks/options` traz `me.permissions` e, em cada membro,
`permissionOverrides` e `photoUpdatedAt`; `Client` (lista, detalhe e respostas de escrita) traz
`stateRegistration`, `stateRegistrationExempt`, `municipalRegistration`, `responsibleDocument` (`null`
sem `finance`), `credentials` (só se cada acesso existe), `documents` e `unions`; `clientInputSchema`
aceita os campos da fase 3, todos opcionais; `GET /search` traz `unions`.

Ids de outro espaço (membro, sindicato, cliente, documento) respondem 404. Escritas pedem assinatura
com escrita (402), exceto a foto do perfil (dado da pessoa, como o nome) e revelar um acesso (é
leitura). Mensagens em pt-BR; sem a chave → 403 com o texto de `PERMISSION_FORBIDDEN_MESSAGES`
(`lib/permissions.ts`): "Somente os administradores do espaço podem fazer isso." (cadastros e
exclusões), "O financeiro é restrito aos administradores do espaço.", "O modelo de contrato e os dados
do escritório são restritos aos administradores do espaço.", "Você não tem permissão para ver este
acesso.", "Somente quem gerencia os membros do espaço pode fazer isso.".

## Permissões por pessoa

- **Chaves** (`PERMISSION_KEYS`): ações `finance`, `registry`, `deleteRegistry`, `deleteTasks`,
  `reopenOthers`, `clientCredentials`, `office`, `members` e páginas `page.audit`, `page.recurring`,
  `page.processes`, `page.clients`, `page.reports`, `page.registry`. Padrões (`ROLE_PERMISSION_DEFAULTS`):
  proprietário tudo; administrador tudo menos `members`; colaborador só as páginas — exatamente o
  comportamento das fases 1 e 2. As chaves `page.*` só escondem a página no web; a API não as usa.
- **Guardado**: `workspace_members.permissions` (jsonb) com **só os ajustes** (as chaves que diferem do
  padrão do papel; `normalizePermissionOverrides`). Trocar o papel leva junto tudo o que não foi
  ajustado; os ajustes ficam. Chaves desconhecidas e valores não booleanos são descartados na entrada e
  na leitura (`sanitizePermissionOverrides`). O proprietário nunca tem ajuste (CHECK no banco).
- **Efetivas a cada requisição**: `loadAccess` lê o papel e os ajustes junto com o membro (uma consulta)
  e expõe `req.access.permissions`; uma mudança vale na próxima requisição.
- **Guardas trocadas pelas chaves**: `financeOnly`/`canAccessFinance` → `finance`; o `assertCanWrite`
  da fronteira financeira (`tenant-routes`/`tenant-scope`: clientes, fornecedores, lançamentos…) →
  `finance` (mensagem "Você tem acesso somente leitura neste espaço" de sempre); tarefas → `registry`,
  `deleteRegistry`, `deleteTasks` por rota (`requireTaskPermission`), `reopenOthers` e `deleteTasks`
  nos serviços (reabrir ocorrência, remover comentário/anexo de outra pessoa), `registry` em "salvar como
  modelo" e no Início de outro departamento; membros, papéis e convites → `members`; consulta de CNPJ →
  `finance`, `registry` ou `office`; sindicatos, escritório e acessos de clientes → as chaves novas.
- **Regras de quem ajusta**: precisa de `members`; ninguém altera as próprias permissões nem o próprio
  papel (422); o proprietário não é ajustável (422); **ninguém concede o que não tem**: toda chave que
  passa de desligada para ligada (por ajuste, troca de papel ou papel de um convite) tem de estar com
  quem faz a mudança (403 com `details.keys`); e quem edita só altera (concede ou revoga) as chaves que
  tem: as demais ficam com o valor efetivo atual, seja qual for o pedido — "voltar ao padrão do papel" ou
  rebaixar o papel não tira de ninguém uma chave que quem edita não poderia devolver
  (`resolvePermissionChange`; é o switch desabilitado da tela).
- **Auditoria**: `member.permissions_changed` (e `member.role_changed`) em `audit_logs`, com quem
  (usuário da linha), quando e `metadata.changes = { chave: { from, to } }` das chaves efetivas que
  mudaram, mais o papel de/para e os ajustes gravados — sem nomes nem e-mails.

## Sindicatos e convenções coletivas

- Cadastro por espaço (`unions`): razão social, CNPJ (único no espaço: 409 "Já existe um sindicato
  com este CNPJ."), sigla, categoria, base territorial, endereço, contato, responsável (nome, e-mail e
  telefone **cifrados**), mês da data-base (1–12 ou nulo), observações (cifradas), ativo. Até
  `MAX_UNIONS` (1000) por espaço — a ordem de urgência é calculada em memória sobre esse conjunto
  limitado; contagens de clientes em SQL.
- Ciclos (`union_conventions`, um por ano: 2026 = "2026/2027"): publicado, quando e por quem — gravados
  pelo servidor e mantidos enquanto o ciclo continua publicado; observação cifrada. O cadastro **não
  aceita** ciclos (o schema nem tem o campo): gravar o sindicato nunca os apaga. `PUT …/conventions` é
  substitutivo; `PATCH …/conventions/:year` marca/desmarca um ciclo (cria se faltar).
- **Ciclo acompanhado** (`trackedConvention`, regra do Effy): começa no ano corrente (fuso do
  escritório) e avança enquanto o ciclo daquele ano estiver publicado; vencimento = dia 1º do mês da
  data-base nesse ano. Faixas: `overdue` (antes de hoje), `within30` (hoje a hoje+30), `within60`
  (+31 a +60), `ok`, `noBaseMonth`. Sem marcar, o sindicato continua no alerta mesmo vencido.
- Vínculo N:N com clientes (`union_clients`, só clientes: FK com `client_kind`): `clientIds` no
  cadastro (lista completa; ausente = mantém). A ficha do cliente (`Client.unions`) mostra os sindicatos
  com o ciclo acompanhado. Inativo sai dos alertas e da lista padrão.
- **Alertas** (`/deadlines`): só sindicatos **ativos com clientes ativos vinculados**, vencidos ou em
  até 60 dias. O resumo da lista (`summary`) conta todos os ativos por situação e `overdueClients`
  (clientes ativos afetados por convenção vencida).

## Dados fiscais, acessos e documentos do cliente

- `contacts` ganha `state_registration`, `state_registration_exempt` (isenta ⇒ sem número),
  `municipal_registration` (em claro: legíveis por todos os membros na ficha da Gestão),
  `responsible_document` (CPF, cifrado; `null` para quem não tem `finance`) e os acessos
  `simples_access_code` e `accountant_password` (cifrados por campo com a chave do espaço, AAD
  `workspace:contacts:<coluna>`; CHECK só aceita o formato cifrado).
- **Acessos nunca saem** em listagens, detalhe, busca, opções de tarefas, alertas ou mensagens de erro:
  o cliente diz só se cada um existe (`credentials`). Gravação em três estados por campo
  (`credentialUpdateSchema`: `keep` ou ausente, `set` com o valor, `clear`), para o formulário nunca
  precisar ler o valor. O código do Simples só com regime Simples Nacional ou MEI (400); trocar o regime
  depois mantém o código gravado.
- **Revelar** (`POST /clients/:id/credentials/reveal`): permissão `clientCredentials` (padrão:
  administradores), POST sem cache, limite por IP (30/min) e **por membro** (10 por minuto, contados
  nos registros de auditoria: 429), e o registro `client.credential_revealed` (quem, quando, `field`;
  nunca o valor) é gravado **antes** de o valor sair. `GET …/credentials/views` lista quem viu.
- Campos novos ausentes num PUT **mantêm** o que está gravado (o formulário das fases 1/2 não os
  conhece); vazio remove.
- **Documentos** (`client_documents`): tipo do catálogo `CLIENT_DOCUMENT_KINDS` (certificado digital,
  CNDs federal/estadual/municipal, CRF do FGTS, CNDT, alvará, licença sanitária, AVCB/CLCB, licença
  ambiental, PCMSO, PGR, LTCAT, registro em órgão de classe, outro — "outro" exige nome), vencimento
  opcional, observação até 200 caracteres (cifrada), quem alterou (nome gravado; "Usuário excluído" se a
  conta sair). Lista **substitutiva** em `documents` do cliente (ausente = não mexe; ids mantêm o
  documento e quem o alterou só muda se algo mudou; id de outro cliente → 404); até 50. Leitura por todos
  os membros em `Client.documents` (mais urgente primeiro, sem data no fim); escrita só com `finance`.
- **Alertas**: `GET /deadlines` (documentos de clientes **ativos**: vencidos, até 30, 31–60 e sem data,
  até 500 com `truncated`; convenções), `GET /deadlines/summary` (contagens; o sino soma
  `overdueTotal` — documentos e convenções **vencidos** — ao que já mostra; `overdueConvention` quando há
  uma só, para "convenção do SINDCOM vencida há 12 dias") e `GET /deadlines/clients` (por cliente ativo:
  vencidos, 30, 60, total e o mais urgente; totais para a célula Documentos). Faixas por
  `deadlineStatus`, no fuso do escritório; contagens com `FILTER` em SQL. Todos os membros (vencimento
  não é dado financeiro).
- **Exportação LGPD** (decisão): a exportação do proprietário leva os acessos e o CPF **decifrados** —
  é a portabilidade dos dados do próprio espaço, só do proprietário, com limite e auditada
  (`data.exported` com `includesCredentials: true`); sem eles, a exportação não serviria para migrar o
  escritório. O arquivo deve ser guardado como segredo.

## Escritório e modelo de contrato

- `offices`: um por espaço (único), dados do escritório; CPF, e-mail e telefone do responsável e a
  chave Pix **cifrados**; tipo da chave Pix validado e normalizado (`normalizePixKey`: CNPJ, CPF,
  e-mail, telefone `+55…`, aleatória); logo e marca d'água como bytes, PNG/JPG/WebP até 500 KB, tipo
  conferido pela assinatura (`lib/images.ts`; nunca SVG; 422 "O conteúdo do arquivo não corresponde…").
  Nome e logo legíveis por todos (`/office/branding`); o resto com `office`. Quem alterou e quando.
- **Modelo de contrato**: blocos `{ type, text?, rule? }` (`CONTRACT_BLOCK_TYPES`; `rule: 'discount'`
  = só com desconto), limites de 500 blocos, 20.000 caracteres por bloco e 400.000 no total (schema +
  CHECK no banco); `contract_blocks` nulo = **modelo de fábrica** (`CONTRACT_FACTORY_BLOCKS`, o
  contrato do próprio escritório vindo do Effy, versão `CONTRACT_FACTORY_VERSION`), marca d'água nula =
  a de fábrica, `contract_watermark_enabled` liga/desliga. "Voltar ao modelo de fábrica" grava na hora
  (texto, marca d'água e o liga voltam ao padrão). No modelo de fábrica, a chave Pix que o Effy tinha
  fixa na cláusula 2.4 virou o campo `[CHAVE PIX ESCRITORIO]`.
- **Contrato de um cliente** (`GET /clients/:id/contract`, `finance`; não precisa de `office`): o modelo
  em uso com os campos preenchidos (`contractValues` + `fillContractBlocks`: CNPJ/CPF/CEP formatados, UF
  por extenso, valores e "por extenso", início do contrato por extenso), a cláusula de desconto só com
  desconto na vigência que cobre hoje, a marca d'água (ou `null` desligada), nome e logo do escritório e
  `missing` por origem (cadastro do cliente, honorário — "Nenhuma vigência cobre hoje" —, escritório).
  O contrato não é gravado; `POST …/contract/issues` registra a emissão (opcional) em `audit_logs`.

## Foto do perfil

- `user_photos` (identidade, fora do RLS: uma foto em todos os espaços): PNG/JPG/WebP até 100 KB
  (o navegador manda 256×256 WebP), assinatura conferida, **cifrada** com uma chave de plataforma
  (AES-GCM, AAD com o id do usuário; `platformEncryptBytes`). Lida só por você e pelos membros do seu
  espaço atual (outro → 404), sai com a conta (cascata) e entra na exportação de quem exporta (só a
  própria). `photoUpdatedAt` nos membros (lista de membros, `/tasks/options`) e em `/auth/me` serve de
  versão na URL (`?v=`); o web busca a imagem pela API (no demo, pelo `fetch` falso).

## Banco (migração 0015)

Escrita à mão, reexecutável (IF NOT EXISTS, DROP … IF EXISTS antes de cada constraint, política e
gatilho) e roda no PGlite (sem CONCURRENTLY). Tabelas de tenant novas — `client_documents`, `unions`,
`union_conventions`, `union_clients`, `offices` — com RLS `ENABLE`+`FORCE` e política única por espaço,
`GRANT` só de DML ao `effinance_app`, FKs compostas `(workspace_id, …)`, índice para cada FK e CHECKs
espelhando o contrato (catálogo de documentos, formato cifrado, imagens, Pix, limites do contrato).
Identidade: `workspace_members.permissions` (CHECK objeto até 2000 caracteres, nunca no proprietário) e
`user_photos` (login da API com SELECT/INSERT/UPDATE/DELETE: `test/db-roles.ts` e
`docs/deploy-aws.md`). Colunas novas em `contacts` só recebem dados cifrados pela API: sem backfill.
LGPD: gatilhos trocam por "Usuário excluído" os nomes gravados em `client_documents`,
`union_conventions` e `offices` quando a conta sai. Testes: `test/phase3-db.test.ts` (RLS, FKs entre
espaços, CHECKs, LGPD, reexecução), `test/phase3-scope.test.ts` (todo SQL dos serviços novos filtra por
espaço; o verificador ficou em `test/scope-checker.ts`, compartilhado com `tasks-scope`),
`permissions`, `unions`, `client-records`, `office`, `profile-photo` e `demo-seed-phase3`.

## Banco (migração 0016)

Revisão de segurança das fases 2 e 3, reexecutável e compatível com o PGlite:

- **LGPD**: `task_events` ganha `from_assignee_id`/`to_assignee_id` (FK para `users` `ON DELETE SET NULL`,
  preenchidas por gatilho a partir de `data.fromAssignee/toAssignee`; a API continua gravando só `data`).
  Excluir a conta troca aquele lado de `data` por `{ id: null, name: "Usuário excluído" }` em todos os
  espaços, inclusive os que a pessoa já tinha deixado (sair mantém o nome). Backfill por espaço (o dono
  só vê linhas com `app.workspace_id`; o RLS forçado continua): nomes de contas já excluídas e ids
  malformados são pseudonimizados.
- **Índices**: `tasks_occurrence_target_idx` (calendário por meta das ocorrências) e `audit_logs_entity_idx`
  (`(workspace_id, entity_id, created_at)`, "quem viu" um acesso; não parcial porque o postgres-js
  prepara as consultas e um plano genérico não casa `action = $n` com predicado parcial).
- **Contrato**: CHECK `offices_contract_blocks_chk` com `contract_blocks_valid(jsonb)` (IMMUTABLE, sem
  SECURITY DEFINER, `search_path` fixo, EXECUTE só para `effinance_app`): bloco objeto só com
  `type`/`text`/`rule`, tipo e regra dos catálogos, até 20.000 caracteres por bloco e 400.000 no total.
- Teste: `test/phase23-db-review.test.ts`.

## Lacunas

- **Assinatura de PDF e importação de .docx** do contrato (o Effy importava .docx): não há; o web tem
  `blocksFromPlainText` para "Importar texto".
- **Histórico de emissões** do contrato: só o registro em `audit_logs` (sem tela própria nem leitura
  na API além do log de auditoria do proprietário).
- **Quem viu um acesso** fica em `audit_logs` (que segue a retenção do log de auditoria).
- **Consulta de CNPJ** passou a exigir `finance`, `registry` ou `office` (antes qualquer membro chamava
  a rota, embora a tela só a oferecesse a administradores) — §18.12.
- **Itens a confirmar** (§18.19): colaborador do Fiscal atualizar vencimento de certificado sem
  `finance` (hoje não); `clientCredentials` ligada para algum colaborador (padrão: só administradores).
- O demo do navegador só ganha os dados da fase 3 num banco novo: o marcador `SEED_VERSION` de
  `apps/web/src/demo/server.ts` precisa subir para reaplicar o seed em quem já tem o demo.
