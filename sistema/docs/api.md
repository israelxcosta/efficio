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
| GET | `/api/auth/me` | — | `MeResponse` (usuário + workspace ativo + lista) |
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
| GET | `/api/clients/:id/fees` | — | `ClientFeesResponse` (`current`, `items` mais recente primeiro, `next`) — owner/editor (`403` para `viewer`, como as escritas de vigência) |
| POST | `/api/clients/:id/fees` | `clientFeeInputSchema` (`amount`, `employeeFee`, `discountBps` 0–9999, padrão 0) | `ClientFee` (201) — próxima vigência |
| PUT | `/api/clients/:id/fees/:feeId` | `clientFeeInputSchema` | `ClientFee` |
| DELETE | `/api/clients/:id/fees/:feeId` | — | 204; 422 se não for a vigência mais recente |
| GET | `/api/cnpj/:cnpj` | `cnpjParamsSchema` (14 dígitos válidos) | `CnpjLookupResult`; 404 não encontrado, 502 Receita indisponível, 503 desabilitado |
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
| GET | `/api/search?q=` | `searchQuerySchema` | `SearchResponse` — descrição, nomes e CPF/CNPJ exato; para `viewer`, só `contacts` (demais listas vazias) |

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
- **Score** (`delinquencyScore` em `packages/shared/src/utils/delinquency.ts`, testado no contrato):
  cada recebível do período pesa `0,5^(meses atrás / 6)` (meia-vida de 6 meses).
  `probability = (atrasados ponderados + 1) / (total ponderado + 5)` (sem histórico = 20%).
  `score = 1000 × (1 − probability) − 150 × min(1, atraso médio ponderado / 60) − 60 × em aberto`,
  limitado a 0..1000. Faixas (`riskOf`): ≥ 800 `baixo` (bom pagador), ≥ 600 `moderado`, ≥ 400
  `alto`, abaixo `critico`. `lowHistory` = menos de 3 recebíveis no período.
- **Relatório do cliente** (web, `/relatorios/cliente/:id?meses=`, botão em cada linha): lê todos
  os lançamentos de receita do cliente em `GET /transactions?contactId=&type=income` (páginas de
  200) e calcula no navegador (`features/reports/client-report/client-report.ts`, testado) o
  histórico, pontualidade, faixas de atraso, mapa de pagamentos, ano a ano e o mesmo score da linha
  (`periodScore`, mesma janela e regras deste relatório).
- Consultas: um SELECT com junção em `contacts` e a soma dos juros/multa de cada linha por
  subconsulta correlacionada (índice parcial em `late_fee_of`) — sem listas de ids, que estourariam
  o limite de parâmetros num escritório grande; os dados de contato vêm decifrados em lotes.

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
  responsáveis do cliente por departamento vão junto com ele (FK em cascata).
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
  segredo TOTP do usuário (chave mestra). CPF/CNPJ
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
    concluir/reabrir, comentar e mexer em subtarefas. Cadastros do módulo (departamentos, departamento
    do membro, categorias de tarefa, responsável por cliente) e excluir tarefas ficam com `owner`/
    `editor`. Ver "Tarefas → Permissões".
  - Mudança de papel vale na próxima requisição (o papel é relido a cada requisição).
- Gravações exigem assinatura válida: `trialing` (14 dias, sem cartão), `active` ou `past_due` dentro
  da carência de 7 dias. Fora disso → `402 subscription_required` (leitura e exportação continuam).
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
| PATCH | `/api/workspaces/current/members/:userId` | `memberRoleSchema` | `Member` (owner) |
| DELETE | `/api/workspaces/current/members/:userId` | — | 204 (owner remove; membro pode sair) |
| GET | `/api/workspaces/current/invites` | — | `Invite[]` (owner) |
| POST | `/api/workspaces/current/invites` | `inviteInputSchema` | `Invite` (201, owner) |
| DELETE | `/api/workspaces/current/invites/:id` | — | 204 (owner) |
| GET | `/api/invites/:token` | — | `InvitePreview` (público) |
| POST | `/api/invites/:token/accept` | — | `MeResponse` (e-mail do convite = e-mail logado) |
| GET | `/api/workspaces/current/export` | — | JSON com todos os dados decifrados (owner, LGPD) |
| GET | `/api/workspaces/current/audit` | `auditQuerySchema` | `Paginated<AuditLogEntry>` (owner) |
| GET | `/api/billing/plans` | — | `Plan[]` |
| GET | `/api/billing/subscription` | — | `Subscription` |
| POST | `/api/billing/checkout` | `checkoutSchema` | `CheckoutResponse` (owner) |
| POST | `/api/billing/cancel` | — | `Subscription` (owner; cancela ao fim do período) |
| POST | `/api/billing/webhooks/mercadopago` | notificação MP | 200 (assinatura `x-signature` verificada, idempotente) |
| POST | `/api/billing/dev/activate` | `checkoutSchema` | `Subscription` — só com `BILLING_PROVIDER=fake` (dev/demo) |

## Detalhes de implementação

- **Fronteira de tenant**: as rotas financeiras são montadas por `lib/tenant-routes.ts`, que autentica,
  verifica permissão de escrita (papel + assinatura) e abre a transação RLS exposta como `req.db`.
  Os serviços recebem `(db, workspaceId, …)`. Workspaces, membros, convites, sessões e assinaturas
  não ficam sob RLS: são acessados pelo login da API, com checagem explícita de papel.
- **Busca com dados cifrados**: observações não são pesquisáveis (a busca de lançamentos usa só a
  descrição). Contatos: busca parcial por nome ou exata por CPF/CNPJ (índice cego); e-mail e
  telefone não são pesquisáveis. Tarefas: a busca (`GET /tasks?search=`) é só pelo título; descrição
  e comentários são cifrados.
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
`docs/tarefas-ui.md`. Contrato em `packages/shared`: constantes e rótulos em `constants.ts`
(`TASK_STATUSES`/`TASK_STATUS_LABELS`, `TASK_PRIORITIES`/`TASK_PRIORITY_LABELS`, `TASK_SCOPES`,
`TASK_SITUATIONS`, `TASK_KINDS`, `TASK_DUE_BUCKETS`, `RECURRENCE_PERIODS`/`RECURRENCE_PERIOD_LABELS`,
`NON_BUSINESS_DAY_RULES`, `OCCURRENCE_STATUSES`, `FLOW_STEP_STATES`, `TASK_TIME_ZONE`), schemas em
`schemas.ts` (seção "Tasks"), tipos em `types.ts` (seção "Tasks") e regras puras em
`utils/tasks.ts` (atrasada, grupos de prazo, fuso do escritório, dias úteis, agenda das recorrentes).

**Fases.** A **fase 1** (núcleo) está implementada: departamentos, departamento do membro, categorias,
tarefas avulsas, subtarefas, comentários, responsável por cliente em cada departamento, listagem com
filtros e resumo, PATCH de estado e a página de início. As fases 2–4 (tarefas recorrentes e auditoria
mensal, fluxos e modelos, relatórios/widgets e anotações) têm **contrato rascunhado** em
`packages/shared` (`RecurringTask`, `AuditMatrixResponse`, `TaskFlow`, `FlowTemplate`,
`TaskReportResponse`, `TasksDashboardResponse`, `TaskNote` e seus schemas), mas **nem banco nem API**:
o modelo de recorrência deve mudar para o de "Processos" do Domínio/Onvio (processo com atividades
dependentes, vínculo processo↔empresa por competência, situações no prazo/fora do prazo, conclusão
e reabertura com histórico) e será redesenhado antes. Até lá, `GET /tasks` devolve
`occurrences: []`, `Task.flow` é sempre `null`, `TaskDetail.flowProgress` é `null`,
`PATCH /tasks/:id/status` devolve `activated: null` e a página de início tem `totals.recurring = 0`.

## Permissões

- **Todos os membros** do espaço usam o módulo, inclusive `viewer` ("Colaborador"): criar, editar
  (autosave), concluir/reabrir/mover, subtarefas (criar, marcar, remover) e comentar.
- **Administradores** (`owner`/`editor`, os mesmos do financeiro): cadastros do módulo
  (departamentos, departamento do membro, categorias de tarefa, responsável por cliente) e **excluir
  tarefa**. Violação → `403` "Somente os administradores do espaço podem fazer isso.". Na página de
  início, só administradores pedem outro departamento ou todos (`403` para os demais).
- Gravações exigem assinatura com escrita (`402`), como no resto da API; leituras continuam.
- Implementação: o plugin `/tasks` é montado em `scopedRoutes` com guardas próprios
  (`modules/tasks/access.ts`: `taskGuards` = autenticação + assinatura; `requireTaskAdmin` por rota) —
  independente do `financeOnly` e do `assertCanWrite` dos módulos financeiros. Cada requisição lê os
  membros (nomes e papéis) na conexão do sistema e trabalha numa transação de tenant (RLS); a resposta
  sai depois do COMMIT. O RLS continua sendo só por espaço (uma política por tabela, como as demais);
  o papel é checado na API.
- **Filtro por espaço em toda consulta**: todo SELECT/UPDATE/DELETE do módulo filtra por
  `workspace_id` do pedido — inclusive os UPDATE/DELETE por id que vêm depois da checagem de posse
  (`taskKey`/`subtaskKey` em `service.ts`); o RLS é a segunda barreira. `test/tasks-scope.test.ts`
  roda todos os serviços exportados numa conexão de superusuário (sem RLS), captura cada SQL pelo
  logger do Drizzle e exige `workspace_id = <espaço>` (ou igualdade com uma tabela já filtrada, em
  joins e subconsultas) para toda tabela de tenant; também confere que outro escritório fica intacto.
- **Permissão por módulo** (pendência §17.1 da spec): resolvida de forma provisória pelo mapeamento de
  papéis (financeiro = `owner`/`editor`; tarefas = todos). Uma permissão "Tarefas: editar" separada do
  papel continua sendo decisão de produto.
- O web sabe quem é administrador por `GET /auth/me` (`workspace.role`) e por `GET /tasks/options`
  (`me.isAdmin`, `me.canWrite`).

## Endpoints (fase 1)

| Método | Rota | Entrada | Resposta | Quem |
| --- | --- | --- | --- | --- |
| GET | `/api/tasks/options` | — | `TaskOptionsResponse` (hoje, você, membros com departamento, departamentos, categorias, clientes, responsáveis) | todos |
| GET | `/api/tasks/clients` | — | `TaskClientOption[]` (clientes em leitura, sem honorários) | todos |
| GET | `/api/tasks/members` | — | `TaskMember[]` | todos |
| PUT | `/api/tasks/members/:userId/department` | `memberDepartmentSchema` | `TaskMember` | admin |
| GET | `/api/tasks/departments` | — | `TaskDepartment[]` (membros, em aberto, atrasadas, total) | todos |
| POST | `/api/tasks/departments` | `taskDepartmentInputSchema` | `TaskDepartment` (201) | admin |
| PUT | `/api/tasks/departments/:id` | `taskDepartmentInputSchema` | `TaskDepartment` | admin |
| DELETE | `/api/tasks/departments/:id` | — | 204; 409 com membros ou tarefas (`details`) | admin |
| GET | `/api/tasks/categories` | — | `TaskCategory[]` (com `taskCount`) | todos |
| POST | `/api/tasks/categories` | `taskCategoryInputSchema` | `TaskCategory` (201) | admin |
| PUT | `/api/tasks/categories/:id` | `taskCategoryInputSchema` | `TaskCategory` | admin |
| DELETE | `/api/tasks/categories/:id` | — | 204 (tarefas ficam sem categoria) | admin |
| GET | `/api/tasks/client-responsibles` | — | `ClientResponsiblesResponse` (grade cliente × departamento) | todos |
| PUT | `/api/tasks/client-responsibles` | `clientResponsibleInputSchema` | `ClientResponsible`; 204 com `userId: null` (remove) | admin |
| GET | `/api/tasks/home` | `taskHomeQuerySchema` (`departmentId` = id ou `all`, `month`) | `TaskHomeResponse` | todos (outro depto./`all`: admin) |
| GET | `/api/tasks/activity` | — | `TaskActivityItem[]` | todos |
| GET | `/api/tasks` | `taskQuerySchema` | `TaskListResponse` | todos |
| POST | `/api/tasks` | `taskInputSchema` | `TaskDetail` (201) | todos |
| GET | `/api/tasks/:id` | — | `TaskDetail` | todos |
| PATCH | `/api/tasks/:id` | `taskUpdateSchema` (só os campos enviados) | `TaskDetail` | todos |
| PATCH | `/api/tasks/:id/status` | `taskStatusInputSchema` | `TaskStatusChangeResponse` | todos |
| DELETE | `/api/tasks/:id` | — | 204 (subtarefas e comentários juntos) | admin |
| POST | `/api/tasks/:id/subtasks` | `subtaskInputSchema` | `TaskSubtask` (201) | todos |
| PATCH | `/api/tasks/:id/subtasks/:subtaskId` | `subtaskUpdateSchema` (`title` e/ou `done`) | `TaskSubtask` | todos |
| DELETE | `/api/tasks/:id/subtasks/:subtaskId` | — | 204 | todos |
| POST | `/api/tasks/:id/comments` | `taskCommentInputSchema` | `TaskComment` (201) | todos |

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
  feitas.
- **Um departamento por membro** (decisão mais simples que atende à spec §12.1: "marcar aqui tira o
  membro do departamento atual"). `PUT /tasks/departments/:id` com `memberIds` é a lista completa.
- **Conclusão** (`PATCH /tasks/:id/status`): na transição para `done` o servidor grava `completedAt`
  (instante) e `completedBy` (quem clicou — o usuário da sessão, não o responsável); repetir `done`
  não muda o registro; sair de `done` apaga os dois. **Reabrir**: `reopenStatus` diz para onde voltar
  (o estado aberto anterior à conclusão/cancelamento; `todo` sem histórico) — o web envia
  `{ status: task.reopenStatus }`. Qualquer transição é aceita (desfazer, mover no quadro). Criar já
  concluída também grava quem/quando. O banco garante `done` ⇔ `completed_at` (CHECK).
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
- **Exclusões**: tarefa (admin) leva subtarefas e comentários. Departamento só sem membros e sem
  tarefas (409 com `details: { members, recurring, tasks }`, mensagem "2 membros e 12 tarefas ainda
  estão neste departamento. Mova-os antes de excluir."). Categoria: exclusão simples, tarefas ficam
  sem categoria. Nomes de departamento e categoria são únicos no espaço (sem diferenciar maiúsculas;
  409). Cliente com tarefas não é excluído (409).
- **Responsável por cliente em cada departamento** (`task_client_responsibles`, "carteira" como no
  Onvio/Tareffa): um membro por cliente × departamento, editável por administradores e legível por
  todos (`options.clientResponsibles`). Na tarefa avulsa, o web sugere o responsável do cliente no
  departamento escolhido (o usuário pode trocar). Na fase 2, a ocorrência de uma recorrente vai para o
  responsável do cliente no departamento da recorrente, senão o responsável padrão, senão ninguém.

### Listagem (`GET /tasks`)

- Filtros (`taskQuerySchema`): `scope` (`mine` = responsável sou eu; `department` = departamento do
  meu membro, vazio sem departamento; `all`), `situation` (`open`, `overdue`, `waiting`, `done` =
  concluídas + canceladas, `all`), `status` exato, `clientId` (id ou `internal`), `assigneeId` (id ou
  `none`), `departmentId`, `categoryId`, `priority`, `kind` (`standalone`; `recurring`/`flow` vazios
  na fase 1), `month` (mês de vencimento), `dueDate`, `dueFrom`/`dueTo`, `dueBucket` (um grupo de
  prazo das abertas: `overdue | today | next7Days | later | noDueDate`), `closedFrom` (quadro:
  concluídas/canceladas só a partir dessa data, pela conclusão), `search` (só o título: descrição e
  comentários são cifrados e não entram na busca), `page`/`pageSize` (até 200).
- Ordem: vencimento (sem vencimento por último), prioridade (urgente primeiro), título; em
  `situation=done`, a conclusão mais recente primeiro.
- `summary` (`TaskListSummary`) usa **os mesmos filtros, exceto a situação** (e `dueBucket`/
  `closedFrom`): atrasadas e a mais antiga, em aberto, vencem hoje / em 7 dias, aguardando cliente,
  do mês (`month` ou o atual: que vencem no mês e quantas foram concluídas ou canceladas), em aberto
  por responsável e por cliente. `groups` conta as abertas por grupo de prazo com a situação aplicada;
  `byStatus` conta por estado com todos os filtros exceto a situação (cabeçalho das colunas do
  quadro, com atrasadas). `months`: meses com tarefas no escopo, mais o atual. `today` vem junto.

### Página de início (`GET /tasks/home`)

- Unidade: tarefas abertas (qualquer vencimento) mais as que vencem, foram concluídas ou canceladas no
  mês (`month`, padrão o atual) — de um departamento (padrão: o do membro), de todos (`all`,
  administradores) ou, para membro sem departamento, só as dele (`view: 'mine'`).
- `totals`: por estado, em aberto, atrasadas, vencem hoje / 7 dias, concluídas **no prazo** (dia da
  conclusão no fuso do escritório ≤ vencimento; sem vencimento conta no prazo) e **com atraso**,
  canceladas. `byAssignee` (`TaskAssigneeStats`, ranking "quem concentra mais": atrasadas, depois
  abertas, depois volume) e `byClient` (com algo em aberto). `mine`: tarefas abertas atribuídas a você
  (qualquer departamento), atrasadas primeiro, até 20. Tudo em SQL agregado.

### Atividade (`GET /tasks/activity`)

Comentários dos **outros** nos últimos 5 dias em tarefas de que você é responsável ou criador, com
trecho de 80 caracteres (do texto decifrado), até 50 (Effy `atividadeRecente`; anexos não foram
portados).

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

## Diferenças deliberadas em relação ao Effy

- Departamento das tarefas abertas acompanha o membro quando ele muda de departamento.
- Nomes de quem criou/concluiu/comentou ficam gravados (o Effy impedia excluir usuário com histórico;
  aqui o membro pode sair sem perder a autoria; se a conta for excluída, o nome vira "Usuário
  excluído" — LGPD).
- "Reabrir" volta ao estado anterior à conclusão (`reopenStatus`), como a spec pede.
- Excluir tarefa é de administrador (no Effy, a chave `delTasks`); criar/editar/concluir é de todos.
- Anexos, recorrentes, auditoria, fluxos, relatórios e anotações ficam para as próximas fases.

## Pendências

- Fases 2–4 (aguardando o modelo de "Processos" do Domínio/Onvio).
- Anexos de tarefa (armazenamento de arquivos; a spec §8.1 prevê a seção).
- Busca global (`/search`, ⌘K) com tarefas (§17.8) e feriados no cálculo de dias úteis
  (`HolidayCalendar` em `utils/tasks.ts`).
