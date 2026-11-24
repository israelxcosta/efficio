# Effinance — Design System

> Mantido pelo agente `ui-saas-designer`. Referência: Graniq (graniq.com.br), com a cor de marca
> trocada de verde para **azul-marinho**. Os tokens abaixo existem como CSS variables em
> `apps/web/src/styles/index.css` e são expostos como utilitários do Tailwind v4 (`bg-surface`,
> `text-muted`, `border-border`, `bg-brand-800`...).

## 1. Tokens

### Cor de marca (azul-marinho)

| Token       | Hex       | Uso                                                      |
| ----------- | --------- | -------------------------------------------------------- |
| `brand-50`  | `#F1F5FD` | fundos muito suaves, hover de itens                      |
| `brand-100` | `#E3EAF8` | botão "soft" (ex.: Consultor), chips, item ativo sidebar |
| `brand-200` | `#C6D4F1` | bordas de destaque, barras de progresso (trilho)         |
| `brand-300` | `#9AB2E6` | gráfico de receita (barra listrada)                      |
| `brand-400` | `#6889D4` | ícones/realces no modo escuro                            |
| `brand-500` | `#3F64BE` | links, anel de foco                                      |
| `brand-600` | `#2A4C9F` | hover de botão primário                                  |
| `brand-700` | `#1E3A80` | texto de marca, rótulos de seção                         |
| `brand-800` | `#152B61` | **cor primária** (botão primário, aba ativa)             |
| `brand-900` | `#0F1F47` | gradiente do card de insights (fim)                      |
| `brand-950` | `#0A1530` | textos sobre fundo claro de marca                        |

### Neutros e semânticas (modo claro)

| Token            | Hex       | Uso                                         |
| ---------------- | --------- | ------------------------------------------- |
| `bg`             | `#F6F6F4` | fundo da aplicação (off-white quente)       |
| `bg-subtle`      | `#EFEFEC` | sidebar, trilho de segmentados              |
| `surface`        | `#FFFFFF` | cards, sheets, inputs                       |
| `surface-muted`  | `#F7F7F5` | hover de linha, linhas zebradas, inputs read |
| `border`         | `#E7E7E3` | bordas padrão                               |
| `border-strong`  | `#D6D6D1` | bordas de input em hover, divisores fortes  |
| `text`           | `#16181D` | texto principal                             |
| `text-muted`     | `#6B6F76` | texto secundário                            |
| `text-subtle`    | `#9A9EA5` | placeholders, legendas                      |
| `success`        | `#18794A` | concluída, pago, em dia, variação positiva, 👍 pago (legível como texto) |
| `success-soft`   | `#E6F4EC` | fundo de "Melhor 👍" e selos de "em dia"     |
| `danger`         | `#B3433E` | **texto** de erro, vencido, crítico, negativo, 👎 pendente (5,5:1 no branco; 5,0:1 no fundo `#f2f4f7`; 5,0:1 no `danger-soft`); fundo de botão/contador com texto branco (5,5:1). Não é cor de marca de gráfico |
| `danger-soft`    | `#FDF0EF` | fundo de "Pior 👎" e selos de vencido        |
| `warning`        | `#95600F` | texto de atenção / vence em breve           |
| `warning-soft`   | `#FDF3DC` | banner de aviso                             |

### Cores dos gráficos

Monocromático azul-marinho + **um vermelho pastel**. **Azul = dado** (receitas, série principal, categorias,
volumes); **vermelho pastel = urgência, vencido e despesa** — nada mais. Marcas (barras, áreas, pontos,
segmentos) não levam texto e vêm sempre com rótulo/valor ao lado; texto em vermelho usa `danger` (AA), nunca
os tons pastel. Tokens em `src/styles/index.css`, expostos no `@theme` (`bg-chart-blue-5`, `bg-chart-red-soft`,
`bg-chart-red`, `bg-chart-red-strong`, `bg-chart-success`, `bg-chart-expense`, `bg-chart-neutral`).

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `chart-blue-1` (R1) | `#203157` | `#DDE5F4` | série forte (`chart-income-strong`, `chart-1`), 1ª categoria |
| `chart-blue-2` (R2) | `#344976` | `#BDCBE5` | 2ª categoria |
| `chart-blue-3` (R3) | `#4C6291` | `#9BAED4` | `data` = `chart-income` = `chart-accent`: receitas, série principal |
| `chart-blue-4` (R4) | `#6B80AB` | `#7D92BD` | 4ª categoria |
| `chart-blue-5` (R5) | `#8D9FC2` | `#6277A1` | 5ª categoria, `chart-3`, até 30 dias de atraso, risco "Atenção" |
| `chart-blue-6` (R6) | `#B1BED8` | `#4C5D81` | `chart-success`: marca de no prazo / concluída (texto de sucesso segue verde) |
| `chart-blue-7` (R7) | `#D7DEEC` | `#343D50` | `data-soft` |
| `chart-grey-1…5` | `#66696E` `#84868B` `#A2A5AA` `#C1C4C9` `#DBDEE3` | `#B5B7BD` `#96989D` `#787A7F` `#5E6065` `#484A4F` | categorias da 6ª em diante; "Outras" = `chart-others` (grey-4) |
| `chart-neutral` | `#CACED4` | `#53555A` | série neutra (período anterior, faturado, cancelada, baixo risco) |
| `chart-neutral-strong` | `#868C99` | `#7C8089` | traço neutro |
| `chart-grid` | `#E7E9EE` | `#3B3B3B` | grade |
| `chart-red-soft` | `#F3B5B1` | `#6E3A38` | barras e áreas de despesa (`chart-expense`), atenção/vence em breve (`BandTone warning`, `ProgressBar warning`) |
| `chart-red` | `#E08883` | `#B5615C` | linha de despesa (`chart-expense-strong`), mês negativo (`chart-negative`), 31–60 dias de atraso, pago/concluído com atraso, risco alto, encerrados |
| `chart-red-strong` | `#C95D58` | `#E48A84` | maior urgência: mais de 60 dias, vencido/atrasado em aberto, crítico, score < 400 (`CHART_COLORS.danger`, `stripeFill('danger')`) |

`SERIES_PALETTE` (`components/charts/chart-utils.tsx`) é `var(--app-chart-series-1…10)` = R1…R5 e depois
grey-1…5: os tokens trocam sozinhos no escuro (não passam por `useTone`/`liftForDark`, que fica só para cores
escolhidas pelo usuário). `REGIME_COLORS` (carteira por regime) também usa a rampa.

Contraste: as marcas pastel não precisam de 3:1 porque nunca são a única informação (rótulo e valor ao lado,
hachura no vencido em aberto); o texto `danger` tem AA em todos os fundos onde aparece (claro: 5,5:1 branco,
5,0:1 `bg`, 5,0:1 `danger-soft`, 4,6:1 sobre `chart-red-soft/35`; escuro `#EF8F8A`: 6,1:1 `surface`, 7,1:1
`bg`, 5,6:1 `danger-soft`).

### Cores de status

Uma cor por situação, em todo o sistema (ícones, selos, barras, gráficos e relatórios). Nas **marcas** a
escala de urgência é azul → vermelho pastel → vermelho pastel forte; no **texto** a situação usa `text-success`,
`text-warning` ou `text-danger`. Hachura e ícones continuam onde já existem (ex.: vencido em aberto hachurado).

| Situação | Marca (gráfico) | Texto |
| --- | --- | --- |
| Concluída / pago / em dia / no prazo | `--app-chart-success` (R6) | `text-success` (verde) |
| Em andamento / série principal / receitas | `--app-data` (R3) | `text-fg` |
| Até 30 dias de atraso / risco "Atenção" | `--app-chart-blue-5` (R5) | `text-warning` |
| Vence em breve / atenção (faixas de status, limite > 70%) | `--app-chart-red-soft` | `text-warning` |
| Pago/concluído com atraso / 31–60 dias / risco alto / mês negativo | `--app-chart-red` | `text-danger` |
| Vencido em aberto / crítico / mais de 60 dias | `--app-chart-red-strong` | `text-danger` |
| Despesa (barras/áreas · linha) | `--app-chart-red-soft` · `--app-chart-red` | `text-fg` em lista de um tipo só |
| Pendente sem prazo / cancelada / neutro | `--app-chart-neutral` | `text-muted` |

Onde se aplica: "Situação das tarefas" e as faixas dos StatusCards do Início, relatório de tarefas (no prazo
R6, concluída com atraso `chart-red`, atrasada em aberto `chart-red-strong`; o atraso da auditoria em
`text-danger`), "Como cada mês foi pago" e o mapa de pagamentos do cliente (no prazo R6, pago com atraso
`chart-red`, vencido em aberto `chart-red-strong` hachurado), faixas de atraso da Inadimplência do painel e
carteira por risco (até 30 dias R5 → 31–60 `chart-red` → mais de 60 `chart-red-strong`). Os tokens
`--app-chart-yellow`, `--app-chart-orange` e `--app-orange-strong` saíram.

**Vermelho é sinal, não textura.** Três regras valem para valores e KPIs:

- **Cor de entrada/saída só em listas mistas.** Verde/vermelho no valor só onde ele separa entrada de saída:
  Extrato, "Maiores despesas" no Painel/Relatórios, fatura do cartão. Em lista de um tipo só (Contas a pagar,
  Contas a receber) o valor fica em `text-fg` com o sinal no texto (`-R$` / `+R$`): `TransactionRow neutralAmount`.
  O vermelho da linha fica para o que está vencido de verdade ("Venceu há 9 dias", status).
- **Zero é cinza.** `MiniStat` recebe o número cru em `amount`; com `amount === 0` o valor sai em `text-subtle`
  e o tom `danger`/`warning` é ignorado ("Vencido R$ 0,00" não é problema). No Extrato, o `BalanceTile` segue
  a mesma regra.
- **Só o que é problema ganha cor.** "A pagar", "A receber", "Limite utilizado" (abaixo de 70%), "Resgatado"
  ficam em tinta; `danger` para vencido > 0, resultado/saldo negativo, fatura vencida, uso de limite > 90%
  (`warning` > 70%, como as barras). Em frases de contagem, só o número leva a cor: "3 no prazo · **1** com
  atraso · **2** atrasadas em aberto", com o número em `text-danger` e o resto em `text-muted`.

Escada de urgência R5 → `chart-red` → `chart-red-strong`: a luminosidade desce a cada degrau no claro
(e sobe no escuro) e o vermelho se separa do azul pelo matiz, então continua legível em cinza e com
daltonismo vermelho-verde (não há verde nas marcas).

### Modo escuro

Neutro, sem azul: fundo cinza escuro, cards e seções em cinza mais claro, texto off-white e tons
claros. A rampa `brand-*` vira uma rampa de cinzas **invertida** (50 = escuro … 950 = claro), então
`text-brand-700` continua legível e `bg-brand-50` continua um tom sutil; cards em degradê usam os
tokens `hero-*` (`from-hero-from via-hero-via to-hero-to`, destaque `text-hero-accent`).

| Token | Hex | Token | Hex |
| --- | --- | --- | --- |
| `bg` | `#1E1E1E` | `fg` | `#F4F3EF` (off-white) |
| `bg-subtle` | `#252525` | `text-muted` | `#CAC9C3` |
| `surface` | `#2B2B2B` | `text-subtle` | `#9C9B95` |
| `surface-muted` | `#323232` | `primary` | `#F4F3EF` com texto `#1E1E1E` |
| `border` | `#3B3B3B` | `primary-soft` | `#3B3B3B` |
| `border-strong` | `#4C4C4B` | `danger` | `#EF8F8A` (6,1:1 no `surface`, 7,1:1 no `bg`, 5,6:1 no `danger-soft` `#432A2B`) |
| `success` | `#4FCB85` | gráficos | ver "Cores dos gráficos" (coluna Escuro) |

O fundo, a cor e a fonte de `html`/`body` ficam **fora** de `@layer` em `index.css`, para que estilos
de quem hospeda o app (ex.: o esqueleto do artifact do claude.ai) não os sobrescrevam.

Cores escolhidas pelo usuário muito escuras (ex.: o azul-marinho padrão de categorias e metas) são
clareadas no modo escuro por `useTone()` (`src/lib/theme.tsx`) para continuarem legíveis.

### Tipografia

- Família: **Plus Jakarta Sans** (variable, via `@fontsource-variable/plus-jakarta-sans`),
  fallback `ui-sans-serif, system-ui`.
- Números: `font-variant-numeric: tabular-nums` em valores monetários e tabelas.

| Estilo       | Tamanho/peso                     | Uso                                   |
| ------------ | -------------------------------- | ------------------------------------- |
| Display      | 28–32px / 700, tracking -0.02em  | valores-herói ("R$ 9.680,00")         |
| H1 (página)  | 22px / 600                       | título de página                      |
| H2 (card)    | 15–16px / 600                    | "Fluxo de Caixa", "Resumo do período" |
| Body         | 14px / 400–500                   | texto geral                           |
| Small        | 12–13px / 400–500                | legendas, rodapés de KPI              |
| Rótulo de seção | 13px / 600, `--app-brand-text`, sem caixa alta | "Tarefas", "Vencimentos" (Início)  |
| Rótulo de grupo | 12px / 600 (`eyebrow`), sem caixa alta | grupos dentro de card ou painel lateral |

**Hierarquia dos painéis** (decisão do dono: sem caixa alta espaçada, ver `@utility eyebrow`): o
rótulo de seção (`SectionLabel as="h2" level="section"`, `components/ui/card.tsx`) é a única cor de
marca no fluxo de leitura e fica acima dos cards, com **40px acima e 12px abaixo**; o título do card
(16px / 600, `text-fg`) continua sendo o nível de título. O ganho vem do contraste de cor e de espaço.

Escala compacta dos cards do dashboard (tokens `--text-*` em `index.css`, classes Tailwind):

| Classe           | Tamanho | Uso                                                        |
| ---------------- | ------- | ---------------------------------------------------------- |
| `text-micro`     | 10px    | eixos dos gráficos, metadados de linha, notas de rodapé    |
| `text-mini`      | 10.5px  | rótulos de categoria, contadores, selos                    |
| `text-caption`   | 11.5px  | subtítulos de card, tooltips, links "Ver todos →"          |
| `text-body-sm`   | 12.5px  | linhas de lista e valores secundários                      |
| `text-title-sm`  | 14px    | título do card                                             |
| `text-kpi`       | 22px    | um número-herói por card e a faixa de KPIs                 |

Nos gráficos os textos têm tamanho fixo (`CHART_TEXT`: eixo 10px, categoria 10.5px, valor 11.5px)
e não acompanham o tamanho do card; quem cresce é o desenho.

### Forma e profundidade

- Raio: `sm 8px` (chips), `md 12px` (inputs, botões), `lg 16px` (cards internos), `xl 20px`
  (cards de seção), `2xl 24px` (sheets/contêiner principal), `full` (pílulas, avatares).
- Sombra: `xs 0 1px 2px rgb(16 24 40 / .04)`; `sm 0 1px 3px rgb(16 24 40 / .06)`;
  `lg 0 12px 32px -8px rgb(16 24 40 / .18)` (sheets, popovers, barra flutuante).
- Espaçamento: escala de 4px; padding de card 20–24px; gap de grid 16px (mobile 12px).
- Movimento: ver "Motion" logo abaixo.

### Motion

Movimento serve a feedback, estado e continuidade, nunca à decoração (fonte:
`docs/analise-design-2026-11-19/animacoes.md` §3). Tokens em `styles/index.css`:

- **Durações** (`--dur-*`, use `duration-(--dur-state)` no Tailwind): hover 100ms (padrão de `transition-colors`),
  pressão 150ms, estado 200ms, entrada de modal/popover 200ms e saída 150ms, Sheet 300/220ms,
  gráficos 300ms (`--dur-chart`). A saída é sempre mais curta que a entrada.
- **Curvas**: entrar e sair com `--ease-out` (`cubic-bezier(.23,1,.32,1)`, também a utility `ease-out`), mover na
  tela com `--ease-in-out`, painéis com `--ease-drawer`, cor com `ease`. Nunca `ease-in`.
- **Propriedades**: só `opacity`, `transform`/`translate`/`scale`/`rotate`; nunca `width`/`height`/`top`/`left`
  (a `ProgressBar` desliza o preenchimento com `translate`). Keyframes de elementos centrados com
  `-translate-x/y-1/2` animam `scale`, nunca `transform` (no Tailwind v4 os dois se somam e o modal entra torto).
- **Modal/ConfirmDialog**: `animate-dialog-in`/`animate-dialog-out` (opacity + scale .96) e overlay com
  `animate-fade-in`/`animate-fade-out`, saindo juntos.
- **Gráficos**: toda série do Recharts recebe `{...chartMotion(resizing)}` (`components/charts/chart-motion.ts`):
  `isAnimationActive: 'auto'` (respeita reduced motion; nunca passe `true`), `false` durante o resize do card,
  300ms `ease-out`. Telas de impressão (relatório do cliente, evolução) ficam com `isAnimationActive={false}`.
  O `Gauge` gira o knob junto com o arco (mesma duração e curva).
- **Sheet**: painel com `animate-sheet-in`/`animate-sheet-out` (`--ease-drawer`, 300/220ms) e scrim com
  `animate-fade-in`/`animate-scrim-out` (220ms): fundo e painel saem juntos.
- **Frequência decide**: atalho de teclado, setas e digitação **não animam**. A paleta ⌘K abre e fecha seca
  (scrim incluído); itens de `DropdownMenu`, `Select` e da paleta destacam sem `transition-colors`.
- **Popover, menu e select**: classes de `lib/motion.ts` (`popoverMotion`, `menuMotion`, `selectMotion`):
  `animate-pop-in`/`animate-pop-out` (opacity + scale .96, 200/150ms) a partir de
  `--radix-*-content-transform-origin`, ou seja, crescem do gatilho. Tooltip e `HelpTip` ficam só com o fade do
  `delayed-open`. Popover novo usa uma dessas constantes.
- **Pressão**: `Button` (todas as variantes, menos `link`) faz `active:scale-[0.97]` com
  `transition-[…,scale] duration-(--dur-press) ease-out`; ícones de 36px da barra flutuante usam `.95` (com .97
  a diferença é de ~1px). Nada de `active:translate-y-px`.
- **Troca de ícone de estado** (`PaidToggle`, `TaskStatusButton`): o ícone recebe `key` do estado (remonta) e a
  classe `.icon-in` (`@starting-style`: opacity 0, scale .25, blur 4px → 200ms `--ease-out`) só depois de uma
  mudança real (`useHasChanged`, `lib/use-has-changed.ts`); nunca no primeiro render. Estado alternado usa
  transição, não keyframe (o antigo `animate-pop` 1.22× foi removido). Não troque ícones por `display`
  (`hidden`/`block`) num elemento com `.icon-in`: reaparecer reanima; use `opacity`.
- **Hover não move o próprio elemento**: muda cor, anel ou sombra, ou um filho se move (cartão da lista de
  Cartões: as luzes decorativas do `CardVisual` deslizam via `group/card-link`; avatar da lateral e swatches
  do `ColorPicker`: só o anel). Nunca `transition` genérico: liste as propriedades
  (`transition-[background-color,color,opacity]`).
- **Painel (Personalizar)**: o card pego levanta (`scale-[1.02]` + `shadow-lg`, 150ms) enquanto a posição segue
  o ponteiro sem transição; ao soltar, desliza até a célula e volta à escala 1 com `--ease-out` em
  `--dur-settle` (250ms). Quando a largura do board muda (janela, lateral) o grid recebe `data-instant` por
  dois quadros e os cards pulam para o lugar, sem deslizar atrás do redimensionamento.
- **Dado lido não se move por estilo**: nada de count-up; troca de período esmaece (`isPlaceholderData` →
  `opacity-60 transition-opacity`). O painel financeiro esmaece com `delay-150` só na ida (cache rápido não
  pisca) e marca `aria-busy`.
- **Reduced motion** (bloco global): deslocamento e escala viram crossfade (mesmo tempo, só opacity);
  transições de cor/opacity/sombra continuam; loops decorativos (`animate-shimmer`, `animate-pulse`,
  `ob-loading`) param em opacidade .7; o spinner continua girando, mais devagar (1,5s).

## 2. Layout (app shell)

- **Duas áreas, a mesma casca** (`docs/tarefas-ui.md` §2): Gestão de tarefas (página inicial de todos) e
  Financeiro (administradores). Trilho, barra flutuante, barra do celular e ⌘K mudam de itens conforme a
  área; sem cor por área. Para administradores, rótulo "Gestão"/"Financeiro" sob o logotipo e o
  `AreaSwitchButton` no rodapé do trilho, acima de Configurações (44×44, `bg-surface ring-1 ring-border
  shadow-xs`, nunca ativo), que leva à última página da outra área (sessionStorage). Colaborador numa URL
  financeira vê "Acesso restrito" (`FinanceGate`), não 404.

- **Sidebar** fixa de 76px (`bg-subtle`, borda direita): logo "Effinance" em texto no topo; ícones
  `lucide` 20px em botões 44×44 com raio 12; ativo = `surface` + sombra xs; tooltip com o nome à
  direita; rodapé com Configurações e avatar com iniciais (menu de conta e tema).
- **Sem topbar**: cada página abre direto com seu cabeçalho (overline + título + descrição).
- **Conteúdo**: max-width 1440px, padding 24px, seções em cards `xl`.
- **Barra flutuante** inferior centralizada (pílula `surface`, sombra lg): busca/⌘K, ações rápidas
  `+ Despesa` (texto `danger`), `+ Receita` (texto `success`), `Transferir`, `Fatura` e, à direita,
  o sino de notificações (contas vencidas, com contador; o menu abre para cima).
- **Mobile** (< 1024px): sidebar vira navegação inferior; "Buscar" e "Contas vencidas" ficam no
  menu "Mais"; sheets em tela cheia.

## 3. Componentes

| Componente         | Especificação                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Button             | variantes `primary` (brand-800), `soft` (brand-100/brand-800), `outline` (surface + border), `ghost`, `danger`; tamanhos sm 32 / md 40 / lg 44; raio md |
| SegmentedControl   | trilho `bg-subtle` raio md, item ativo `surface` + sombra xs; variante `solid` com ativo `brand-800` texto branco (abas principais) |
| Card               | `surface`, borda, raio xl, padding 20–24; header com título H2 + subtítulo small muted + ação à direita |
| KpiCard            | rótulo small + ícone info; valor `text-kpi` (24px) **à esquerda**, rótulo sobre o valor; a comparação é uma linha de texto (12,5 muted) no pé do card, com seta (TrendingUp/Down) colorida, "% vs mês anterior" e seta → quando é link (cor e texto da variação por `changeParts`, `features/dashboard/kpi-logic.ts`); sem faixa cinza de rodapé; fora dos dashboards (relatórios, aba inteligente) |
| MiniStat / MiniStatGroup | KPIs de topo das telas de lista (Pagar/Receber, Metas, Cartões, Relatórios, Extrato, Contas, Transferências), no mesmo padrão da `MetricStrip`: `MiniStatGroup` é um container de borda única e raio `xl` com células separadas por divisores de 1px (passe as colunas em `className`, ex. `lg:grid-cols-4`; no celular 2 colunas; a última célula ímpar leva `col-span-2`); célula = rótulo 12,5 muted (+ ajuda), valor tabular à esquerda (18px no celular, `text-kpi` 24px a partir de `sm`), dica opcional 12,5 muted; `amount === 0` deixa o valor cinza |
| MetricStrip        | faixa de números do topo dos dois dashboards (`components/ui/metric-strip.tsx`): um `Card` com células separadas por divisores de 1px; célula = rótulo 12,5 muted + (i), valor `text-kpi` à esquerda (32px na célula `hero`, que tem 1,3 fração), minigráfico opcional à direita e rodapé de uma linha (truncado, texto inteiro em `footerTitle`); ≥ 1000px de faixa uma fileira, 560–999px `medium` (2 ou 3) por fileira, abaixo cada célula vira linha com o valor inteiro à direita (20px, sem `truncate`); a célula inteira é link (camada por cima), e botões/links do rodapé ficam acima dela |
| StackBar           | barra empilhada proporcional (`components/charts/stack-bar.tsx`): 6px (`sm`) ou 10px (`md`), raio cheio, 2px entre segmentos, larguras exatas e % inteiros pelo maior resto (`stackSegments`); segmento hachurado (`hatch`) para o que está em aberto; marca opcional de 2px com rótulo `text-micro` ("dia 5", "mês anterior"); `aria-hidden` |
| Sparkline          | linha SVG de 1,5px sem eixos (`components/charts/sparkline.tsx`, 96×32), `--app-data` ou vermelho pastel (`--app-chart-expense-strong` = `chart-red`) para despesas, ponto no último valor, comprime na horizontal em célula estreita; `aria-hidden` |
| Input / Select     | altura 44, raio md, borda `border`, foco: borda `brand-500` + anel 3px `brand-500/15` |
| CategoryPicker     | campo único de categoria: lista com busca no topo, categorias como títulos de grupo e só subcategorias selecionáveis (rádio circular); categoria sem subcategorias é selecionável; rodapé "+ Nova categoria" |
| SplitEditor        | "Dividir" no campo Categoria: linhas categoria + valor (2–10), "Dividir igualmente", "+ Adicionar categoria" (já com o valor que falta) e faixa de conferência (Falta / Excede / Valores conferem) |
| Select (lista)     | nunca o menu nativo: lista própria (Radix) com raio xl, borda, sombra lg, padding 6px; itens com raio lg, destaque `bg-subtle` no hover/teclado, item escolhido em negrito com ✓; grupos com rótulo overline e divisor |
| MoneyInput         | prefixo "R$" muted, digitação da direita para a esquerda (centavos), tabular-nums |
| PercentInput       | campo de percentual com sufixo "%" muted, texto à direita, tabular-nums; id/aria chegam ao input (funciona dentro de `Field`); `inputMode="text"` quando aceita negativo (o teclado decimal do iPhone não tem sinal de menos) |
| Sheet (lateral)    | 440px, raio 2xl à esquerda, header (título H2 + subtítulo muted + X), corpo rolável, rodapé fixo com `Cancelar` (ghost) e `Salvar` (primary) |
| PaidToggle         | botão 👍/👎: pendente (padrão) = `ThumbsDown` em `danger-soft`/`danger`; pago = `ThumbsUp` em `success-soft`/`success`; animação de "pop" ao alternar |
| Badge              | pílula 11–12px: `brand`, `success`, `danger`, `warning`, `neutral` (soft) |
| EmptyState         | caixa com borda tracejada raio lg, ícone em quadrado `bg-subtle`, título 14/600, descrição muted, botão outline (estados vazios de página); `framed={false}` dentro de cards (o card já é a moldura): ícone 20px `text-subtle`, título 14/600, descrição 12,5 muted, centrado — é o `BodyEmpty` dos widgets |
| ProgressBar        | trilho `brand-100`, preenchimento `brand-800` (metas) ou `success`/`danger`/`warning` (limite; marcas `chart-success`/`chart-red-strong`/`chart-red-soft`); preenchimento desliza com `translate` em 300ms |
| InsightCard        | gradiente `brand-700 → brand-900`, texto branco, cartão interno vidro (`white/8`, borda `white/12`), chip overline |
| BankLogo           | círculo com cor oficial aproximada do banco e sigla (Nu, Itaú, BB, Cx...) — sem marcas registradas |
| CategoryIcon       | quadrado raio md com fundo `cor/12%` e ícone lucide na cor da categoria |
| TaskRow            | linha de tarefa no esqueleto do `TransactionRow` (`features/tasks/components/task-row.tsx`): `TaskStatusButton` no lugar do 👍/👎, ícone neutro da categoria, título com selos (Urgente, Alta, Aguardando cliente), subtítulo, colunas por largura do contêiner (Cliente `@3xl`, Responsável `@2xl`, Situação `@4xl`, Vencimento `@xl`) e menu "⋯" com "Mudar situação ›" |
| TaskStatusButton   | botão redondo de estado: glifo por forma (`TaskStatusGlyph`), só "Em andamento" (`primary-soft`) e "Concluída" (`success-soft`) com cor; hover mostra o ✓ de concluir; concluída reabre; "pop" ao mudar |
| MemberAvatar       | iniciais em círculo `primary-soft` (sm 24, md 32, lg 40); sem responsável = círculo tracejado com `UserRound`; `AvatarStack` sobrepõe até N e "+N" |
| SearchSelect       | lista do `Select` com campo de busca no topo (base de `ClientPicker` e `MemberPicker`); aceita grupos, dica à direita e gatilho próprio (célula de tabela) |
| WidgetCard         | card de widget dos dois dashboards (`features/dashboard/layout/widget-card.tsx`): título estável 16px + (i) com a descrição, abaixo a **linha do achado** (`subtitle`, 12,5px, uma linha, texto inteiro em `title`), ação encostada na borda direita (desce para uma 2ª linha abaixo de 384px), corpo `flex-1` e rodapé de uma linha; com alerta, ponto vermelho no título; alça de mover, olho "Ocultar card", cursor de mover e borda `border-strong` **só no modo Personalizar** (`WidgetChrome.editing`) |
| StatusSummary      | topo dos StatusCards do Início (`features/tasks/components/band-list.tsx`): número-herói `text-kpi` opcional (cor só em `danger`/`warning`) + rótulo 12,5, depois `StackBar md` com a marca "dia N"; `BandList` abaixo com o % de cada faixa (`total`) e a variante `dense` (32px; `tight` 28px nos cards M de 296px) |
| DashSlot           | célula da grade do Início (`features/tasks/components/dash-slot.tsx`): altura por `heightForRows` (S/M/L) e largura por faixa de contêiner (`span.wide` de 12, `span.medium` de 2, 1 no celular); `mediumRows`/`phoneRows` trocam a altura abaixo de 4 colunas; colunas por `DashColsContext` (a página mede a própria largura); `fit` (cards sem lista ajustável: Por responsável, Processos, Pendências fiscais, Visão geral dos clientes, Cadastro incompleto) troca a altura fixa por mínima (2 linhas), a linha da grade fica com a altura do maior e as listas usam `SlotList` (corte por quantidade, `cap`, em vez de pela altura); listas de até 6 linhas não ocupam a largura toda (Cadastro incompleto em 8 de 12 colunas) |
| FitList            | lista cortada às linhas que cabem no card (mede cada linha a cada redimensionamento) com a linha "+ N …" (`showMore={false}` quando o rodapé já tem "Ver todos"); aceita o total real do servidor |
| TransactionRow `line` | densidade dos dashboards: uma linha de 40px (estado, descrição + contato na mesma linha, vencimento relativo, valor, "⋯"), sem o selo "+ Empregados" (fica no menu) e sem a coluna de conta |
| ChartBox           | envolve um gráfico Recharts e ocupa a altura restante do card (mínimo 96px), para o gráfico crescer junto |
| DonutChart `fill`  | rosca que se dimensiona pelo espaço (legenda ao lado a partir de 448px, embaixo antes), número central ajustado ao furo, cauda agrupada em "Outras (N)" |
| TasksHub           | hub de ícones nas `actions` do `PageHeader` de Tarefas, Auditoria, Recorrentes e Processos (`features/tasks/components/tasks-hub.tsx`): **Ver** é uma `nav` "Páginas de tarefas" no trilho do `SegmentedControl subtle` (itens `Link` de 36px, 40 em `pointer-coarse`, ativo `surface` + sombra xs com `aria-current`, filete entre visualizações e páginas) e **Criar** um `role="group"` de `Button size="icon"` (Plus `primary`, os outros `outline`; oculto abaixo de 640px). No computador, só ícones (pedido do dono): o nome fica no `Tooltip` (`side="bottom"`, 150ms) e no `aria-label`; em tela de toque ou estreita o nome curto aparece sob o ícone (no celular em duas fileiras, visualizações e depois páginas), sempre contido no `aria-label`. O "Mais" do celular lista Auditoria, Recorrentes e Processos logo após Tarefas. Padrão "hub de ícones": navegação e ação nunca usam a mesma forma de ícone |
| RepeatField        | "Não se repete · Repete" (`SegmentedControl sm`) e, ligado, o bloco `rounded-lg border p-3` com Frequência + "A cada", dias da semana (7 botões `aria-pressed`), Dia/Mês (`recurrence-fields.tsx`, os mesmos do `RecurringTaskSheet`), dia não útil, Termina, "Meta e referência" recolhido, resumo `aria-live` e o aviso da primeira data (`repeat-field.tsx`, regras em `repeat-rules.ts`) |
| AccountMenu        | menu de conta do cabeçalho de Minha área (`components/layout/account-menu.tsx`): botão `outline` com o ícone do tipo de espaço, o nome (`max-w-56`) e chevron; menu `w-72` com Conta, espaços e Nova empresa, tema, Configurações e Sair (`danger`). O avatar do trilho é um link para `/minha-area` (`AvatarLink`, anel `ring-primary` quando ativo) |
| MiniCalendar       | mês de segunda a domingo (42 dias, dias de 40px), ponto de 5px por dia (`chart-red-strong` atrasado, `data` em aberto, `border-strong` só concluídas), `Popover w-72` do dia com até 5 itens e "Novo compromisso", teclado de seletor de data (`mini-calendar.tsx`, `mini-calendar-logic.ts`) |
| PortfolioRiskCard  | "Carteira por risco" da Inadimplência (`PortfolioRiskCardView`, `reports/components/delinquency-gauges.tsx`), no lugar do termômetro (sem degradê): número-herói "2 de 10" (`danger` só com alguém em risco) + "clientes em risco alto ou crítico", `StackBar md` na ordem Crítico → Risco alto → Atenção → Baixo risco, faixas com quadradinho, contagem, nomes (os de mais em aberto primeiro, 3 + "e mais N") e o valor em aberto à direita ("—" sem clientes, "em dia" sem aberto); rodapé com a chance média ("cerca de 1 em cada 3 mensalidades") e "N clientes com retrabalho (M tarefas em 90 dias)". Cores do risco (`RISK_TONE`): Baixo risco neutro (`--app-chart-neutral`), Atenção `chart-blue-5` (texto `warning`), Risco alto `chart-red` (texto `danger`), Crítico `chart-red-strong` (selo `danger-soft` com anel); sem verde |
| Gráfico "Como cada mês foi pago" | barras empilhadas por mês de vencimento (`delinquency-chart.tsx`): no prazo `--app-chart-success`, pago com atraso `--app-chart-red`, vencido em aberto `stripeFill('danger')` (`chart-red-strong`); `SegmentedControl sm` Quantidade · Valor (estado local; abaixo de 480px de card desce para baixo do título); taxa de atraso `text-micro` no topo do segmento mais alto (vermelha acima da média do período); mês corrente com opacidade 0,6, rótulo "Nov/26 / parcial" em duas linhas e sem taxa; meses iniciais vazios cortados (`trimLeadingEmpty`); um eixo (`niceDomain`); tooltip com a média de dias **só das pagas com atraso** e a idade da vencida em aberto mais antiga |
| ScoreComposition   | partes do score em linhas com o valor à direita (`delinquency-gauges.tsx`): Pontualidade, Em aberto (N) −X, Retrabalho (2 + 1 antiga) −Y, "= score"; `tone="inverse"` no tooltip escuro da coluna Score (as partes zeradas saem) e `full` no relatório do cliente (todas as partes, rótulos longos "2 vencidas", "2 em 90 dias + 1"). Leitor de tela recebe a mesma composição numa linha (`scoreParts`) |
| ReworkCard         | card "Retrabalho" do relatório do cliente (`client-report/rework-card.tsx`): achado "2 em 90 dias · 3 em 12 meses · −90 pontos no score"; até 5 tarefas (título, "Aberta em", selo `warning` da categoria com o ícone, situação), pontos de cada uma à direita (−40 em `danger`; −10 com "há mais de 90 dias") e "Abrir tarefa ↗" só com título legível; sem retrabalho, `EmptyState compact` "Nenhum retrabalho nos últimos 12 meses"; rodapé com a regra e "Ver categorias" (`page.registry`) |
| Ponte do honorário | lista com sinais (+ / − / =) e barras horizontais de 4px proporcionais ao maior valor (`evolution/evolution-bridge.tsx`), não cascata: Base anterior (`--app-chart-neutral`), Novos (`data`), Reajustes (`data/45`; negativo em `chart-red/60`), Encerrados (`chart-red`), Base do mês (`primary`, 6px, separada por filete); abaixo "Quem entrou (N)" / "Quem saiu (N)" com iniciais, nome, "contrato iniciado em …" ou o motivo, e "+R$ …/mês" (`success`) / "−R$ …/mês" (`danger`), 5 de cada e "+ N" que expande |
| Eixo duplo         | proibido, com **uma** exceção: a linha "Clientes ativos" do Fluxo de caixa (modo M) no eixo da direita (inteiro, sem grade própria, marcas "8 cl." alinhadas às do R$, `--app-fg` 1,5px com pontos de 3px, rótulo "8 clientes" no último ponto); o chip "Clientes ativos (eixo direito)" na legenda liga/desliga (`fluxoClientes`) |

## 4. Padrões de tela

- **Dashboard**: abas (Dashboard / Dashboard inteligente), navegação ‹ mês/ano › e botão
  "Personalizar" (com o selo "N ocultos"); a linha sob o título termina com "· atualizado às 14:32"
  (`updatedLabel`). Faixa de números (`MetricStrip`: Receitas, Despesas e Resultado com minigráfico
  de 6 meses e comparação; Patrimônio com a composição) e, abaixo, **um quadro único de cards, sem
  seções**:
  - grade de 4 colunas (2 abaixo de 1000px de largura, 1 abaixo de 560px), linhas de 96px (88px
    abaixo de 4 colunas), gap 16px; tamanhos padrão só S/M/L (2, 3 ou 4 linhas = 208/320/432px;
    192/296/400px abaixo de 4 colunas) e, no arranjo padrão, a mesma altura em cada fileira; cada
    card tem célula (coluna × linha) e tamanho C × R entre o mínimo e o máximo do catálogo
    (`layout/specs.ts`); os cards são posicionados em absoluto e deslizam (200ms, sem animação com
    `prefers-reduced-motion`) quando outros os empurram;
  - **largura proporcional em 2 colunas** (`displaySpan`): 1/4 e 1/2 viram meia largura, 3/4 e 1 a
    largura toda; redimensionar em 2 colunas grava a largura de 4 colunas (1 → 2, 2 → 4) e mantém a
    gravada quando a exibida não muda (`commitCols`); os limites do canto valem em colunas exibidas
    (`specOnBoard`);
  - **modo Personalizar**: na visualização os cards não têm alça, olho nem canto e o cabeçalho não
    arrasta; "Personalizar" entra no modo (aviso ao leitor de tela "Modo de personalização. Use a
    alça de cada card para mover."), o cabeçalho troca para **Cards** (a lista de cards, mesmo selo),
    **Organizar** (só com vãos) e **Concluir**; Esc ou Concluir saem e devolvem o foco a
    "Personalizar"; `?personalizar=1` entra no modo com "Cards" aberto; a aba "Dashboard
    inteligente" sai do modo;
  - posição livre: arrastar pelo cabeçalho ou pela alça (toque só pela alça) solta o card em
    qualquer célula, inclusive mais abaixo deixando espaço vazio; o destino aparece tracejado e os
    cards cobertos descem (prévia ao vivo); nada sobe sozinho; Esc cancela;
  - teclado na alça: setas movem uma célula (um card no caminho troca de lugar com ele), Home/End
    levam ao topo/ao fim; leitor de tela ouve "Card: coluna X, linha Y" (no celular, "posição N de M");
  - redimensionar pelo canto até a borda direita do quadro (selo "C × R"; setas; Esc cancela);
    o que o card passa a cobrir desce;
  - "Organizar" aparece no cabeçalho só quando há espaços vazios que dá para fechar: os cards
    sobem na própria coluna e, se um card largo impedir, vão para um espaço livre mais alto onde
    caibam (nunca para baixo nem só para o lado); aviso "Cards organizados." com "Desfazer";
  - no celular (1 coluna) o quadro é uma lista: arrastar e as setas só mudam a ordem, sem vãos;
  - 2 e 1 coluna seguem a ordem de leitura do quadro mais largo até o usuário mexer nelas; daí
    guardam o próprio arranjo (os tamanhos são os mesmos em todas as larguras);
  - ocultar pelo olho (deixa o espaço vazio; aviso com "Desfazer"); ligar um card em
    "Personalizar" (lista agrupada por assunto, só para organizar) o coloca no primeiro espaço livre
    onde ele cabe; "Restaurar layout padrão" volta posições, tamanhos, ocultos e opções dos cards;
  - arranjo padrão por fileiras (cobrança → caixa → clientes → análises → recorrentes): Inadimplência
    | Devedores (M), Honorários do mês (S), Próximos vencimentos (M), Fluxo | Saldo (L), Projeção (L),
    Insights (S), Carteira | Vigências (L), Resumo | Despesas por categoria (L), Gastos | Receitas
    fixas (L), empacotados sem buracos em 4 e 2 colunas; "Resultado mês a mês" fica oculto por padrão
    (repete o Fluxo) e continua em "Cards";
  - o layout fica no navegador, por espaço e usuário (`effinance.dashboardLayout.v1:<espaço>:<usuário>`,
    objeto `v: 2`), e é sempre validado ao ler; layouts `v: 1` (com seções) viram posições;
  - os cards de clientes aparecem por padrão só em espaços empresariais (nos outros, ficam em
    "Personalizar").
- **Listas** (contas a pagar/receber, extrato): filtros em linha (período segmentado + navegação
  ‹ mês ›, conta, status), totais no topo em mini-KPIs, linhas com CategoryIcon, descrição, contato,
  vencimento, valor colorido e PaidToggle; ações por linha em menu "⋯".
- **Cadastros** (categorias, contas, cartões, metas, contatos): grade de cards ou tabela, criação/
  edição em Sheet.
- **Relatórios**: abas por análise, seletor de período global, gráficos Recharts com tooltips
  formatados em R$, tabelas de apoio e frases de insight.
  - **Evolução** (`?aba=evolucao`, 2ª aba, ícone `TrendingUp`; janela `6 · 12 · 24 meses` no
    cabeçalho, `?meses=` fora do padrão 12): linha "Mês de referência" (`?ref=YYYY-MM`, some no mês
    corrente; "Voltar a novembro (mês atual)"), 4 `KpiCard compact` (Clientes ativos, Honorário
    mensal recorrente, Ticket médio, Faturado no mês) com a comparação no rodapé e cor só no sinal
    da base e do honorário; abaixo de 560px de contêiner os 4 viram uma lista num card. "Carteira
    mês a mês" (3/5: barras divergentes de novos/encerrados com rótulos "+1"/"−1", linha em degraus
    dos ativos com "8 ativos" no fim, um eixo de contagem com passos inteiros, mês de referência
    sombreado, clique troca o mês) + ponte do honorário (2/5); "Faturado, recebido e honorário
    mensal" na largura toda (barras + linha tracejada do honorário no mesmo eixo, mês parcial
    hachurado); tabela "Mês a mês" semântica (mais recente primeiro, linha de referência
    destacada, Novos/Encerrados abrem um `Popover` com os nomes, a mais antiga com "—" nas
    variações; abaixo de `md` vira lista por mês com "+ N meses"); nota das reativações e "Dados de
    dd/mm/aaaa"; imprime em A4 paisagem.
  - **Inadimplência**: KPI "Taxa de atraso" com a tendência dos últimos 3 meses completos contra os 3
    anteriores; Carteira por risco (2/5) + "Como cada mês foi pago" (3/5); "Empresas" com o filtro
    `Ativos · Todos` (padrão Ativos: inativos sem nada em aberto saem, "N inativos em dia ocultos"
    no subtítulo); coluna Score com "N retrabalhos em 90 dias" (`RotateCcw` 12px) e a composição no
    tooltip; no celular o score é a 5ª estatística da grade e o nome fica com a largura toda; o link
    do relatório do cliente não leva o período (o score é sempre de 12 meses).
  - **Relatório do cliente**: bloco "Score de 12 meses" com a composição em linhas (espera o
    retrabalho carregar para não pular), 4 `MiniStat` (Faturado, Recebido, Em aberto,
    Pontualidade) e os outros 4 números num `dl` compacto no fim de "Quando paga"; "Faturado e
    recebido por mês" (3/5) com o em aberto empilhado sobre o recebido, hachurado (vencido `danger`,
    a vencer cinza, rótulo "vencido"/"a vencer") + Vigências (2/5); "Em aberto" (3/5) + Retrabalho
    (2/5).

- **Reajuste em lote** (`/clientes/reajuste`): abas `Novo reajuste · Histórico`; passo 1 num card (mês ‹ › com o
  mês sugerido, os quatro índices em 4 colunas — 2 no celular —, selo "Maior" no escolhido, percentual aplicado
  com "Usar o maior índice", taxa por empregado e a memória de cálculo `aria-live`); passo 2 com tabela (lista
  abaixo de 768px de card), caixas de seleção só nos prontos, "Prazo do aviso já passou" em `danger`, totais e
  "Aplicar reajuste" no rodapé do card, confirmação com o percentual e quantos clientes; depois, card de
  resultado com "Imprimir cartas". Cartas: folha A4 na tela (como o contrato), uma por página na impressão
  (`@page` A4 15/20 mm, sem o zoom de impressão do app), marcas só de tela para vigência alterada e aviso fora
  do prazo.

## 5. Revisão "livro-razão" (out/2026)

Aplicada a partir da análise com as skills `design-taste-frontend` (telas de app) e `frontend-design`.
Prevalece sobre os itens acima quando houver conflito.

- **Cor só nos dados.** Fundo `#f2f4f7` (papel de livro-razão), cartões brancos com borda `--app-border`, sem
  sombra em repouso (sombra só em menus, diálogos e popovers). Um tom de dado, `--app-data` (`#4c6291`), na série
  principal de cada gráfico; comparações em cinza, despesas e urgência em vermelho pastel (§1, "Cores dos gráficos"). Verde/vermelho só como sinal (variação, atraso,
  resultado negativo) e nas situações da tabela "Cores de status" (§1); valores em tinta, zero em cinza, sinal no texto (`+R$` para receitas).
- **Sem degradês, vidro, arco-íris ou ícones em quadradinhos coloridos.** Categorias usam a rampa azul por
  posição (`SERIES_PALETTE`); `CategoryIcon` é neutro nas listas (`tinted` só no editor/seletor de categorias).
  Hachura só para o que está em aberto/previsto. Regimes tributários usam degraus da rampa de dados (`REGIME_COLORS`: tons de azul alternando escuro/claro, cinzas para Imune/Isenta e Outro).
- **Tipografia** (densidade média): linhas e valores 14px, título de card 16px, meta 12–12,5px, eixos 11px;
  nada abaixo de 11px. Rótulos em caixa normal (sem caixa alta espaçada; `eyebrow` virou rótulo comum).
- **Grade do dashboard:** linhas de 96px (88px em 2 colunas), espaçamento 16px, cartões com 20px de padding.
- **Títulos:** toda tela tem um `h1`; a linha abaixo fala dos dados (mês, regime de competência/caixa), não da
  interface. O dashboard mostra o achado do mês (vencidos e quem concentra) ao lado do link para agir.
- **Barras de rolagem** finas, com polegar arredondado e sem setas; `Modal` rola só o corpo, com cabeçalho e
  rodapé fixos, para não cortar os cantos arredondados.
- **Checagem:** `node ~/.claude/skills/design-taste-frontend/scripts/lint.mjs --app src/...` (0 FAIL) e
  `inspect.mjs --app` nas telas. Falsos positivos conhecidos: o `<span>` de medição do Recharts encostado na
  borda e o texto dentro do logo do banco.

## 6. Proporção dos painéis (nov/2026)

Resumo de `docs/dashboards-redesign.md` (a spec completa, com a auditoria e o card a card). Vale para o
Painel financeiro e o Início da Gestão.

- **Tamanhos:** linha de 96px (88px abaixo de 4 colunas), espaço de 16px; padrão só S (2 linhas), M (3) e
  L (4), por `heightForRows`; a mesma altura em cada fileira do arranjo padrão. Colunas pela largura do
  contêiner: ≥ 1000px = 4 (financeiro) ou 12 (Início, `DashSlot`); 560–999px = 2; abaixo = 1.
- **Faixa de números única** (`MetricStrip`) no topo dos dois painéis; todo número de topo tem comparação
  (mês anterior, meta implícita da competência, % no prazo); Patrimônio mostra a composição e diz no (i) que
  não há histórico.
- **Card:** título estável + linha do achado (funções puras testadas: `widgets/insight-lines.ts` e
  `tasks/dashboard-logic.ts`); janelas diferentes do mês entram como prefixo ("Hoje · ", "Próximos 15 dias ·
  ", "Competência 10/2026 · "); só o número de alerta fica vermelho; vazio sem moldura dupla.
- **Status como barra empilhada** (`StackBar`, `StatusSummary`), nunca rosca: progresso = concluído (success) →
  atrasado (danger) → pendente (cinza); distribuição na ordem das faixas. Tons (`BandTone`): `danger`,
  `warning` (ponto/barra em `chart-red-soft`, texto em `text-warning`), `danger` (marca `chart-red-strong`), `success` (marca `chart-success`, ver "Cores de status" na §1), `data`, `dataSoft` (`bg-data/45`,
  31–60 dias) e `muted`.
- **Gráficos:** eixo Y por `niceDomain` (3 a 5 marcas em passos 1/2/2,5/5 × 10ⁿ, começa em zero; negativo
  menor que ¼ do passo só estica o domínio); projeção sem repetir o pior dia (`projectionTiles`) e com a
  linha do saldo de hoje; sem degradê na área.
- **Listas:** linhas de uma altura (`TransactionRow density="line"`), cortadas com "+ N …"; nada rola dentro
  de card nem na horizontal em 375/1024/1440.
- **Layouts salvos:** o formato continua `v: 2`; cards que passaram a ficar ocultos por padrão perdem a
  célula só se o usuário não os ligou, e o vão que sobra é fechado por "Organizar" no modo Personalizar.

<!-- 14/11/2026 -->
**Ficha única do cliente** (14/11/2026): `features/clients/pages/client-page.tsx` serve `/tarefas/clientes/:id` e `/clientes/:id` (mesmo componente em cada casca); seções e ações por permissão em `client-page-logic.ts` (`clients` edita dados cadastrais via `PATCH /api/clients/:id/registration` e documentos via `PUT /api/clients/:id/documents`; `finance` vê honorários, contrato e observações; `clientCredentials` revela acessos). Abas com `SegmentedControl` em `?aba=`; `ClientSheet mode="registration"` para quem não tem `finance`.

## 7. Estilo "Seu dia": coluna à direita e card sólido (24/11/2026)

Aprovado pelo dono (relatório consolidado de 24/11/2026). Componentes:

- **`PageWithAside`** (`components/layout/page-with-aside.tsx`): conteúdo + coluna de 256px a partir de
  1280px (`from="2xl"` = 1536px). Abaixo: o card sólido primeiro, depois o conteúdo, depois os cards
  pequenos (`below="hide"` esconde a coluna). `AsideCard` é o card pequeno da coluna (título 14/600,
  número à direita em `text-muted`).
- **`SpotlightCard`** (`components/ui/spotlight-card.tsx`): o **único** bloco sólido da tela
  (`bg-hero-from`), para o dado que pede ação agora (atrasadas, inadimplência, vence hoje, falta conferir).
  Rótulo, número grande **ou** título, até 4 linhas, uma ação principal branca e uma secundária com
  contorno. Sem nada urgente, mostra a frase calma no mesmo lugar (a tela não pula).
- **Vermelho sobre o sólido:** `--app-on-solid-danger` (`#f6c7c4` claro / `#f2b2ad` escuro); o chip usa
  `bg-chart-red/20` + `ring-chart-red/45`. Nunca `text-danger` sobre o azul-marinho (sem contraste).
- **`MiniStat solid`**: em listas largas (Receber/Pagar, Recebimentos) a coluna cortaria as linhas; o
  destaque vira a célula sólida da faixa de números, clicável para filtrar.
- **`StackedBar`** (`components/ui/stacked-bar.tsx`): barra fina em partes (no prazo × atraso, vencido ×
  30 dias × depois), com `max` para comparar linhas.
- **Ranking com ordenação no título da coluna** (Relatório de tarefas): uma linha de cabeçalho, um único
  seletor no card; nunca uma segunda fileira de botões.

Onde está: Início e Minha área da gestão, Clientes da gestão, Painel financeiro (coluna fora da grade
personalizável). A lista de Tarefas **não** tem coluna (cortava os títulos mesmo a 1600px). Os painéis
passam a ter 4 colunas a partir de 900px (`columnsForWidth`), para caber ao lado da coluna.

