# Dashboards: redesenho de cards e gráficos

> Dono: `ui-saas-designer`. Status: **implementada** (05/11/2026) pelo plano
> `docs/superpowers/plans/2026-11-05-dashboards-redesign.md`.
> Escopo: **Painel financeiro** (`/financeiro`, `apps/web/src/features/dashboard/**`) e **Início da
> Gestão** (`/`, `features/tasks/pages/home.tsx`, `components/dashboard-cards.tsx`, `band-list.tsx`,
> `dashboard-logic.ts`). Fica de fora a aba "Dashboard inteligente".
> Base: `docs/design-system.md` (a §5, livro-razão, prevalece) e a skill `dashboard-designer`
> (público, KPIs em 3 níveis, F-pattern, cores, densidade, títulos com achado, comparação, celular).
> Capturas da auditoria (demo, 1440 / 1024 / 375, página inteira e recortes):
> `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/dash-audit/`
> (medidas de cada card em `metrics.json`).

---

## 0. Decisões principais (leitura rápida)

1. **Um sistema de tamanhos para os dois painéis.** Linha de 96px (88px abaixo de 4 colunas), espaço
   de 16px, e só três alturas por padrão: **S** 2 linhas (208px), **M** 3 linhas (320px) e **L** 4
   linhas (432px). Em cada fileira do arranjo padrão, todos os cards têm a mesma altura. Larguras em
   frações: 1/4, 1/2 e 1 no financeiro; 1/4, 1/3, 1/2, 2/3 e 1 no Início.
2. **Largura proporcional em 2 colunas.** Hoje um card de meia largura vira largura total em 2 colunas
   (`displaySpan = min(c, cols)`), e a 1024px o financeiro vira uma coluna de cards de 900px. Passa a
   valer a proporção: 1/4 e 1/2 viram 1/2; 3/4 e 1 viram 1.
3. **Faixa de números única (`MetricStrip`)** no topo dos dois painéis: um cartão com células
   separadas por divisores, rótulo + valor + rodapé com comparação; no financeiro, minigráfico de 6
   meses. No celular, as células viram linhas (rótulo à esquerda, valor inteiro à direita), sem corte.
4. **Anatomia única de card (`WidgetCard`)**: título estável (o nome do card) e, abaixo, a **linha do
   achado** (a frase com o número que importa, gerada por função pura), ação alinhada à borda direita,
   corpo em um de cinco padrões e rodapé de uma linha. Descrição do card vai para o (i).
5. **Status como barra empilhada, não rosca.** As três roscas do Início (Situação das tarefas,
   Pendências fiscais, Visão geral dos clientes) e as listas de faixas só com texto viram o padrão
   **StatusCard**: barra empilhada proporcional + faixas clicáveis (e, nos cards L, um número-herói).
6. **Cor de progresso corrigida**: concluído/em dia no tom de dado (azul), atrasado em vermelho,
   atenção em âmbar, pendente e sem data em cinza. Verde fica só para variação positiva e resultado
   positivo. Hoje "pendente" é o azul forte e uma obrigação 0/3 parece cheia.
7. **Comparação em todo número de topo**: vs mês anterior (receitas, despesas, resultado), meta
   implícita da competência (% concluído com a marca de "hoje" no mês), % no prazo, bullet contra o
   previsto (honorários) e contra o mês anterior (resumo). Patrimônio não tem histórico na API: mostra
   a composição e diz isso no (i).
8. **Gráficos legíveis por regra**: domínio "redondo" que só desce abaixo de zero o necessário,
   3 a 5 marcas, rótulo direto no pico/último período, tooltip em R$, altura mínima de 160px e nenhum
   gráfico em card com menos de 3 linhas.
9. **Modo Personalizar** no financeiro: na visualização normal os cards não têm alça, olho nem canto
   de redimensionar (somem os 52px reservados que desalinham as ações); "Personalizar" entra no modo de
   edição, onde ficam arrastar, redimensionar, ocultar, "Cards" (a lista de hoje), "Organizar" e
   "Concluir".
10. **Arranjos novos**, mantendo a ordem de prioridade de cada painel (financeiro: cobrança → caixa →
    clientes → análises → recorrentes; Início: minhas tarefas → próximos dias → carga → vencimentos →
    obrigações). "Resultado mês a mês" sai do padrão (repete o Fluxo de caixa) e continua em "Cards".

---

## 1. Público, propósito e KPIs (skill, passos 1 e 2)

| | Painel financeiro | Início da Gestão |
| --- | --- | --- |
| Quem | Sócio/administrador do escritório | Toda a equipe; administradores veem todos os departamentos |
| Decisão | Quem cobrar, se o caixa aguenta o mês, onde a despesa pesa | O que fazer hoje, quem está sobrecarregado, o que vence |
| Frequência | Diária a semanal (operacional) | Várias vezes ao dia (operacional) |
| Ação | Abrir inadimplência/vencidos, gerar honorários, rever despesas | Abrir a tarefa, a lista filtrada, a auditoria |
| Nível 1 (topo) | Receitas, Despesas, Resultado (margem), Patrimônio | Atrasadas, Fora da meta, Vencem hoje, Próximos 7 dias, Em aberto, Concluídas no mês |
| Nível 2 (cards) | Inadimplência, Devedores, Honorários do mês, Próximos vencimentos, Fluxo, Saldo, Projeção, Insights, Carteira, Vigências, Resumo, Categorias, Fixos | Minhas tarefas, Situação, Fluxo por dia, Agenda, Por responsável, Processos, Vencimentos (4), Pendências fiscais, Clientes |
| Nível 3 (detalhe) | Listas de contas, extrato, relatórios (links dos cards) | Lista de tarefas, auditoria, folhas de lista (links dos cards) |

Operacional pede 8 a 15 indicadores: o financeiro fica com 4 KPIs + 14 cards no padrão (era 15) e o
Início com 6 números + 12 cards. Por tela (1440×900) aparecem no máximo 6 elementos de dados.

---

## 2. Auditoria (estado em 05/11/2026)

Medidas das capturas em 1440px salvo indicação. "Princípio" remete à skill ou à §5 do design system.

### 2.1 Painel financeiro

| # | Onde | Problema | Evidência | Princípio |
| --- | --- | --- | --- | --- |
| F1 | Quadro a 1024px | Em 2 colunas todo card 2×N ocupa a largura toda: o quadro vira uma coluna | 15 cards de 900px; página de 6.119px (4.288px a 1440) | Proporção, densidade |
| F2 | Clientes devedores 2×3 | 2 linhas num card de 650×320 | ~65% da altura vazia | Proporção |
| F3 | Receitas fixas 2×4 (vazio) | Estado vazio tracejado de 606×330 dentro do card (moldura dupla) | Card inteiro vazio | Proporção, ruído |
| F4 | Resultado mês a mês 4×3 | 6 barras de 44px em 1.316px; eixo vai a −2,5k por um mês de −R$ 30 | ~80% da área em branco; metade do desenho abaixo de zero sem dado | Gráfico legível |
| F5 | Honorários do mês 4×3 | 3 barras esticadas; valores a ~700px dos rótulos; "Recebido R$ 0,00" sem destaque | Leitura em Z | Proporção, comparação |
| F6 | Cabeçalhos com ação | Alça + olho invisíveis reservam ~52px: D S M A, filtros e "Ver todos →" ficam fora da borda direita | Fluxo, Próximos, Projeção, Carteira, Gastos/Receitas fixas | Alinhamento |
| F7 | Todos | Mesmo peso visual; subtítulos descrevem a interface ("Saldo de hoje em cada conta", "Ranking por valor vencido em aberto") | 4 de 15 subtítulos dizem um achado | Títulos com achado |
| F8 | Resumo do período | Repete totais e variações dos KPIs; 2 minigráficos de 6 meses repetem o Fluxo; pílulas com fundo verde/vermelho | 7 blocos num card de 432px | Densidade, cor só nos dados |
| F9 | Projeção de caixa | "Pior dia do período" igual a "Em 90 dias" (mesmo valor e data) | 4 blocos, 1 repetido | Redundância |
| F10 | KPIs | Patrimônio sem comparação; valor alinhado à direita deixa ~60% do card vazio à esquerda; sem tendência (a API já manda 6 meses em `monthly`) | 1 de 4 sem base | Comparação, F-pattern |
| F11 | Listas | Linhas de 3 andares (chip "+ Empregados", "Sem conta") | Próximos: 3 de 24 visíveis em 320px; Gastos fixos: 3 de 8 em 432px | Densidade |
| F12 | Janelas de tempo | Hoje (Inadimplência, Saldo), 15 dias (Próximos), mês (Resumo, Categorias), 6 meses (Fluxo), 90 dias (Projeção), sem aviso; nada diz quando o dado foi atualizado | — | Datas claras, "última atualização" |
| F13 | Celular 375 | KPIs em 2×2 cortam o valor e o rodapé | "$17.923,60", ";109.429,56", "vs mês an"; página de 6.266px | Celular |
| F14 | Inadimplência | 3ª família de cor (âmbar → marrom) só neste card | `--app-aging-1..3` | Máx. 4–5 cores (aceito: escala de gravidade) |

### 2.2 Início da Gestão

| # | Onde | Problema | Evidência | Princípio |
| --- | --- | --- | --- | --- |
| I1 | Grade | 9 alturas fixas diferentes (`h-[17rem]` a `h-[30rem]`); em Vencimentos, Convenções tem 304px e os vizinhos 272px; "Ver todos" em 2 de 4 | `home.tsx` | Proporção, consistência |
| I2 | Situação das tarefas, Visão geral dos clientes | Rosca de 100px solta em cards de 416 e 384px, repetindo os números da lista ao lado (decorativa) | ~60% da área vazia | Proporção |
| I3 | Processos, Por responsável, Agenda | 1 linha em 320px; 2 linhas em 352px; Agenda vazia com moldura tracejada de 606×252 | — | Proporção |
| I4 | Pendências fiscais, Processos | "Pendente" no azul de dado (o tom mais forte), concluído em verde: obrigação 0/3 aparece como barra azul cheia | DCTFWeb 0/6 parece completa | Codificação |
| I5 | Resumo × Situação | "Atrasadas 3" (todas as abertas) e "Atrasadas 2" (só a competência) na mesma tela, sem dizer a diferença | — | Definições consistentes |
| I6 | Cores | Verde em 6 cards para "Em dia/Concluídas" + âmbar + vermelho + azul + cinza; Visão geral dos clientes toda âmbar | Até 5 cores por fileira | Cor só no que exige atenção |
| I7 | Resumo a 1024 | 6 colunas em 924px: "Fora da / meta" em 2 linhas, "6 em andamento · 5 aguardando cliente" em 5 linhas | Células com alturas de conteúdo muito diferentes | Proporção |
| I8 | Vencimentos a 1024 | 4 cards de ~210px truncam o título | "Certificados digit…", "Honorários próxim…" | Proporção |
| I9 | Vencimentos | 4 listas iguais de "ponto + rótulo + número", sem noção de proporção | — | Hierarquia |
| I10 | Cadastro incompleto | "+ 3 clientes" e "Ver todos (6)" juntos; 1.316px com o nome a 240px do texto | — | Redundância |
| I11 | Celular 375 | Resumo em células de 2 colunas ocupa ~2 telas; página de 5.627px | — | Celular |

### 2.3 Entre os dois painéis

- Duas faixas de topo diferentes: cartões separados com rodapé cinza (financeiro) × um cartão com
  células (Início).
- Espaço entre cards de 16px no financeiro e 20px no Início; títulos de `CardHeader` em 15px e de
  `WidgetCard` em 16px.
- Estado vazio tracejado dentro de um card já emoldurado (moldura dupla) nos dois.

---

## 3. Abordagens consideradas

**Redesenho geral**
- **A. Ajuste fino** (corrigir alturas e espaços, sem padrões novos): barato, mas deixa a 2 colunas em
  uma coluna, as roscas soltas e a cor invertida. Descartada.
- **B. Sistema proporcional + padrões compartilhados** (tamanhos S/M/L, `MetricStrip`, `StatusCard`,
  regras de gráfico, linha do achado): mantém Personalizar, Organizar, catálogo e componentes; troca o
  conteúdo dos cards onde ele não cabe. **Escolhida.**
- **C. Painel fixo por modelo** (sem quadro livre): mais simples de manter proporcional, mas acaba com
  a personalização. Descartada.

**Título do card**
- Título com o achado ("R$ 6.480 vencidos, 84% com 1 cliente"): segue a skill ao pé da letra, mas o
  título muda todo mês, o usuário perde a âncora e "Cards"/leitor de tela ficam com nomes instáveis.
- **Título estável + linha do achado logo abaixo** (padrão de Stripe, Linear e Vercel). **Escolhida**:
  a frase com o número fica no primeiro lugar que o olho lê depois do nome.

**Controles do card (alça, olho, canto)**
- Manter no hover: continua reservando 52px e desalinhando as ações.
- Alça no topo central + olho no fluxo: reduz o vão a 28px, mas ainda há vão.
- **Modo de edição** (Grafana, Datadog, HubSpot, Stripe): visualização limpa; arrastar, redimensionar
  e ocultar só depois de "Personalizar". **Escolhida.** Perde-se o arrastar direto pelo cabeçalho na
  visualização normal (troca aceita: evita arrastos acidentais e conflitos com links do cabeçalho).

---

## 4. Grade e tamanhos

- **Contêiner**: a largura do conteúdo da página escolhe as colunas (`columnsForWidth`): ≥ 1000px = 4
  colunas (financeiro) ou 12 (Início); 560–999px = 2; < 560px = 1. Linha de 96px em 4/12 colunas e
  88px abaixo; espaço de 16px em tudo (o Início deixa os 20px).
- **Alturas** (`heightForRows`, fonte única para os dois painéis):

  | Classe | Linhas | 4 col | 2 e 1 col | Uso |
  | --- | --- | --- | --- | --- |
  | S | 2 | 208px | 192px | faixas (Insights, Honorários do mês) |
  | M | 3 | 320px | 296px | status, listas curtas, rankings |
  | L | 4 | 432px | 400px | gráficos, listas principais |

  Tamanhos maiores (5–7 linhas) continuam possíveis no redimensionar e nos presets, nunca no padrão.
- **Largura em 2 colunas** (`displaySpan`): `c ≤ 2 → 1`, `c ≥ 3 → 2`. Redimensionar em 2 colunas grava
  a largura de 4 colunas proporcional (1 → 2, 2 → 4) e mantém a gravada quando a exibida não muda.
- **Mínimos**: card com gráfico, no mínimo 2×3; lista, 1×3; faixa, 2×2. Nada abaixo de 2 linhas.
- **Início** usa a mesma função de altura num `DashSlot` (linhas + largura por faixa de contêiner),
  em vez de alturas soltas por card.

---

## 5. Anatomia do card (padrão único: `WidgetCard`)

```
┌──────────────────────────────────────────────────────────┐ raio xl, borda, sem sombra, padding 20
│ Título (16/600)  (i)                       [ação à direita]│ ação encostada na borda direita
│ Linha do achado: "84% com Transportadora Rota Sul" (12,5)  │ número-chave em tinta 600; alerta em danger
│                                                            │
│ Corpo: 1 de 5 padrões (abaixo), ocupa a altura que sobra   │
│                                                            │
│ rodapé (12,5): resumo ou nota          Ver todos →         │ 1 linha, sempre no mesmo lugar
└──────────────────────────────────────────────────────────┘
```

- **Linha do achado** (substitui o subtítulo descritivo): começa pela janela quando ela não é o mês
  escolhido ("Próximos 15 dias · …", "Últimos 6 meses · …", "Hoje · …"); tem até ~70 caracteres e
  trunca com `title`; nunca descreve a interface; só o número de alerta fica vermelho. Vem de funções
  puras testadas (plano, tarefas 6 e 10). Sem dados: a descrição curta de hoje.
- **Padrões de corpo**:
  1. **StatusCard**: barra empilhada + faixas (cards M); com número-herói em cima (cards L).
  2. **Série temporal**: Recharts, regras da §6.
  3. **Ranking**: linhas com barra proporcional ao maior, valor e % do total (devedores, responsáveis,
     departamentos).
  4. **Lista** (`FitList`): linhas de uma altura só, cortadas com "+ N …" que é link.
  5. **Bullet/progresso contra referência**: barra realizada + aberta hachurada + marca da referência
     (previsto, mês anterior, hoje no mês).
- **Estados**: carregando = esqueleto com a forma do conteúdo (barras, linhas, eixo); vazio dentro do
  card = **sem moldura tracejada** (o card já é a moldura): ícone 20px `text-subtle`, título 14/600,
  descrição 12,5 muted, ação outline sm, centrado; erro = `ErrorState` compacto. A moldura tracejada
  fica para estados vazios de página e para o destino do arrasto no modo Personalizar.
- **Tipografia** (tokens atuais): título `text-title-sm` 16; achado e rodapé `text-caption` 12,5; linha
  de lista `text-body-sm` 14; meta `text-micro` 11 (piso); número-herói `text-kpi` 24 (32 só na célula
  "Atrasadas" do Início).
- **Faixa de topo (`MetricStrip`)**: um `Card` com células separadas por divisores (mesmo desenho no
  financeiro e no Início). Célula: rótulo 12,5 muted + (i); valor `text-kpi` **alinhado à esquerda**;
  à direita do valor, minigráfico opcional (96×32); rodapé de uma linha com a comparação. Cada célula é
  um link (como hoje). Abaixo de 560px, cada célula vira uma linha (rótulo e rodapé à esquerda, valor
  inteiro à direita, 20px), sem corte e sem compactar o valor.

---

## 6. Gráficos

- **Cores**: série principal `--app-data`; comparação e despesas `--app-chart-expense` (cinza); valor
  negativo `danger`; o que está em aberto/previsto, hachurado (`StripeDefs`). No máximo 4 cores num
  gráfico; categorias pela rampa `SERIES_PALETTE`.
- **Eixo Y**: 3 a 5 marcas em passos redondos (1, 2, 2,5 ou 5 × 10ⁿ), escolhendo o menor intervalo
  que contém os dados (`niceDomain`); começa em zero; um negativo pequeno (menor que ¼ do passo) só
  estica o domínio, sem marca negativa. Rótulos curtos (`moneyAxisFormatter`).
- **Eixo X**: rótulos que cabem (`labelTicks`/`fitTicks`), o último sempre visível.
- **Grade** só horizontal, tracejada; linha de zero sólida quando há negativos.
- **Rótulos diretos**: valor no pico ou no último período; legenda só com 2+ séries, com o total de
  cada série ao lado do nome.
- **Tooltip**: `MoneyTooltip`, cursor `bg-subtle`; clique continua abrindo o detalhe onde já abre.
- **Tamanho**: desenho com no mínimo 160px de altura; em 2 colunas o gráfico de meia largura tem
  ~440px de largura; barras de até 44px (6 a 14 categorias por gráfico).
- **Barra empilhada (`StackBar`)**: 10px, raio cheio, 2px entre segmentos, larguras exatas e % inteiros
  pelo maior resto (`stackSegments`). Ordem: **progresso** = concluído (data) → atrasado (danger) →
  pendente (cinza); **distribuição** = mesma ordem das faixas da lista (danger → warning → data →
  cinza). Marca opcional "hoje" (traço de 2px + rótulo "dia 5") na posição do mês já passado.
- **Minigráfico (`Sparkline`)**: linha SVG de 1,5px no tom de dado (cinza para despesas), ponto no
  último valor, sem eixos, `aria-hidden` (o número ao lado é o dado).
- **Acessibilidade**: `role="img"` com `aria-label` = a linha do achado + o total; contraste AA; o
  sentido nunca só pela cor (rótulo e sinal no texto).

**Tons de status** (`BandTone`): `danger` vencido/atrasado; `warning` vence em 30 dias/pendências;
`data` em dia/concluído; `dataSoft` (`bg-data/45`) em 31 a 60 dias; `muted` pendente/sem data. Verde
(`success`) sai das faixas.

---

## 7. Painel financeiro

### 7.1 Faixa de topo

| Célula | Valor | Minigráfico | Rodapé (comparação) |
| --- | --- | --- | --- |
| Receitas | `summary.income` | `monthly[].income` | "+20,0% vs mês anterior" (verde se sobe) |
| Despesas | `summary.expense` | `monthly[].expense` (cinza) | "−2,2% vs mês anterior" (verde se cai) |
| Resultado | `summary.net` (vermelho se < 0) | `monthly[].net` | "margem 22,6% · +17,6 p.p. vs mês anterior" |
| Patrimônio | `balances.netWorth` | — | "Em contas R$ X · investido R$ Y" ((i): "Sem histórico de saldo para comparar") |

"Margem" vira o rodapé do Resultado (o número em R$ é o que se decide; a margem é o contexto).

### 7.2 Arranjo padrão (4 colunas, espaço de trabalho empresarial)

```
┌ Receitas ─────┬ Despesas ─────┬ Resultado ────┬ Patrimônio ───┐ MetricStrip
├───────────────┴───────────────┼───────────────┴───────────────┤
│ Inadimplência 2×3             │ Clientes devedores 2×3        │ M 320
├───────────────────────────────┴───────────────────────────────┤
│ Honorários do mês 4×2  (previsto → gerado → recebido)          │ S 208
├───────────────────────────────────────────────────────────────┤
│ Próximos vencimentos 4×3                                       │ M 320
├───────────────────────────────┬───────────────────────────────┤
│ Fluxo de caixa 2×4            │ Saldo em contas 2×4           │ L 432
├───────────────────────────────┴───────────────────────────────┤
│ Projeção de caixa 4×4                                          │ L 432
├───────────────────────────────────────────────────────────────┤
│ Insights 4×2                                                   │ S 208
├───────────────────────────────┬───────────────────────────────┤
│ Carteira de clientes 2×4      │ Vigências de honorários 2×4   │ L
├───────────────────────────────┼───────────────────────────────┤
│ Resumo do período 2×4         │ Despesas por categoria 2×4    │ L
├───────────────────────────────┼───────────────────────────────┤
│ Gastos fixos 2×4              │ Receitas fixas 2×4            │ L
└───────────────────────────────┴───────────────────────────────┘
```

Ordem do catálogo (`WIDGET_SPECS`, que faz o empacotamento sem buracos nos dois tipos de espaço):
inadimplencia, clientes-devedores, honorarios-mes, proximos-vencimentos, fatura-cartao*, fluxo-caixa,
saude*, saldo-contas, projecao-caixa, insights, carteira-clientes, vigencias-honorarios,
cadastro-incompleto*, resumo-periodo, despesas-categoria, resultado-mensal*, receitas-categoria*,
evolucao*, composicao*, gastos-fixos, receitas-fixas, metas* (* = oculto por padrão). Nos espaços
pessoais saem Honorários, Carteira e Vigências e o quadro continua sem buracos.

### 7.3 Card a card

| Card | Tamanho (padrão · mín · presets) | Corpo | Linha do achado (exemplo do demo) |
| --- | --- | --- | --- |
| Inadimplência | 2×3 · 1×3 · 2×3, 2×4 | Como hoje (valor, "34% do total a receber · 8 títulos", barra por faixa, 3 faixas) | "Hoje · maior faixa: até 30 dias (87%)" |
| Clientes devedores | 2×3 · 1×3 · 2×3, 2×4, 2×5 | Ranking com % do vencido por linha; rodapé "2 clientes · R$ 6.480,00" | "Transportadora Rota Sul Ltda concentra 84% do vencido" |
| Honorários do mês | **4×2** · 2×2 · 4×2, 2×3 | Faixa em 3 colunas: Previsto · Gerado (bullet com marca no previsto, "110%") · Recebido (bullet contra o gerado, "0%"); à direita Em aberto e Sem honorário gerado. Abaixo de 512px de card, 3 linhas e o resto no rodapé | "110% do previsto gerado · 0% recebido" |
| Próximos vencimentos | 4×3 · 2×3 · 4×3, 4×4, 2×4 | Lista com linha de uma altura (densidade `line`: estado, descrição + contato numa linha, vencimento com "venceu há N dias", valor, "⋯"; sem chip "+ Empregados" e sem "Sem conta") — ~5 linhas em M | "A pagar R$ 3.499,90 (4) · a receber R$ 12.565,00 (21)" |
| Fluxo de caixa | 2×4 · 2×3 · 2×4, 2×5, 4×5 | Como hoje (receitas azul × despesas cinza, D S M A); domínio `niceDomain`; legenda com totais | "Receitas acima das despesas em 5 de 6 meses" |
| Saldo em contas | 2×4 · 1×3 · 1×4, 2×4, 2×5 | Como hoje | "R$ 64.653,86 em 4 contas" |
| Projeção de caixa | 4×4 · 2×4 · 2×4, 4×4, 4×5 | Linha em degraus; marcos 30/60/90 sem repetir: "Pior dia" só aparece se a data ou o valor diferirem do último marco; linha de referência no saldo de hoje | "De R$ 64,7 mil hoje a R$ 41,6 mil em 90 dias" (ou "Fica negativo em 12/01") |
| Insights | 4×2 · 1×2 · 1×2, 2×2, 4×2 | Como hoje | "5 análises do mês" |
| Carteira de clientes | 2×4 · 2×3 · 2×4, 4×4 | Como hoje; "Ver clientes →" no rodapé | "8 ativos · ticket médio R$ 1.637,14" |
| Vigências de honorários | 2×4 · 1×3 · 2×3, 2×4 | Como hoje | "1 sem vigência · 4 renovam em 60 dias" |
| Resumo do período | 2×4 · 2×3 · 2×3, 2×4 | Dois blocos (Receitas, Despesas): total + variação; **bullet** realizado (sólido) + em aberto (hachurado) com marca no total do mês anterior; legenda "Recebido R$ X · 30%" e "A receber R$ Y". Sem pílulas coloridas e sem os minigráficos de 6 meses. Rodapé: saldo do mês · eficiência | "30% das receitas recebidas · 75% das despesas pagas" |
| Despesas por categoria | 2×4 · 2×3 · 2×4, 2×5, 4×5 | Como hoje (rosca, até 5 fatias + "Outras") | "Pessoal soma 66% das despesas" |
| Resultado mês a mês | 2×4 · 2×3 · 2×4, 4×3 (**oculto por padrão**) | Barras com `niceDomain` (o −R$ 30 não abre −2,5k), rótulo no pico | "5 de 6 meses positivos · média R$ 1.055,18" |
| Gastos fixos / Receitas fixas | 2×4 · 2×3 · 2×4, 2×5 | Barra de pagos; lista em densidade `line` (~6 linhas em L); vazio sem moldura | "74% pago · falta R$ 3.319,90" |

Os demais ocultos por padrão (Fatura, Saúde, Cadastro incompleto, Receitas por categoria, Evolução,
Composição, Metas) só seguem as regras gerais (achado, gráficos, vazio, mínimos).

### 7.4 Modo Personalizar

- Visualização: cards sem alça, olho e canto; cabeçalho não arrasta; a ação encosta na borda.
- "Personalizar" (cabeçalho da página) entra no modo: a barra do cabeçalho troca para **Cards** (abre a
  folha de hoje, com o selo "N ocultos"), **Organizar** (só com vãos), e **Concluir** (primário).
  Esc também conclui. `?personalizar=1` entra no modo e abre "Cards".
- No modo: alça e olho no cabeçalho do card, canto de redimensionar, borda dos cards em
  `border-strong` e cursor de mover no cabeçalho; o destino do arrasto continua tracejado; arrastar
  pelo cabeçalho ou pela alça, teclado na alça, ocultar com "Desfazer" e as demais regras da §4 do
  design system continuam iguais.
- Leitor de tela: "Modo de personalização. Use a alça de cada card para mover." ao entrar.

---

## 8. Início da Gestão

### 8.1 Faixa de topo (`MetricStrip`, 6 células)

- ≥ 1000px: uma fileira, "Atrasadas" com 1,3 fração e número de 32px; 560–999px: 3 × 2; < 560px:
  linhas. Rodapés numa linha (truncados com `title`), então todas as células da fileira têm a mesma
  altura.
- Comparações: Atrasadas = "a mais antiga venceu há 21 dias: DCTFWeb"; Concluídas em novembro =
  barra no prazo (data) × com atraso (danger) e "60% no prazo" (contra a meta de 100%); as demais como
  hoje.

### 8.2 Arranjo (≥ 1000px, 12 colunas)

```
┌ Atrasadas ─┬ Fora da meta ┬ Vencem hoje ┬ Próx. 7 dias ┬ Em aberto ┬ Concluídas ┐ MetricStrip
Tarefas
├──────────────────────────────────────┬───────────────────────────┤
│ Minhas tarefas 8/12                   │ Situação das tarefas 4/12 │ L 432
├──────────────────────────┬────────────┴───────────────────────────┤
│ Fluxo de tarefas por dia 6/12 │ Agenda 6/12                        │ M 320  (próximos dias)
├──────────────────────────┼────────────────────────────────────────┤
│ Por responsável 6/12      │ Processos por departamento 6/12        │ M 320  (carga)
Vencimentos
├────────────┬────────────┬────────────┬───────────────────────────┤
│ Certificados 3 │ Laudos 3 │ Convenções 3 │ Honorários próx. 3       │ M 320  (sem Honorários: 4/4/4)
Obrigações e clientes
├──────────────────────────────────────┬───────────────────────────┤
│ Pendências fiscais 8/12               │ Visão geral dos clientes 4/12 │ L 432
├──────────────────────────────────────┴───────────────────────────┤
│ Cadastro incompleto 12/12                                          │ M 320
└────────────────────────────────────────────────────────────────────┘
```

- **560–999px** (2 colunas): Minhas tarefas, Situação (M), Pendências fiscais, Visão geral (M) e
  Cadastro incompleto na largura toda; os demais em pares. Sem Honorários, Convenções ocupa as duas
  colunas e as faixas vão em 2 colunas.
- **< 560px**: uma coluna na mesma ordem do DOM; listas em L, status em M.

### 8.3 Card a card

| Card | Corpo novo | Linha do achado (exemplo) |
| --- | --- | --- |
| Minhas tarefas | Como hoje | "1 atrasada · 1 para hoje" |
| Situação das tarefas | StatusCard L: herói "18%" + "5 de 28 concluídas"; barra de progresso com a marca "hoje (dia 5)"; faixas Atrasadas / Pendentes / Concluídas com % | "Competência de novembro · 2 atrasadas" ((i) explica a diferença para "Atrasadas" do topo) |
| Fluxo de tarefas por dia | Barras HTML como hoje (recorrentes = data, avulsas = data/45), até 40px de largura, rótulo de valor em cima, fim de semana com rótulo `text-subtle` | "5 em aberto em 7 dias · pico ter 10 (4)" |
| Agenda | Como hoje; vazio sem moldura | "2 prazos legais até 10/11 · próximo: DCTFWeb em 07/11" |
| Por responsável | Ranking como hoje | "Ana R. concentra 80% · 3 atrasadas" |
| Processos por departamento | Ranking com barra de progresso (concluído data → atrasado danger → pendente cinza) e "2/18" | "2 de 18 concluídas · mais pendências: Fiscal (16)" (só com 2+ departamentos) |
| Certificados, Laudos | StatusCard M: barra de distribuição + faixas; "Ver todos" no rodapé dos dois | "1 vencido · 1 vence em 30 dias" |
| Convenções coletivas | StatusCard M (5 faixas em linhas de 32px, para caber em 320px) | "1 data-base passou" |
| Honorários próximos de vencer | StatusCard M | "1 vigência encerrada" |
| Pendências fiscais | À esquerda StatusCard (herói "11%", barra de progresso com "hoje"); à direita a lista de obrigações com barras de progresso na nova cor | "16 pendentes · nenhuma atrasada" |
| Visão geral dos clientes | StatusCard L: herói "8" + "com pendências"; barra de distribuição; faixas com as dicas do Effy | "8 de 8 clientes com pendências" |
| Cadastro incompleto | Lista como hoje; só "Ver todos (6)" no rodapé (sai o "+ 3 clientes") | "6 clientes · média de 46% preenchido" |

Herói dos StatusCards (`progressHeadline` / `severityHeadline`): cards de progresso mostram o % concluído;
cards de distribuição, a contagem da faixa mais grave com contagem > 0 (danger, depois warning) ou,
sem alertas, o % em dia.

---

## 9. Responsivo (o que se vê)

| Largura | Financeiro | Início |
| --- | --- | --- |
| 1440 | Faixa de 4 células; quadro de 4 colunas (cards de 317, 650 e 1.316px) | Faixa de 6 células; 12 colunas |
| 1024 (900–924px úteis) | Faixa 2×2; quadro de **2 colunas** com cards de meia largura lado a lado | Faixa 3×2; pares de cards; Vencimentos 2×2 |
| 375 | Faixa em 4 linhas (valores inteiros); 1 coluna (lista; ordem do quadro) | Faixa em 6 linhas; 1 coluna |

Sem rolagem lateral em nenhuma largura; nenhuma lista com rolagem interna (corta com "+ N …").

---

## 10. Data e atualização

A linha sob o título de cada página termina com "· atualizado às 14:32" ("agora", "há N min" até 1
hora), do `dataUpdatedAt` da consulta principal (`useDashboard` / `useTaskHome`), no fuso do escritório.

---

## 11. Objetivos, não-objetivos e anti-objetivos

- **Objetivos**: cards proporcionais em 1440, 1024 e 375; um padrão de card e de faixa nos dois
  painéis; todo número de topo com comparação; todo card com a linha do achado; gráficos sem área
  morta.
- **Não-objetivos**: mudar a API ou o contrato; dados novos (histórico de patrimônio, metas
  cadastradas por indicador); aba "Dashboard inteligente"; outros gráficos ou outra biblioteca; mudar o
  destino dos cliques.
- **Anti-objetivos** (falha mesmo que funcione): degradê, vidro, ícone em quadrado colorido; número ou
  meta inventados; animação acima de 200ms; KPIs em carrossel; rolagem dentro de card; perder posições
  e tamanhos salvos pelo usuário.

---

## 12. Checklist da skill (passo 7) depois da implementação

- [x] Todo card tem a linha do achado; todo gráfico tem `aria-label` com ela.
- [x] Todo número de topo tem comparação (Patrimônio: composição, com o motivo no (i)).
- [x] Cores: data / cinza / danger / warning; verde só em variação e resultado positivos.
- [x] Período do painel claro (mês no cabeçalho) e janelas diferentes ditas na linha do achado.
- [x] Valores formatados (R$ inteiros nas faixas e listas; "R$ 64,7 mil" só em eixos e frases).
- [x] "Atualizado às…" visível.
- [x] 1440, 1024 e 375 conferidos por captura; `design-taste-frontend` lint sem FAIL novo (o único FAIL é o
      ✓ de `matrix-cell.test.tsx`, anterior a este trabalho).
- [x] `docs/design-system.md` (§3 componentes, §4 dashboard, nova §6 "Proporção dos painéis") e
      `docs/tarefas-ui.md` §6 atualizados.
