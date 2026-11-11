# Projeto de melhorias: dashboards e relatórios

> Dono: `ui-saas-designer`. Status: **onda 1 implementada** (10/11/2026: API e web; capturas em
> `scratchpad/melhorias-shots/`). Plano de implementação dos itens 2 a 4:
> `docs/superpowers/plans/2026-11-10-evolucao-score-retrabalho.md`.
> Escopo: **Painel financeiro** (`/financeiro`), **Início da Gestão** (`/`), **Minha área**
> (`/minha-area`), **Relatórios** financeiros (`/relatorios`, incluindo Inadimplência e
> `/relatorios/cliente/:id`) e **Relatórios de tarefas** (`/tarefas/relatorios`).
> Base: `docs/design-system.md` (§5 livro-razão e §6 proporção prevalecem) e
> `docs/dashboards-redesign.md` (redesenho de 05/11, já implementado; este projeto parte dele).
> Capturas (demo, 1440 e 375, viewport e página inteira; alturas em `metrics.json`):
> `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/projeto-dash/`

---

## 0. Leitura rápida

1. **Falta a pergunta "a carteira está crescendo?"**. Nenhuma tela mostra clientes novos,
   encerrados, base líquida nem honorário mensal recorrente mês a mês. Proposta: aba **Evolução**
   em Relatórios e linha **Clientes ativos** no gráfico de receitas do painel (§4).
2. **O gráfico de inadimplência engana.** São dois eixos com escalas sem relação (dias e %), o mês
   corrente despenca para 0% todo início de mês e as barras de meses passados crescem a cada dia
   (os em aberto contam até hoje). Proposta: barras empilhadas de como cada mês foi pago, com a
   taxa no topo e o mês corrente marcado como parcial (§5.1).
3. **O score não separa quem atrasa 5 dias de quem não paga há 6 meses.** No demo, Rota Sul (paga
   tudo com 5 a 21 dias de atraso) tem 164 e Ju Prado (184 dias, 6 meses em aberto) tem 0: os dois
   são "Crítico". Proposta: atraso pesado pela gravidade, desconto de em aberto com teto e janela
   fixa de 12 meses (§5.2).
4. **Score com retrabalho**: categoria de tarefa ganha "Conta como retrabalho"; cada tarefa dessas
   categorias aberta para o cliente tira **40 pontos nos últimos 90 dias e 10 entre 91 dias e 12
   meses (até 200)**. Aparece como "3 retrabalhos em 90 dias" na inadimplência e na composição do
   score do relatório do cliente (§6). O backend já implementou a contagem com 4/1/20 pontos: com
   teto de 20 em 1000 o retrabalho nunca muda a faixa de ninguém; os pesos precisam subir (§9).
5. **Cards com mais vazio que dado** continuam nos painéis de tarefas: Minha área (Para você, Seu
   ritmo, Meu departamento) e Início (Situação, Processos com 1 departamento, Visão geral dos
   clientes). Proposta: altura pelo conteúdo, dentro das classes S/M/L (§3, onda 2).
6. **O mesmo fato repetido e definições que brigam**: "1 atrasada" três vezes no primeiro
   viewport de Minha área; "Em aberto 53" no topo e "Em aberto 44" no card ao lado em Relatórios de
   tarefas; "Concluídas 6" e "7 de 28 concluídas" no Início.
7. **Comparação ausente nos relatórios**: os KPIs de Visão geral e de Inadimplência não dizem se o
   número melhorou. O painel já compara; os relatórios devem seguir.
8. Roadmap em três ondas (§7): **onda 1** são os itens 2 a 4 (plano pronto, backend em paralelo);
   **onda 2**, ganhos rápidos de proporção e definição; **onda 3**, histórico que a API ainda não
   guarda.

---

## 1. Método e o que cada skill contribuiu

Capturas no demo (`vite --mode demo`, 1440×900 e 375×812, página inteira) de 10 telas; alturas de
página: financeiro 3.839 / 5.865px (1440 / 375), Início 2.795 / 5.487, Minha área 1.669 / 3.755,
Inadimplência 1.863 / 4.599, Relatório do cliente 2.996 / 5.625, Relatórios de tarefas
2.712 / 7.052. Nenhuma tela rola na horizontal. Leitura do código de `features/reports/**`,
`features/dashboard/**`, `features/tasks/pages/{home,my-area,task-reports}.tsx`,
`packages/shared/src/utils/delinquency.ts` e `apps/api/src/modules/reports/delinquency.ts`.

| Skill | O que valeu para o Efficio | Onde aplicado | Ignorado |
| --- | --- | --- | --- |
| `dashboard-designer` | Público → decisão → ação antes do layout; KPIs em 3 níveis; **toda métrica com comparação**; máximo de 4 a 5 cores; títulos que dizem o achado; no celular, só os 3 KPIs principais no topo; "teste dos 5 segundos" | KPIs da Evolução e da Inadimplência com "vs mês anterior"; cores do risco (§5.3); diagnóstico de cards repetidos | Escolha de ferramenta de BI |
| `axiom-build-dashboard` (+ `design-playbook`) | "Sem decisão, sem painel"; **visão geral → detalhamento → evidência**; **"calcule ou adie"** (nunca trocar a grandeza pedida por outra parecida); taxas e distribuição em vez de médias (a média esconde a cauda); nomes em forma de pergunta; 50 a 200 pontos por série | Evolução: KPIs → gráficos → tabela mês a mês → listas de quem entrou e saiu; reativações sem histórico ficam ditas no (i), sem número inventado; o gráfico da inadimplência troca a média de dias pela distribuição de como cada mês foi pago | APL, MPL, scripts e API do Axiom |
| `build-dashboard` | Esqueleto KPI → gráfico principal → secundário → tabela; KPI com variação "vs período anterior"; **barra + linha só quando a linha é taxa ou o mesmo assunto**; **pré-agregar no servidor** (12 linhas, não milhares); tabela ordenável; estilo de impressão; "dados de…" no rodapé | Endpoint de evolução já agregado por mês; linha de honorário mensal no mesmo eixo em R$ das barras; impressão da aba Evolução | HTML autocontido, Chart.js, CDN |
| `react-vite-dashboard` | TanStack Query nas buscas e componentes de apresentação puros; esqueletos com `aria-busy`; `<table>` semântica; conferir em 375 e 1280 | Lógica em módulos puros testados (`evolution-logic.ts`, `delinquency-view.ts`); tabela mês a mês semântica | Stitch, Web3, linter de DESIGN.md |
| `building-admin-dashboard-customizations` | **Consultas de exibição carregam ao montar** (nada de `enabled` amarrado a estado de UI); consulta da tela separada da consulta do painel lateral; **invalidar as consultas de exibição depois da mutação**; estado de carregamento, nunca vazio, enquanto busca; só cores semânticas; Select para até ~10 opções e lista com busca acima disso | Retrabalho do cliente carrega com a página; salvar categoria invalida `['reports']` (o score muda); checkbox no Sheet de edição | SDK e componentes do Medusa |
| `brainstorming` | Abordagens comparadas e decisão registrada (§8), sem rodada de perguntas (pedido do coordenador) | §8 | Diálogo com o usuário |
| `writing-plans` | Plano em tarefas pequenas, TDD, interfaces explícitas entre tarefas | Plano de 10/11 | — |

---

## 2. Diagnóstico por tela

"Princípio" remete à skill ou ao design system. Medidas das capturas em 1440 salvo indicação.

### 2.1 Painel financeiro

| # | Onde | Problema | Evidência | Princípio |
| --- | --- | --- | --- | --- |
| P1 | Painel inteiro | Nenhum número sobre a base de clientes: crescimento, saída, honorário recorrente | Faixa = Receitas, Despesas, Resultado, Patrimônio; "Carteira" diz "8 ativos" sem comparação | Comparação; decisão do sócio |
| P2 | Fluxo de caixa (M) | Receita sem relação com a carteira: subir R$ 4 mil por cliente novo ou por honorário atrasado pago se lê igual | Só barras de receita × despesa | Pergunta do usuário (item 2) |
| P3 | Próximos vencimentos | As 5 linhas visíveis são do mesmo cliente (honorários 04 a 08/2026 de Ju Prado, vencidos há 61 a 184 dias); o que vence de fato nos próximos dias fica no "+ 16" | Lista em ordem de data, sem agrupar | Densidade; detalhamento acionável |
| P4 | Clientes devedores (M, 320px) | 2 linhas num card de 320px (~60% vazio) | Persistiu do F2 de 05/11 | Proporção |
| P5 | Receitas fixas (L, 432px) | Card vazio de 432px no arranjo padrão de escritório sem receitas fixas | Estado vazio no centro | Proporção |
| P6 | Carteira de clientes | "Ticket médio R$ 1.637,14" sem referência; três blocos (fixo mensal, ativos/inativos/sem vigência, rosca) | — | Comparação |
| P7 | Celular 375 | ~370px de cabeçalho antes do primeiro número (descrição em 3 linhas, abas, mês e "Personalizar" em linhas próprias) | Página de 5.865px | Celular: 3 KPIs no topo |

### 2.2 Início da Gestão

| # | Onde | Problema | Evidência | Princípio |
| --- | --- | --- | --- | --- |
| I1 | Faixa de topo | Rodapés cortados em 1440 | "A mais antiga venceu há 26 dias: …", "6 em andamento · 3 aguarda…", "67% no prazo · 2 c…" | Rótulo inteiro |
| I2 | Situação das tarefas (L) e Pendências fiscais (L) | 3 faixas num card de 432px; ~35% embaixo vazio | — | Proporção |
| I3 | Processos por departamento (M) | Com o filtro "Fiscal" há 1 departamento: uma linha em 320px, repetindo a Situação | ~75% vazio | Sem decisão, sem painel |
| I4 | Visão geral dos clientes | "8 de 8 com pendências": barra toda âmbar para o estado normal do mês; nada a decidir | Faixa "Pendências 100%" | Cor só no que exige atenção |
| I5 | Topo × Situação | "Concluídas em novembro 6" e "7 de 28 concluídas" lado a lado (conclusão no mês × competência) | (i) existe, mas o olho lê os dois números | Definições consistentes |
| I6 | Faixa de topo | Só "Concluídas" tem referência; Atrasadas e Em aberto não dizem se pioraram | — | Comparação (a API não guarda histórico: onda 3) |

### 2.3 Minha área

| # | Onde | Problema | Evidência | Princípio |
| --- | --- | --- | --- | --- |
| M1 | Para você (L) | 3 linhas em 432px (~60% vazio) | — | Proporção |
| M2 | Seu ritmo (L) | Estado vazio "Nenhuma conclusão nos últimos 6 meses" ocupando 432px | — | Proporção |
| M3 | Meu departamento (L) | Barra + 3 linhas, ~45% vazio | — | Proporção |
| M4 | Primeiro viewport | "1 atrasada" três vezes: faixa, Minhas tarefas e Para você | — | Redundância |
| M5 | Celular 375 | Para você continua L com metade vazia | Página de 3.755px | Celular |

### 2.4 Relatórios financeiros (Visão geral, Fluxo de caixa, Contatos)

| # | Onde | Problema | Evidência | Princípio |
| --- | --- | --- | --- | --- |
| R1 | Visão geral | 5 KPIs sem comparação com o período anterior (o painel compara) | Receitas, Despesas, Resultado, Margem, Gasto médio diário | Comparação |
| R2 | Visão geral | "Insights do período" repete o card de Insights do painel | Mesmas 4 frases | Redundância |
| R3 | Fluxo de caixa | Barras (5 a 20 mil) e "Saldo acumulado" (23 a 75 mil) no mesmo eixo: barras achatadas em ~25% da altura; Dez/25 e Jan/26 vazios no começo | `trimLeadingEmpty` existe e não é usado aqui | Gráfico legível |
| R4 | Contatos | Rótulos das barras cortados ("Transportadora Rota S…", "Tecnova Soluções em S…") | — | Rótulo inteiro |
| R5 | Abas | Não há relatório da carteira (novos, encerrados, honorário recorrente) | — | Item 2 |

### 2.5 Inadimplência

| # | Onde | Problema | Evidência | Princípio |
| --- | --- | --- | --- | --- |
| D1 | "Média de dias de atraso por mês" | Dois eixos sem relação (0–120d à esquerda, 0–50% à direita); a linha cruzando as barras sugere uma correlação que não existe; marcas da direita 0/15/30/45/50% (o último passo é 5) | `rateMax` arredonda a 10, as marcas vêm de 15 em 15 | Gráfico legível; um eixo por gráfico |
| D2 | Mês corrente | A taxa de Nov/26 cai para 0%: só entram os vencidos até hoje e ainda não houve tempo de atrasar | Todo dia 1 o gráfico "melhora" | Calcule ou adie |
| D3 | Meses passados | A média conta os em aberto até hoje: as barras antigas crescem todo dia (Mai/26 = 101 dias por um título aberto desde maio) | O histórico muda sozinho | Taxas/distribuição em vez de média |
| D4 | Cor | A grandeza principal (dias) em cinza de comparação; a secundária em azul | `CHART_COLORS.expense` nas barras | Cor só nos dados |
| D5 | Termômetro | SVG com degradê verde → vermelho (antiobjetivo do design system) ocupando 2/5 da fileira para um número (29%); "chance média 29%" ao lado de "taxa real 33,7%", que também é o 2º KPI | Três percentuais parecidos no primeiro viewport | Sem degradê; redundância |
| D6 | Cores do risco | Selo "Bom pagador" verde, barra do mesmo cliente cinza; âmbar, laranja e vermelho para os outros três | `RISK_TONE` | Máximo de 4–5 cores; verde só em variação |
| D7 | Score | Gravidade quase ignorada: o atraso de 5 dias pesa como o de 184 na chance; Rota Sul 164 e Ju Prado 0, ambos "Crítico"; 1 atraso de 18 dias em 8 (Alicerce) = 781 "Atenção" | Linhas da tabela | Diferenciar o que pede ação diferente |
| D8 | Score | Desconto de em aberto sem teto (−60 por título): 6 títulos = −360 | Ju Prado zera | Escala explicável |
| D9 | Score | A janela segue o período da aba (6/12/24): o mesmo cliente muda de score ao trocar o período; o relatório do cliente carrega `?meses` só para concordar | `periodScore(…, months)` | Definição estável |
| D10 | Lista | Inativos que pagaram tudo (Arte & Forma, Bom Preço) ocupam linhas sem ação | 2 de 10 linhas | Detalhamento acionável |
| D11 | KPIs | Nenhum diz se melhorou | — | Comparação |
| D12 | Celular 375 | Nome cortado ("Ju Prado D…") porque o bloco do score tem 132px; ~265px por cliente | Página de 4.599px | Celular |

### 2.6 Relatório do cliente

| # | Onde | Problema | Evidência | Princípio |
| --- | --- | --- | --- | --- |
| C1 | Bloco do score | Mostra o número, não o porquê (nenhuma composição) | "164 de 1000 · Crítico" | Explicável |
| C2 | Faturado e recebido | Out/26 (vencido) e Nov/26 (a vencer) aparecem iguais: só a barra cinza | — | O aberto hachurado (§5 do design system) |
| C3 | Topo | 8 MiniStats (2 fileiras) antes do primeiro gráfico; em 375 são 4 fileiras e "10,2 dias depois" quebra em 3 linhas | — | Hierarquia; celular |
| C4 | Relação com o escritório | Nada sobre o custo operacional do cliente (retrabalho) | — | Item 4 |

### 2.7 Relatórios de tarefas

| # | Onde | Problema | Evidência | Princípio |
| --- | --- | --- | --- | --- |
| T1 | KPI × Por situação | "Em aberto 53 (9 atrasadas)" no topo e "Em aberto 44 · Atrasadas 9" no card | Mesma palavra, dois números | Definições consistentes |
| T2 | Rankings (departamento, responsável, cliente, categoria) | Texto de 3 partes em 11px ("4 no prazo · 2 com atraso · 2 atrasadas em aberto") + % + barra sem escala dita | — | Leitura em uma passada |
| T3 | Pontualidade por mês | 4 de 6 meses vazios (dados começam em Out/26); eixo até 40 para 12 | — | Gráfico legível |
| T4 | Filtros | 7 selects cortados ("Todos os departa…", "Todos os respons…") | — | Rótulo inteiro |
| T5 | Por categoria | Não distingue categorias de retrabalho | — | Item 4 |
| T6 | Celular 375 | A página mais longa: 7.052px | — | Celular |

---

## 3. Melhorias priorizadas (impacto × esforço)

Impacto: **A** muda decisão ou corrige número enganoso · **M** reduz atrito/leitura · **B**
acabamento. Esforço: **P** ≤ ½ dia · **M** 1–2 dias · **G** 3–5 dias. "API" = precisa do backend.

| Prioridade | ID | Melhoria | Tela | Imp. | Esf. | API |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | E1 | Aba **Evolução** (KPIs, carteira mês a mês, honorário mensal, tabela, quem entrou/saiu) | Relatórios | A | G | sim |
| P0 | E2 | Linha **Clientes ativos** no Fluxo de caixa (modo M) | Painel | A | P | sim (E1) |
| P0 | S1 | **Score v2**: gravidade do atraso, teto do em aberto, janela fixa de 12 meses | Inadimplência, Cliente | A | M | sim |
| P0 | S2 | **Retrabalho** no score + checkbox na categoria + "3 retrabalhos em 90 dias" | Cadastros, Inadimplência, Cliente | A | M | sim |
| P0 | D-a | Gráfico "Como cada mês foi pago" (empilhado, taxa no topo, mês parcial) no lugar do de dois eixos | Inadimplência | A | M | sim (campos novos em `monthly`) |
| P1 | D-b | **Carteira por risco** no lugar do termômetro (sem degradê; distribuição + em aberto por faixa) | Inadimplência | M | P | não |
| P1 | D-c | Cores do risco: Baixo risco neutro, Atenção âmbar, Risco alto âmbar escuro, Crítico vermelho | Inadimplência, Cliente | M | P | não |
| P1 | D-d | KPIs com tendência (últimos 3 meses completos × 3 anteriores) | Inadimplência | M | P | não |
| P1 | C-a | Composição do score + card Retrabalho + em aberto hachurado no Faturado e recebido | Cliente | A | M | sim (S2) |
| P1 | D-e | Filtro "Ativos · Inativos com pendência · Todos" (padrão sem inativos em dia) | Inadimplência | M | P | não |
| P2 | Q1 | Altura pelo conteúdo nos cards de tarefas (Para você, Seu ritmo, Meu departamento, Situação) | Minha área, Início | M | M | não |
| P2 | Q2 | "Para você" sem repetir o que a faixa e a lista já dizem | Minha área | M | P | não |
| P2 | Q3 | Processos por departamento some com 1 departamento (Por responsável vai a 12/12) | Início | M | P | não |
| P2 | Q4 | Visão geral dos clientes: faixas "Com atraso / A vencer / Em dia", sem âmbar no estado normal | Início | M | P | não |
| P2 | Q5 | Próximos vencimentos agrupa 3+ títulos do mesmo contato numa linha ("Ju Prado Design · 5 vencidos · R$ 850 · desde 10/05") | Painel | A | M | não |
| P2 | Q6 | Fluxo de caixa (relatório): saldo acumulado em gráfico próprio abaixo, meses vazios iniciais cortados | Relatórios | M | P | não |
| P2 | Q7 | KPIs da Visão geral com "vs período anterior" (segunda consulta do mesmo relatório) | Relatórios | M | P | não |
| P2 | Q8 | "Em aberto" com uma definição só (topo = em aberto sem as atrasadas, com "+ 9 atrasadas") | Rel. tarefas | M | P | não |
| P2 | Q9 | Rodapés da faixa do Início sem corte (texto mais curto; nome da obrigação no `title`) | Início | B | P | não |
| P3 | Q10 | Rankings de tarefas com `StackBar` (no prazo · com atraso · atrasadas) e números em colunas | Rel. tarefas | M | M | não |
| P3 | Q11 | Clientes devedores em S quando ≤ 3 devedores; Receitas fixas oculto por padrão se vazio | Painel | B | P | não |
| P3 | Q12 | Cabeçalho do painel em 375: mês e Personalizar na mesma linha das abas | Painel | B | P | não |
| P3 | Q13 | Filtros do relatório de tarefas viram "Filtros (n)" abaixo de 1280px | Rel. tarefas | B | P | não |
| P3 | H1 | Histórico diário de atrasadas/em aberto para comparar o Início com o mês anterior | Início | M | G | sim (snapshot) |
| P3 | H2 | Eventos de status do cliente (reativação) para a Evolução não reescrever o passado | Evolução | M | M | sim |

**Leitura do quadrante**: E2, D-b, D-c, D-d, D-e, Q2–Q4, Q6–Q9 são ganhos rápidos (alto/médio
impacto, esforço P); E1, S1, S2, D-a e C-a são os projetos que o usuário pediu e vão primeiro; H1 e
H2 ficam para depois (dependem de guardar dados que hoje não existem).

---

## 4. Evolução em relação ao mês anterior (item 2)

### 4.1 Onde fica

- **Relatórios › aba "Evolução"** (ícone `TrendingUp`), a segunda aba, depois de Visão geral:
  `?aba=evolucao&meses=12`. Descrição do cabeçalho: "Clientes, honorário mensal e faturamento mês a
  mês, comparados ao mês anterior." Controle do cabeçalho: janela `6 meses · 12 meses · 24 meses`
  (padrão 12, fora da URL). A janela termina sempre no mês corrente (a API não aceita outro fim). O
  **mês de referência** dos KPIs e da ponte é o corrente; clicar num mês do gráfico ou da tabela o
  troca (`?ref=2026-10`, some quando volta ao corrente).
- **Painel financeiro › Fluxo de caixa**, modo **M**: linha "Clientes ativos" sobre as barras de
  receita × despesa (§4.5).
- **Carteira de clientes** (painel): a linha do achado ganha a variação ("8 ativos · +2 vs outubro ·
  ticket médio R$ 1.637,14") e o rodapé "Ver evolução →".

Não confundir com o card oculto "Evolução do total" do painel (receitas/despesas de 12 meses); o
nome da aba fica "Evolução" porque o assunto dela é a carteira e o faturamento.

### 4.2 Métricas (definições únicas, calculadas na API)

Mês de referência `M`; **dia de referência** (`asOf`) = último dia de `M`, ou hoje se `M` é o mês
corrente (o mês fica marcado `partial`). Entre parênteses, o campo de `EvolutionMonth` que a API já
devolve (`GET /reports/evolution?months=1..36`, implementado pelo backend).

| Métrica | Definição |
| --- | --- |
| **Clientes ativos** (`activeClients`) | Clientes com `contractStartDate` ≤ `asOf` e sem inativação até ele (`inactivatedAt` nulo ou depois) |
| **Novos** (`newClients`) | `contractStartDate` dentro de `M`, até `asOf` |
| **Encerrados** (`churnedClients`) | `inactivatedAt` dentro de `M`, até `asOf` (motivo em `inactivationReason`) |
| **Variação da base** (`netChange`) | novos − encerrados (= `ativos(M) − ativos(M−1)`), com "+" sempre: "+4 clientes vs outubro" |
| **Honorário mensal recorrente** (`recurringFees`) | Soma do `amount` da vigência que contém `asOf`, dos clientes ativos (a mesma regra de "Gerar honorários"); cliente sem vigência conta como ativo e soma 0 (`clientsWithFee` não o conta) |
| **Ponte do honorário** (web, com `newList`/`churnedList`, **a pedir à API**) | `anterior + novos − encerrados + reajustes = atual`: novos = Σ honorário dos novos em `M`; encerrados = Σ honorário que os encerrados tinham em `M−1`; reajustes = o resto (vigência nova, cliente que ganhou ou perdeu vigência) |
| **Ticket médio** (`averageFee`) | honorário mensal ÷ `clientsWithFee` (centavos, arredondado); a API manda 0 sem vigência e a tela mostra "—" |
| **Faturado** (`billed`) | Recebíveis de clientes com vencimento em `M`, pagos ou não (sem linhas de juros/multa, sem cartão) |
| **Recebido** (`received`) | O que entrou dos clientes em `M` pela data de pagamento: recebíveis + juros + multa − descontos por pontualidade |
| **% recebido** | recebido ÷ faturado do mesmo mês (pode passar de 100% quando entram atrasados) |

Comparação: todo número do mês tem a diferença para `M−1` (absoluta e, em R$, também em %). A API
devolve `comparison` (mês corrente × anterior, `EvolutionChange` com `diff` e `diffPercent`) e um
mês a mais antes da janela, então a primeira linha também tem com quem comparar. Para outro mês de
referência, a tela calcula a mesma comparação a partir de `months` (função pura). No mês corrente,
"Recebido" leva "até hoje" e não compara em % (o mês não acabou); o faturado compara normalmente
(os recebíveis do mês já existem em aberto).

**Calcule ou adie**: a base é reconstruída de `contractStartDate` e `inactivatedAt`. Um cliente
reativado perde a data de inativação e passa a contar como ativo desde o início do contrato. Isso
fica escrito no (i) da aba ("Reativações reescrevem o histórico: o cliente conta como ativo desde o
início do contrato"); o registro de eventos de status é a melhoria H2.

### 4.3 Layout da aba (≥ 1280px; abaixo empilha na mesma ordem)

```
┌ Clientes ativos ┬ Honorário mensal ┬ Ticket médio ┬ Faturado no mês ┐  KpiCard compacto ×4
│ 10              │ R$ 16.260,00     │ R$ 1.626,00  │ R$ 12.565,00    │  (@container: 1 / 2 / 4)
│ +4 vs outubro · │ +R$ 4.800 (+41,9%)│ −0,6% vs out │ recebido 16% ·  │
│ 4 novos, 0 enc. │ vs outubro       │              │ −8,1% vs out    │
├ Carteira mês a mês (3/5) ───────────────┬ Honorário mensal: outubro → novembro (2/5) ┐
│ linha em degraus "Clientes ativos" +     │ Base de outubro          R$ 11.460,00       │
│ barras divergentes: novos (+, data),     │ + Novos (4)              R$ 4.800,00        │
│ encerrados (−, danger); um eixo, contagem│ + Reajustes              R$ 0,00            │
│ rótulos "+4" / "−1" nas barras           │ − Encerrados (0)         R$ 0,00            │
│                                          │ = Base de novembro       R$ 16.260,00       │
│                                          │ Quem entrou · Quem saiu (nomes, honorário)  │
├ Faturado, recebido e honorário mensal (largura toda) ─────────────────────────────────┤
│ barras faturado (cinza) e recebido (data); linha do honorário mensal (tinta, tracejada)│
│ — tudo em R$, um eixo (niceDomain); mês parcial hachurado com "parcial" no rótulo       │
├ Mês a mês (tabela) ─────────────────────────────────────────────────────────────────────┤
│ Mês | Ativos | Novos | Encerrados | Variação | Honorário mensal | Δ | Ticket | Faturado |│
│ Recebido | % recebido   (mais recente primeiro; Novos/Encerrados abrem a lista de nomes)│
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

- **KPIs** (`KpiCard compact`, reports usam KpiCard): valor do mês de referência; rodapé com a
  comparação em uma linha, cor só no sinal (verde se a base/o honorário/o recebido sobem, vermelho
  se caem; ticket em tinta). Mês parcial: rodapé termina com "· parcial".
- **Linha do achado** (subtítulo do primeiro gráfico, função pura `evolutionFinding`):
  "Novembro: +4 clientes (4 novos, 0 encerrados) · honorário mensal +R$ 4.800,00 (+41,9%) vs
  outubro". Sem variação: "Novembro: carteira estável em 8 clientes · honorário mensal igual a
  outubro". Com entradas e saídas que se anulam: "Setembro: base igual a agosto (1 novo, 1 encerrado) ·
  honorário mensal −R$ 500,00 (−4,2%) vs agosto".
- **Carteira mês a mês**: `ComposedChart` com **um eixo de contagem** (os dois são clientes):
  `Bar newClients` (`--app-data`), `Bar` de `−churnedClients` (`--app-danger`), linha `activeClients`
  (`type="stepAfter"`, `--app-fg`, 2px, rótulo direto no último ponto "10 ativos"), linha de zero
  sólida. Tooltip: "Novembro · 10 ativos · +4 novos · 0 encerrados · variação +4".
- **Ponte do honorário**: lista com sinais e barras horizontais proporcionais (não gráfico de
  cascata); abaixo, "Quem entrou" e "Quem saiu" (nome, honorário, motivo do encerramento), até 5 de
  cada com "+ N" que expande. Sem movimento: "Nenhum cliente entrou ou saiu em novembro."
- **Faturado, recebido e honorário mensal**: barras agrupadas (faturado `--app-chart-expense`,
  recebido `--app-data`) e a linha do honorário mensal (`--app-fg`, tracejada 4 4, 1,5px). Mesma
  unidade, então **um eixo**; `MoneyTooltip` com as três séries e o % recebido.
- **Tabela mês a mês**: `<table>` semântica, mais recente primeiro; variações com sinal; o número
  de Novos/Encerrados é um botão que abre um popover com os nomes. Imprime em A4 paisagem.
- **Estados**: carregando = esqueletos com a forma (4 KPIs, 2 gráficos, linhas); sem clientes =
  `EmptyState` "Nenhum cliente cadastrado" com "Cadastrar cliente"; erro = `ErrorState`.
- **Celular 375**: KPIs em lista (2 colunas não cabem os rodapés), gráficos com 220px de altura,
  tabela vira lista por mês (Mês, Ativos com variação, Honorário com variação, Recebido/Faturado).

### 4.4 Comparação mês a mês e com o mês anterior

- O mês de referência compara com o anterior nos KPIs e na ponte.
- Cada linha da tabela compara com a linha de baixo (o mês anterior); a mais antiga, com `baseline`.
- O exemplo do usuário vira: novembro com 4 contratos fechados → KPI "Clientes ativos 12 · +4 vs
  outubro · 4 novos, 0 encerrados"; barra "+4" em Nov no gráfico; linha da tabela
  "Nov/26 · 12 · 4 · 0 · +4".

### 4.5 Linha no gráfico do painel

- **Fluxo de caixa, modo M** (6 meses de competência terminando no mês do painel): linha
  "Clientes ativos" no **eixo da direita**, inteiro, sem grade própria (a grade é a do R$), marcas
  com sufixo ("8 cl."), `--app-fg` 1,5px com pontos de 3px e rótulo direto no último ponto
  ("10 clientes"). É o único eixo duplo aceito no produto, porque o usuário pediu e porque as duas
  grandezas são lidas separadamente (a linha nunca é comparada à altura das barras); a legenda
  diz "Clientes ativos (eixo direito)".
- Ligada por padrão; chip na legenda liga/desliga (preferência `fluxoClientes` no layout salvo).
  Nos modos D, S e A não aparece (a contagem é por fim de mês). Some também quando a evolução não
  tem nenhum cliente ativo (espaço pessoal).
- Tooltip ganha a linha "Clientes ativos 10 (+4)". A linha do achado não muda.

---

## 5. Inadimplência: gráfico e score (item 3)

### 5.1 Gráfico "Como cada mês foi pago"

Substitui "Média de dias de atraso por mês".

- **Barras empilhadas por mês de vencimento**, em **quantidade** (padrão) ou **valor**
  (`SegmentedControl sm`: Quantidade · Valor; estado local, fora da URL): **No prazo** (`--app-data`), **Pago com atraso**
  (`--app-warning`), **Vencido em aberto** (`--app-danger` hachurado com `stripeFill('danger')`).
  Um eixo só.
- **Rótulo no topo de cada barra**: a taxa de atraso do mês ("34%"), em `text-micro` muted; em
  vermelho só quando acima da média do período.
- **Mês corrente** (parcial): barras com opacidade 0,6, rótulo do eixo "Nov · parcial" e taxa
  omitida (o mês ainda não teve tempo de atrasar). Corrige D2.
- **Dias de atraso** saem do gráfico. O tooltip diz: "Agosto · 9 mensalidades · 6 no prazo · 2
  pagas com atraso (média 12 dias) · 1 vencida em aberto há 74 dias · R$ 4.800,00 em atraso". A
  média de dias passa a considerar **só as pagas com atraso** (número estável, D3); o em aberto
  aparece pela idade.
- **Linha do achado** (subtítulo): "Últimos 3 meses: 41% com atraso (eram 28% nos 3 anteriores)"
  ou, sem base, "34% das mensalidades do período atrasaram".
- Dados: `DelinquencyMonth` ganha `paidLateCount`, `openLateCount`, `onTimeAmount`,
  `paidLateAmount`, `openLateAmount`, `paidLateAvgDays` e `partial` (campos atuais mantidos).

### 5.2 Score v2 (pagamento)

Problemas: D7 (gravidade), D8 (em aberto sem teto), D9 (janela variável). Nova regra, no contrato
(`packages/shared/src/utils/delinquency.ts`), mesma função usada pela API e pelo relatório do
cliente:

```
janela      = últimos 12 meses, sempre (SCORE_WINDOW_MONTHS), qualquer que seja o período da aba
peso        w = 0,5^(meses atrás / 6)                          (meia-vida de 6 meses, como hoje)
gravidade   g(d) = 0 no prazo · 0,25 de 1 a 5 dias · 0,5 de 6 a 15 · 0,75 de 16 a 30 · 1 acima de 30
chance      = (Σ w·[d > 0] + 1) / (Σ w + 5)                    (inalterada: "chance de atrasar")
pontualidade = 1000 × (1 − (Σ w·g(d) + 1) / (Σ w + 5))         (sem histórico = 800)
em aberto   = −50 por mensalidade vencida em aberto, até −250
retrabalho  = −40 por retrabalho em 90 dias e −10 por um de 91 dias a 12 meses, até −200 (§6)
score       = pontualidade − em aberto − retrabalho, arredondado, limitado a 0..1000
faixas      = 800+ Baixo risco · 600–799 Atenção · 400–599 Risco alto · < 400 Crítico
```

Valores de referência (testes do plano):

| Histórico | Hoje | Score v2 |
| --- | --- | --- |
| Sem histórico | 800 | 800 |
| 12 meses no prazo | 916 | 916 |
| 12 meses, sempre 5 dias de atraso | 324 (Crítico) | **771 (Atenção)** |
| 12 meses, sempre 45 dias de atraso | 224 (Crítico) | 337 (Crítico) |
| 12 meses, 5 dias de atraso, 2 em aberto | 204 (Crítico) | 671 (Atenção) |
| 8 meses, 1 atraso de 18 dias (perfil Alicerce, 781 no demo) | 793 (Atenção) | **855 (Baixo risco)** |
| Perfil Rota Sul (12 atrasos de 5 a 21 dias, 2 em aberto) | 164 (Crítico) | **508 (Risco alto)** |
| Perfil Ju Prado (9 atrasos de 10 a 184 dias, 6 em aberto) | 0 (Crítico) | 191 (Crítico) |
| 12 meses no prazo, 8 em aberto | 436 (Risco alto) | 666 (Atenção; teto de −250) |
| 12 meses no prazo, 3 retrabalhos em 90 dias | — | **796 (Atenção)** |
| 12 meses no prazo, 9 retrabalhos em 90 dias | — | 716 (teto de −200) |

Os perfis Rota Sul e Ju Prado são reconstruções que reproduzem exatamente os scores atuais do demo
(164 e 0); os números finais do demo saem dos dados reais depois da implementação.

A **chance de atrasar** continua só sobre pagamento (sem gravidade e sem retrabalho): é a que
aparece em "68% de chance de atrasar" e na média da carteira.

### 5.3 Tela da inadimplência

- **KPIs** com tendência no rodapé (calculada no navegador a partir de `monthly`, só meses
  completos): Taxa de atraso "33,7% · últimos 3 meses 41% (eram 28%)"; os outros três
  KPIs ficam como hoje.
- **Carteira por risco** (substitui o termômetro, D5): número-herói "2 de 10" + "clientes em risco
  alto ou crítico"; `StackBar md` na ordem Crítico → Risco alto → Atenção → Baixo risco; faixas
  (`BandList`) com contagem e **valor em aberto por faixa** ("Crítico · 2 · R$ 6.480,00"); abaixo,
  "Chance média de atraso: 29% (cerca de 1 em cada 3 mensalidades)" e "3 clientes com retrabalho
  (4 tarefas em 90 dias)". Sai a "Taxa de atraso real" (é o KPI).
- **Cores** (D6): Baixo risco = neutro (selo `neutral`, barra `--app-chart-neutral`), Atenção =
  `warning`, Risco alto = `aging-3` (âmbar escuro), Crítico = `danger`. Sai o verde.
- **Coluna Score**: número + selo; embaixo, "68% de chance de atrasar" e, quando houver,
  "3 retrabalhos em 90 dias" (ícone `RotateCcw` 12px, `text-muted`); tooltip com a composição
  "Pontualidade 608 · em aberto −100 · retrabalho −120 = 388".
- **Filtro** (D10) ao lado da busca: `Ativos · Todos` (padrão Ativos; inativos com valor em aberto
  sempre aparecem, com "inativo" no nome).
- **Celular** (D12): o bloco do score desce para a grade de 2 colunas como a 5ª estatística
  (largura do nome inteira); cards de cliente com ~200px.
- **(i) do score** (`SCORE_HELP`, texto fixo): "Score de 0 a 1000 (maior = melhor), sempre sobre
  os últimos 12 meses. Parte da pontualidade: cada mensalidade atrasada pesa pela gravidade (1 a 5
  dias 25%, 6 a 15 dias 50%, 16 a 30 dias 75%, mais de 30 dias 100%), os meses recentes valem mais
  (6 meses atrás vale metade) e quem tem pouco histórico parte de 20%. Depois desconta 50 pontos por
  mensalidade vencida em aberto (até 250), 40 por retrabalho nos últimos 90 dias e 10 por
  retrabalho de até 12 meses (até 200).
  Faixas: 800+ Baixo risco · 600–799 Atenção · 400–599 Risco alto · abaixo de 400 Crítico."

### 5.4 Relatório do cliente

- **Score de 12 meses** (sem `?meses`; o link da inadimplência deixa de carregar o período) com a
  **composição** abaixo do número: "Pontualidade 608 · Em aberto −100 (2) · Retrabalho −120 (3) ·
  = 388", cada termo numa linha com o valor alinhado à direita.
- **Card Retrabalho** (ao lado de "Em aberto", no lugar de "Vigências do honorário", que desce):
  título "Retrabalho"; achado "3 em 90 dias · 7 em 12 meses"; as 5 mais recentes (`rework.latest`:
  data de abertura, título, categoria, situação), com "Abrir tarefa" quando o usuário pode ver
  tarefas; sem retrabalho: corpo vazio "Nenhum retrabalho nos últimos 12 meses".
- **Faturado e recebido por mês**: em aberto empilhado sobre o recebido, hachurado (vencido em
  `danger`, a vencer em cinza). Corrige C2.
- **KPIs** (C3): ficam 4 (Faturado, Recebido, Em aberto, Pontualidade); os outros 4 passam para uma
  linha `dl` compacta sob o "Quando paga".

---

## 6. Score do cliente considera retrabalho (item 4)

### 6.1 Cadastro de categorias

- **Sheet "Nova/Editar categoria"** (`TaskCategorySheet`): depois de "Cor", um `Checkbox` com rótulo
  **"Conta como retrabalho"** e descrição: "Tarefas desta categoria abertas para um cliente reduzem
  o score dele: −40 pontos por tarefa nos últimos 90 dias e −10 pelas de até 12 meses (até −200).
  Use em categorias como Retificação ou Correção." Só administradores salvam (o `WriteGate` atual).
  O formulário sempre envia `isRework` (a API mantém o valor guardado quando o campo falta).
- **Lista de categorias** (Cadastros › Categorias): selo `Badge tone="warning"` "Retrabalho" ao lado
  do nome; o subtítulo continua "N tarefas".
- **Relatórios de tarefas › Por categoria**: o mesmo selo ao lado do nome da categoria.
- Salvar uma categoria invalida as consultas `['reports']` (o score muda).
- Demo (já na semente do backend): categoria "Retrabalho" (`wrench`) com Rota Sul 2 em 90 dias + 1
  mais antiga, Pão Quente 1 + 1 e Ju Prado 1.

### 6.2 Contagem (fonte única, na API)

Retrabalho de um cliente = tarefas com `client_id` do cliente, categoria com `is_rework`, situação
diferente de cancelada, **fora das ocorrências de recorrentes** (`recurring_task_id` nulo: obrigação
gerada não é retrabalho) e **abertas** (`created_at` no fuso do escritório, `TASK_TIME_ZONE`) em
duas janelas que terminam hoje: **90 dias** (`last90Days`, de hoje − 89) e **12 meses**
(`last12Months`, inclui as de 90 dias). É o que o backend já faz (`reworkByClient`,
`reworkWindows`). Desconto = `min(200, 40 × last90Days + 10 × (last12Months − last90Days))`.
Desmarcar a categoria tira as tarefas da conta na hora (não há histórico do flag, de propósito).

Alternativa descartada: taxa de retrabalho (retrabalhos ÷ tarefas do cliente). O volume de tarefas
depende das obrigações geradas pelo regime; a taxa diluiria o sinal nos clientes grandes e ficaria
difícil de explicar. A contagem absoluta com teto é o que o usuário descreveu ("3 retrabalhos em
90 dias").

### 6.3 Onde aparece

| Lugar | Como |
| --- | --- |
| Inadimplência, coluna Score | "3 retrabalhos em 90 dias" sob a chance; composição no tooltip |
| Inadimplência, linha expandida | "Retrabalho: 3 em 90 dias" junto de "No período: …" |
| Inadimplência, Carteira por risco | "3 clientes com retrabalho (4 tarefas em 90 dias)" |
| Relatório do cliente | Composição do score e card Retrabalho (§5.4) |
| Ordenação "Score" | Já reflete (o score inclui o desconto) |

Exemplos: um cliente pontual de 12 meses (916) com 3 retrabalhos em 90 dias vai a 796 e sai de
Baixo risco para "Atenção" (tooltip "Pontualidade 916 · retrabalho −120 = 796"). No demo, Rota Sul
perde 90 (2 recentes + 1 antiga), Pão Quente 50 e Ju Prado 40. Com os pesos de hoje do backend
(4/1/20) os mesmos clientes perderiam 9, 5 e 4 pontos: invisível na faixa.

---

## 7. Roadmap

| Onda | Quando | Conteúdo | Dependências |
| --- | --- | --- | --- |
| **1** | esta semana (plano de 10/11) | Contrato; API: evolução, flag e contagem de retrabalho, score v2, campos novos do mensal (backend em paralelo); web: checkbox da categoria, score v2 na inadimplência e no cliente, gráfico "Como cada mês foi pago", Carteira por risco, cores, aba Evolução, linha no Fluxo de caixa; docs | Migração 0020 (reiniciar o `vite --mode demo`) |
| **2** | semana seguinte | Q1–Q9 (proporção por conteúdo em Minha área e Início, Para você sem repetição, Processos com 1 departamento, Visão geral dos clientes, Próximos vencimentos agrupados, Fluxo do relatório, comparação na Visão geral, "Em aberto" único, rodapés da faixa) e D-e | Nenhuma da API |
| **3** | depois | Q10–Q13; H1 (fotografia diária de atrasadas/em aberto para comparar o Início com o mês anterior); H2 (eventos de status do cliente para a Evolução não reescrever o passado) | Tabelas novas na API |

Critério de pronto de cada onda: capturas em 1440, 1024 e 375 sem rolagem lateral; todo número de
topo com comparação; nenhum card com mais de ~40% de vazio no arranjo padrão; `pnpm typecheck &&
pnpm test`.

---

## 8. Abordagens consideradas (decididas sem rodada de perguntas)

- **Onde mostrar a evolução**: (a) só um card novo no painel: pouco espaço para a tabela e as
  listas de quem entrou/saiu; (b) **aba no Relatórios + linha no Fluxo de caixa + variação no card
  Carteira**: o painel responde "cresceu?" num relance e o relatório responde "quem e quanto".
  **Escolhida (b).**
- **Gráfico da carteira**: (a) linha de ativos e barras de novos/encerrados em dois eixos; (b)
  **um eixo de contagem** (as duas séries são clientes; a escala de 8 a 12 e de −4 a +4 cabe junta).
  **Escolhida (b).** No Fluxo de caixa o eixo duplo é aceito porque o pedido é explícito e a linha
  tem rótulo próprio.
- **Score com retrabalho**: (a) dois scores (pagamento e operacional): mais preciso, mas o usuário
  pediu que o retrabalho entre no score; (b) **um score com composição visível**. **Escolhida
  (b)**: a chance de atrasar continua só de pagamento e a composição mostra quanto veio de cada
  parte. Por isso "Bom pagador" vira **"Baixo risco"**.
- **Gravidade**: (a) aumentar o desconto pela média de dias: continua tratando 12 atrasos de 5 dias
  como 12 "atrasos"; (b) **atraso pesado por faixa de dias dentro da pontualidade**: simples de
  explicar em uma frase e separa os perfis do demo. **Escolhida (b).**
- **Janela do score**: (a) seguir o período da aba; (b) **12 meses fixos**: o score vira uma
  propriedade do cliente, igual em qualquer tela. **Escolhida (b).**

**Não-objetivos**: metas de crescimento cadastradas; previsão de churn; mudar o destino dos
cliques; outra biblioteca de gráficos. **Antiobjetivos**: degradê (sai o do termômetro), número
inventado (reativação fica dita, não estimada), animação acima de 200ms, rolagem dentro de card.

---

## 9. Alinhamento com a API em andamento (backend em paralelo, 10/11)

O agente de backend já entregou, no contrato e na API (sem commit): migração 0020
(`task_categories.is_rework`), `isRework` opcional no `taskCategoryInputSchema` (falta = mantém),
`utils/rework.ts` (`reworkWindows`, `reworkPenalty`, `clientScore` = `delinquencyScore` − desconto),
`reworkByClient` e `GET /reports/clients/:id/rework` (`ClientReworkResponse`: `today`, `windows`,
`penalty`, `rework { last90Days, last12Months, latest[≤5] }`), `DelinquencyClient` com
`paymentScore`, `reworkPenalty` e `rework`, `utils/evolution.ts` (`clientBaseEvolution`,
`evolutionComparison`), `GET /reports/evolution?months=1..36` (`EvolutionMonth`, `comparison`) e a
semente do demo. Esta spec adota esses nomes. O que ainda falta na API para a spec:

| # | Delta | Por quê |
| --- | --- | --- |
| A1 | `REWORK_PENALTY_RECENT = 40`, `REWORK_PENALTY_OLDER = 10`, `REWORK_PENALTY_MAX = 200` (eram 4, 1, 20) | Com teto de 20 em 1000 o retrabalho nunca muda a faixa; o pedido do usuário ficaria sem efeito visível |
| A2 | Score v2 em `delinquencyScore` (gravidade, em aberto −50 até −250) com `punctuality` e `openPenalty` no retorno | D7, D8 e a composição do score |
| A3 | Score da inadimplência sempre sobre 12 meses (`SCORE_WINDOW_MONTHS`), qualquer `months` | D9 |
| A4 | `DelinquencyMonth` com `onTimeCount`, `paidLateCount`, `openLateCount`, os três valores, `paidLateAvgDays` e `partial` | Gráfico "Como cada mês foi pago" |
| A5 | `EvolutionMonth.newList` e `churnedList` (`{ id, name, fee }`, encerrados com `reason` e o honorário de `M−1`) | Ponte do honorário, "quem entrou / quem saiu", motivos |
| A6 | `ReworkTask.title` nulo para quem não tem a permissão `tasks` (contagem e categoria continuam) | Usuário só do financeiro não lê títulos de tarefas |
| A7 | `EVOLUTION_METRIC_LABELS`: `activeClients` "Clientes ativos" (era "Base ativa") e `recurringFees` "Honorário mensal recorrente" (era "Honorários recorrentes") | As palavras do usuário |

