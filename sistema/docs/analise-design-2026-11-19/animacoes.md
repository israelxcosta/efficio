# Auditoria de motion: animações, transições e microinterações do Efficio (web)

Escopo: `sistema/apps/web/src` (React 19.3, Vite, Tailwind v4.3, Radix, Recharts 3.10, sonner). Só li o código, sem editar nada.
Método: skills `animate` (+RECIPES), `motion` (+recipes), `impeccable/animate` e `delight`, `vercel-react-view-transitions` e a seção de animação das Web Interface Guidelines.
Verificação: rodei o demo (`dist-demo` em `127.0.0.1:8772`, já no ar e usado só para leitura) com Playwright. Desacelerei as animações 10–20× via CDP e amostrei estilos computados quadro a quadro. Os 3 achados P1 foram confirmados medindo, não só lendo o código.

Arquivos de apoio (scratchpad):
- `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/proposed-inject.css`: CSS de demonstração para injetar no build atual.
- `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/demo.mjs`: captura das 3 sequências (`node demo.mjs before|after [baseUrl]`).
- Quadros já gerados: `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/demo/before/` e `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/demo/after/`.
- Folhas de contato antes (linha de cima) / depois (linha de baixo): `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/sheet-A-open.png`, `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/sheet-A-close.png`, `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/sheet-B-open.png`, `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/sheet-B-close.png`, `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/sheet-C.png`.

Nota do Tailwind v4 que pesa em vários achados: `translate-*`, `scale-*` e `rotate-*` geram as propriedades **individuais** `translate`, `scale` e `rotate`, não `transform`. A variante `hover:` já vem atrás de `@media (hover: hover)`, então o "hover sem gating" da skill já está resolvido pelo framework.

---

## 1. Inventário

### 1.1 Tokens atuais (`styles/index.css`)

| Linha | Token | Valor | Observação |
|---|---|---|---|
| 261 | `--ease-out-soft` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Curva "inventada", fora das tabelas da skill. É a única curva própria. |
| 263 | `--animate-pop` | `pop 260ms` (scale 1 → **1.22** → 1) | Keyframe em estado alternado; escala exagerada. |
| 264 | `--animate-fade-in` | 160ms `ease-out` (nativo, fraco) | Usado em overlays, popovers, selects, menus e tooltips (17 usos). |
| 265 | `--animate-sheet-in` | 240ms `--ease-out-soft`, `translateX(100%→0)` | OK em duração. |
| 266 | `--animate-sheet-out` | 200ms **`ease-in`** | Viola "nunca `ease-in` em UI". |
| 267 | `--animate-dialog-in` | 180ms, `transform: translate(-50%,-48%) scale(.97)` | **Bug**: soma com o `translate` do Tailwind (ver P1-1). |
| 268 | `--animate-shimmer` | 1.4s `ease-in-out` infinito, só opacidade | Skeleton e barra do FullPageLoader. |
| 399–406 | reduced motion | `animation-duration` e `transition-duration: 1ms !important` em `*` | **Bug** em loops infinitos e "zero" em vez de "mais suave" (P1-2). |

Não existe token de duração. Cada componente usa `duration-150`, `duration-200`, `duration-500` ou o default do Tailwind (150ms, `cubic-bezier(.4,0,.2,1)`).

### 1.2 O que anima hoje

| Onde | Propriedade | Duração / curva | Veredito |
|---|---|---|---|
| `components/ui/dialog.tsx:21` overlay | opacity (fade-in) | 160ms ease-out; **sem saída** | Faltam a saída e uma curva forte. |
| `components/ui/dialog.tsx:31` Modal/ConfirmDialog | transform+opacity (dialog-in) | 180ms; **sem saída** | **Quebrado** (P1-1): entra deslocado ~224px para a esquerda e ~49px para cima, depois dá um salto. |
| `components/ui/sheet.tsx:35` overlay | opacity | 160ms; **sem saída** | Some na hora enquanto o painel ainda desliza (P2-4). |
| `components/ui/sheet.tsx:38` painel | transform translateX | 240ms entrada / 200ms saída com `ease-in` | Curva de saída errada; sob reduced motion vira corte seco em vez de crossfade. |
| `components/ui/tooltip.tsx:22`, `help-tip.tsx:79` | opacity | 160ms, só em `delayed-open` | **Correto**: os vizinhos abrem em `instant-open` sem animação e fecham na hora (regra `motion-tooltip-delay`). Manter. |
| `components/ui/dropdown-menu.tsx:16,69`, `select.tsx:188`, popovers em `task-filters.tsx:219`, `matrix-cell.tsx:224`, `mini-calendar.tsx:189`, `task-calendar.tsx:270`, `evolution-table.tsx:172`, `search-select.tsx:145`, `category-picker.tsx:154` | opacity | 160ms ease-out; sem escala, sem origem, sem saída | Aceitável; falta escala a partir do gatilho (P3-9). |
| `components/layout/command-palette.tsx:289-290` | opacity | 160ms | Abre por **⌘K**: não deveria animar (P2-5). |
| `dropdown-menu.tsx:50`, `select.tsx:69` itens | `transition-colors` em `data-[highlighted]` | 150ms | Destaque por teclado (setas) animado (P2-5). |
| `components/ui/button.tsx:40` | bg/border/color/shadow/transform | 150ms default | `active:translate-y-px` só no primary (l.8) e **não transiciona**, porque `translate` não está na lista. Os outros variants não têm feedback de pressão (P3-10). |
| `components/ui/switch.tsx:17,22` | bg (cores) + thumb `translate` (`transition-transform` cobre `translate` no v4) | 150ms | Bom. Manter. |
| chevrons: `select.tsx:179`, `search-select.tsx:135`, `category-picker.tsx:146`, `task-group.tsx:58`, `audit.tsx:633`, `audit-occurrence-row.tsx:116`, `delinquency-clients.tsx:294`, `generate-fees-dialog.tsx:288` | rotate | 150ms | Bom (indicação de estado). |
| `components/ui/paid-toggle.tsx:51`, `tasks/components/task-status.tsx:107`, `transactions/transaction-sheet.tsx:667` | `animate-pop` scale 1.22 | 260ms keyframe | Escala fora da faixa e keyframe em toggle (P2-6). |
| `components/ui/progress-bar.tsx:34` | **width** | **500ms** ease-out | Anima propriedade de layout e passa de 300ms (P2-7). |
| `components/charts/gauge.tsx:35` | stroke-dasharray | **700ms** | O knob (`circle`, l.37) **teleporta** enquanto o arco anima (P2-7). |
| `components/charts/donut-chart.tsx:99` | Recharts Pie | **700ms** `ease`; `isAnimationActive` default `'auto'` | Respeita reduced motion, mas é longo. Hover em fatias com opacity 150ms (l.113) está bom. |
| Recharts no painel: `cashflow-card.tsx:318,327`, `trend-widgets.tsx:273,274,286,410`, `projection-widget.tsx:174`, `analysis-widgets.tsx:423` | Bar 400ms, Line/Area **1500ms** (defaults), `ease` | `isAnimationActive={!resizing}` passa **`true`** e anula o `'auto'` do Recharts 3, que respeitaria reduced motion (P1-3). |
| Recharts em relatórios: `cashflow-tab.tsx:83,84,102`, `comparison-tab.tsx:129-130`, `categories-tab.tsx:137,147`, `contacts-tab.tsx:79-96`, `insights-tab.tsx:126`, `card-detail.tsx:136` | defaults: Line/Area 1500ms | `'auto'` (respeita reduced motion), mas longo demais. |
| `reports/evolution/evolution-charts.tsx`, `client-report.tsx`, `task-reports.tsx`, `delinquency-chart.tsx` | — | `isAnimationActive={false}` | Política **inconsistente** entre telas. |
| `dashboard/layout/widget-grid.tsx:446-447` cards do painel | transform+translate | 200ms `ease-out` (Tailwind, fraco); `motion-reduce:transition-none`; `transition-none` durante o drag | O deslize do card solto até a célula está correto. Faltam o "levantar" e uma curva forte. A transição também roda ao redimensionar a janela (cards "atrasam") (P3-11). |
| `widget-grid.tsx:298` alvo do drop | transform | 150ms ease-out | Bom. |
| `widget-card.tsx:48`, `widget-grid.tsx:469` | opacity dos controles do Personalizar | 150ms | Bom. |
| 20 telas com `isPlaceholderData && 'opacity-60 transition-opacity'` (ex.: `statement.tsx:147`, `tasks.tsx:221`, `transaction-list-page.tsx:260`, `audit.tsx:439`) | opacity | 150ms | **Bom**: indica dado velho durante a troca de período. O **painel financeiro não faz isso** (P2-8). |
| `components/ui/skeleton.tsx:4`, `app-shell.tsx:136`, `tasks/pages/my-area.tsx:220` (`animate-pulse`), `tasks/components/attachments.tsx:227`, `onboarding-deck.css:1739` (`ob-pulse`) | opacity loop | 1.4s / 2s | OK no modo normal. Sob reduced motion vira **cintilação** (P1-2). |
| `animate-spin`: `button.tsx:54`, `connections-card.tsx:166`, `connect-flow.tsx:299`, `mapping-step.tsx:171`, `file-step.tsx:134` | rotate | 1s linear | OK. Sob reduced motion gira em ângulos aleatórios a cada quadro (P1-2). |
| Hover que move o próprio elemento: `cards/pages/cards.tsx:86` (`-translate-y-0.5`), `layout/sidebar.tsx:91` (avatar `scale-105`), `ui/color-picker.tsx:25` (`scale-110`), `ui/kpi-card.tsx:68` (seta `translate-x-0.5`, ok, é um filho) | translate/scale | 150ms | P3-12. |
| `transition` "quase all" (Tailwind `transition` = cores, opacity, sombra, transform, filter…) em 12 lugares: `transaction-row.tsx:408`, `task-sheet.tsx:804,888`, `occurrence-sheet.tsx:311`, `processes.tsx:297,395`, `recurring.tsx:533,643`, `registry.tsx:59`, `tasks/pages/clients.tsx:344`, `client-records.tsx:257`, `contribution-dialog.tsx:102` | várias | 150ms | P3-12 (nomear as propriedades). |
| Toasts (`app/providers.tsx:27`, sonner) | transform/opacity, swipe | defaults do sonner (~400ms `ease`) | **Bom**: o sonner já desliga tudo sob reduced motion. Manter. |
| Rolagem suave: `onboarding-deck.tsx:30-36`, `site-header.tsx:95` | scroll-behavior | — | **Bom**: respeita reduced motion. |
| Barra flutuante (`layout/quick-bar.tsx:14,37`) | `transition-colors` / opacity no hover | 150ms | Sem feedback de pressão nos atalhos (P3-10). O fade de hover no botão de busca (opacity .9) está ok. |
| Menu lateral (`layout/sidebar.tsx:116,140,191`) | `transition-colors` | 150ms | Ok. Tooltips com `delay=150` e skip-delay do Radix: correto. |
| Navegação mobile (`layout/mobile-nav.tsx`) | — (menu é o Sheet) | herda do Sheet | Ok, com os problemas do Sheet. |
| Onboarding deck (`onboarding-deck.css:393`, `ConfirmedReading` em `confirm-reading.tsx:14`) | só hover de fundo 150ms | — | O momento "Leitura confirmada" (raro, primeira vez) aparece seco. É a oportunidade de delight (item 7). |

### 1.3 O que não anima mas deveria

1. **Saídas** de Modal, overlays e popovers: hoje somem na hora, enquanto a entrada anima. A saída deve ser mais curta, não inexistente, e o overlay deve sair junto com o painel.
2. **Dado velho no painel** (`dashboard.tsx:204`): na troca de mês o `keepPreviousData` mostra os números do mês anterior sem nenhum sinal. As outras 20 telas esmaecem.
3. **Pressão em botões** (`Button` não-primary e atalhos da barra flutuante): feedback de 150ms com scale .97.
4. **Troca de ícone** de status (pago/pendente, tarefa concluída): crossfade curto no lugar do "pop" 1.22.
5. **"Levantar" o card** ao começar o drag no Personalizar (scale 1.02 + sombra), para o pegar ficar físico.
6. **Knob do gauge** acompanhando o arco.
7. **Confirmação de leitura do onboarding** (rara e única para o cliente): uma entrada curta com o check. É o único lugar com orçamento de delight.

### 1.4 O que anima e não deveria (ou deveria menos)

- Paleta ⌘K (atalho de teclado: nunca anima).
- Destaque de item por teclado em menus e selects (`transition-colors` em `data-[highlighted]`).
- Recharts Line/Area a 1500ms (defaults) em toda troca de período: o usuário está lendo esse dado.
- Pop de 1.22× em toggles usados dezenas de vezes por dia.
- Barra de progresso a 500ms em `width`.
- **Contadores de números (count-up)**: hoje não existem e **não devem ser criados**. Num app financeiro o número é o dado lido, e animá-lo atrasa a leitura (regra "data the user is reading should not move for style"). A troca de período se resolve com esmaecimento (P2-8).

### 1.5 Vale a pena usar View Transitions?

React 19.3.1 já traz `<ViewTransition>`. Recomendação:
- **Rotas: não.** A navegação é lateral, frequente (dezenas por dia, inclusive por ⌘K), as páginas são densas e cheias de gráficos (snapshots caros), e as rotas usam `lazy`+Suspense. A skill `motion` pede que o "chrome" no máximo faça fade e que nada replaye; o ganho não paga o custo.
- **Abas "Visão geral / Dashboard inteligente" e abas de relatórios: não.** São laterais; um corte seco é melhor que um fade sem informação.
- **Exceção que vale no futuro (P3, fora do top 6):** elemento compartilhado `name="card-<id>"` entre o `CardVisual` da lista (`cards/pages/cards.tsx:86`) e o cabeçalho de `cartoes/:id`. É a única navegação hierárquica ("o mesmo objeto, mais fundo") do app, com `nav-forward`/`nav-back` e reduced motion sem movimento.

---

## 2. Problemas priorizados

| # | Prio | Problema | Onde | Regra violada |
|---|---|---|---|---|
| 1 | **P1** | **O Modal entra torto e dá um salto.** O keyframe anima `transform: translate(-50%,-48%) scale(.97)`, mas a centralização vem das classes `-translate-x-1/2 -translate-y-1/2`, que no Tailwind v4 usam a propriedade `translate`. As duas se somam: medido com Playwright, durante os 180ms o diálogo fica 224px à esquerda e 49px acima (x=272 → x=496 no fim) e salta para o centro quando a animação termina. Afeta **todo** `Modal`/`ConfirmDialog` (exclusão, escopo de recorrência, aporte etc.). | `styles/index.css:267,288-291`; `components/ui/dialog.tsx:31` | `animate` §4 (propriedades: animar o que não conflita); guidelines "Set correct transform-origin / transform"; `motion-no-scale-from-zero` (a entrada precisa sair do próprio lugar). Evidência: `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/sheet-A-open.png` (linha de cima). |
| 2 | **P1** | **Reduced motion causa cintilação e corta o que dá significado.** `animation-duration: 1ms` em loops `infinite` faz o shimmer pular de opacidade a cada quadro (medido: 0.55 → 0.85 → 0.55 → 0.96… por quadro), o spinner girar em ângulos aleatórios e `ob-pulse`/`animate-pulse` piscarem. Ao mesmo tempo, fades úteis (overlay, esmaecimento de dado velho) viram corte seco, e o Sheet desliza em 1ms em vez de fazer crossfade. | `styles/index.css:399-406` | `motion-reduced-motion` ("slides viram crossfade de opacity"); `animate` §7 ("fewer and gentler, not zero"); guidelines "Muted decorative loops must stop under prefers-reduced-motion". |
| 3 | **P1** | **Gráficos do painel animam mesmo com reduced motion.** O Recharts 3 tem `isAnimationActive: 'auto'` (respeita a preferência), mas `isAnimationActive={!resizing}` passa `true` e anula isso. O CSS global não alcança animação JS do Recharts. | `cashflow-card.tsx:318,327`; `trend-widgets.tsx:273,274,286,410`; `projection-widget.tsx:174`; `analysis-widgets.tsx:423` | `motion-reduced-motion`; guidelines "Honor prefers-reduced-motion". |
| 4 | P2 | **Sheet:** saída com `ease-in`; o overlay não tem saída (some na hora enquanto o painel ainda desliza 200ms); sob reduced motion não vira crossfade. O mesmo overlay sem saída aparece no Modal e na paleta. | `index.css:266`; `sheet.tsx:35,38`; `dialog.tsx:21`; `command-palette.tsx:289` | `motion-ease-by-direction` / "Never ease-in"; recipe Modal ("anime a opacity do backdrop junto"); `motion-close-faster` (fechar mais rápido, não instantâneo pela metade). |
| 5 | P2 | **Animação em ação de teclado:** a paleta ⌘K faz fade (overlay + conteúdo), e itens de menu/select fazem `transition-colors` no destaque por setas. | `command-palette.tsx:289-290`; `dropdown-menu.tsx:50`; `select.tsx:69` | `animate` §1 ("Keyboard-initiated actions are a disqualifier"); `motion-no-motion-on-repeat`. |
| 6 | P2 | **`animate-pop` (scale 1→1.22→1, keyframe)** em PaidToggle, TaskStatus e tipo da transação: escala fora da faixa, keyframe reinicia do zero em cliques rápidos, e a troca de ícone (ThumbsDown→ThumbsUp, Circle→CircleCheck) é seca. | `index.css:263,271-275`; `paid-toggle.tsx:51,173`; `task-status.tsx:107`; `transaction-sheet.tsx:667` | `motion-press-scale` (0.95–1.05); `motion-transitions-for-state`; `motion-icon-crossfade`. |
| 7 | P2 | **Durações longas em dados:** Line/Area 1500ms (default) e Pie 700ms a cada troca de período; gauge 700ms com o knob teleportando; ProgressBar 500ms animando `width`. | `donut-chart.tsx:99`; `gauge.tsx:35,37`; `progress-bar.tsx:34`; séries sem props nos relatórios (`cashflow-tab.tsx:83-102` etc.) | `motion-under-300ms`; `animate` §4 ("transform/opacity only"); `animate` §2 (dado lido não se move por estilo). |
| 8 | P2 | **O painel não sinaliza dado velho** na troca de mês (as outras 20 telas esmaecem para 60%). É a tela mais vista. | `features/dashboard/pages/dashboard.tsx:200-205` | `animate` §2 "State indication"; consistência com o padrão da casa. |
| 9 | P3 | Popovers, menus e selects só fazem fade de 160ms com o `ease-out` nativo: sem escala a partir do gatilho e sem saída. | `dropdown-menu.tsx:16,69`; `select.tsx:188`; popovers listados em 1.2 | `motion-origin-from-trigger`; `motion-strong-ease-out`. |
| 10 | P3 | Pressão: só o primary tem `active:translate-y-px`, que não transiciona (`translate` fora da lista de `transition-[…]`). Outline/ghost/soft/danger e os atalhos da barra flutuante não dão feedback. | `button.tsx:8,40`; `quick-bar.tsx:14` | recipe "Button press" (scale .97, 160ms). |
| 11 | P3 | Drag do painel: pegar o card não o "levanta" (a sombra aparece seca no frame), a soltura usa o `ease-out` fraco do Tailwind, e todos os cards deslizam 200ms ao redimensionar a janela (efeito de arrasto atrasado). | `widget-grid.tsx:446-447` | `motion-strong-ease-out`; `motion-spring-for-gestures` (compromisso documentado abaixo); `animate` §2 (a transição de resize não tem propósito). |
| 12 | P3 | Hover que move o próprio elemento (cartão sobe 2px, avatar 1.05×, swatch 1.10×), `transition` genérico em 12 lugares, e tokens "forkados" (`--ease-out-soft` inventado, nenhuma escala de duração). | `cards.tsx:86`; `sidebar.tsx:91`; `color-picker.tsx:25`; lista em 1.2; `index.css:261` | impeccable/animate "Hover: o filho carrega o movimento"; `motion-name-the-properties`; `animate` Hard Rule 2–3. |

O que está bom e deve ser preservado: tooltips (atraso só no primeiro, vizinhos instantâneos, fecham na hora), switch, chevrons, esmaecimento de `isPlaceholderData` nas listas, alvo do drop e deslize do card solto, `motion-reduce:transition-none` no grid, toasts do sonner, rolagem suave condicionada e o drag com alternativa de teclado (setas/Home/End e anúncio `aria-live`, que satisfaz `motion-gesture-alternative`).

---

## 3. House motion do Efficio

### 3.1 Tese
O Efficio é uma ferramenta de **operar e ler** (o modo "Operate + Read" do impeccable). O movimento serve a **feedback, estado e continuidade**, nunca à decoração. Telas abertas dezenas de vezes por dia ficam rápidas e quase imperceptíveis. O único orçamento de delight é o raro/primeira vez: a confirmação de leitura do onboarding, a primeira meta concluída.

### 3.2 Tokens para `styles/index.css`

Estes blocos **substituem** as linhas 261–296 e 399–406 e estendem os tokens existentes, sem criar um sistema paralelo. Os nomes `--animate-*` existentes continuam funcionando.

```css
/* :root — escala de durações (CSS vars; usar como duration-(--dur-press) no Tailwind v4) */
:root {
  --dur-hover: 100ms;      /* cor de hover/foco (quase imperceptível) */
  --dur-press: 150ms;      /* pressão de botão, levantar card */
  --dur-tooltip: 125ms;
  --dur-state: 200ms;      /* toggle, chevron, esmaecer dado velho, troca de ícone */
  --dur-pop-in: 200ms;     /* modal, popover, menu, select — entrada */
  --dur-pop-out: 150ms;    /* … saída (sempre mais curta) */
  --dur-panel-in: 300ms;   /* Sheet */
  --dur-panel-out: 220ms;
  --dur-settle: 250ms;     /* card solto assentando na célula */
  --dur-chart: 300ms;      /* séries do Recharts, gauge, barra de progresso */
}

@theme inline {
  /* Curvas da skill (substituem o ease-out fraco do Tailwind: os 3 usos de `ease-out` herdam) */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --ease-out-soft: var(--ease-out); /* alias legado */

  /* `transition-colors` e afins sem duração explícita: 100ms ease (cor de hover) */
  --default-transition-duration: var(--dur-hover);
  --default-transition-timing-function: ease;

  --animate-fade-in: fade-in var(--dur-pop-in) var(--ease-out);
  --animate-fade-out: fade-out var(--dur-pop-out) var(--ease-out);
  --animate-scrim-out: fade-out var(--dur-panel-out) var(--ease-out);
  --animate-pop-in: pop-in var(--dur-pop-in) var(--ease-out);
  --animate-pop-out: pop-out var(--dur-pop-out) var(--ease-out);
  --animate-dialog-in: dialog-in var(--dur-pop-in) var(--ease-out);
  --animate-dialog-out: dialog-out var(--dur-pop-out) var(--ease-out);
  --animate-sheet-in: sheet-in var(--dur-panel-in) var(--ease-drawer);
  --animate-sheet-out: sheet-out var(--dur-panel-out) var(--ease-drawer);
  --animate-shimmer: shimmer 1.4s ease-in-out infinite;
}

@keyframes fade-in { from { opacity: 0; } }
@keyframes fade-out { to { opacity: 0; } }
/* Propriedades individuais (scale/translate) não brigam com as utilities de translate do Tailwind v4 */
@keyframes pop-in { from { opacity: 0; scale: 0.96; } }
@keyframes pop-out { to { opacity: 0; scale: 0.96; } }
@keyframes dialog-in { from { opacity: 0; scale: 0.96; } }
@keyframes dialog-out { to { opacity: 0; scale: 0.96; } }
@keyframes sheet-in { from { transform: translateX(100%); } }
@keyframes sheet-out { to { transform: translateX(100%); } }
@keyframes shimmer { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
/* @keyframes pop removido (ver melhoria 5) */

/* Troca de ícone in-place (pago/pendente, concluir tarefa) — skill motion: scale .25→1, opacity, blur 4px */
@layer components {
  .icon-in {
    transition: opacity var(--dur-state) var(--ease-out), scale var(--dur-state) var(--ease-out),
      filter var(--dur-state) var(--ease-out);
  }
  @starting-style {
    .icon-in { opacity: 0; scale: 0.25; filter: blur(4px); }
  }
}
```

### 3.3 Reduced motion (substitui as linhas 399–406)

```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { scroll-behavior: auto !important; }
  /* Transições: mantêm cor/opacity/sombra (comunicam estado); descartam deslocamento e escala */
  *, ::before, ::after {
    transition-property: color, background-color, border-color, outline-color, fill, stroke, opacity, box-shadow !important;
  }
  /* Entradas/saídas: mesmo tempo, só opacity (@keyframes condicionais vencem as de cima) */
  @keyframes pop-in { from { opacity: 0; } }
  @keyframes pop-out { to { opacity: 0; } }
  @keyframes dialog-in { from { opacity: 0; } }
  @keyframes dialog-out { to { opacity: 0; } }
  @keyframes sheet-in { from { opacity: 0; } }
  @keyframes sheet-out { to { opacity: 0; } }
  /* Loops: decorativos param; o spinner (feedback essencial) continua, mais lento */
  .animate-shimmer, .animate-pulse, .ob-loading { animation: none; opacity: 0.7; }
  .animate-spin { animation-duration: 1.5s; }
}
```
O Recharts fica coberto pelo `'auto'` (melhoria 4) e o sonner já se cuida sozinho.

### 3.4 Regras de quando animar (checklist para PR)

1. **Frequência decide.** Atalho de teclado, navegação por setas e digitação: **sem animação**. Hover e listas: só cor, 100ms. Modais, sheets, popovers e toasts: animação padrão. Primeira vez / conquista: delight permitido.
2. **Dê nome ao propósito**: feedback, continuidade espacial, estado, evitar salto brusco ou delight (só no raro). Sem nome, não entra.
3. **Dado lido não se move por estilo**: nada de count-up. Gráficos com no máximo `--dur-chart`, e esmaecer (opacity) quando o dado está velho.
4. **Propriedades**: `opacity`, `transform`/`translate`/`scale`/`rotate` e `clip-path`. Nunca `width`/`height`/`top`/`left` (exceção: accordion). Nunca `transition` genérico: liste as propriedades. No Tailwind v4, inclua `translate`/`scale`/`rotate` na lista quando usar essas utilities.
5. **Curvas**: entrar e sair com `--ease-out`; mover na tela com `--ease-in-out`; painéis com `--ease-drawer`; cor com `ease`; progresso com `linear`. Nunca `ease-in`.
6. **Durações**: apenas os tokens `--dur-*`. Nada iniciado pelo usuário passa de 300ms, exceto o Sheet. A saída é sempre mais curta que a entrada.
7. **Origem**: popover, menu e select escalam de `--radix-*-content-transform-origin`. Modal fica centrado.
8. **Estado alternado usa transição, não keyframe.** Keyframe só para entradas/saídas do Radix (mount/unmount) e para loops.
9. **Reduced motion vem junto** (bloco 3.3): movimento vira crossfade, loops decorativos param.
10. **Gestos**: todo drag tem alternativa por teclado (o painel já tem).

---

## 4. As 6 melhorias mais valiosas (código pronto)

### 1) Consertar a entrada do Modal e dar saída (P1-1)
**Onde:** `components/ui/dialog.tsx:21,31` + keyframes de 3.2.
```tsx
<RDialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out dark:bg-black/55" />
<RDialog.Content
  className={cn(
    'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lg outline-none data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out',
    className,
  )}
```
Diagnóstico: tier ocasional, propósito "evitar salto brusco". Animação CSS (Radix já espera `animationend` para desmontar). Props `opacity` + `scale` (.96), `--ease-out`, 200ms na entrada e 150ms na saída, origem no centro (modal isento).

### 2) Reduced motion correto (P1-2)
**Onde:** `styles/index.css:399-406` → bloco 3.3 inteiro. Acaba com a cintilação do skeleton, do spinner e do `ob-pulse`, mantém fades úteis e transforma Sheet/Modal/popovers em crossfade.

### 3) Sheet e overlays: curva de drawer, saída mais curta, scrim sincronizado (P2-4)
**Onde:** `components/ui/sheet.tsx:35,38` (os tokens de 3.2 já trocam `ease-in` por `--ease-drawer`).
```tsx
<Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-scrim-out dark:bg-black/50" />
<Dialog.Content
  className={cn(
    'fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface shadow-lg outline-none data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out sm:inset-y-2 sm:right-2 sm:rounded-2xl sm:border sm:border-border',
```
Também em `command-palette.tsx:289-290`: **remover** `data-[state=open]:animate-fade-in` do overlay e do conteúdo (⌘K abre instantâneo).
Em `dropdown-menu.tsx:50` e `select.tsx:69`: trocar `transition-colors` por `transition-none` nos itens (destaque por teclado instantâneo).

### 4) Política única de motion para gráficos + gauge (P1-3, P2-7)
**Onde:** `components/charts/chart-utils.tsx` (novo helper) e todas as séries.
```ts
/** Recharts: respeita prefers-reduced-motion ('auto'), curto, desligado enquanto o card é redimensionado. */
export function chartMotion(resizing = false) {
  return { isAnimationActive: resizing ? false : ('auto' as const), animationDuration: 300, animationEasing: 'ease-out' as const };
}
```
```tsx
<Bar yAxisId="money" dataKey="receita" … {...chartMotion(resizing)} />   // cashflow-card.tsx:318,327, trend-widgets.tsx, projection-widget.tsx, analysis-widgets.tsx
<Line type="linear" dataKey="total" … {...chartMotion()} />               // cashflow-tab, comparison-tab, categories-tab, contacts-tab, insights-tab, card-detail
<Pie … {...chartMotion()} />                                              // donut-chart.tsx:99 (700 → 300)
```
Os gráficos que hoje usam `false` (evolução, relatório do cliente, que é impresso) podem continuar assim, mas o ideal é documentar a regra: "telas de impressão = false; o resto = `chartMotion`".

Gauge (`components/charts/gauge.tsx:35-37`), com o knob girando junto com o arco:
```tsx
const deg = (clamped / 1000) * 180;
<path … strokeDasharray={`${progress} ${length}`} style={{ transition: 'stroke-dasharray var(--dur-chart) var(--ease-out)' }} />
<g style={{ transform: `rotate(${deg}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform var(--dur-chart) var(--ease-out)' }}>
  <circle cx={cx - r} cy={cy} r="7" fill="var(--app-surface)" stroke="var(--app-fg)" strokeWidth="2.5" />
</g>
```
ProgressBar (`components/ui/progress-bar.tsx:34`): `translate` em vez de `width`. A ponta direita continua arredondada e a esquerda fica escondida pelo `overflow-hidden` do trilho.
```tsx
<div
  className={cn('h-full w-full rounded-full transition-[translate] duration-(--dur-chart) ease-out', !color && TONES[tone])}
  style={{ translate: `${pct - 100}% 0`, ...(color ? { backgroundColor: color.startsWith('#') ? toneColor(color) : color } : {}) }}
/>
```

### 5) Pressão física + troca de ícone no lugar do "pop" (P2-6, P3-10)
**Button** (`components/ui/button.tsx:8,40`): remover `active:translate-y-px` do primary e trocar a base por:
```ts
'… transition-[background-color,border-color,color,box-shadow,scale] duration-(--dur-press) ease-out active:scale-[0.97] …'
// variant link: acrescentar 'active:scale-100'
```
Barra flutuante (`layout/quick-bar.tsx:14`): acrescentar `transition-[background-color,color,scale] duration-(--dur-press) ease-out active:scale-[0.94]` ao `btn` (ícone pequeno: .94 continua dentro da faixa .95–1.05 da skill, arredondando).

**PaidToggle** (`components/ui/paid-toggle.tsx`): apagar o estado `animate` e o `setTimeout`; o ícone novo monta com `.icon-in` só depois do primeiro render.
```tsx
const mounted = useRef(false);
useEffect(() => { mounted.current = true; }, []);
// …
className={cn('inline-flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,scale] duration-(--dur-press) ease-out active:scale-[0.97] …')}  // sem 'animate-pop'
<Icon key={paid ? 'up' : 'down'} className={cn(size === 'sm' ? 'size-3.5' : 'size-4', mounted.current && 'icon-in')} aria-hidden fill={paid ? 'currentColor' : 'none'} fillOpacity={0.15} />
```
**TaskStatus** (`tasks/components/task-status.tsx:107-113`): mesmo padrão. Tirar `animate-pop` e passar `className={mounted.current ? 'icon-in' : undefined}` ao `TaskStatusGlyph` (que já troca de componente por status e por isso remonta). **Não** colocar `.icon-in` no `Check` de hover (l.115): ele alterna `display` a cada hover e reanimaria dezenas de vezes por dia.
**Tipo da transação** (`transaction-sheet.tsx:667`): só remover `animate-pop`; a cor já indica a seleção.
Sob reduced motion, `scale`/`filter` saem da lista de transição e fica só o fade de opacity.

### 6) Painel: levantar/assentar no drag + esmaecer dado velho (P2-8, P3-11)
**Drag** (`dashboard/layout/widget-grid.tsx:440-449`):
```tsx
<div
  data-widget-id={spec.id}
  data-dragging={dragging || undefined}
  …
  className={cn(
    'group/widget absolute top-0 left-0 min-h-0 min-w-0 rounded-xl transition-[transform,translate] duration-(--dur-settle) ease-out motion-reduce:transition-none',
    dragging && 'pointer-events-none z-30 transition-none',   // a sombra passa para o filho
    resizing && 'z-20 outline-2 outline-offset-2 outline-primary',
  )}
>
```
```css
/* index.css — o filho carrega o "levantar" (o frame já é movido por translate durante o drag) */
[data-widget-id] > * { transition: scale var(--dur-press) var(--ease-out), box-shadow var(--dur-press) var(--ease-out); }
[data-widget-id][data-dragging] > * { scale: 1.02; box-shadow: var(--shadow-lg); }
```
Uma mola de verdade (`motion-spring-for-gestures`) exigiria a lib Motion só para isto. Pela regra "cheapest tool", fica o `--ease-out` forte a 250ms, que retoma do ponto atual se interrompido. O lag no redimensionamento da janela se resolve desligando a transição quando a largura do board muda: um `data-instant` no grid por um quadro, com `[data-instant] [data-widget-id] { transition: none }`.

**Dado velho** (`dashboard/pages/dashboard.tsx:204`):
```tsx
<div
  className={cn('transition-opacity duration-(--dur-state)', dashboard.isPlaceholderData && 'opacity-60 delay-150')}
  aria-busy={dashboard.isPlaceholderData || undefined}
>
  <Overview d={d} loading={dashboard.isPending} … />
</div>
```
O `delay-150` só existe enquanto esmaece: um cache rápido não pisca, e a volta para 100% é imediata.

### 7) (opcional, delight) Confirmação de leitura do onboarding
Momento raro e único para o cliente do escritório. Em `confirm-reading.tsx:16`, aplicar a classe só quando o `ConfirmedReading` **substitui o formulário na mesma sessão**, para não replayar em revisitas (`motion-no-replay-on-entry`):
```css
.ob-done.ob-just { animation: fade-in 300ms var(--ease-out) both; }
.ob-done.ob-just svg { animation: pop-in 400ms 100ms var(--ease-out) both; }
```

---

## 5. Como demonstrar em imagem (3 sequências)

Pré-requisitos: demo servido (hoje há um `python3 -m http.server 8772` em `apps/web/dist-demo`), login pelo botão "Entrar". Desacelere a reprodução com CDP (`Animation.enable` + `Animation.setPlaybackRate({playbackRate: 0.1})`) e capture nos instantes indicados (ms de animação = espera real ÷ 0.1). "Depois" = injetar `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/proposed-inject.css` com `page.addStyleTag({ path })` depois de carregar a rota. Tudo isso está automatizado em `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/demo.mjs`, que já rodei. Os quadros estão em `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/demo/before/` e `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/demo/after/`.

**Atenção na captura:** use screenshot do viewport (ou `clip`), não `fullPage: true`. Reproduzi que o `fullPage` captura as séries animadas do Recharts vazias: o print `antes/financeiro.png` mostra "Fluxo de caixa" sem barras e "Projeção" sem área, embora no DOM as barras tenham altura normal. Com a melhoria 4 aplicada, um contexto `reducedMotion: 'reduce'` também deixa as séries estáticas para a captura.

**A. Modal entrando torto → centrado (melhoria 1)**
- Rota: `#/contas-a-pagar`
- Passos: clicar em `button[aria-label^="Ações de"]` (primeira linha) → item de menu `getByRole('menuitem', { name: /Excluir/ })` → abre o ConfirmDialog "Excluir lançamento que se repete" (`[role=dialog]`).
- Quadros: 0, 40, 90 e 200ms da abertura; depois `Escape` e 0, 50, 100 e 160ms do fechamento.
- O que se vê: **antes**, nos 3 primeiros quadros o diálogo aparece no quadrante superior esquerdo e só no último salta para o centro; ao fechar, some no quadro 0. **Depois**, ele cresce de .96 no centro e sai com fade+scale em 150ms. Folha: `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/sheet-A-open.png`.
- Alternativa determinística (sem depender de dados): injetar um `div` com as mesmas classes do `dialog.tsx:31` e `data-state="open"`. Medido assim: x=272 durante a animação contra x=496 no fim.

**B. Sheet "Nova despesa": scrim que some antes do painel → saída sincronizada (melhoria 3)**
- Rota: `#/financeiro`
- Passos: clicar em `[data-bottom-bar] button[aria-label="Nova despesa"]`; capturar 0, 60, 140 e 320ms; clicar em `getByRole('dialog').getByRole('button', { name: 'Fechar' })`; capturar 0, 60, 120 e 240ms.
- O que se vê no fechamento: **antes**, o fundo volta a 100% no quadro 0 enquanto o painel ainda está na tela (painel "flutuando" sobre a página clara), e a saída acelera no fim (`ease-in`). **Depois**, o escurecimento e o painel saem juntos, com desaceleração de drawer. Folhas: `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/sheet-B-open.png` e `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/sheet-B-close.png`.
- Variação reduced motion: mesmo roteiro com `browser.newContext({ reducedMotion: 'reduce' })` e o bloco 3.3 injetado. O painel deve aparecer por crossfade, sem deslizar.

**C. Drag do card no Personalizar: pegar → arrastar → soltar → assentar (melhoria 6)**
- Rota: `#/financeiro` → clicar em `getByRole('button', { name: /Personalizar/ })`.
- Seletor: `[data-widget-id="fluxo-caixa"] button[aria-label^="Mover"]`; recorte (`clip`) a partir do `[data-widget-grid]`.
- Passos (`page.mouse`): (0) repouso; (1) `down` no grip + mover 12px → "pegou" (depois: card 1.02× com sombra); (2) mover meia largura do board → "arrastando" (alvo tracejado na célula nova); (3) com reprodução a 0.1, `up` e capturar 0, 60, 120 e 250ms → o card assenta na célula com `--ease-out` e a escala volta a 1.
- Folha: `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/sheet-C.png`. Use os quadros individuais em `/tmp/claude-0/-home-user-efficio/b7474d0d-1c85-5ad0-a019-6fbdcb5c3257/scratchpad/motion/demo/after/C-drag-*.png` para ver o "levantar"; na folha reduzida a diferença de 2% fica sutil.

Itens que não pude verificar: a sensação ("feel") dos 300ms do Sheet e da curva de assentamento em hardware real (pedem um teste de 2–5× no inspetor de animação e uma segunda olhada no dia seguinte), Safari, e o `@starting-style` do `.icon-in` em navegadores sem suporte (o ícone apenas troca sem animar).
