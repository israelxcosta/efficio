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
| `surface-muted`  | `#F7F7F5` | rodapé de KPI, linhas zebradas, inputs read |
| `border`         | `#E7E7E3` | bordas padrão                               |
| `border-strong`  | `#D6D6D1` | bordas de input em hover, divisores fortes  |
| `text`           | `#16181D` | texto principal                             |
| `text-muted`     | `#6B6F76` | texto secundário                            |
| `text-subtle`    | `#9A9EA5` | placeholders, legendas                      |
| `success`        | `#12A150` | receita, variação positiva, 👍 pago          |
| `success-soft`   | `#E7F6ED` | fundo de "Melhor 👍"                         |
| `danger`         | `#E5484D` | despesa, variação negativa, 👎 pendente      |
| `danger-soft`    | `#FDECEC` | fundo de "Pior 👎"                           |
| `warning`        | `#B7791F` | alertas                                     |
| `warning-soft`   | `#FEF6DA` | banner de aviso                             |
| `chart-expense`  | `#F2A3A5` | barra de despesa (listrada, vermelho suave) |
| `chart-neutral`  | `#D4D4D8` | série neutra (ex.: período anterior)        |

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
| `border-strong` | `#4C4C4B` | gráfico receita/despesa | `#E3E2DD` / `#C4595D` |

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
| Overline     | 11px / 600, uppercase, 0.12em    | "PLANEJAMENTO", "OPORTUNIDADE"        |

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
- Movimento: 150–200ms `cubic-bezier(.2,.8,.2,1)`; sheets deslizam da direita (240ms).

## 2. Layout (app shell)

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
| KpiCard            | rótulo small + ícone info; valor Display; rodapé `surface-muted` com seta (TrendingUp/Down) colorida, "% vs mês anterior" e chevron |
| Input / Select     | altura 44, raio md, borda `border`, foco: borda `brand-500` + anel 3px `brand-500/15` |
| CategoryPicker     | campo único de categoria: lista com busca no topo, categorias como títulos de grupo e só subcategorias selecionáveis (rádio circular); categoria sem subcategorias é selecionável; rodapé "+ Nova categoria" |
| SplitEditor        | "Dividir" no campo Categoria: linhas categoria + valor (2–10), "Dividir igualmente", "+ Adicionar categoria" (já com o valor que falta) e faixa de conferência (Falta / Excede / Valores conferem) |
| Select (lista)     | nunca o menu nativo: lista própria (Radix) com raio xl, borda, sombra lg, padding 6px; itens com raio lg, destaque `bg-subtle` no hover/teclado, item escolhido em negrito com ✓; grupos com rótulo overline e divisor |
| MoneyInput         | prefixo "R$" muted, digitação da direita para a esquerda (centavos), tabular-nums |
| Sheet (lateral)    | 440px, raio 2xl à esquerda, header (título H2 + subtítulo muted + X), corpo rolável, rodapé fixo com `Cancelar` (ghost) e `Salvar` (primary) |
| PaidToggle         | botão 👍/👎: pendente (padrão) = `ThumbsDown` em `danger-soft`/`danger`; pago = `ThumbsUp` em `success-soft`/`success`; animação de "pop" ao alternar |
| Badge              | pílula 11–12px: `brand`, `success`, `danger`, `warning`, `neutral` (soft) |
| EmptyState         | caixa com borda tracejada raio lg, ícone em quadrado `bg-subtle`, título 14/600, descrição muted, botão outline |
| ProgressBar        | trilho `brand-100`, preenchimento `brand-800` (metas) ou `success`/`danger` (limite) |
| InsightCard        | gradiente `brand-700 → brand-900`, texto branco, cartão interno vidro (`white/8`, borda `white/12`), chip overline |
| BankLogo           | círculo com cor oficial aproximada do banco e sigla (Nu, Itaú, BB, Cx...) — sem marcas registradas |
| CategoryIcon       | quadrado raio md com fundo `cor/12%` e ícone lucide na cor da categoria |
| WidgetCard         | card de widget do dashboard (`features/dashboard/layout/widget-card.tsx`): cabeçalho fixo (título 14px, subtítulo 11.5px, ação à direita que desce para uma 2ª linha abaixo de 384px, alça de mover e olho "Ocultar card" que aparecem no hover/foco), corpo `flex-1` que ocupa a altura restante; variante `hero` (gradiente); com alerta, ponto vermelho no título e barra vermelha de 3px à esquerda |
| FitList            | lista cortada às linhas que cabem no card (mede cada linha a cada redimensionamento) com a linha "+ N …"; aceita o total real do servidor |
| ChartBox           | envolve um gráfico Recharts e ocupa a altura restante do card (mínimo 96px), para o gráfico crescer junto |
| DonutChart `fill`  | rosca que se dimensiona pelo espaço (legenda ao lado a partir de 448px, embaixo antes), número central ajustado ao furo, cauda agrupada em "Outras (N)" |

## 4. Padrões de tela

- **Dashboard**: abas (Dashboard / Dashboard inteligente), navegação ‹ mês/ano › e botão
  "Personalizar" (com o selo "N ocultos"). Faixa fixa de KPIs (Saldo em conta, Resultado do mês,
  A pagar, A receber) e, abaixo, a grade de widgets portada do Effy:
  - grade de 4 colunas (2 abaixo de 1000px de largura, 1 abaixo de 560px), linhas de 86px (80px
    fora do desktop), gap 12px, empacotamento `dense`; cada widget tem tamanho C × R entre o mínimo
    e o máximo do catálogo (`layout/specs.ts`);
  - cinco seções recolhíveis (Visão geral, Receber e pagar, Análises do mês, Clientes e honorários,
    Metas e recorrentes) com o selo "N exigem atenção", que abre a lista do que precisa de ação;
  - redimensionar pelo canto (selo "C × R" durante o arraste; setas do teclado; Esc cancela);
  - reordenar arrastando pelo cabeçalho ou pela alça (toque pela alça; setas, Home e End no
    teclado), só dentro da própria seção, com o aviso "Cards reorganizados.";
  - ocultar pelo olho (aviso com "Desfazer"); reexibir em "Personalizar" ou em Configurações →
    Dashboard; "Restaurar layout padrão" volta tamanhos, ordem, ocultos, seções e opções dos cards;
  - o layout fica no navegador, por espaço e usuário (`effinance.dashboardLayout.v1:<espaço>:<usuário>`),
    e é sempre validado ao ler;
  - os cards de clientes aparecem por padrão só em espaços empresariais (nos outros, ficam em
    "Personalizar").
- **Listas** (contas a pagar/receber, extrato): filtros em linha (período segmentado + navegação
  ‹ mês ›, conta, status), totais no topo em mini-KPIs, linhas com CategoryIcon, descrição, contato,
  vencimento, valor colorido e PaidToggle; ações por linha em menu "⋯".
- **Cadastros** (categorias, contas, cartões, metas, contatos): grade de cards ou tabela, criação/
  edição em Sheet.
- **Relatórios**: abas por análise, seletor de período global, gráficos Recharts com tooltips
  formatados em R$, tabelas de apoio e frases de insight.

## 5. Revisão "livro-razão" (out/2026)

Aplicada a partir da análise com as skills `design-taste-frontend` (telas de app) e `frontend-design`.
Prevalece sobre os itens acima quando houver conflito.

- **Cor só nos dados.** Fundo `#f2f4f7` (papel de livro-razão), cartões brancos com borda `--app-border`, sem
  sombra em repouso (sombra só em menus, diálogos e popovers). Um tom de dado, `--app-data` (`#2f5fbf`), na série
  principal de cada gráfico; despesas e comparações em cinza. Verde/vermelho só como sinal (variação, atraso,
  resultado negativo); valores em tinta, zero em cinza, sinal no texto (`+R$` para receitas).
- **Sem degradês, vidro, arco-íris ou ícones em quadradinhos coloridos.** Categorias usam a rampa azul por
  posição (`SERIES_PALETTE`); `CategoryIcon` é neutro nas listas (`tinted` só no editor/seletor de categorias).
  Hachura só para o que está em aberto/previsto. Regimes tributários mantêm cores próprias (`REGIME_COLORS`).
- **Tipografia** (densidade média): linhas e valores 14px, título de card 16px, meta 12–12,5px, eixos 11px;
  nada abaixo de 11px. Rótulos em caixa normal (sem caixa alta espaçada; `eyebrow` virou rótulo comum).
- **Grade do dashboard:** linhas de 96px (88px em 2 colunas), espaçamento 16px, cartões com 20px de padding.
- **Títulos:** toda tela tem um `h1`; a linha abaixo fala dos dados (mês, regime de competência/caixa), não da
  interface. O dashboard mostra o achado do mês (vencidos e quem concentra) ao lado do link para agir.
- **Elemento próprio:** a "Régua da competência" (um quadro por cliente: pago, em aberto, atrasado, não gerado).
- **Barras de rolagem** finas, com polegar arredondado e sem setas; `Modal` rola só o corpo, com cabeçalho e
  rodapé fixos, para não cortar os cantos arredondados.
- **Checagem:** `node ~/.claude/skills/design-taste-frontend/scripts/lint.mjs --app src/...` (0 FAIL) e
  `inspect.mjs --app` nas telas. Falsos positivos conhecidos: o `<span>` de medição do Recharts encostado na
  borda e o texto dentro do logo do banco.
