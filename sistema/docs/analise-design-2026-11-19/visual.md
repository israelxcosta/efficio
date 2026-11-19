# Efficio: auditoria visual (design geral, hierarquia, tipografia, cor, gráficos, cards, tabelas, vazios, responsivo)

Método: DEGRADADO, contexto único (sem sub-agente e sem o detector do impeccable). Rubrica de
`impeccable/reference/critique.md` + `critique-rubric.md`, checagens de `audit.md`, `layout.md`,
`typeset.md`, `colorize.md`, `polish.md`, `quieter.md`, `craft-floor.md`, regras de
`design-taste-frontend/references/app-screens.md` e da Vercel (`web-interface-guidelines.md`).
Evidência: os 18 prints de `antes/`, mais prints que tirei de um servidor local do build `dist-demo` de
19/11 (porta 8772), e leitura do código em `apps/web/src`. O brief do design system (estilo Graniq com
marca azul-marinho) tem prioridade sobre as regras genéricas quando os dois conflitam.

Três avisos sobre os prints "antes" (importante para comparar com o "depois"):

1. **Os `cel-*.png` mostram a tela de login.** A sessão do demo não passa para o contexto novo via
   `storageState`, então o `shots.mjs` nunca entrou no app no celular. Para ter os prints certos, faça o
   login dentro do próprio contexto mobile. Tirei esses prints de novo em
   `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/audit/me/cel-{financeiro,clientes,tarefas,home,pagar}.png` (e `*-full.png`).
2. **No `financeiro.png` os gráficos aparecem vazios** (barras do Fluxo de caixa, rosca de Honorários por
   regime e de Despesas por categoria, área da Projeção). É um efeito do print, não um defeito do app: a
   animação do Recharts só roda quando o gráfico entra na tela, e o print de página inteira não rola a
   página. Role a página até o fim e volte ao topo antes do `fullPage` (print certo:
   `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/audit/me/fin-scrolled.png`).
3. A barra flutuante inferior aparece no meio da página nos prints `fullPage` (cobre o título "Agenda" e
   linhas de tabela). Também é efeito do print. Para comparar, use o mesmo método no antes e no depois.

---

## 1. Nota geral

| # | Heurística (Nielsen) | Nota | Ponto principal |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | "atualizado agora", skeletons, contagens por faixa, 👍/👎 de pago. Falta só um carimbo de hora real nos painéis longos |
| 2 | Linguagem do usuário | 3 | Vocabulário do escritório no ponto (DCTFWeb, competência, prazo legal, fora da meta). Escapam "eficiência −16%", "p.p.", "Sem categoria" como categoria |
| 3 | Controle e liberdade | 3 | Filtros com "Limpar", painéis laterais, links diretos (deep links). Nada encontrado que prenda o usuário |
| 4 | Consistência | 2 | Três componentes de KPI diferentes. Filtros recolhem no celular em Tarefas, mas não em Pagar/Receber. Botão de estado vazio cheio em Metas e outline em Cartões. Três formas de barra nos gráficos |
| 5 | Prevenção de erro | 3 | "Excluir" desabilitado com o motivo, confirmação ao restaurar o demo |
| 6 | Reconhecer em vez de lembrar | 2 | Barra de 11 ícones sem rótulo em Tarefas, 6 ícones por linha em Clientes, 12 ícones na sidebar do Financeiro |
| 7 | Flexibilidade e eficiência | 3 | ⌘K, barra rápida, "Personalizar" painel, filtros na URL |
| 8 | Estética e minimalismo | 2 | Vermelho e verde viram textura nas listas, cards com vão em branco, até 3 chips por linha em Receber |
| 9 | Recuperação de erro | 3 | `ErrorState` diz o que falhou e oferece "Tentar novamente" |
| 10 | Ajuda | 3 | Ícone de info em quase todo card e KPI. No KpiCard o ícone não recebe foco pelo teclado (ver P2-12) |
| **Total** | | **27/40** | **Aceitável** (no limite de cima da faixa 20–27) |

**Carga cognitiva:** 3 de 8 itens falham (hierarquia visual nos painéis longos, escolhas demais em
Tarefas e Relatórios de tarefas com 7 filtros e 11 ícones, e falta de revelação progressiva dos filtros
no celular). Carga moderada, a tratar logo.

**Especificidade do design:** o conteúdo tem cara própria: os dados, as faixas de risco e a linguagem
fiscal só existem neste produto. Já a superfície se confunde com qualquer kit: fundo cinza-azulado,
cards brancos de 20px, Plus Jakarta, e o azul-marinho quase só nos botões primários. As marcas que o
brief pede (card de insights com gradiente e cartão "vidro", barras de receita listradas, rótulos de
seção em caixa alta na cor da marca) foram achatadas no código (`--app-hero-*` virou superfície
plana, `eyebrow` virou "sentence case"). A identidade está nos dados, não na forma.

**Notas de auditoria técnica (audit.md, 0–4):** acessibilidade 3, tematização 3, responsivo 2,
integridade da implementação 3 (desempenho não foi medido).

### 3 forças

1. **Tokens e semântica de cor bem pensados.** Um só vermelho (`#cc3333`), escada de risco amarelo →
   laranja → vermelho com luminosidade descendo (segue legível para daltônicos e em cinza), cinzas de
   texto que passam 4,5:1, modo escuro neutro derivado dos mesmos tokens (`styles/index.css`).
2. **Cada número vem com uma frase.** Os subtítulos de card dizem o achado, não a interface ("Ana R.
   concentra 67% · 7 atrasadas", "Transportadora Rota Sul Ltda concentra 83% do vencido"). É o melhor
   recurso de hierarquia do produto, e é bem específico do domínio.
3. **Faixa de KPIs divididos (MetricStrip) e listas de faixas (BandList)** seguem o padrão certo para
   painel: um container com divisórias, rótulo sobre o valor, números tabulares, contagem colorida só
   quando é alerta.

### 3 fraquezas

1. **Cor de status usada como textura:** vermelho em todo valor de saída, em "R$ 0,00 vencido" e em
   cerca de 20 frases "atrasadas em aberto". Isso apaga o alerta de verdade.
2. **Celular sem triagem:** filtros, segmentados e 6 ícones por item empurram o conteúdo para fora da
   primeira tela, e o nome do lançamento é cortado com cerca de 13 caracteres.
3. **Hierarquia plana e grade rígida nos painéis:** o título de seção tem o mesmo estilo do título de
   card, e os cards de altura fixa deixam vãos de 150 a 250px (Início e Financeiro, com 2.800 e 3.800px
   de altura).

---

## 2. Achados priorizados

### P1-1. Vermelho e âmbar como textura, e cor de status no zero
- **Tela:** Contas a pagar, Extrato, Relatórios (Maiores despesas), Relatórios de tarefas, Cartões, Metas.
- **O que se vê:** em Contas a pagar, os 27 valores estão todos em vermelho, mais o KPI "Vencido R$ 0,00"
  em vermelho e "A pagar" em mostarda. Em Cartões, "Limite utilizado R$ 0,00" aparece em vermelho. Em
  Relatórios de tarefas, os 4 rankings repetem "N atrasadas em aberto" em vermelho em quase toda linha
  (cerca de 20 vezes) e "com atraso" em laranja logo ao lado.
- **Por que importa:** princípio 1 do design system ("cor é informação"). Numa lista que só tem saídas,
  o vermelho não diz nada e disputa atenção com o único vermelho que importa ("Venceu há 9 dias").
  app-screens §11 diz "red is a signal, not a texture" e §5 diz "zero é cinza". O próprio comentário do
  `MiniStat` diz "colour only flags a problem", mas o código aplica o tom sem olhar o valor.
- **Melhoria:** (a) na lista de um tipo só (Pagar ou Receber), o valor fica na cor do texto com o sinal
  "−" ou "+". Verde e vermelho ficam para as listas mistas (Extrato, Maiores despesas no Painel) e para
  o valor vencido. (b) `MiniStat` só aplica `danger`/`warning` quando o valor é maior que 0. "A pagar"
  e "A receber" ficam na cor do texto, porque não são problema. (c) Nos rankings de tarefas, só o número
  fica vermelho ("· **3** atrasadas") e o resto da frase fica em `text-muted`.
- **Onde mexer:** `components/ui/misc.tsx:115-120` (MiniStat), `features/transactions/components/transaction-list-page.tsx:128-135`,
  `features/transactions/components/transaction-row.tsx:380` (prop nova `neutralAmount` no `Money`),
  `features/cards/pages/cards.tsx:59`, `features/tasks/pages/task-reports.tsx:694-695`.
  Documentar em `docs/design-system.md` §"Cores de status" que a cor de entrada/saída se aplica a listas
  mistas. **Mockup: receita R3.**

### P1-2. Celular: o conteúdo começa abaixo da primeira tela e a identidade da linha é cortada
- **Tela:** Contas a pagar e a receber, Clientes, Tarefas (390px).
- **O que se vê:** em Pagar, depois de 4 KPIs vêm Dia/Semana/Mês/Ano, o navegador de mês, o
  segmentado de status, a busca e 4 selects empilhados. O primeiro lançamento só começa por volta de
  865px (CSS), fora da primeira tela e atrás da barra inferior. Na linha, "Aluguel do escri…", "Pró-labore dos …", "Pix enviado …":
  o botão de pago, o valor e o kebab ficam com uns 60% da largura. Em Clientes, cada card tem uns 390px
  por causa de uma fileira de 6 ícones (ver, editar, honorários, contrato, inativar, excluir), e cabem
  só 2 clientes por tela. Em Tarefas, o seletor de visão ocupa 2 fileiras com 7 blocos (cerca de 220px).
- **Por que importa:** app-screens §12 diz que "a primeira linha da lista começa nos 60% de cima da
  tela" e que "filtros recolhem numa fileira de chips ou num painel Filtros". O próprio produto já faz
  isso em Tarefas (`task-filters.tsx:236-256`, busca + "Filtros (N)"), então Pagar e Receber são uma
  inconsistência. A identidade (o nome do lançamento) é a última coisa que pode ser cortada (§7.4).
- **Melhoria:** abaixo de 640px, as listas financeiras usam o mesmo padrão de Tarefas: uma fileira com
  mês e "Hoje", uma fileira de status rolável, e busca com "Filtros (N)" abrindo um painel. O tipo de
  período (Dia/Semana/Mês/Ano) vai para dentro do navegador (toque em "Novembro 2026"). Na linha do
  celular, o kebab sai (o toque abre a edição, que já tem as ações) e o gap cai para 10px. Em Clientes,
  o card mostra "Ver" e um menu "⋯" no lugar dos 6 ícones. Em Tarefas, a visão vira um segmentado
  rolável de uma fileira.
- **Onde mexer:** `features/transactions/components/transaction-list-page.tsx:140-222`,
  `features/transactions/components/transaction-row.tsx:383` (RowMenu escondido com `max-sm`),
  `features/clients/pages/clients.tsx:79,190` (RowAction), `features/tasks/components/tasks-hub.tsx:66-75`.
  **Mockup: receita R6.**

### P2-3. Hierarquia plana nos painéis: título de seção igual ao título de card
- **Tela:** Início (e Minha área). O Painel financeiro nem tem seções: são 14 cards em sequência.
- **O que se vê:** "Tarefas", "Vencimentos" e "Obrigações e clientes" usam 16px/600 em `text-fg`,
  exatamente o estilo de "Minhas tarefas" logo abaixo. Na página de 2.800px não dá para ver onde começa
  cada bloco. O espaço acima do título da seção (24px) é quase o mesmo de abaixo (12px).
- **Por que importa:** hierarquia por tipografia e espaço (princípio 1). layout.md pede o "teste do
  apertar os olhos": com o detalhe borrado, os grupos grandes devem aparecer. craft-floor pede mais
  espaço acima do título do que abaixo. O brief define rótulos de seção "em caixa alta, pequenos,
  espaçados, na cor de marca ('PLANEJAMENTO')", e o `docs/design-system.md` ainda documenta o
  Overline 11px/600/0,12em.
- **Melhoria:** `Section` vira o Overline do brief (11px, 600, caixa alta, 0,12em, `--app-brand-text`),
  com 40px acima e 12px abaixo. É a única cor de marca no fluxo de leitura, e o card fica como o nível
  de título. No Painel financeiro, agrupe os widgets em 3 ou 4 seções (Resultado, Recebíveis, Caixa,
  Carteira) com o mesmo rótulo. Se o dono preferir manter sem caixa alta (decisão registrada no
  `@utility eyebrow`), use 13px/600 na cor da marca com a mesma régua de espaço. O ganho vem do
  contraste de cor e de espaço, não da caixa alta.
- **Onde mexer:** `features/tasks/pages/home.tsx:199-206`, `@utility eyebrow` em `styles/index.css`
  (e alinhar com §Tipografia do `docs/design-system.md`), `components/ui/card.tsx:33` (`SectionLabel`
  já existe, basta usar). **Mockup: receita R1.**

### P2-4. Token de texto (mostarda #95600f) usado como marca em barras e pontos
- **Tela:** Início (Certificados, Laudos, Convenções, Honorários, Visão geral dos clientes), StatusCards.
- **O que se vê:** o segmento "A vencer (30 dias)" e "Pendências" sai marrom-mostarda, mais escuro que
  o laranja. Parece um quarto matiz e quebra a escada amarelo → laranja → vermelho.
- **Por que importa:** o `docs/design-system.md` §"Cores de status" diz que o amarelo claro é a
  **marca** (`--app-chart-yellow` #f2b931) e que `text-warning` é só para **texto**. A escada foi feita
  para a luminosidade descer (L* 78 → 64 → 46), e a mostarda (L* ~45) fica igual ao vermelho em
  luminosidade. Em cinza e para daltônicos, "a vencer" e "vencido" passam a ter o mesmo peso.
- **Melhoria:** `BAND_DOT.warning = 'bg-chart-yellow'` e `ProgressBar` `warning: 'bg-chart-yellow'`. A
  contagem continua em `text-warning`, que é texto e precisa do contraste.
- **Onde mexer:** `features/tasks/dashboard-logic.ts:44`, `components/ui/progress-bar.tsx:18`. **Mockup: receita R2.**

### P2-5. Cards de altura fixa deixam vãos, e listas curtas esticadas viram vazio
- **Tela:** Início, Painel financeiro, Dashboard inteligente, Configurações.
- **O que se vê:** "Processos por departamento" tem 1 linha e uns 170px vazios antes da legenda.
  "Clientes devedores" tem 2 linhas e uns 120px vazios. "Situação das tarefas" tem uns 150px vazios.
  Os 4 cards de Vencimentos têm 80 a 120px vazios acima de "Ver todos". "Fixas x variáveis" tem cerca
  de 60% de vazio, e "Aparência" (Configurações) é um card de 290px com um segmentado só. No sentido
  oposto, "Cadastro incompleto" e "Categorias que mais pesaram" ocupam 1.300px com uns 900px entre o
  nome e o número.
- **Por que importa:** app-screens §4.2: "um card esticado só estica quando tem conteúdo para
  preencher" (`panel-void` > 40px), e "blocos estreitos não ocupam a tela toda" (uma lista de até 6
  linhas fica em uns 760px e faz par com outro bloco). Também é densidade confortável (princípio 3).
- **Melhoria:** no Início, `DashSlot` usa `grow` (altura mínima, não fixa) nos cards sem lista
  ajustável (Por responsável, Processos, Pendências fiscais, Visão geral, Cadastro incompleto). Em cada
  fileira, a linha fica com a altura do conteúdo maior, e os cards seguem alinhados embaixo porque o
  grid estica. No Painel financeiro, o widget aproveita o espaço que sobra: "Clientes devedores" mostra
  os próximos títulos vencidos, "Processos" ganha linhas por regime. Listas de até 6 linhas ficam com
  `max-width` de uns 760px ou fazem par com outro bloco.
- **Onde mexer:** `features/tasks/components/dash-slot.tsx:63-65`, `features/dashboard/layout/specs.ts`
  (tamanhos padrão), `features/dashboard/components/insights-tab.tsx` (Categorias),
  `features/settings` (Aparência e Painel financeiro num card só). Parte (b) da **receita R1**.

### P2-6. Três componentes de KPI para o mesmo trabalho
- **Tela:** Início e Painel (MetricStrip), Pagar/Receber/Metas/Cartões/Relatórios/Extrato (MiniStat),
  Dashboard inteligente e Inadimplência (KpiCard).
- **O que se vê:** MetricStrip tem 24px, alinhado à esquerda, num container dividido por linhas de 1px.
  MiniStat tem 18px, cards soltos com gap de 12px e rótulo de 12px. KpiCard tem 26px, **alinhado à
  direita**, com faixa cinza no rodapé. Na mesma navegação, o mesmo "Resultado do mês" aparece com três
  tamanhos e dois alinhamentos.
- **Por que importa:** consistência (heurística 4, princípio 2 do brief: "todo componente novo deve
  reutilizar tokens"). app-screens §5: o padrão é um container dividido, rótulo sobre o valor, à
  esquerda.
- **Melhoria:** `MiniStat` vira uma célula da `MetricStrip` (ou o grid recebe o visual dividido), com
  valor em `text-kpi` (24px). O `KpiCard` alinha o valor à esquerda e o rodapé cinza sai em favor da
  linha de comparação, como na MetricStrip.
- **Onde mexer:** `components/ui/misc.tsx:103-125`, `components/ui/kpi-card.tsx:85-86`,
  `components/ui/metric-strip.tsx`. **Mockup: receita R4.**

### P2-7. Tabela de Clientes: 6 ações por linha, valor à esquerda, status que repete o filtro
- **Tela:** Clientes (desktop).
- **O que se vê:** cada linha termina com 6 ícones de 32px (o "Excluir" desabilitado fica cinza). São
  48 ícones na tela, e a coluna "Ações" é a mais pesada da tabela. "Honorário vigente" (dinheiro) está
  alinhado à esquerda. "Situação" mostra "Ativo" em verde nas 8 linhas, com a aba "Ativos" selecionada.
- **Por que importa:** app-screens §7.4 diz "números à direita, tabulares" e §7.8 diz "ações de linha:
  nenhuma ou um kebab". Uma marca de status por linha, e só quando informa algo. Alvo de toque de 32px
  fica abaixo do mínimo do brief (40px).
- **Melhoria:** em repouso, fica só "Abrir ficha" (olho). As outras ações aparecem quando a linha tem
  hover ou foco (`:focus-within`) e vão para um menu "⋯" no toque. Honorário à direita. A coluna
  Situação some na aba "Ativos" e, em "Todos", mostra só o selo "Inativo". Botões `size-10` no toque.
- **Onde mexer:** `features/clients/pages/clients.tsx:79` (RowAction) e `:190` em diante (colunas).
  **Mockup: receita R5.**

### P2-8. Gráficos: eixo duplo, barras-pílula para contagens de 1, três formas de barra
- **Tela:** Painel financeiro (Fluxo de caixa), Início e Minha área (Fluxo de tarefas por dia, Seu
  ritmo), Relatórios de tarefas (Pontualidade).
- **O que se vê:** o Fluxo de caixa sobrepõe receitas e despesas (eixo R$) e uma linha preta "Clientes
  ativos" com eixo próprio à direita (0–12 cl.). A linha corta as barras e o rótulo "8 clientes" fica
  em cima da barra de novembro. "Fluxo de tarefas por dia" desenha 5 pílulas de 40×150px com o rótulo
  "1" em cada uma. Os raios mudam de um gráfico para outro: pílula total (tarefas por dia), 4px no topo
  (fluxo de caixa) e quadrado (pontualidade empilhada).
- **Por que importa:** app-screens §6.2 diz "uma pergunta, uma série". Mais métricas entram por troca
  (segmentado), nunca por eixo duplo, que sugere uma relação que não existe. Para poucos números, §6.1
  diz para não desenhar gráfico. Consistência de forma: o brief pede barras arredondadas, então isso
  deve ser um token só.
- **Melhoria:** a linha de clientes começa desligada (o toggle continua) ou vai para um mini-card
  próprio. Em "Fluxo de tarefas por dia", barras de no máximo 24px de largura e raio 6px, com um eixo
  0–N ou uma lista de dias com contagem quando o máximo for 3 ou menos. Criar `--chart-bar-radius: 6px`
  (topo arredondado, base reta) para todos os gráficos de barra.
- **Onde mexer:** `features/dashboard/components/cashflow-card.tsx:204-205,258-267`
  (`prefs.fluxoClientes` começa `false`), `features/tasks/components/dashboard-cards.tsx:130` em diante,
  `components/charts/stack-bar.tsx`, `features/tasks/pages/task-reports.tsx` (Pontualidade).

### P2-9. Rodapés de KPI cortados escondem a informação principal
- **Tela:** Início, Painel financeiro (no celular), Tarefas.
- **O que se vê:** "A mais antiga venceu há 35 dias: …", "5 em andamento · 3 aguarda…",
  "67% no prazo · 3 c…", "margem −15,7% · −7,7 p.p. vs m…", "Em contas R$ 65.861,48 · inv…".
- **Por que importa:** Vercel "Content handling" (texto longo precisa de tratamento). O que o
  reticências corta é justamente o nome da tarefa mais antiga, a ação seguinte.
- **Melhoria:** rodapé com `line-clamp-2` em vez de `truncate`, ou uma frase mais curta ("Mais antiga:
  35 dias"), com o nome num link de uma linha só.
- **Onde mexer:** `components/ui/metric-strip.tsx:111` e os textos em `features/tasks/pages/home.tsx:285-375`.

### P2-10. Primeiro uso: quatro zeros acima do estado vazio, e CTA diferente em cada tela
- **Tela:** Metas, Cartões (e qualquer lista vazia).
- **O que se vê:** 4 cards "R$ 0,00 / 0%" (um deles em vermelho) em cima de um estado vazio tracejado.
  Metas usa botão primário cheio ("Criar primeira meta") e Cartões usa outline ("Adicionar cartão").
  As duas páginas também têm o botão primário "Nova meta"/"Novo cartão" no cabeçalho, então são duas
  ações iguais na tela.
- **Por que importa:** app-screens §11 ("primeiro uso: mantenha a moldura e o título, e coloque a
  primeira ação onde o dado vai aparecer"). O brief define o estado vazio com "botão outline". É
  consistência (heurística 4).
- **Melhoria:** sem nenhum item, a faixa de KPIs some (ou fica em cinza, sem tom). O CTA do estado vazio
  é sempre `variant="outline"` (o primário fica no cabeçalho).
- **Onde mexer:** `features/goals/pages/goals.tsx:53-57,72`, `features/cards/pages/cards.tsx:57-61,76`,
  `components/ui/empty-state.tsx` (documentar a regra do CTA).

### P2-11. Alvos pequenos e ícones de info sem teclado (acessibilidade visual)
- **Tela:** geral.
- **O que se vê / código:** segmentado `sm` com 28px (`components/ui/segmented-control.tsx:91`, os
  "Abertas/Hoje/Atrasadas" dos cards). Linhas de faixa com 28 e 32px (`features/tasks/components/band-list.tsx:81`).
  Ações de linha com 32px (`features/clients/pages/clients.tsx:79`). No `KpiCard`, o ícone de info é um
  `<span aria-label>` sem `tabIndex` nem `role`, então o tooltip não abre pelo teclado
  (`components/ui/kpi-card.tsx:79`). O `MetricStrip` faz certo (`tabIndex={0}`, `role="img"`). O
  `prefers-reduced-motion` global zera toda transição para 1ms (`styles/index.css:399`), inclusive o
  feedback de pago.
- **Por que importa:** brief (área de toque de 40px ou mais), WCAG 2.5.8, Vercel ("interactive elements
  need keyboard"), audit.md (desligar o movimento de forma global destrói feedback útil).
- **Melhoria:** com `pointer: coarse`, segmentado sm em 36px e linhas de faixa em 40px. Info do
  `KpiCard` como `<button type="button" aria-label>`. Em movimento reduzido, troque deslocamento por
  opacidade em vez de zerar tudo.
- **Onde mexer:** os arquivos e linhas acima.

### P3-12. Barra de visões de Tarefas só com ícones no desktop
- **Tela:** Tarefas, Auditoria mensal.
- **O que se vê:** 7 ícones de visão, mais "+" e 3 ícones de criar, sem nome visível. A visão ativa
  também não diz o nome.
- **Por que importa:** reconhecer em vez de lembrar (heurística 6). O código registra que foi escolha do
  dono (`features/tasks/components/tasks-hub.tsx:64`), por isso fica em P3.
- **Melhoria (respeitando a escolha):** mostrar o nome só no item ativo ("☰ Lista") e manter os outros só
  com ícone. Isso custa uns 50px e orienta sem poluir.
- **Onde mexer:** `features/tasks/components/tasks-hub.tsx:66-80` (`Caption` visível quando `active`).

### P3-13. Filtros de Relatórios de tarefas: 7 selects cortados numa fileira
- **Tela:** Relatórios de tarefas.
- **O que se vê:** "Todos os departa…", "Todos os respons…", "Todas as categori…", "Todas as prioridad…".
  São 7 controles iguais, e nenhum diz o que filtra quando está no valor padrão.
- **Por que importa:** carga cognitiva (no máximo 4 opções visíveis por decisão) e o texto é cortado.
- **Melhoria:** deixar visíveis os 3 filtros mais usados (Departamento, Responsável, Cliente), com
  "Mais filtros (N)", que já existe em Tarefas. Rótulo curto no estado padrão ("Departamento: todos").
- **Onde mexer:** `features/tasks/pages/task-reports.tsx` (barra de filtros).

### P3-14. A marca quase não aparece: as assinaturas do brief foram achatadas
- **Tela:** geral (Painel financeiro, Dashboard inteligente, Relatórios).
- **O que se vê:** o card de Insights é branco com rótulos "Atenção/Dica" e não tem o gradiente da marca
  nem o cartão "vidro" com o chip "OPORTUNIDADE". As barras de receita são azuis sólidas, sem a textura
  listrada. O azul-marinho só aparece no botão primário e no item ativo da sidebar.
- **Por que importa:** o brief (seção "Referência visual") define essas três assinaturas. Sem elas, a
  tela cai no "visual do kit" (app-screens §14). Fica em P3 porque é decisão de identidade, não defeito.
- **Melhoria:** recuperar **uma** assinatura forte: o card de Insights do Dashboard inteligente em
  `--app-hero-*` (marinho 800 → 900, cartão interno `bg-white/8` com borda `white/12`, chip
  "OPORTUNIDADE" no Overline). Assim a marca vira a atmosfera de um card só, não de todos.
- **Onde mexer:** `features/dashboard/components/insight-card.tsx`, tokens `--app-hero-from/via/to` em
  `styles/index.css` (hoje os três são iguais a `brand-800`).

### P3-15. `docs/design-system.md` desatualizado em relação aos tokens
- **O que se vê:** o doc diz `bg #F6F6F4` ("off-white quente"), `border #E7E7E3` e a escala compacta
  10 / 10,5 / 11,5 / 12,5 / 14 / 22px. O `index.css` tem `#f2f4f7` (cinza-azulado), `#e4e7ec` e
  11 / 12 / 12,5 / 14 / 16 / 24px. O Overline em caixa alta está documentado, mas o `eyebrow` está em
  "sentence case". Pequenos detalhes de texto: "Buscar..." em vez de "Buscar…"
  (`features/categories/category-picker.tsx:166`).
- **Por que importa:** o doc é a fonte de verdade para o `frontend-specialist`. Com o doc divergente, o
  código diverge também.
- **Melhoria:** atualizar §1 e §Tipografia com os valores reais e registrar a decisão sobre o Overline
  (ver P2-3).

---

## 3. Receitas de mockup (6), para simular o "depois" via Playwright

Testei as seis receitas no build `dist-demo` de 19/11 (servidor local na 8772). Os prints de teste
estão em
`/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/audit/me/rec/r1.png … r6.png`,
e o script que aplica as receitas é
`/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/audit/me/recipes.mjs`
(basta trocar `B` para a porta 8771). Os seletores usam classes e atributos que existem nos `.tsx`
(conferidos no DOM).

**Preparação comum:** `goto('/#/login')`, clicar no botão "Entrar", esperar 4s, `goto(rota)`, esperar 3s,
`page.addStyleTag({content: CSS})` e, se houver JS, `page.evaluate(JS)`. Esperar mais 0,8s antes do print.
Desktop em 1440×900 com `fullPage`. Os dados do demo mudam com a data (contagens podem variar).

### R1: Início com seções legíveis e sem vão (P2-3 e P2-5)
- **Rota:** `#/` (1440, página inteira).
- **CSS:**
```css
main section[aria-label]:has(> h2.text-title-sm){gap:12px;margin-top:16px}
main section[aria-label] > h2.text-title-sm{font-size:11px;line-height:16px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--app-brand-text)}
main .grid > div.min-w-0[style*="height"]:has(> section[aria-label="Por responsável"], > section[aria-label="Processos por departamento"]){height:auto!important}
```
- **O print deve mostrar:** "TAREFAS", "VENCIMENTOS" e "OBRIGAÇÕES E CLIENTES" em azul-marinho
  (`#1e3a80`), pequenos e espaçados, com 40px acima de cada bloco. Os títulos de card ficam claramente
  um nível abaixo. A fileira "Por responsável / Processos por departamento" cai de uns 320 para uns
  236px, sem o buraco em branco, e os dois cards seguem alinhados embaixo.
- **Não aplique `height:auto` em todos os slots:** "Minhas tarefas" calcula quantas linhas cabem pela
  altura e encolheria para 2 tarefas. A regra vale só para cards sem lista ajustável.

### R2: Escada de risco com o amarelo certo (P2-4)
- **Rota:** `#/` (1440). Antes do print:
  `document.querySelector('section[aria-label="Vencimentos"]').scrollIntoView({block:'start'})` e print
  da viewport (sem `fullPage`).
- **CSS:**
```css
.bg-warning{background-color:var(--app-chart-yellow)!important}
```
- **O print deve mostrar:** nos 4 cards de Vencimentos e em "Visão geral dos clientes", o segmento
  "A vencer (30 dias)" / "Pendências" em âmbar dourado `#f2b931`, mais claro que o laranja e o vermelho.
  A escada vermelho → amarelo → verde fica legível, e as contagens ("1", "3", "5") continuam no texto
  escuro de atenção.

### R3: Contas a pagar sem vermelho de textura (P1-1)
- **Rota:** `#/contas-a-pagar` (1440, página inteira).
- **CSS:**
```css
main span.tabular.whitespace-nowrap.text-danger{color:var(--app-fg)!important}
main .grid > div.rounded-lg > p.tabular.text-warning{color:var(--app-fg)!important}
```
- **JS (zero fica cinza):**
```js
document.querySelectorAll('main .grid > div.rounded-lg > p.tabular').forEach(p => {
  if (/^-?R\$\s?0,00$/.test(p.textContent.trim())) p.style.color = 'var(--app-subtle)';
});
```
- **O print deve mostrar:** os 27 valores em tinta escura com o sinal "−R$" (a coluna fica calma e
  escaneável), "A pagar R$ 2.629,90" em tinta e "Vencido R$ 0,00 · Nada em atraso" em cinza. O único
  alerta que sobra na tela é o "Vence em 1 dia" âmbar das linhas pendentes. Opcional: aplicar o CSS da R4
  junto para mostrar a faixa unificada também em Pagar.

### R4: Faixa de KPIs única em Contas a receber (P2-6)
- **Rota:** `#/contas-a-receber` (1440, página inteira).
- **CSS:**
```css
main .grid.grid-cols-2.gap-3:has(> div.rounded-lg > p.tabular){gap:1px!important;background:var(--app-border);border:1px solid var(--app-border);border-radius:20px;overflow:hidden}
main .grid.grid-cols-2.gap-3:has(> div.rounded-lg > p.tabular) > div.rounded-lg{border:0!important;border-radius:0!important;padding:16px 20px!important}
main .grid.grid-cols-2.gap-3:has(> div.rounded-lg > p.tabular) > div.rounded-lg > p:first-child{font-size:12.5px;line-height:18px}
main .grid.grid-cols-2.gap-3:has(> div.rounded-lg > p.tabular) > div.rounded-lg > p.tabular{font-size:24px!important;line-height:30px!important;margin-top:6px}
main .grid.grid-cols-2.gap-3:has(> div.rounded-lg > p.tabular) > div.rounded-lg > p.tabular.text-warning{color:var(--app-fg)!important}
main .grid.grid-cols-2.gap-3:has(> div.rounded-lg > p.tabular) > div.rounded-lg > p:last-child:not(.tabular){font-size:12.5px;margin-top:6px;color:var(--app-muted)}
```
- **O print deve mostrar:** os 4 números (Total, Recebido, A receber, Vencido) num container único de
  raio 20px com divisórias de 1px, igual à faixa do Início. Valores em 24px, "A receber" em tinta e só
  "Vencido R$ 180,00" em vermelho, porque é o único problema.

### R5: Tabela de Clientes quieta (P2-7)
- **Rota:** `#/clientes` (1440, página inteira). Antes do print: `page.hover('main table tbody tr:nth-child(3)')`.
- **CSS:**
```css
main table th:nth-child(5),main table td:nth-child(5){text-align:right}
main table th:nth-child(6),main table td:nth-child(6){display:none}
@media (hover:hover){
  main table tbody tr:not(:hover):not(:focus-within) td:last-child button:not([aria-label="Abrir ficha do cliente"]),
  main table tbody tr:not(:hover):not(:focus-within) td:last-child span[tabindex]{opacity:0}
}
main table td:last-child button{transition:opacity .15s ease-out}
```
- **O print deve mostrar:** "Honorário vigente" alinhado à direita (valores e "R$ x / empregado" na mesma
  borda, "Reajuste pendente" também à direita). A coluna "Situação" some na aba Ativos. Em repouso, cada
  linha mostra só o olho, e a linha 3 (Ju Prado Design, com hover) mostra as 6 ações. São 8 ícones na
  tela em vez de 48.
- **Na implementação real**, a coluna Situação volta na aba "Todos" mostrando só o selo "Inativo", e no
  toque as ações vão para um "⋯".

### R6: Contas a pagar no celular, com a lista na primeira tela (P1-2)
- **Rota:** `#/contas-a-pagar` com viewport 390×844, `deviceScaleFactor: 2`, `isMobile: true`,
  `hasTouch: true`, **login feito nesse mesmo contexto**. Print da viewport (e `fullPage` opcional).
- **CSS:**
```css
@media (max-width:639px){
  main [role="radiogroup"][aria-label="Tipo de período"]{display:none}
  main [role="radiogroup"][aria-label="Status"]{display:flex;width:100%;overflow-x:auto}
  main [role="radiogroup"][aria-label="Status"] > button{flex:1 0 auto}
  main div.relative:has(> button[role="combobox"][aria-label="Categoria"]),
  main div.relative:has(> button[role="combobox"][aria-label="Fornecedor"]),
  main div.relative:has(> button[role="combobox"][aria-label="Conta ou cartão"]),
  main div.relative:has(> button[role="combobox"][aria-label="Origem"]){display:none}
  main .grid:has(> div.relative > input[aria-label="Buscar"]){grid-template-columns:minmax(0,1fr) auto}
  main button[aria-label^="Ações de "]{display:none}
  main .group.flex.items-center.gap-3{gap:10px}
}
```
- **JS (botão "Filtros", no padrão de Tarefas):**
```js
(() => {
  const g = document.querySelector('main .grid:has(> div.relative > input[aria-label="Buscar"])');
  if (!g || g.querySelector('[data-mock-filtros]')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.mockFiltros = ''; b.textContent = 'Filtros';
  b.className = 'inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-semibold text-fg shadow-xs';
  g.appendChild(b);
})();
```
- **O print deve mostrar:** o card de filtros com 3 fileiras (mês + "Hoje", status Todos / A pagar /
  Pago / Vencidos, busca + "Filtros") e os primeiros lançamentos já visíveis acima da barra inferior.
  Antes, a lista só começava por volta de 865px, fora da primeira tela. As linhas mostram o nome inteiro ("Aluguel do escritório",
  "Salários da equipe") porque o kebab saiu. Para um "depois" mais completo, aplique junto o CSS de R3 e
  R4 (KPIs num container 2×2 e "R$ 0,00" em cinza).

---

### Personas (resumo)
- **Alex (usuário avançado):** o ⌘K e a barra rápida ajudam. Trava nos 11 ícones sem nome de Tarefas e
  nos 7 selects cortados de Relatórios de tarefas.
- **Sam (acessibilidade):** o tooltip de info do KpiCard não abre pelo teclado. O segmentado tem 28px e
  as ações têm 32px. O amarelo das marcas depende do rótulo ao lado (está correto, mas não pode ser
  trocado pela mostarda).
- **Ana, analista fiscal (do domínio):** abre o Início para saber "o que vence hoje e o que está
  atrasado". A resposta está no topo, mas o nome da tarefa mais antiga vem cortado ("venceu há 35
  dias: …") e o "Vencimentos" se perde no meio de uns 15 cards sem divisão visível.
