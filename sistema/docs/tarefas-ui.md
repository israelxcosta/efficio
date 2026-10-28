# Módulo Tarefas: especificação de UI

> Dono: `ui-saas-designer`. Status: especificação. Nada disto está implementado.
> Base visual: `docs/design-system.md` (a seção **5. Revisão livro-razão** prevalece) e os tokens de
> `apps/web/src/styles/index.css`. Origem funcional: o sistema antigo **Effy** (telas
> `view-solicitacoes`, `view-obrigacoes`, `view-acompanhamento`, `view-relatorios`,
> `view-departamentos`, `view-categorias`, `view-dashboard`, `view-perfil` e o modal de tarefa).
> As funcionalidades são as mesmas do Effy; muda só o design. Sindicatos, financeiro e contrato do
> Effy ficam fora. "Empresa" do Effy é o **cliente** do Efficio (contato `kind = client`, com
> regime) e "usuário" é o **membro** do espaço.

---

## 0. Decisões principais (leitura rápida)

1. **Um item no trilho**: "Tarefas" (`ListChecks`), logo depois do Dashboard. Dentro do módulo,
   uma **subnavegação própria** (`TasksNav`) acima do título leva às 6 páginas. Cada página tem o
   próprio `h1`.
2. **A linha de tarefa é a linha de Contas a pagar** (`TransactionRow`): botão de estado à esquerda
   (no lugar do 👍/👎), ícone neutro da categoria, título com selos, subtítulo truncado, colunas que
   aparecem pela largura do contêiner, vencimento à direita no lugar do valor e menu "⋯".
3. **"Atrasada" é sinal, não estado**: não existe coluna, opção nem selo "Atrasada". O atraso
   aparece uma única vez por objeto, no texto do prazo ("Venceu há 3 dias", em `danger`).
4. **Cor só no que exige atenção**: os estados usam glifos de forma diferente e só dois tons
   (`primary-soft` para "Em andamento", `success-soft` para "Concluída"). Vermelho só para atraso,
   âmbar só para "Urgente" e "Vence hoje". Categorias usam ícone neutro.
5. **"Minhas tarefas" é um escopo, não uma tela**: `Minhas | Meu departamento | Todas`, combinado
   com a visualização `Lista | Quadro | Calendário`. O padrão é Minhas + Lista, agrupada por prazo
   (Atrasadas, Hoje, Próximos 7 dias, Mais tarde, Sem vencimento), como no Effy.
6. **Recorrentes entram na lista como uma linha por tarefa recorrente no mês** ("DCTFWeb · 12 de
   30 clientes pendentes"), e não uma linha por cliente. A linha abre a lista de clientes daquela
   competência, com o mesmo controle de estado da auditoria.
7. **Auditoria mensal**: no desktop, uma **matriz cliente × tarefa recorrente**; cada célula avança
   A fazer → Em andamento → Concluída com um clique. Ao concluir, a célula mostra as iniciais de
   quem concluiu. Para **reabrir** é preciso confirmar num popover, já que a conclusão é registro
   de auditoria. A visão "Por tarefa" e o celular usam acordeão.
8. **Uma forma de salvar por tela**: a tarefa existente salva cada campo sozinha, com atualização
   otimista e o carimbo "Salvo". Criar tarefa é formulário com "Criar tarefa". Cadastros
   (recorrentes, modelos, departamentos, categorias) usam o Sheet com Cancelar e Salvar, como o
   resto do app.
9. **Concluir, mover e alterar o estado na matriz são otimistas, com toast "Desfazer"**
   (`sonner`, o mesmo de "Cards organizados.").
10. **Nenhum token novo.** Tudo sai de `--app-*`, `--brand-*` e da escala `text-micro…text-kpi`.

---

## 1. Vocabulário e dados que a UI usa

| Termo na tela | O que é | Origem (Effy) |
| --- | --- | --- |
| Tarefa | Trabalho avulso: título, descrição, cliente ou **Interna**, responsável, categoria, prioridade, estado, início, vencimento, horário opcional | `Task` |
| Responsável | Membro do espaço que deve fazer | `assignee` |
| Departamento | **Derivado do responsável**, nunca escolhido; mostrado como texto | `deptId` derivado |
| Concluída por / em | Quem clicou e quando (data e hora), que pode não ser o responsável | `concluidaPor/Em` |
| Tarefa recorrente | Definição: nome, descrição, periodicidade (Mensal, Trimestral, Anual), responsável, data-base, aplica-se por regime ou a clientes específicos | `ObligationDef` |
| Competência | Mês `AAAA-MM` em que a recorrente vence (vencimento = dia da data-base, limitado ao fim do mês) | `competencia` |
| Ocorrência | Uma recorrente num mês, cobrindo os clientes a que se aplica (X de Y concluídos) | `recurringAsTasks` |
| Estado na matriz | Cliente × recorrente × competência: A fazer, Em andamento, Concluída | `StatusMatrixEntry` |
| Registro de conclusão | Quem concluiu e quando, por célula; some ao reabrir | `AuditConclusion` |
| Fluxo | Sequência de etapas; a etapa N+1 só vira tarefa quando a N é concluída | `TaskFlow/Step` |
| Modelo de fluxo | Roteiro reaproveitável com prazo relativo em dias; ao aplicar, escolhe-se só o cliente | `TaskFlowTemplate` |
| Compromisso | Tarefa com horário (HH:MM–HH:MM) no dia do vencimento | `horaInicio/Fim` |
| Anotação | Nota pessoal, visível só para quem escreveu | `UserNote` |

**Regras que a UI aplica (iguais às do Effy):**
- Uma tarefa está **atrasada** quando está aberta (A fazer, Em andamento ou Aguardando cliente) e o
  vencimento é anterior a hoje. Tarefa sem vencimento nunca atrasa.
- **Concluídas** (no resumo e nos relatórios) somam concluídas e canceladas. A lista distingue as
  duas pelo glifo e pelo texto.
- Uma ocorrência recorrente só existe para clientes **ativos** cujo início de contrato é anterior
  ou igual à competência. Recorrente sem data-base aparece na auditoria todo mês, mas não nas listas
  nem na agenda.
- O estado da tarefa tem 5 valores (`pendente`, `andamento`, `aguardando_cliente`, `concluida`,
  `cancelada`). A periodicidade tem 3 (o formulário antigo oferecia Semestral e Eventual, mas o
  banco não aceita esses valores).

**Campos que cada linha precisa (para o contrato em `packages/shared`):** id, título, cliente
(`id`, nome fantasia ou razão) ou nulo, departamento (`id`, nome), categoria (`id`, nome, ícone, cor),
responsável (`id`, nome), prioridade, estado, vencimento, horário, `completedAt`, `completedBy`
(nome), contagens (subtarefas feitas/total, comentários, anexos) e, se houver, fluxo (`id`, título,
etapa N de M). A ocorrência recorrente precisa de: id da definição, nome, periodicidade,
competência, vencimento, responsável, departamento e as contagens total, concluídas e em andamento.

---

## 2. Navegação e rotas

### 2.1 Trilho lateral (`components/layout/nav.ts`)

| Campo | Valor |
| --- | --- |
| Posição em `NAV_ITEMS` | **2ª**, logo depois de Dashboard (é a fila de trabalho diária da equipe) |
| `to` | `/tarefas` |
| `label` / `short` | `Tarefas` / `Tarefas` |
| `icon` | `ListChecks` (lucide) |
| `mobile` | `true` |
| `keywords` | `solicitacoes pedidos afazeres prazos kanban quadro obrigacoes recorrentes auditoria fluxos departamentos` |

O item fica ativo em qualquer `/tarefas/*` (`isActivePath` já trata subcaminhos). Em telas baixas,
`splitRail` empurra os últimos itens para o "mais"; como Tarefas fica no topo, continua visível.

### 2.2 Celular (`components/layout/mobile-nav.tsx`)

- **Barra inferior**: `Painel · Tarefas · (+) · Receber · Mais`. Com Tarefas na 2ª posição e
  `mobile: true`, o `slice` atual já produz essa ordem. **Clientes** sai da barra e continua no menu
  "Mais". (Alternativa, se o dono preferir manter Clientes: dar a `NavItem` um campo `mobileOrder`.)
- **Menu do "+"**: um novo item no topo, `Tarefa` (ícone `ListChecks`), separado das ações
  financeiras por `DropdownMenuSeparator`. Ele abre o `TaskSheet` em modo criação.
- **Menu "Mais"**: lista Tarefas (vem de `NAV_ITEMS`). As subpáginas ficam na `TasksNav`.

### 2.3 Barra flutuante, ⌘K e sino

- **`quick-bar.tsx`**: depois de `Fatura`, um separador `h-6 w-px` e o botão `+ Tarefa`, com texto
  em tinta (`text-fg`, sem cor semântica, porque cor fica para receita e despesa) e `WriteGate`.
- **`command-palette.tsx`**: em "Ações", `Nova tarefa`, `Nova tarefa recorrente` e
  `Aplicar modelo de fluxo`; em "Ir para", as 6 páginas do módulo. Busca por título de tarefa num
  grupo "Tarefas" só quando o `/search` da API incluir tarefas (ver §17).
- **`notifications.tsx`**: um grupo "Tarefas" abaixo de "Vencidas" com
  `Atrasadas atribuídas a você (N)`, que leva a `/tarefas?situacao=atrasadas`, e
  `Novos comentários nas suas tarefas`, que abre a tarefa. O contador do sino soma contas vencidas
  e tarefas minhas atrasadas, e o `aria-label` separa as duas:
  `Notificações (3 contas vencidas, 2 tarefas atrasadas)`.

### 2.4 Subnavegação do módulo: `TasksNav`

`features/tasks/components/tasks-nav.tsx`. É a primeira linha de toda página `/tarefas/*`, acima do
`PageHeader`, com `gap-5` como as outras páginas.

| Rota | Rótulo | Ícone |
| --- | --- | --- |
| `/tarefas` | Tarefas | `ListChecks` |
| `/tarefas/recorrentes` | Recorrentes | `Repeat` |
| `/tarefas/auditoria` | Auditoria mensal | `ClipboardCheck` |
| `/tarefas/fluxos` | Fluxos | `Workflow` |
| `/tarefas/relatorios` | Relatórios | `ChartColumn` |
| `/tarefas/cadastros` | Cadastros | `FolderCog` |

- **Visual**: o trilho do `SegmentedControl` variante `subtle` (`bg-bg-subtle rounded-md p-1`), com
  itens `h-8 rounded-[10px] px-3 text-[13px] font-semibold` e ícone de 16px. O item ativo é
  `bg-surface text-fg shadow-xs`; os outros, `text-muted hover:text-fg`.
- **Semântica**: `<nav aria-label="Módulo Tarefas">` com `NavLink` e `aria-current="page"`. Não é
  `radiogroup`: são páginas, então Tab percorre os links e setas não mudam de página.
- **Larguras**: cabe inteira a partir de 768. Abaixo disso, rola na horizontal dentro da própria
  linha (`-mx-1 overflow-x-auto px-1`, como as abas de Relatórios), com o item ativo levado à vista
  (`scrollIntoView({ inline: 'nearest' })`).

### 2.5 Rotas (`app/router.tsx`, páginas com `lazy`)

| Rota | Página (`features/tasks/pages/`) | `h1` | Parâmetros de URL |
| --- | --- | --- | --- |
| `/tarefas` | `tasks.tsx` | Tarefas | `escopo=minhas\|departamento\|todas`, `visao=lista\|quadro\|calendario`, `situacao=abertas\|atrasadas\|aguardando\|concluidas\|todas`, `busca`, `cliente` (id ou `interna`), `responsavel` (id ou `nenhum`), `departamento`, `categoria`, `prioridade`, `tipo=avulsas\|recorrentes\|fluxos`, `mes=AAAA-MM`, `vencimento=AAAA-MM-DD`, `pagina` |
| `/tarefas/recorrentes` | `recurring.tsx` | Tarefas recorrentes | `busca`, `periodicidade`, `departamento`, `responsavel` |
| `/tarefas/auditoria` | `audit.tsx` | Auditoria mensal | `competencia=AAAA-MM`, `visao=cliente\|tarefa`, `regime`, `departamento`, `pendentes=1`, `busca`, `recorrente` (abre a tarefa expandida) |
| `/tarefas/fluxos` | `flows.tsx` | Fluxos de tarefas | `aplicar=<modeloId>` (abre o diálogo) |
| `/tarefas/relatorios` | `task-reports.tsx` | Relatórios de tarefas | os filtros do relatório |
| `/tarefas/cadastros` | `registry.tsx` | Cadastros de tarefas | `aba=departamentos\|categorias` |

- **Abrir uma tarefa de qualquer página do módulo**: `?tarefa=<id>` abre o `TaskSheet` por cima da
  página. `?nova=1` abre em modo criação, aceitando `&vencimento=`, `&cliente=` e `&horario=1`.
  Fechar o Sheet remove o parâmetro com `replace`.
- **Ocorrência recorrente**: `?recorrente=<id>&competencia=AAAA-MM` abre o `RecurringOccurrenceSheet`.
- **Lembrar a escolha**: escopo e visualização ficam salvos em `localStorage`
  (`effinance.tasks.view.v1:<espaço>:<usuário>` = `{ escopo, visao }`), lidos com validação, como
  o layout do dashboard. Os filtros ficam só na URL.

### 2.6 Permissões

Usa o `usePermissions`/`WriteGate` que já existe. Quem só lê (`viewer` ou assinatura inativa) vê
tudo e não altera nada: botões de estado desabilitados com o motivo no tooltip, menus sem itens de
escrita (a coluna continua reservada, como no `RowMenu`) e Sheets em leitura. Ver a pendência sobre
permissão por módulo em §17.

---

## 3. Cor, selos e glifos (só tokens existentes)

### 3.1 Estado da tarefa

O botão à esquerda da linha (`TaskStatusButton`) mostra o estado por **forma** (glifo) e só pinta
os dois estados que importam.

| Estado (valor) | Rótulo | Glifo (`TaskStatusGlyph`, 16px, traço 1,75) | Fundo e cor do botão | Texto na coluna Situação |
| --- | --- | --- | --- | --- |
| `pendente` | A fazer | anel vazio (`Circle`) | `bg-bg-subtle text-muted` | `text-muted` |
| `andamento` | Em andamento | anel com a metade direita cheia (`Contrast`) | `bg-primary-soft text-primary-soft-fg` | `text-brand-text` |
| `aguardando_cliente` | Aguardando cliente | `CirclePause` | `bg-bg-subtle text-muted` | `text-muted` |
| `concluida` | Concluída | `CircleCheck` preenchido (`fill="currentColor" fillOpacity={0.15}`) | `bg-success-soft text-success` | `text-success` |
| `cancelada` | Cancelada | `CircleX` | `bg-bg-subtle text-subtle`, desabilitado | `text-subtle` |
| (derivado) | Atrasada | não tem glifo | não muda | não aparece: vai no prazo, em `danger` |

- **Hover e foco nos estados abertos**: o glifo vira `Check` (prévia da ação) e o fundo vai para
  `bg-success-soft/60`. Tooltip `Concluir`.
- **Concluída**: tooltip `Reabrir`. Ao reabrir, a tarefa volta ao estado anterior à conclusão (o
  Effy guardava `_prevStatus`; sem esse dado, volta para A fazer).
- **Cancelada**: não alterna. Tooltip `Cancelada. Reabra pelo menu`.

### 3.2 Estado na matriz da auditoria (`MatrixStatusCell`)

| Estado | Visual (célula de 32×32, ou 40×40 em `pointer-coarse`) | Texto acessível |
| --- | --- | --- |
| A fazer | anel `border border-border-strong`, vazio | "A fazer" |
| Em andamento | `bg-primary-soft text-primary-soft-fg`, glifo `Contrast` | "Em andamento" |
| Concluída | pílula `bg-success-soft text-success` com `Check` e as **iniciais de quem concluiu** (`text-mini font-semibold`, 52px de largura) | "Concluída por Ana Paula Ribeiro em 12/10/2026 às 14:32" |
| Não se aplica | `—` em `text-subtle`, sem botão | "Não se aplica" |

O atraso na matriz é **da coluna** (todos os clientes têm o mesmo vencimento na competência). Por
isso ele aparece uma vez, no cabeçalho da coluna ("Venceu há 8 dias", em `danger`), e as células
continuam neutras. Uma coluna inteira de vermelho seria textura, não sinal.

### 3.3 Prioridade (`PriorityBadge`)

| Prioridade | Na linha e no cartão | No detalhe e nos filtros |
| --- | --- | --- |
| Urgente | `Badge tone="warning"` com `ChevronsUp` e "Urgente" | o mesmo |
| Alta | `Badge tone="neutral"` com `ChevronUp` e "Alta" | o mesmo |
| Média | nada (é o padrão) | texto "Média" |
| Baixa | nada | `Badge tone="neutral"` com `ChevronDown` e "Baixa" |

A borda colorida por prioridade do Effy (vermelho, âmbar, azul e verde) **sai**. Ordenar por
prioridade é critério de desempate (vencimento primeiro, depois Urgente → Baixa).

### 3.4 Outros selos (todos com `Badge`, `size="sm"`, `shrink-0`)

| Selo | Quando | Tom | Conteúdo |
| --- | --- | --- | --- |
| Recorrente | linha de ocorrência | `neutral` | `Repeat` e "Recorrente". Abaixo de `@md`, só o ícone, com o texto `sr-only` |
| Fluxo | tarefa que é etapa de fluxo | `neutral` | `Workflow` e "Etapa 2/4"; `title` = nome do fluxo |
| Aguardando cliente | estado `aguardando_cliente` **e** coluna Situação oculta | `neutral` | `Hourglass` e "Aguardando cliente" (só o ícone abaixo de `@md`) |
| Cancelada | estado `cancelada` **e** coluna Situação oculta | `neutral` | "Cancelada" |
| Subtarefas | tem subtarefas | texto `text-mini text-muted`, sem pílula | `ListChecks` e "2/5" (só a partir de `@md`) |
| Compromisso | tem horário | vai no prazo, não é selo | "14:00–15:00" |

Regra: **um só texto de estado por linha**. Quando a coluna Situação aparece (a partir de `@4xl`),
os selos "Aguardando cliente" e "Cancelada" somem.

### 3.5 Prazo (`TaskDueLabel`)

Segue o `DueLabel` de `transaction-row.tsx`. Ao lado da data (`beside`) o texto **não repete a
data**. Em linha estreita (`inline`) ele carrega a data curta (`05/10` no ano corrente,
`05/10/25` fora dele).

| Situação | `beside` (ao lado da data) | `inline` (linha estreita) | Classe |
| --- | --- | --- | --- |
| Aberta, vencida | Venceu há N dias | Venceu há N dias | `text-xs font-semibold text-danger` |
| Aberta, vence hoje | Vence hoje (ou "Hoje, 14:00–15:00") | o mesmo | `text-xs font-semibold text-warning` |
| Aberta, amanhã | Vence amanhã | Vence amanhã | `text-xs font-medium text-warning` |
| Aberta, em 2 a 5 dias | Vence em N dias | Vence em N dias | `text-xs font-medium text-warning` |
| Aberta, depois | Vence em N dias | Vence 12/11 | `text-xs text-muted` |
| Sem vencimento | (a data mostra `—`) Sem vencimento | Sem vencimento | `text-xs text-subtle` |
| Concluída no dia do vencimento | Concluída no vencimento | Concluída em 12/10 | `text-xs text-muted` |
| Concluída em outro dia | Concluída em 14/10 | Concluída em 14/10 | `text-xs text-muted` |
| Cancelada | Cancelada | Cancelada | `text-xs text-subtle` |

O tooltip do prazo de uma concluída diz quem concluiu: "Concluída por Bruno Carvalho em 14/10/2026
às 09:12".

### 3.6 Pessoas, clientes e "Interna"

- **`MemberAvatar`** (`components/ui/member-avatar.tsx`): círculo com iniciais (`initials()` de
  `lib/utils.ts`), `bg-primary-soft text-primary-soft-fg font-bold`, igual ao avatar da barra
  lateral e ao dos clientes. Tamanhos: `sm` 24px com texto de 11px, `md` 32px com 12px, `lg` 40px
  com 13px. Nada abaixo de 11px.
- **Sem responsável**: círculo de 24px com borda tracejada (`border border-dashed
  border-border-strong`), `UserRound` em `text-subtle` e o texto "Sem responsável" em `text-subtle`.
- **Pilha de avatares** (departamentos): até 4, `-space-x-1.5`, `ring-2 ring-surface`, e "+N" num
  círculo `bg-bg-subtle text-muted`.
- **Cliente**: nome fantasia, ou a razão social quando não houver fantasia (como em
  `clients-summary.tsx`). **Interna** (sem cliente) é um valor real e aparece como "Interna" em
  `text-subtle`, não como `—`.

### 3.7 Categorias de tarefa

`CategoryIcon` neutro nas listas (`bg-bg-subtle text-muted`). A cor da categoria só aparece no
editor e no seletor (`tinted`), a mesma regra das categorias financeiras.

### 3.8 Gráficos

Uma série por gráfico, em `--app-data`. A parte em aberto vai em `--app-data-soft`, as comparações
em cinza (`--app-chart-neutral`) e o atraso em `--app-danger`, só como sinal. Sem rosca de 6 cores
e sem uma cor por departamento.

---

## 4. Componentes

### 4.1 Reaproveitar (sem mudar a API)

| Componente | Caminho | Uso no módulo |
| --- | --- | --- |
| `PageHeader`, `ErrorState`, `MiniStat` | `components/ui/misc.tsx` | título e descrição de toda página; erro dentro do bloco |
| `Card`, `CardHeader` | `components/ui/card.tsx` | barra de filtros, lista, blocos de relatório |
| `SegmentedControl` | `components/ui/segmented-control.tsx` | escopo, situação, visualização, abas, periodicidade |
| `Select`, `Input`, `Textarea`, `Field` | `components/ui/select.tsx`, `input.tsx` | filtros e formulários |
| `Sheet` | `components/ui/sheet.tsx` | tarefa (`lg`), recorrente (`lg`), modelo e fluxo (`lg`), departamento e categoria (`md`), anotação (`md`), filtros no celular (`md`) |
| `Modal`, `ConfirmDialog` | `components/ui/dialog.tsx` | aplicar modelo, confirmar exclusões |
| `Badge` | `components/ui/badge.tsx` | selos (§3.3 e §3.4) |
| `CategoryIcon` | `components/ui/category-icon.tsx` | ícone da categoria (neutro) |
| `IconPicker`, `ColorPicker` | `components/ui/icon-picker.tsx`, `color-picker.tsx` | categoria de tarefa |
| `Checkbox`, `Switch` | `components/ui/checkbox.tsx`, `switch.tsx` | subtarefas, listas de clientes, "Só com pendências" |
| `EmptyState`, `Skeleton`, `SkeletonRows` | `components/ui/empty-state.tsx`, `skeleton.tsx` | vazios e carregamento |
| `ProgressBar` | `components/ui/progress-bar.tsx` | subtarefas (`size="sm"`, `tone="brand"`) |
| `Tooltip`, `DropdownMenu*` | `components/ui/tooltip.tsx`, `dropdown-menu.tsx` | tooltips e menus "⋯" |
| `PeriodNavigator` | `components/ui/period-navigator.tsx` | competência (`modes={['month']}`) e calendário |
| `PeriodFilter`, `presetRange` | `features/reports/components/period-filter.tsx` | período dos relatórios de tarefas |
| `WidgetCard`, `FitList` | `features/dashboard/layout/widget-card.tsx` | widgets do dashboard |
| `ListSkeleton`, `BodyEmpty` | `features/dashboard/widgets/shared.tsx` | estados dos widgets |
| `ChartBox`, `axisProps`, `CHART_TEXT` | `components/charts/chart-utils.tsx` | gráfico de tarefas por dia |
| `ClientDetailsDialog` | `features/clients/client-details-dialog.tsx` | "Ver dados do cliente" na auditoria (era a lupa do Effy) |
| `WriteGate`, `usePermissions` | `features/auth/permissions.tsx` | permissões |
| `toast` (sonner), `toastError` | `lib/notify.ts` | feedback e desfazer |
| `usePrintInLight` | `features/reports/pages/client-report.tsx` (extrair para `lib/`) | "Imprimir ou salvar PDF" |
| Classe de alternância do resumo (`toggleClass`) | `features/clients/clients-summary.tsx` (extrair) | células do resumo que filtram a lista |

### 4.2 Novos

`features/tasks/` guarda os componentes do módulo. `components/ui/` guarda os genéricos, marcados
com (ui).

| Componente | Props principais | Estados |
| --- | --- | --- |
| `TasksNav` | — (lê a rota) | ativo, hover, foco, rolagem no celular |
| `TaskStatusGlyph` | `status`, `className` | os 5 glifos de §3.1 |
| `TaskStatusButton` | `status`, `onToggle(next)`, `size: 'sm'\|'md'`, `loading`, `disabled`, `disabledReason`, `taskTitle` | os 5 estados, hover (prévia `Check`), "pop" ao alternar, `loading` (opacidade 70%), desabilitado |
| `TaskDueLabel` | `task`, `beside?: boolean` | tabela de §3.5 |
| `PriorityBadge` | `priority`, `show?: 'row'\|'detail'` | §3.3 |
| `MemberAvatar` (ui) | `name`, `size`, `unassigned?` | iniciais, sem responsável |
| `SearchSelect` (ui) | `value`, `onChange`, `options: {value,label,hint?,leading?}[]`, `groups?`, `placeholder`, `searchPlaceholder`, `emptyText`, `size_` | fechado, aberto com busca, vazio ("Nenhum cliente encontrado"), desabilitado. Visual da lista do `Select` (raio xl, sombra lg) com campo de busca no topo, como o `CategoryPicker` |
| `ClientPicker` | sobre `SearchSelect`: `allowInternal`, `allowAll` | "Interna (sem cliente)" fixa no topo, clientes ativos com regime em `text-muted` |
| `MemberPicker` | sobre `SearchSelect`: `allowNone`, `allowAll`, `meFirst` | "Atribuir a mim" no topo, avatar e departamento como dica |
| `TaskRow` | `task`, `density`, `hideAssignee?`, `showDue?`, `muted?` | §5 |
| `RecurringOccurrenceRow` | `occurrence`, `density` | §5.6 |
| `TaskRowMenu` | `task` | itens de §5.4, ou só leitura |
| `TaskGroup` | `title`, `count`, `tone?: 'danger'`, `collapsible`, `children`, `onShowMore?`, `remaining?` | aberto, recolhido, "Mostrar mais (N)" |
| `TasksSummary` | `summary`, `filter`, `onFilter`, `scope` | carregando (esqueleto do mesmo tamanho), zero, com atrasadas |
| `TaskFilters` | estado da URL e `onChange` | 2 linhas no desktop; no celular, botão "Filtros (N)" que abre o Sheet |
| `TaskBoard`, `TaskBoardColumn`, `TaskCard` | `tasks`, `onMove(task, status)` | §7 |
| `TaskCalendar` | `month`, `tasks`, `onCreateAt(date)` | §6.6 |
| `TaskSheet` | `taskId \| null`, `defaults?`, `onOpenChange` | criar, ver e editar, só leitura, carregando, erro, não encontrada |
| `TaskProperties` | `task`, `onPatch(field, value)`, `readOnly` | — |
| `FlowStepper` | `flow` (etapas com estado) | feita, atual, aguardando |
| `SubtaskList` | `taskId`, `items` | vazia, com itens, salvando, erro |
| `AttachmentList` | `taskId`, `items` | vazia, enviando (barra), erro de tamanho ou tipo |
| `CommentThread` | `taskId`, `items` | vazia ("Nenhum comentário ainda."), enviando |
| `SavedStamp` | `state: 'idle'\|'saving'\|'saved'\|'error'` | "Salvando…", "Salvo", "Não foi salvo" (com `aria-live`) |
| `RecurringTaskSheet` | `definition \| null` | criar e editar, validação |
| `RecurringRow` | `definition`, `month` | §9 |
| `RecurringOccurrenceSheet` | `definitionId`, `competence` | lista de clientes com `MatrixStatusCell` |
| `AuditSummary` | `summary`, `filter`, `onFilter` | igual ao `ClientsSummary` |
| `AuditMatrix` | `clients`, `definitions`, `cells`, `onCycle`, `onReopen` | §10 |
| `MatrixStatusCell` | `state`, `concludedBy?`, `concludedAt?`, `onCycle`, `onOpenRecord` | §3.2, salvando |
| `ConclusionPopover` | `record`, `onReopen` | — |
| `AuditAccordion` | `mode: 'cliente'\|'tarefa'`, os dados | recolhido, aberto |
| `FlowTemplateRow`, `FlowTemplateSheet`, `FlowStepsEditor`, `ApplyTemplateDialog`, `FlowBuilderSheet` | §11 | §11 |
| `DepartmentRow`, `DepartmentSheet`, `TaskCategoryRow`, `TaskCategorySheet` | §12 | §12 |
| `BreakdownList` | `rows: {id,label,done,open,overdue}[]`, `max=8`, `onSelect?`, `selected?` | §13 |
| `StatusBar100` | `parts: {label,value,color}[]` | barra 100% de 12px com junções de 2px e a legenda em tabela |
| `NoteSheet` | `note \| null` | criar, editar, excluir |

---

## 5. Linha de tarefa (`TaskRow`)

É o mesmo esqueleto de `TransactionRow`: `@container` em volta,
`group flex items-center gap-3 rounded-lg transition-colors hover:bg-surface-muted`, com
`px-3 py-3 @lg:px-4` no padrão e `px-2 py-2` no compacto.

### 5.1 Anatomia (largura total)

```
[○ estado] [▢ categoria] Título da tarefa  [Urgente] [Etapa 2/4]   │ Cliente        │ ◯ Ana P.  │ Em andamento │   28/10/2026 │ ⋯
                          Abertura · Fiscal                          │ Padaria Pão... │           │              │ Vence hoje   │
```

### 5.2 Colunas por largura do contêiner

| Bloco | Largura | Aparece a partir de | Abaixo disso |
| --- | --- | --- | --- |
| `TaskStatusButton` | 36px (`size-9`), 32px no compacto, 40px em `pointer-coarse` | sempre | — |
| `CategoryIcon` (`md`, `sm` no compacto) | 40 / 32 | `@sm` (384px) | some; o espaço vai para o título |
| Título, selos e subtítulo | `flex-1 min-w-0` | sempre | o título trunca com mínimo de `4.5rem`, como em `TransactionRow` |
| Cliente | `w-44` | `@3xl` (768px); nunca no compacto | vai para o subtítulo |
| Responsável (`MemberAvatar sm` e nome curto "Ana P.") | `w-36` | `@2xl` (672px) | só o avatar, antes do menu (a partir de `@sm`); abaixo de `@sm`, o primeiro nome vai na linha do prazo |
| Situação (texto, §3.1) | `w-32` | `@4xl` (896px); nunca no compacto | selos "Aguardando cliente" e "Cancelada" |
| Vencimento (data `text-[13px] font-medium tabular`, com `TaskDueLabel beside` embaixo) | `w-36 text-right` | `@xl` (576px); no compacto, `@2xl` | linha própria sob o subtítulo, com `TaskDueLabel` inline |
| Menu `⋯` | 32px | sempre | — |

A ordem das colunas fixas é Cliente, Responsável, Situação, Vencimento, Menu. O vencimento fica no
lugar do valor de Contas a pagar porque é o dado-chave da linha. `hideAssignee` (escopo Minhas e
widget "Minhas tarefas") remove a coluna Responsável e o avatar.

**Larguras reais da lista** (Card com `p-1.5`, conteúdo = viewport − trilho de 76px − 48px de
margem):

| Viewport | Contêiner da linha | Colunas visíveis |
| --- | --- | --- |
| 1440 | cerca de 1300px | todas |
| 1024 | cerca de 886px | Cliente, Responsável, Vencimento (Situação vira selo) |
| 768 | cerca de 706px | Responsável e Vencimento (Cliente vai para o subtítulo) |
| 390 | cerca de 344px | estado, título, subtítulo e linha do prazo |

### 5.3 Título, selos e subtítulo

- **Título**: `text-sm font-semibold text-fg truncate`. Em concluída ou cancelada, `text-muted`
  (sem riscado, para continuar legível).
- **Selos**, nesta ordem: Prioridade (Urgente, Alta), Fluxo, Aguardando cliente ou Cancelada
  (quando a coluna Situação está oculta) e a contagem de subtarefas. Abaixo de `@md` ficam só os de
  ação (Urgente e Aguardando cliente, este só com ícone), como em `TransactionRow`.
- **Subtítulo** (`mt-0.5 block truncate text-xs text-muted`): `categoria · cliente`, em que o
  cliente só entra quando a coluna Cliente está oculta. Sem categoria e com o cliente na coluna, o
  subtítulo não aparece e a linha fica mais baixa. Não se usa a descrição no subtítulo.
- **Linha do prazo** (abaixo de `@xl`): `TaskDueLabel` inline e, abaixo de `@sm`,
  ` · Ana` em `text-muted`.

### 5.4 Interações

| Alvo | Ação |
| --- | --- |
| Botão de estado | conclui ou reabre (otimista, toast com "Desfazer", §16). `e.stopPropagation()` |
| Área do título (`<button>` com `flex-1`) | abre o `TaskSheet` (`?tarefa=<id>`) |
| Menu `⋯` (`aria-label="Ações de {título}"`) | **Abrir**, **Mudar situação ›** (subitens com o glifo: A fazer, Em andamento, Aguardando cliente, Concluída, Cancelada), **Atribuir a mim** (se não for o responsável), **Duplicar**, separador, **Excluir** (`tone="danger"`) |
| Hover | `bg-surface-muted`; menu com opacidade de 70% para 100% (como `RowMenu`) |
| Leitura | o título vira `div` e o botão de estado fica desabilitado com o motivo |

### 5.5 Densidade compacta (widgets)

`density="compact"`: `px-2 py-2`; estado `sm` (32px); `CategoryIcon sm` a partir de `@sm`; sem
colunas Cliente e Situação; vencimento em coluna a partir de `@2xl`; responsável só como avatar
(oculto no widget "Minhas tarefas"); selos só Urgente e Fluxo (este só com ícone); menu mantido.
Num widget de 2 colunas (cerca de 610px), o prazo fica em linha. Num de 4 colunas, em coluna.

### 5.6 Linha de ocorrência recorrente (`RecurringOccurrenceRow`)

- **À esquerda**: um **anel de progresso** de 36px, que não é botão. Trilho `stroke-bg-subtle`,
  arco `stroke-data` na fração concluída, 3px. Quando todos os clientes concluíram, vira o glifo
  "Concluída". Tooltip "12 de 30 clientes concluídos".
- **Título**: o nome e o selo Recorrente. **Subtítulo**: "18 de 30 clientes pendentes · Fiscal".
- **Colunas**: Cliente mostra "30 clientes" em `text-muted`; Responsável é o da definição;
  Situação mostra "12/30 concluídas" (`tabular`); Vencimento é o da competência.
- **Clique** em qualquer parte: abre o `RecurringOccurrenceSheet` (§9.4). O menu tem
  **Abrir na auditoria** (`/tarefas/auditoria?visao=tarefa&recorrente=<id>&competencia=<mês>`) e
  **Editar tarefa recorrente**.

### 5.7 Cabeçalho da lista

O mesmo do `TransactionListPage`: `hidden @xl:flex border-b px-5.5 py-2.5 text-xs font-medium
text-muted`, com as colunas "Tarefa" (`flex-1`, depois dos 36 + 40px), "Cliente" (`@3xl`),
"Responsável" (`@2xl`), "Situação" (`@4xl`) e "Vencimento" (`text-right`), mais 32px vazios no
lugar do menu. A frase fica em caixa normal, sem caixa alta.

---

## 6. Tela Tarefas (`/tarefas`)

**Pergunta da tela:** "O que eu (ou o escritório) preciso fazer, e o que já passou do prazo?"
**Achado:** a tarefa atrasada mais antiga do escopo, na célula principal do resumo.
**Ação mais frequente:** concluir uma tarefa (botão na linha) ou criar uma ("Nova tarefa").

### 6.1 Estrutura (de cima para baixo, `flex flex-col gap-5`)

1. `TasksNav`.
2. `PageHeader`
   - `title`: **Tarefas**.
   - `description`, sobre os dados: "Terça-feira, 28 de outubro · atribuídas a você", "… ·
     departamento Fiscal" ou "… · todo o escritório".
   - `actions`: `outline` **Aplicar modelo de fluxo** (`Workflow`), que abre o diálogo de escolha
     de modelo e depois o `ApplyTemplateDialog`, e `primary` **Nova tarefa** (`Plus`). Os dois com
     `WriteGate`.
3. `TasksSummary` (§6.2).
4. `TaskFilters` num `Card className="p-4"` (§6.3).
5. O conteúdo da visualização: Lista (§6.4), Quadro (§7) ou Calendário (§6.6).

### 6.2 Resumo (`TasksSummary`)

É um painel único com divisórias, construído como o `ClientsSummary`
(`overflow-hidden rounded-xl border bg-surface`). Os números saem dos **mesmos filtros da lista,
exceto a situação**, para a contagem e a lista concordarem. Recorrentes contam uma vez por
ocorrência (a linha da lista).

| Célula | Rótulo (`text-body-sm font-medium text-muted`) | Número | Linha de baixo | Clique |
| --- | --- | --- | --- | --- |
| 1 (principal) | Atrasadas, com `Info` e tooltip "Abertas com vencimento antes de hoje." | `tabular text-[32px] font-semibold` (28px entre 1024 e 1279), em `text-danger` se maior que 0 e em tinta se for 0 | se maior que 0: "A mais antiga venceu há 12 dias: **Balancete de setembro** · Padaria Pão Dourado" (o título é um botão `text-brand-text` que abre a tarefa); se 0: "Nada atrasado." | alterna `situacao=atrasadas` (`aria-pressed`) |
| 2 | Em aberto | `text-kpi` | "3 vencem hoje · **5 aguardando cliente**" (o segundo trecho alterna `situacao=aguardando`, com o estilo do link "N inativos") | alterna `situacao=abertas` |
| 3 | Concluídas em outubro | `text-kpi` | "de 25 que vencem no mês (72%)" | alterna `situacao=concluidas` |
| 4 | "Em aberto por responsável" (escopos Departamento e Todas) ou "Em aberto por cliente" (Minhas) | — | até 5 linhas, como as dos regimes: nome (`9rem`), barra `bg-data` sem trilho (a maior ocupa o espaço), contagem em tinta e, se houver, "3 atr." em `text-mini text-danger` | cada linha filtra por responsável ou cliente (`aria-pressed`); clicar de novo limpa |

**Grade**: em `lg`, `grid-cols-[minmax(0,1.15fr)_10rem_10rem_minmax(0,1fr)]`; em `md`, 3 colunas
com a célula 4 embaixo ocupando a largura toda (`md:col-span-3`, linhas em 2 colunas); abaixo de
`md`, a célula 1 ocupa a largura, as células 2 e 3 ficam lado a lado e a célula 4 some (o filtro
continua no Sheet de filtros). **Sem nenhuma tarefa no espaço**, o resumo não aparece e o vazio da
lista leva a primeira ação (como em Clientes).

### 6.3 Filtros (`TaskFilters`)

**Linha 1** (`flex flex-wrap items-center justify-between gap-3`):
- à esquerda, o `SegmentedControl` "Escopo": `Minhas` · `Meu departamento` (oculto se o membro não
  tiver departamento) · `Todas`;
- à direita, o `SegmentedControl size="sm"` "Situação": `Abertas` · `Atrasadas` ·
  `Aguardando cliente` · `Concluídas` · `Todas`. No Quadro ele é trocado por
  `Switch` "Só atrasadas", porque as colunas já são os estados;
- e o `SegmentedControl` "Visualização" só com ícones: `List` (Lista), `SquareKanban` (Quadro) e
  `CalendarDays` (Calendário), com o rótulo em `sr-only` e `title`.

**Linha 2** (`mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto_auto]`):
busca (`Search`, placeholder "Buscar pelo nome da tarefa", espera de 300ms como `useDebounced`),
`ClientPicker` ("Todos os clientes", "Internas", e os clientes), `MemberPicker` ("Todos os
responsáveis", "Sem responsável", oculto em Minhas), `Select` Categoria ("Todas as categorias"),
`Select` Prioridade ("Todas as prioridades"), o botão `outline sm` **Mais filtros** (`ListFilter`,
mostra "(2)" quando há filtros ativos nele; abre um popover com Departamento, só em Todas, Tipo:
"Todas, Avulsas, Recorrentes, Etapas de fluxo", e Mês de vencimento: "Qualquer mês" e os meses com
tarefas mais o atual) e, se houver filtro, `ghost sm` **Limpar** (`X`). Os controles têm 36px
(`size_="sm"`, como em Contas a pagar).

**Celular (390)**: linha 1 com o Escopo em largura total (3 opções cabem); linha 2 com a busca
(`flex-1`), o botão `outline` **Filtros** (com "(N)") e a Visualização. "Filtros" abre um `Sheet`
"Filtros" com Situação (lista de rádios), Cliente, Responsável, Departamento, Categoria,
Prioridade, Tipo e Mês, e no rodapé `ghost` Limpar e `primary` **Ver 23 tarefas** (a contagem é
atualizada ao vivo).

### 6.4 Lista

Um `Card className="@container overflow-hidden"` com o cabeçalho (§5.7) e `p-1.5` com os grupos.

- **Agrupamento** (situação Abertas, Atrasadas ou Aguardando, ordenado por vencimento): grupos
  **Atrasadas** (título em `text-danger`), **Hoje**, **Próximos 7 dias**, **Mais tarde** e
  **Sem vencimento**. Grupos sem itens não aparecem.
  - `TaskGroup`: um `<section aria-labelledby>` com cabeçalho de 36px
    (`px-3 text-body-sm font-semibold`, com a contagem em `text-muted tabular`) e chevron para
    recolher (`aria-expanded`). O estado de recolhido dura a sessão.
  - Cada grupo traz até 50 linhas; depois vem `ghost sm` **Mostrar mais (N)**.
- **Lista simples** (Concluídas e Todas): sem grupos. Concluídas ordena por "concluída em", da mais
  recente para a mais antiga; Todas, por vencimento. Paginação de 50, igual à de Contas a pagar:
  "Página 1 de 3 · 124 tarefas" com ‹ ›.
- Durante uma nova busca (`isPlaceholderData`), a lista fica com `opacity-60`, como hoje.

### 6.5 Estados e textos da tela

| Estado | O que aparece |
| --- | --- |
| Carregando | resumo com esqueletos do tamanho final (como o `ClientsSummary`) e `SkeletonRows rows={6} className="p-3"` na lista; os filtros aparecem na hora |
| Erro | `ErrorState` dentro do Card da lista, com "Tentar novamente"; o resumo some se também falhar |
| Espaço sem nenhuma tarefa nem recorrente | `EmptyState` com `ListChecks`, "Nenhuma tarefa ainda", "Crie tarefas para o escritório, atribua responsáveis e acompanhe os prazos de cada cliente. As tarefas recorrentes do mês também aparecem aqui." e `outline` **Nova tarefa**; abaixo, o `link` **Cadastrar tarefas recorrentes** |
| Minhas, nada aberto | `CircleCheck`, "Nada atribuído a você", "Quando alguém atribuir uma tarefa a você, ela aparece aqui com o prazo." e `outline` **Nova tarefa** |
| Atrasadas vazio | `CircleCheck`, "Nenhuma tarefa atrasada", "Tudo dentro do prazo." (sem ação) |
| Filtros sem resultado | `SearchX`, "Nenhuma tarefa com esses filtros", e `outline` **Limpar filtros** |
| Leitura | sem "Nova tarefa" (`WriteGate`), botões de estado desabilitados com o motivo |

### 6.6 Calendário (`visao=calendario`)

- **A partir de 1024px**: um `PeriodNavigator modes={['month']}` acima de uma grade de 7 colunas
  (Dom a Sáb; a semana começa no domingo, como em `packages/shared`). Cada dia tem no mínimo 112px
  em 1440 e 88px em 1024; o fim de semana usa `bg-surface-muted`; **hoje** tem uma borda superior
  de 2px em `bg-data` e o número em `font-semibold text-fg`.
  - Até 3 itens por dia (2 em 1024): compromissos primeiro ("09:00 Reunião com Clínica Sorriso
    Pleno"), depois por prioridade. Cada item tem 24px, `rounded-sm bg-bg-subtle text-caption
    truncate`; uma tarefa vencida e aberta tem o texto em `text-danger`; uma concluída, em
    `text-muted`.
  - Uma ocorrência recorrente é um item só ("DCTFWeb · 12/30"). "+ N mais" abre um popover com as
    linhas compactas do dia.
  - Ao passar o mouse sobre um dia, aparece "+" (`icon-sm ghost`, `aria-label="Novo compromisso em
    30/10"`, `WriteGate`), que abre o `TaskSheet` com o vencimento naquele dia e o horário
    09:00–10:00 já preenchido, como no Effy.
  - Tarefas sem vencimento não entram; o cabeçalho mostra o link "3 sem vencimento", que volta para
    a lista filtrada.
- **Abaixo de 1024px**: uma **agenda** em lista, com os dias com itens como `TaskGroup`
  ("Qui, 30/10") e linhas compactas; o "+" fica no cabeçalho de cada dia.
- **Vazio do mês**: a grade continua desenhada e mostra uma faixa de uma linha, "Nenhuma tarefa com
  vencimento em novembro."

### 6.7 Responsivo

| | 1440 (conteúdo de 1316px) | 1024 (900px) | 768 (720px, sem trilho) | 390 (358px) |
| --- | --- | --- | --- | --- |
| `TasksNav` | inteira | inteira | inteira | rola na própria linha |
| Cabeçalho | título à esquerda, 2 ações à direita | igual | as ações descem para baixo do título | só **Nova tarefa**; "Aplicar modelo de fluxo" vai para um `⋯` ao lado |
| Resumo | 4 células em linha | 4 células, com o número principal em 28px | 3 células e a lista por responsável embaixo | célula 1 inteira, depois 2 e 3; lista oculta |
| Filtros | 2 linhas | linha 2 em 2 colunas | linha 2 em 2 colunas | escopo, busca, "Filtros (N)" e visualização |
| Lista | todas as colunas | sem Situação | sem Cliente e sem Situação | estado, título, subtítulo e prazo em linha |
| Quadro | §7.5 | §7.5 | §7.5 | §7.5 |
| Calendário | grade (3 itens por dia) | grade (2 itens por dia) | agenda | agenda |

---

## 7. Quadro (kanban)

### 7.1 Colunas

As colunas são os estados, na ordem do trabalho: **A fazer**, **Em andamento**, **Aguardando
cliente**, **Concluída** e **Cancelada**. Não há coluna "Atrasada".

- **Trilho da coluna**: `rounded-xl bg-bg-subtle p-2`, direto no fundo da página (sem Card em
  volta), com 16px entre colunas (o mesmo espaçamento do resto).
- **Cabeçalho da coluna** (36px, fixo no topo enquanto a coluna rola): `TaskStatusGlyph`, o nome
  (`text-body-sm font-semibold`), a contagem (`text-muted tabular`) e, se houver atrasadas,
  ` · 3 atrasadas` em `text-mini font-semibold text-danger`. À direita, o "+" (`icon-sm ghost`,
  `aria-label="Nova tarefa em Em andamento"`, só nas 3 colunas abertas), que abre o `TaskSheet` com
  aquele estado.
- **Concluída**: mostra as concluídas nos **últimos 14 dias**, da mais recente para a mais antiga.
  O rodapé tem o link "Ver todas as concluídas", que leva à lista com `situacao=concluidas`, e a
  contagem do cabeçalho tem o tooltip "Concluídas nos últimos 14 dias".
- **Cancelada**: começa **recolhida** numa faixa de 56px com `CircleX`, a contagem e o botão
  `aria-expanded` "Mostrar canceladas (3)". O texto não é girado. Expandida, fica como as outras.
- **Ordem dentro da coluna**: vencimento, depois prioridade. Não há ordem manual (o Effy também não
  tinha), então arrastar só troca de coluna.
- **Coluna vazia**: caixa tracejada de 64px (`border border-dashed border-border-strong/80
  rounded-lg`) com "Nenhuma tarefa" em `text-caption text-subtle`, que também é alvo para soltar.

### 7.2 Cartão (`TaskCard`)

`rounded-lg border border-border bg-surface p-3`, sem sombra em repouso, `hover:border-border-strong`.

```
Balancete de setembro                       ← text-body-sm font-semibold, até 2 linhas
[Urgente] [Etapa 2/4]                        ← selos (§3.3, §3.4)
▢ Padaria Pão Dourado                        ← Building2 14px + text-caption text-muted truncate ("Interna" em subtle)
Venceu há 3 dias · 25/10      ☑ 2/5  💬 3  ◯AP  ← TaskDueLabel inline; contagens text-mini muted; MemberAvatar sm
```

- **Atrasada**: só o `TaskDueLabel` em `danger`. Não há borda colorida, fundo nem ponto. Na
  coluna Concluída, o prazo vira "Concluída em 14/10".
- **Ocorrência recorrente**: o cartão tem o anel de progresso no lugar do selo e "12/30 clientes".
  Fica na coluna do estado derivado (nenhum concluído: A fazer; alguns: Em andamento; todos:
  Concluída), **não é arrastável** (`aria-disabled`, tooltip "Concluída por cliente: abra para
  marcar") e o clique abre o `RecurringOccurrenceSheet`.
- **Abrir**: um `<button>` cobrindo o cartão abre o `TaskSheet`.
- **Menu** `⋯` (aparece no hover e no foco; sempre visível em `pointer-coarse`): **Mover para ›**
  (os estados), **Atribuir a mim**, **Excluir**. É a alternativa acessível ao arrastar.

### 7.3 Arrastar entre colunas

| Entrada | Comportamento |
| --- | --- |
| Mouse ou caneta | arrastar o cartão inteiro depois de 4px de movimento. O cartão sobe (`shadow-lg`, `ring-1 ring-border-strong`, sem girar); no lugar de origem fica um contorno tracejado da mesma altura; a coluna de destino recebe `bg-primary-soft/50` e uma vaga tracejada na posição em que o cartão vai cair (pela ordenação). Perto da borda do quadro, ele rola sozinho na horizontal. Esc cancela |
| Toque | **só pela alça** (`GripVertical`, no canto do cartão em `pointer-coarse`), a mesma regra do dashboard. Arrastar o resto do cartão rola a página |
| Teclado | Tab até a alça "Mover {título}" e **Espaço** para pegar (anúncio "Balancete de setembro selecionada. Use seta para a esquerda ou direita para escolher a coluna, Espaço para soltar e Esc para cancelar."). **←** e **→** mudam a coluna de destino, com a mesma prévia do mouse e o anúncio "Em andamento, posição 3 de 6". **Espaço** ou **Enter** soltam e **Esc** cancela |
| Ao soltar | atualização otimista, com o toast "Movida para Em andamento." e "Desfazer" (§16). Soltar em Concluída grava quem concluiu e quando; numa etapa de fluxo, o toast fala da próxima etapa |
| Erro | o cartão volta para a coluna original (animação de 200ms) e aparece `toastError` |

Com `prefers-reduced-motion`, nada desliza: o cartão aparece direto na nova coluna.

### 7.4 Contagens

A contagem do cabeçalho é a de cartões visíveis com os filtros atuais (escopo, cliente,
responsável, "Só atrasadas"…) e é recalculada a cada mudança. Mover um cartão atualiza as duas
contagens de forma otimista.

### 7.5 Larguras

| Viewport | Quadro |
| --- | --- |
| 1440 | 4 colunas de cerca de 299px mais Cancelada recolhida (56px): `4 × 299 + 56 + 4 × 16 = 1316`. Tudo cabe |
| 1024 | colunas de 280px; o quadro rola na horizontal dentro do próprio contêiner (`overflow-x-auto`, `scroll-snap-type: x proximity`) e a página nunca rola de lado |
| 768 | o mesmo, com cerca de 2,5 colunas visíveis |
| 390 | **uma coluna por vez**: uma linha de abas que rola (`SegmentedControl size="sm"`, com "A fazer 12", "Em andamento 5"…), seguida dos cartões em largura total. Mover é pelo menu do cartão ("Mover para ›") |

**Carregando**: as colunas e os cabeçalhos aparecem na hora, com 3 esqueletos de 72px por coluna.
**Erro**: um `ErrorState` só, na largura do quadro.

---

## 8. Detalhe e edição da tarefa (`TaskSheet`)

`Sheet width="lg"` (620px; tela cheia abaixo de 640px). Abre por `?tarefa=<id>` ou `?nova=1`.

### 8.1 Tarefa existente: cada campo salva sozinho

- **Título do Sheet**: o nome da tarefa. Ao passar o mouse aparece um lápis; clicar no nome ou em
  "Renomear" troca por um `Input` de 18px; **Enter** salva e **Esc** cancela.
- **Descrição do Sheet**: "Padaria Pão Dourado · Fiscal" ou "Interna · Fiscal".
- **Corpo**, de cima para baixo, com `gap-6` entre seções:
  1. **`TaskProperties`**: uma grade de 2 colunas de `Field` (1 coluna abaixo de 640px), com
     controles de 40px.

     | Campo | Controle | Observação |
     | --- | --- | --- |
     | Situação | `Select` com `TaskStatusGlyph` em cada opção | não existe a opção "Atrasada" |
     | Prioridade | `Select` | Baixa, Média, Alta, Urgente |
     | Responsável | `MemberPicker` (`allowNone`, `meFirst`) | dica: "Departamento: Fiscal (definido pelo responsável)", "Este responsável não tem departamento." ou "Escolha um responsável para definir o departamento." |
     | Cliente | `ClientPicker` (`allowInternal`) | "Interna (sem cliente)" |
     | Vencimento | `Input type="date"` | se vencida e aberta, dica em `danger`: "Venceu há 3 dias" |
     | Categoria | `Select` "Sem categoria" | opções com o `CategoryIcon` colorido (é o seletor) |
     | Horário | botão `ghost sm` **Definir horário**, que mostra dois `Input type="time"` ("das" e "às") e o botão **Remover horário** | erro: "A hora de término deve ser posterior à de início." |
     | Início | `Input type="date"`, opcional, recolhido em **Mais campos** | o campo `startDate` existe, mas o Effy não o mostrava |
  2. **`FlowStepper`** (só em etapa de fluxo): um bloco `rounded-lg bg-surface-muted p-3` com
     "Fluxo: **Abertura de empresa** · etapa 2 de 5" e a lista de etapas. Etapas feitas têm o
     glifo Concluída e "concluída em 25/10" (o clique abre a etapa); a atual tem o próprio glifo e
     "esta tarefa"; as que aguardam têm o anel em `text-subtle` e "começa quando esta for concluída
     · prazo de 3 dias".
  3. **Descrição**: `Textarea` que cresce com o texto ("Descreva o que precisa ser feito…") e
     salva ao perder o foco.
  4. **Subtarefas**: o título "Subtarefas", com "2 de 5" em `text-muted` e um `ProgressBar sm`.
     Cada linha tem `Checkbox`, o texto (riscado e em `text-muted` quando feita) e um `X` que
     aparece no hover e no foco (`aria-label="Remover subtarefa {texto}"`). No fim, o campo
     "Adicionar subtarefa" (`Plus`): **Enter** adiciona e mantém o foco, **Esc** limpa. Vazio:
     "Nenhuma subtarefa."
  5. **Anexos**: o título "Anexos (2)" e o botão `outline sm` **Anexar arquivo** (`Paperclip`). A
     lista tem `FileText`, nome, "48 KB · Ana P. · 12/10", baixar (`Download`) e remover. Arrastar
     um arquivo sobre a seção mostra uma área tracejada "Solte para anexar". Durante o envio, a
     linha mostra uma `ProgressBar sm`. O limite de tamanho vem da API e aparece na dica. Vazio:
     "Nenhum anexo."
  6. **Comentários**: lista com `MemberAvatar md`, nome, tempo relativo ("há 2 h", "ontem",
     "12/10") e o texto (`whitespace-pre-wrap`, sem HTML). No fim fica o campo: avatar, `Textarea`
     "Escreva um comentário…" e o botão `outline sm` **Comentar** (⌘/Ctrl+Enter também envia). O
     comentário entra na lista na hora (otimista); se falhar, volta para o campo com
     `toastError`. Vazio: "Nenhum comentário ainda."
  7. **Rodapé de informações** (`text-caption text-subtle`): "Criada por Ana Paula Ribeiro em
     12/10/2026 · Concluída por Bruno Carvalho em 20/10/2026 às 14:32".
- **Rodapé fixo**: à esquerda, o `SavedStamp`; à direita, um `⋯` (Duplicar, Copiar link, Excluir)
  e o botão principal **Concluir tarefa** (`primary`, `CircleCheck`). Em tarefa concluída ou
  cancelada, ele vira `outline` **Reabrir**. Concluir pelo Sheet tem o mesmo efeito da linha (toast
  com Desfazer) e deixa o Sheet aberto.
- **Salvar sozinho**: cada mudança dispara um PATCH otimista; o carimbo mostra "Salvando…" e depois
  "Salvo". Em erro, o campo volta ao valor anterior, o carimbo diz "Não foi salvo" (em
  `text-danger`) e aparece `toastError`. Não há botão Salvar.

### 8.2 Criar tarefa

- Título "Nova tarefa", descrição "Atribua um responsável e um prazo."
- Corpo: **Nome** (`Input`, `data-autofocus`, placeholder "Ex.: Balancete de setembro,
  Alteração contratual"), `TaskProperties` (Situação já em A fazer, Prioridade em Média e os
  valores vindos da URL, do "+" da coluna ou do dia) e Descrição. Abaixo, a nota em `text-subtle`
  "Subtarefas, anexos e comentários ficam disponíveis depois de criar."
- Rodapé: `ghost` **Cancelar** e `primary` **Criar tarefa**.
- Validação inline: "Informe o nome da tarefa." e a regra do horário.
- Ao criar, o Sheet **continua aberto**, já no modo edição (para adicionar subtarefas e anexos), e
  aparece o toast "Tarefa criada."

### 8.3 Estados

| Estado | Comportamento |
| --- | --- |
| Carregando | as propriedades mostram esqueletos de 40px e as seções, de 3 linhas; o título aparece se já estiver no cache da lista |
| Erro | `ErrorState` no corpo, com "Tentar novamente" |
| Não encontrada (404 ou 400) | `EmptyState` com `ListChecks`, "Tarefa não encontrada", "Ela pode ter sido excluída." e `outline` **Voltar às tarefas** |
| Leitura | controles desabilitados com os valores, sem campo de comentário nem "Anexar", rodapé com o `readOnlyReason` em `text-caption` |
| Excluir | `ConfirmDialog` "Excluir “Balancete de setembro”?", com "Subtarefas, comentários e anexos também serão excluídos. Esta ação não pode ser desfeita." e o botão **Excluir tarefa**. Depois fecha o Sheet e mostra o toast "Tarefa excluída." |

---

## 9. Tarefas recorrentes (`/tarefas/recorrentes`)

**Pergunta da tela:** "Quais obrigações o escritório repete, para quem, e como está o mês?"

### 9.1 Estrutura

1. `TasksNav`.
2. `PageHeader`: **Tarefas recorrentes**, com a descrição "14 tarefas recorrentes · outubro: 182
   de 240 ocorrências concluídas" e a ação `primary` **Nova tarefa recorrente** (`WriteGate`).
3. Filtros num `Card p-4`, em uma linha: busca ("Buscar tarefa recorrente"), `SegmentedControl`
   Periodicidade (Todas · Mensal · Trimestral · Anual), `Select` Departamento, `MemberPicker`
   Responsável e Limpar.
4. Lista num `Card @container` com cabeçalho (a partir de `@xl`): "Tarefa recorrente",
   "Aplica-se a" (`@3xl`), "Responsável" (`@2xl`), "Outubro" (o progresso, `@xl`) e
   "Vencimento" (`text-right`).

### 9.2 Linha (`RecurringRow`), no padrão de §5

- À esquerda, `CategoryIcon` neutro com `Repeat`. Não há botão de estado, porque a definição não
  tem estado.
- Título com o selo da periodicidade (`neutral`: "Mensal", "Trimestral", "Anual"); subtítulo com a
  descrição truncada ou o departamento.
- **Aplica-se a** (`w-44`): "Simples Nacional e MEI · 23 clientes" ou "4 clientes específicos".
- **Responsável** (`w-36`): avatar e nome curto, ou "Sem responsável".
- **Progresso do mês** (`w-36`): "18 de 23" (`tabular`) sobre uma barra de 6px `bg-data` sem
  trilho. Se não ocorre no mês, "Não ocorre em outubro" em `text-subtle`.
- **Vencimento** (`w-36 text-right`): "Dia 20" com "todo mês" embaixo; "Dia 15" com "jan, abr,
  jul, out"; ou "31/05" com "todo ano". Sem data-base: "—" com "sem vencimento".
- O clique abre o `RecurringTaskSheet`. O menu tem **Editar**, **Ver na auditoria**, **Duplicar** e
  **Excluir**.

### 9.3 `RecurringTaskSheet` (`width="lg"`)

Título "Nova tarefa recorrente" ou "Editar tarefa recorrente". Descrição: "Vira uma coluna da
auditoria mensal e uma tarefa por cliente a cada competência." Rodapé: **Cancelar** e **Salvar
tarefa recorrente**.

| Campo | Controle | Texto |
| --- | --- | --- |
| Nome* | `Input` | placeholder "Ex.: DCTFWeb, DAS do Simples, Folha de pagamento" · erro "Informe o nome da tarefa." |
| Descrição | `Textarea` de 2 linhas | "Detalhes ou observações (opcional)" |
| Periodicidade | `SegmentedControl` Mensal · Trimestral · Anual | — |
| Data-base do vencimento | `Input type="date"` | dica calculada: "Vence todo dia 20 (no último dia, em meses mais curtos).", "Vence dia 15 em jan, abr, jul e out." ou "Vence todo ano em 31/05." Sem data: "Sem data-base, a tarefa entra na auditoria todo mês, mas não aparece nas listas nem na agenda." |
| Responsável | `MemberPicker` (`allowNone`: "Sem responsável definido") | dica do departamento, como na tarefa |
| Aplica-se a | `SegmentedControl` **Por regime** · **Clientes específicos** | — |
| (por regime) | `Checkbox` por regime de `TAX_REGIMES`, cada um com "· 18 clientes ativos" em `text-muted` | — |
| (clientes específicos) | busca, lista de `Checkbox` com rolagem própria (`max-h-72`), cada cliente com o regime em `text-muted`, e "N selecionados", **Marcar os visíveis** e **Limpar** | — |
| Resumo | uma linha `text-body-sm`: "Aplica-se a **23 clientes ativos**." | erro: "Escolha ao menos um regime ou cliente." |

**Excluir** (`ConfirmDialog`): "Excluir “DCTFWeb”?" com "O histórico de estados e conclusões desta
tarefa recorrente também será excluído (24 competências). Esta ação não pode ser desfeita." e o
botão **Excluir tarefa recorrente**. Ver §17 sobre arquivar em vez de excluir.

### 9.4 `RecurringOccurrenceSheet` (`width="lg"`)

Abre pela linha de ocorrência (§5.6), pelo cartão ou pelo calendário.

- Título: "DCTFWeb · outubro de 2026". Descrição: "Vence 15/10 · Fiscal · Ana Paula Ribeiro", com
  "Venceu há 13 dias" em `danger` se houver pendentes.
- `headerExtra`: `SegmentedControl` **Pendentes (18)** · **Todos (30)** e a busca de cliente.
- Corpo: uma linha por cliente, com `MatrixStatusCell`, nome (botão que abre o
  `ClientDetailsDialog`), regime em `text-muted` e, se concluída, "Concluída por Ana P. em 12/10,
  14:32" em `text-mini text-muted`.
- Rodapé: `link` **Abrir na auditoria**.

### 9.5 Estados e larguras

- **Vazio**: `Repeat`, "Nenhuma tarefa recorrente", "Cadastre as obrigações que se repetem (DAS,
  DCTFWeb, folha) e diga a quais clientes se aplicam. Elas aparecem na auditoria mensal e nas
  tarefas de cada responsável." e `outline` **Nova tarefa recorrente**.
- **Carregando**: `SkeletonRows`. **Erro**: `ErrorState`. **Sem resultado nos filtros**: "Nenhuma
  tarefa recorrente com esses filtros" e **Limpar filtros**.
- **Larguras**: as colunas seguem §5.2. Em 1024 fica sem "Aplica-se a" (vai para o subtítulo); em
  390, os filtros viram busca e "Filtros (N)".

---

## 10. Auditoria mensal (`/tarefas/auditoria`)

**Pergunta da tela:** "Na competência, o que cada cliente já entregou, o que falta e quem concluiu?"
**Peça própria do produto:** a matriz cliente × tarefa recorrente.

### 10.1 Estrutura

1. `TasksNav`.
2. `PageHeader`
   - **Auditoria mensal**.
   - `description` com o achado: "Outubro de 2026: 182 de 240 concluídas (76%). 12 pendências já
     venceram."
   - `actions`: `PeriodNavigator modes={['month']}` (competência, `?competencia=`). O padrão é o
     mês atual e "Hoje" volta a ele. Tooltip do rótulo: "Competência: mês em que o vencimento cai".
3. `AuditSummary` (como o `ClientsSummary`):

   | Célula | Conteúdo | Clique |
   | --- | --- | --- |
   | Concluídas (principal) | "182 de 240" em 32px, com "76% da competência" embaixo | — |
   | Pendências vencidas | "12", em `text-danger` se maior que 0, com "em 5 clientes" embaixo | liga "Só com pendências" e ordena os clientes com pendência vencida primeiro |
   | Clientes com pendências | "9 de 40" | liga "Só com pendências" |
   | Por departamento | linhas: nome, barra `bg-data` (concluídas sobre o total do departamento) e "64/80" | filtra o departamento (`aria-pressed`) |
4. Barra de ferramentas num `Card p-4`: `SegmentedControl` Visão **Por cliente** · **Por tarefa**,
   busca ("Buscar cliente" ou "Buscar tarefa recorrente", conforme a visão), `Select` Regime
   ("Todos os regimes" e `TAX_REGIME_LABELS`), `Select` Departamento, `Switch` "Só com pendências"
   e **Limpar**.
5. O conteúdo da visão.

### 10.2 Por cliente, a partir de 1024px: `AuditMatrix`

Fica num `Card overflow-hidden` com rolagem própria nos dois eixos. A página nunca rola de lado.

- **Linhas**: clientes ativos que já eram clientes na competência, em ordem alfabética (com "Só com
  pendências", os de pendência vencida vêm primeiro). Cada linha tem 52px.
- **1ª coluna, fixa à esquerda** (264px, `sticky left-0 bg-surface`, com borda direita
  `border-border-strong` quando a tabela está rolada): o nome (`text-sm font-semibold`, botão que
  abre o `ClientDetailsDialog`) e, embaixo, "Simples Nacional · 12.345.678/0001-90" (`text-xs
  text-muted tabular`).
- **Colunas**: as recorrentes que ocorrem na competência, ordenadas pelo dia de vencimento e depois
  pelo nome, com 104px cada. O cabeçalho (72px, fixo no topo) tem o nome curto (até 2 linhas,
  `text-caption font-semibold`, tooltip com o nome completo e o responsável), o prazo da coluna
  ("Vence 20/10", ou "Venceu há 8 dias" em `danger` se houver pendentes) e "18/23"
  (`text-mini tabular text-muted`).
- **Última coluna, fixa à direita** (88px): o progresso do cliente, "7/9" com uma barra de 48px
  `bg-data` embaixo.
- **Células**: `MatrixStatusCell` centralizada (§3.2).
- **Leitura cruzada**: o hover ou foco numa célula realça (`bg-surface-muted`) a linha e o cabeçalho
  da coluna.
- **Sem regras entre colunas**; uma régua de 1px entre linhas (`border-border`).

**Interação da célula**

| Ação | Efeito |
| --- | --- |
| Clique, **Enter** ou **Espaço** numa célula A fazer ou Em andamento | avança: A fazer → Em andamento → Concluída (otimista) |
| Chegar a Concluída | o servidor grava quem concluiu e quando; a célula mostra ✓ e as iniciais; toast "DCTFWeb concluída para Padaria Pão Dourado." com **Desfazer** (volta ao estado anterior e apaga o registro) |
| Clique ou **Enter** numa célula Concluída | abre o `ConclusionPopover`: "Concluída por **Ana Paula Ribeiro** em 12/10/2026 às 14:32" e o botão `outline sm` **Reabrir**, que volta para A fazer, apaga o registro e mostra o toast "DCTFWeb reaberta para Padaria Pão Dourado.". Esc fecha. Reabrir **nunca** acontece num clique só, porque a conclusão é registro de auditoria |
| Teclas **1**, **2** e **3** na célula em foco | definem A fazer, Em andamento ou Concluída direto (em célula Concluída, **1** e **2** abrem o popover) |
| Salvando | a célula fica com `aria-busy` e opacidade de 70%; em erro, volta ao estado anterior e aparece `toastError` |

### 10.3 Por tarefa (todas as larguras): `AuditAccordion mode="tarefa"`

- Cada recorrente da competência é uma linha (padrão de §5) com `CategoryIcon` neutro (`Repeat`),
  o nome e o selo da periodicidade, "Fiscal · Ana Paula" no subtítulo, "18/23" com barra
  `bg-data` e o vencimento à direita (`TaskDueLabel`, em `danger` se vencida com pendentes). O
  chevron fica em `aria-expanded`.
- Aberta, mostra os clientes daquela tarefa, um por linha, com `MatrixStatusCell` à esquerda, o
  nome e o regime, e a linha de conclusão em `text-mini text-muted` ("Concluída por Ana P. em
  12/10, 14:32"). É o mesmo componente do `RecurringOccurrenceSheet`.
- Com "Só com pendências", a tarefa aberta mostra só os clientes pendentes, e somem as tarefas sem
  pendentes.
- `?recorrente=<id>` abre aquela tarefa e rola até ela.

### 10.4 Por cliente abaixo de 1024px (tablet e celular)

`AuditAccordion mode="cliente"`. Cada cliente é uma linha com o avatar de iniciais (36px,
`bg-primary-soft`), o nome, "Simples Nacional · 7 de 9" e uma barra de 64px à direita. Aberta, lista
as recorrentes do cliente com `MatrixStatusCell` de 40px (área de toque), nome, departamento e o
prazo à direita, além da linha de conclusão. A matriz não aparece abaixo de 1024px.

### 10.5 Estados e larguras

| Estado | Texto |
| --- | --- |
| Nenhuma recorrente cadastrada | `ClipboardCheck`, "A auditoria começa pelas tarefas recorrentes", "Cadastre as obrigações do escritório e a quais clientes se aplicam; elas viram as colunas desta tela." e `outline` **Cadastrar tarefas recorrentes** |
| Nenhum cliente ativo | `Building2`, "Nenhum cliente ativo nesta competência" e `outline` **Ir para Clientes** |
| Filtros sem resultado | "Nenhum cliente encontrado para os filtros selecionados." e **Limpar filtros** |
| Tudo concluído (com "Só com pendências") | `CircleCheck`, "Nenhuma pendência em outubro" e "Todas as tarefas recorrentes da competência foram concluídas." |
| Carregando | o cabeçalho da matriz aparece na hora (as colunas vêm das definições); as linhas são esqueletos de 52px |
| Erro | `ErrorState` dentro do Card |

| | 1440 | 1024 | 768 | 390 |
| --- | --- | --- | --- | --- |
| Resumo | 4 células | 4 células | 3 células e departamentos embaixo | 2 × 2, departamentos ocultos |
| Barra de ferramentas | 1 linha | 2 linhas | 2 linhas | Visão em largura total, depois busca e "Filtros (N)" |
| Por cliente | matriz, com cerca de 9 colunas de 104px visíveis e rolagem | matriz, com cerca de 5 colunas visíveis e rolagem | acordeão | acordeão |
| Por tarefa | acordeão | acordeão | acordeão | acordeão |

---

## 11. Fluxos e modelos (`/tarefas/fluxos`)

**Pergunta da tela:** "Que roteiros o escritório reaproveita, e como aplico um a um cliente?"

### 11.1 Estrutura

1. `TasksNav`.
2. `PageHeader`: **Fluxos de tarefas**, com a descrição "Roteiros em etapas: cada etapa vira tarefa
   quando a anterior é concluída. 3 modelos · 5 fluxos em andamento." As ações são `outline`
   **Criar fluxo avulso** e `primary` **Novo modelo**.
3. **Modelos**: `Card` com `CardHeader` "Modelos de fluxo" e a lista.
   - Linha (`FlowTemplateRow`): `CategoryIcon` neutro com `Workflow`; título com o selo "5 etapas";
     subtítulo com a descrição; coluna **Prazo total** (`w-36`, `@2xl`): "até 16 dias" com "somando
     os prazos" embaixo; coluna **Uso** (`w-36`, `@3xl`): "Aplicado 7 vezes" ou "Nunca aplicado";
     botão `outline sm` **Aplicar** sempre visível (é a ação principal da linha, `WriteGate`) e o
     menu (Editar, Duplicar, Excluir). O clique na linha abre o editor.
4. **Em andamento** (opcional, ver §17): `Card` "Fluxos em andamento". Cada linha tem o título
   ("Abertura de empresa · Construtora Vale Verde"), um mini-progresso de etapas (5 pontos de 8px:
   feitas em `bg-data`, a atual com anel `ring-2 ring-data`, as que aguardam em
   `bg-border-strong`) com "Etapa 2 de 5", a tarefa atual (nome, `MemberAvatar sm` e
   `TaskDueLabel`) e o clique abre a tarefa atual.

### 11.2 Editor de modelo (`FlowTemplateSheet`, `width="lg"`)

- Título "Novo modelo de fluxo" ou "Editar modelo de fluxo". Descrição: "O cliente não é definido
  aqui: é escolhido ao aplicar o modelo e vale para todas as etapas."
- Campos: **Nome do modelo*** ("Ex.: Abertura de empresa") e **Descrição** ("Para que serve este
  roteiro").
- **Etapas** (`FlowStepsEditor`), com a dica "O prazo de cada etapa conta em dias corridos a partir
  da conclusão da anterior. Na primeira, conta do dia em que o modelo for aplicado. Use 0 para
  vencer no mesmo dia."
  - Cada etapa é uma linha `rounded-lg border p-3` com a alça `GripVertical`, um círculo com o
    número (24px, `bg-bg-subtle text-mini font-semibold`), **Nome** (`flex-1`, "Nome da tarefa
    desta etapa"), **Prazo** (`Input type="number" min=0 max=365`, 80px, com o sufixo "dias"),
    **Responsável** (`MemberPicker`), **Prioridade** (`Select`) e um `⋯` (Categoria…, Mover para
    cima, Mover para baixo, Remover etapa). Em largura de celular, a linha quebra em duas: nome e,
    embaixo, prazo, responsável e prioridade.
  - Reordenar arrastando pela alça ou, pelo teclado, com **Alt+↑** e **Alt+↓** na alça (anúncio
    "Etapa movida para a posição 2 de 5").
  - `ghost` **+ Adicionar etapa**, que já vem com 1 dia de prazo e o foco no nome.
- **Prévia** (`text-caption text-muted`, `bg-surface-muted rounded-lg p-3`): "Se aplicado hoje
  (28/10): a etapa 1 vence em 29/10; as outras contam da conclusão da anterior (+2, +3, +5 e +6
  dias)."
- Validação: "Informe o nome do modelo.", "Adicione pelo menos uma etapa.", "Informe o nome da
  tarefa desta etapa." e "O prazo deve ficar entre 0 e 365 dias."
- Rodapé: **Cancelar** e **Salvar modelo**.

### 11.3 Aplicar modelo (`ApplyTemplateDialog`, `Modal` com `max-w-lg`)

- Título "Aplicar “Abertura de empresa”". Descrição: "A primeira tarefa é criada agora; as outras,
  quando a anterior for concluída."
- **Cliente*** (`ClientPicker`, sem "Interna", "Selecione o cliente…") e **Nome do fluxo**
  (opcional; o padrão é "Abertura de empresa · {cliente}").
- **Tarefas que serão criadas** (lista numerada): "1. Solicitar documentos · Marina S. · vence
  29/10 (criada agora)" e "2. Consulta de viabilidade · Rafael L. · 2 dias após a etapa 1", e
  assim por diante.
- Rodapé: **Cancelar** e `primary` **Aplicar ao cliente**. Erro de validação: "Selecione o cliente
  para aplicar o modelo."
- Ao concluir: fecha e mostra o toast "Modelo aplicado. A primeira tarefa já foi criada." com a
  ação **Ver tarefa**.
- Pelo cabeçalho de Tarefas ("Aplicar modelo de fluxo"), um passo antes aparece um `Modal` com a
  busca e a lista de modelos ("Escolha o modelo").

### 11.4 Fluxo avulso (`FlowBuilderSheet`, `width="lg"`)

- Título "Novo fluxo de tarefas". Descrição: "Cada etapa só aparece para o responsável quando a
  anterior for concluída."
- Campos: **Nome do fluxo*** ("Ex.: Alteração contratual da Padaria Pão Dourado"), **Cliente**
  (`ClientPicker` com "Interna", vale para todas as etapas) e as **Etapas**, no mesmo
  `FlowStepsEditor`. No `⋯` de cada etapa há "Outro cliente…" para quando uma etapa for de outro
  cliente (o Effy permitia um cliente por etapa).
- `Checkbox` "Salvar também como modelo".
- Rodapé: **Cancelar** e **Criar fluxo**. Toast: "Fluxo criado. A primeira tarefa já está com
  Marina."

### 11.5 Estados

- **Sem modelos**: `Workflow`, "Nenhum modelo de fluxo", "Cadastre roteiros como Abertura de
  empresa ou Alteração contratual e aplique a qualquer cliente com um clique." e `outline`
  **Novo modelo**.
- **Sem fluxos em andamento**: uma linha só no Card, "Nenhum fluxo em andamento."
- **Excluir modelo**: "Excluir o modelo “Abertura de empresa”?" com "Os fluxos já aplicados
  continuam; só o roteiro deixa de existir."
- **Larguras**: as colunas seguem §5.2; em 390, "Aplicar" fica visível e as colunas vão para o
  subtítulo ("5 etapas · até 16 dias · aplicado 7 vezes").

---

## 12. Cadastros: departamentos e categorias (`/tarefas/cadastros`)

O `PageHeader` é **Cadastros de tarefas**, e logo abaixo vem um `SegmentedControl` com as abas
**Departamentos** · **Categorias** (`?aba=`). A descrição e a ação mudam com a aba, como em
Relatórios.

### 12.1 Departamentos

- Descrição: "4 departamentos · a tarefa fica no departamento do responsável." Ação: **Novo
  departamento**.
- Linha (`DepartmentRow`): `CategoryIcon` neutro com `UsersRound`; o nome; o subtítulo com os
  membros ("Ana Paula, Bruno e mais 2" ou "Sem membros"); a coluna **Membros** (pilha de avatares,
  `@2xl`); **Em aberto** (`tabular`, com "3 atrasadas" em `text-mini text-danger` embaixo);
  **Recorrentes** (contagem, `@3xl`); e o menu (Editar, Excluir).
- **`DepartmentSheet`** (`md`): **Nome*** ("Ex.: Fiscal") e **Membros**, uma lista com busca, em
  que cada membro aparece com `Checkbox`, avatar, nome e, se estiver em outro departamento, "hoje
  em Contábil" em `text-muted`. Dica: "Cada membro fica em um departamento. Marcar aqui tira o
  membro do departamento atual." Rodapé: **Cancelar** e **Salvar departamento**.
- **Excluir com vínculos** (regra do Effy): um `Modal` informativo "Não é possível excluir Fiscal"
  com "2 membros, 5 tarefas recorrentes e 12 tarefas ainda estão neste departamento. Mova-os antes
  de excluir." e o botão **Entendi**. Sem vínculos: `ConfirmDialog` "Excluir o departamento
  Fiscal?".
- **Vazio**: `UsersRound`, "Nenhum departamento", "Departamentos agrupam os membros (Fiscal, Pessoal,
  Contábil). A tarefa fica no departamento de quem é responsável." e **Novo departamento**.

### 12.2 Categorias de tarefa

- Descrição: "Rótulos para filtrar e analisar as tarefas." Ação: **Nova categoria**.
- Linha: `CategoryIcon` neutro com o ícone da categoria, o nome, o subtítulo "12 tarefas" e o
  menu.
- **`TaskCategorySheet`** (`md`): **Nome*** ("Ex.: Abertura, Alteração, Certidões, Atendimento"),
  **Ícone** (`IconPicker`), **Cor** (`ColorPicker`) e a **Prévia** (`CategoryIcon tinted` com o
  nome).
- **Excluir**: "Excluir a categoria Certidões?" com "12 tarefas ficarão sem categoria."
- **Vazio**: `Tags`, "Nenhuma categoria" e "Categorias são rótulos livres para filtros e
  relatórios."

O departamento de cada membro também pode aparecer em **Configurações → Membros**, como uma coluna
`Select` "Departamento", com o link "Gerenciar departamentos" para esta aba.

---

## 13. Relatórios de tarefas (`/tarefas/relatorios`)

**Pergunta da tela:** "Como o escritório entregou no período, e onde o atraso se concentra?"

### 13.1 Estrutura

1. `TasksNav`.
2. `PageHeader`
   - **Relatórios de tarefas**.
   - Descrição com o achado: "Outubro de 2026: 86 tarefas, 64 concluídas (74%). Fiscal concentra 9
     das 12 atrasadas."
   - Ações: `PeriodFilter` (o mesmo de Relatórios; o padrão é **Mês**), `outline` **Exportar CSV**
     (`Download`) e `outline` **Imprimir ou salvar PDF** (`Printer`, `window.print()` com
     `usePrintInLight`).
3. Filtros num `Card p-4`: Departamento, Responsável, Categoria, Cliente, **Situação** (`Select`
   com grupos, como no Effy: "Em aberto (todas)", "Concluídas (todas)" e "Atrasadas", seguidos de
   A fazer, Em andamento, Aguardando cliente, Concluída e Cancelada), Prioridade, Tipo (Avulsas ou
   Recorrentes) e Limpar.
4. Resumo (um painel com divisórias e 5 células): **Concluídas no período** como principal ("64 de
   86", com "74%" embaixo); **Em aberto** "22"; **Atrasadas** "12" (`danger` se maior que 0);
   **Canceladas** "3"; **Total** "86". As 4 primeiras alternam o filtro de situação
   (`aria-pressed`).
5. Grade de blocos (2 colunas a partir de 1024px, 1 abaixo), cada um num `Card p-5` com
   `CardHeader`:

   | Bloco | Forma | Texto do cabeçalho |
   | --- | --- | --- |
   | Por situação | `StatusBar100`: Concluídas (`data`), Em aberto (`data-soft`), Atrasadas (`danger`), Canceladas (`chart-neutral`), com a legenda em tabela (amostra, nome, quantidade e %) | "Por situação" · "Atrasadas contam à parte de Em aberto" |
   | Por prioridade | `BreakdownList` de 4 linhas | "Por prioridade" |
   | Por departamento | `BreakdownList` | "Por departamento" · "Onde o trabalho e o atraso se concentram" |
   | Por responsável | `BreakdownList`, com o avatar na linha | "Por responsável" |
   | Por categoria | `BreakdownList` | "Por categoria" |
   | Por cliente | `BreakdownList` (até 8 linhas e "Outros (N)") | "Por cliente" |

   A linha do `BreakdownList` (44px) tem o rótulo (`10rem`, truncado), uma barra empilhada de 8px
   com concluídas (`data`), em aberto (`data-soft`) e atrasadas (`danger`), sem trilho e com a
   maior ocupando o espaço, o total em tinta (`tabular`, à direita) e "3 atrasadas" em
   `text-mini text-danger` quando houver. O clique filtra o relatório (`aria-pressed`). A legenda é
   uma linha só no cabeçalho do primeiro bloco da grade, com amostras iguais às marcas.
6. **Detalhamento** (`Card`): o cabeçalho "Detalhamento" com "86 tarefas" à direita. É uma
   **tabela, não uma lista**, porque é o que vai para o PDF e o CSV, com as mesmas colunas: Tarefa,
   Cliente, Departamento, Categoria, Responsável, Prioridade, Vencimento, Situação, Concluída em e
   Concluída por. Cabeçalho em `text-xs text-muted` sem faixa; datas `tabular` à direita; régua de
   1px entre linhas; o cabeçalho fica fixo na rolagem. São 50 linhas por página. O clique numa
   linha abre o `TaskSheet`.

### 13.2 Exportação

- **CSV** com as colunas do detalhamento, `;` como separador, BOM UTF-8 e proteção contra injeção
  de fórmula (prefixar `'` em valores que começam com `= + - @`, tab ou CR, como no Effy). O nome do
  arquivo é `relatorio-tarefas-AAAA-MM-DD.csv` e o toast diz "CSV exportado.". Sem dados, o botão
  fica desabilitado com o tooltip "Não há dados para exportar com os filtros atuais."
- **PDF** (impressão): `@page { size: A4 landscape }` só nesta página. `TasksNav`, filtros e botões
  ficam `print:hidden`. Saem o título, a descrição (com o período), o resumo, os blocos (2 por
  linha) e a tabela, além da nota "Gerado em 28/10/2026 às 15:40."

### 13.3 Estados e larguras

- **Sem tarefas no período**: o resumo mostra zeros (que são dados reais); os blocos ficam com o
  contorno e a frase "Nenhuma tarefa no período."; o detalhamento mostra o `EmptyState` "Nenhuma
  tarefa com vencimento em outubro" com **Ver últimos 3 meses**, que muda o período.
- **Carregando**: esqueletos do tamanho final em cada bloco. **Erro**: `ErrorState` por bloco.
- **Larguras**: em 1440 e 1024, 2 colunas de blocos; em 768, 1 coluna; em 390, os botões de
  exportar vão para um `⋯` ao lado do período, e a tabela vira **linhas de duas linhas** (tarefa e
  situação na primeira; "Padaria Pão Dourado · Ana P. · vence 25/10" na segunda), sem perder campos.

---

## 14. Widgets do dashboard

Ficam num grupo novo em `layout/specs.ts`: `{ id: 'tarefas', title: 'Tarefas' }`, logo depois de
"Honorários e cobrança". Os ids entram em `layout/types.ts`, os componentes em
`features/dashboard/widgets/tasks-widgets.tsx` (com `WidgetCard`) e o registro em
`layout/catalog.tsx`. Os widgets buscam os próprios dados (`useTasksDashboard(month)`), como
`ClientsPortfolioWidget`.

| id | Título | Descrição em "Personalizar" | Padrão / mín. / máx. | Predefinições | Visível por padrão |
| --- | --- | --- | --- | --- | --- |
| `minhas-tarefas` | Minhas tarefas | Suas tarefas atrasadas, de hoje e dos próximos dias. | 2×4 / 1×3 / 4×7 | 2×4, 2×5, 4×4 | sim (espaço empresarial) |
| `tarefas-atrasadas` | Tarefas atrasadas | Tudo o que passou do prazo no escritório, da mais antiga para a mais nova. | 2×3 / 1×3 / 4×6 | 2×3, 2×4 | não |
| `situacao-tarefas` | Situação das tarefas | Concluídas, em aberto e atrasadas na competência, com recorrentes. | 2×3 / 2×3 / 4×4 | 2×3 | não |
| `tarefas-por-dia` | Tarefas por dia | Quanto vence em cada um dos próximos 14 dias. | 2×3 / 2×3 / 4×5 | 2×3, 4×3 | não |
| `processos-departamento` | Processos por departamento | Recorrentes do mês por departamento: feitas, abertas e vencidas. | 2×4 / 2×3 / 4×6 | 2×4 | não |
| `agenda-tarefas` | Agenda | Compromissos e recorrentes dos próximos 15 dias. | 2×4 / 1×3 / 4×7 | 2×4, 2×5 | não |
| `clientes-pendencias` | Clientes com mais pendências | Quem acumula tarefas abertas no seu departamento. | 2×3 / 1×3 / 4×5 | 2×3, 2×4 | não |
| `anotacoes` | Minhas anotações | Notas pessoais, visíveis só para você. | 2×3 / 1×3 / 4×6 | 2×3, 2×4 | não |

**Conteúdo de cada widget**

| id | Corpo | Cabeçalho e ação | Vazio | Alerta (ponto e barra vermelha) |
| --- | --- | --- | --- | --- |
| `minhas-tarefas` | `FitList` de `TaskRow density="compact" hideAssignee`, com as atrasadas primeiro e depois por vencimento; o "+ N tarefa(s)" leva a `/tarefas` | subtítulo "3 atrasadas · 2 para hoje" (o trecho das atrasadas em `text-danger`) ou "Nada atrasado"; ação `SegmentedControl size="sm"` Todas · Hoje · Atrasadas (preferência `minhasFiltro`) | "Nada atribuído a você" e "Tarefas com você como responsável aparecem aqui." | quando há atrasadas minhas |
| `tarefas-atrasadas` | o número em `text-kpi text-danger` com "a mais antiga venceu há 12 dias" e, abaixo, `FitList` compacto com avatar | link "Ver todas", que leva a `?escopo=todas&situacao=atrasadas` | "Nenhuma tarefa atrasada" e "Tudo dentro do prazo no escritório." | quando maior que 0 |
| `situacao-tarefas` | "74% concluídas" em `text-kpi`, `StatusBar100` e a legenda em tabela (Concluídas 64, Em aberto 18, Atrasadas 4) | subtítulo com o mês ativo do dashboard; link "Auditoria" para `?competencia=` | "Nenhuma tarefa em outubro" | — |
| `tarefas-por-dia` | colunas por dia (Recharts com `ChartBox`), hoje em `--app-data` e os outros dias em `--app-data-soft`; eixo Y com inteiros; o rótulo X é "Qui 30"; o clique numa coluna leva a `/tarefas?vencimento=AAAA-MM-DD` | subtítulo "47 nos próximos 14 dias" | eixo desenhado no zero e "Nada vence nos próximos 14 dias." | — |
| `processos-departamento` | `BreakdownList` por departamento (feitas, abertas, vencidas); o clique leva à auditoria filtrada | subtítulo com o mês | "Nenhuma tarefa recorrente no mês" e o link para cadastrar | quando houver vencidas |
| `agenda-tarefas` | dias como grupos ("Qui, 30/10") com linhas compactas; compromissos com horário primeiro; "+" no cabeçalho do dia (`WriteGate`) cria um compromisso | ação `SegmentedControl size="sm"` **Próximos** · **Anteriores** (só o mês corrente, como no Effy) | "Nada na agenda dos próximos 15 dias" | — |
| `clientes-pendencias` | ranking: nome do cliente, barra `bg-data` e "6 abertas · 2 atrasadas" | subtítulo "Departamento Fiscal" | "Nenhum cliente com pendências" | — |
| `anotacoes` | lista com o título, a primeira linha em `text-muted` e "editada há 2 dias"; o clique abre o `NoteSheet` | ação `ghost sm` "+ Nova" | "Nenhuma anotação" e "Guarde lembretes e senhas de portais. Só você vê." | — |

**`NoteSheet`** (`md`): título "Nova anotação" ou "Editar anotação", descrição "Visível somente
para você.", campos **Título*** ("Ex.: Senha do portal da prefeitura", máximo de 200 caracteres) e
**Anotação** (`Textarea` de 8 linhas). Rodapé: **Excluir** à esquerda (só na edição), depois
**Cancelar** e **Salvar**.

Todos os widgets usam `ListSkeleton` ao carregar, `BodyEmpty` quando vazios e `ErrorState` compacto
em erro.

---

## 15. Acessibilidade

| Elemento | Semântica e teclado |
| --- | --- |
| `TasksNav` | `nav` com links e `aria-current="page"`; Tab entre os itens |
| Escopo, Situação, Visualização, Visão | `SegmentedControl` (`radiogroup`, setas ← →, já implementado) |
| Células do resumo que filtram | `button` com `aria-pressed` e `aria-label` com o número: "Atrasadas: 7. Filtrar a lista." |
| Grupo da lista | `section aria-labelledby` com cabeçalho `h2` (visualmente 14px); recolher com `aria-expanded` e `aria-controls` |
| `TaskStatusButton` | `button` com `aria-pressed={concluída}` e `aria-label="{Estado}: {título}. Ativar para concluir."` (ou "…para reabrir."); desabilitado com o motivo no `aria-label` (como o `PaidToggle`) |
| Título da linha | `button` cujo nome é o título; abre o Sheet |
| Menu `⋯` | `aria-label="Ações de {título}"`; "Mudar situação ›" e "Mover para ›" são submenus com itens `menuitemradio`. O wrapper `components/ui/dropdown-menu.tsx` ainda não exporta isso: adicionar `DropdownMenuSub`, `DropdownMenuSubTrigger`, `DropdownMenuSubContent`, `DropdownMenuRadioGroup` e `DropdownMenuRadioItem` (Radix), com o mesmo visual do `DropdownMenuItem` |
| Quadro | cada coluna é `section aria-labelledby` ("A fazer, 12 tarefas, 3 atrasadas"); cartões em `ul`/`li`; a alça é `button` "Mover {título}" com o fluxo de teclado de §7.3; anúncios num `aria-live="polite"` compartilhado |
| Matriz | `role="grid"` com `aria-rowcount` e `aria-colcount`; cabeçalhos com `columnheader` e `rowheader`; foco itinerante (um `tabIndex=0`); **setas** movem uma célula, **Home** e **End** levam ao início ou fim da linha, **Ctrl+Home** à primeira célula; **Enter** ou **Espaço** avançam; **1**, **2** e **3** definem o estado direto; cada mudança anuncia "DCTFWeb, Padaria Pão Dourado: Em andamento." |
| Acordeão | `button aria-expanded aria-controls`; a região aberta tem `role="region"` |
| Sheets e Modais | Radix (foco preso, Esc fecha, o foco volta ao gatilho); o primeiro campo recebe o foco (`data-autofocus`); o `SavedStamp` fica em `aria-live="polite"` |
| Prazo | o texto ("Venceu há 3 dias") carrega o sentido; a cor só reforça |
| Estados | glifos de forma diferente, não só cor; tooltips repetem o nome |
| Gráficos | cada barra e linha tem `aria-label` com os números; o `BreakdownList` é uma lista de botões com o texto completo |
| Áreas de toque | botões de estado e células da matriz com 40px em `pointer-coarse`; linhas com pelo menos 44px de altura |
| Foco | o anel global `:focus-visible` (2px `--app-ring`, offset 2), sem sobrescrever |
| Movimento | 150–200ms (`ease-out-soft`), tudo desligado com `prefers-reduced-motion` (já existe em `index.css`) |
| Contraste | só tokens que passam 4,5:1 (`text-muted`, `text-subtle`, `danger`, `warning` e `success` em texto) |

---

## 16. Microinterações e feedback

**Atualização otimista com desfazer.** Na mutação, `onMutate` atualiza o cache da lista, do
quadro, do resumo e dos widgets; `onError` restaura e chama `toastError(error)`; `onSettled`
invalida as chaves de tarefas e o resumo. Os toasts com "Desfazer" duram 6s
(`toast(msg, { duration: 6000, action: { label: 'Desfazer', onClick } })`).

| Ação | Feedback imediato | Toast |
| --- | --- | --- |
| Concluir (linha, cartão ou Sheet) | o botão faz "pop" (`animate-pop`) e vira verde; **a linha fica no lugar, esmaecida (`opacity-70`), enquanto o toast estiver aberto**, e só depois some (a altura vai a 0 em 200ms) | "Tarefa concluída." com **Desfazer** |
| Concluir etapa de fluxo | igual | "Tarefa concluída. Próxima etapa criada para Rafael: Contrato social (vence 04/11)." com **Ver etapa** (sem desfazer, ver §17) |
| Reabrir | o glifo volta ao estado anterior | "Tarefa reaberta." com **Desfazer** |
| Mover no quadro | o cartão cai na coluna e as contagens mudam | "Movida para Aguardando cliente." com **Desfazer** |
| Mudar situação pelo menu | o glifo muda | "Situação: Em andamento." com **Desfazer** |
| Célula da matriz até Concluída | ✓ com as iniciais e "pop" | "DCTFWeb concluída para Padaria Pão Dourado." com **Desfazer** |
| Célula da matriz (outros passos) | o glifo muda | nenhum (seria barulho a cada clique) |
| Reabrir célula | popover fecha e o glifo volta | "DCTFWeb reaberta para Padaria Pão Dourado." |
| Campo do Sheet | `SavedStamp` com "Salvando…" e depois "Salvo" | nenhum |
| Subtarefa marcada | o `Checkbox` e a barra de progresso andam na hora | nenhum |
| Comentário | aparece na lista na hora | nenhum (erro: `toastError`) |
| Anexo | linha com barra de envio | erro: "Não foi possível anexar: o arquivo passa de 10 MB." (o limite vem da API) |
| Criar tarefa | o Sheet passa para edição | "Tarefa criada." |
| Excluir | confirmação antes | "Tarefa excluída." |
| Aplicar modelo | o diálogo fecha | "Modelo aplicado. A primeira tarefa já foi criada." com **Ver tarefa** |
| Exportar CSV | download | "CSV exportado." |
| Sem permissão | — | o toast global de acesso que já existe (`app-shell.tsx`) |

**Outros detalhes:** o hover das linhas e cartões só troca o fundo ou a borda (sem elevação em
repouso); menus e popovers usam `shadow-lg`; nada tem animação de entrada ao carregar a página;
números que mudam usam `tabular` para não pular; skeletons sem gradiente (`animate-shimmer` de
opacidade, o que já existe).

---

## 17. Pendências para backend e produto

1. **Permissão por módulo.** Hoje `viewer` não escreve nada. Num escritório, quem executa tarefas
   pode não dever ver ou editar o financeiro. O Effy tinha permissão por módulo. Sem isso, a equipe
   operacional precisa ser `editor` e passa a editar o financeiro. Sugestão: uma permissão "Tarefas:
   editar" separada do papel. Decisão de produto, a resolver com `backend-senior` e
   `security-node-api`.
2. **Departamento do membro**: precisa existir no membro do espaço, com a API para listar e alterar
   (§12.1).
3. **Concluir ocorrência recorrente pela lista ou Sheet**: usa o mesmo endpoint da matriz (estado
   por cliente × recorrente × competência). Confirmar que o registro de conclusão é gravado pelo
   servidor com o usuário da sessão.
4. **Desfazer**: precisa que o PATCH de estado aceite voltar ao estado anterior e, na matriz, apague
   o registro de conclusão (o modelo do Effy já faz isso ao sair de "concluído").
5. **Reabrir etapa de fluxo**: o que acontece com a etapa seguinte já criada? Até haver regra, o
   toast de etapa concluída não oferece "Desfazer".
6. **"Fluxos em andamento"** (§11.1, item 4): o Effy retirou essa lista em 01/08/2026 a pedido do
   escritório. Confirmar com o usuário antes de implementar. O módulo funciona sem ela (o fluxo
   aparece no `FlowStepper` da tarefa e no selo "Etapa N/M").
7. **Excluir tarefa recorrente** apaga o histórico da auditoria (cascata no Effy). Considerar
   **arquivar** (some das próximas competências e mantém o passado). Se aceito, a ação vira
   "Arquivar" e o filtro ganha "Arquivadas".
8. **Busca global** (`/search`, ⌘K): incluir tarefas por título.
9. **Notificações** de comentários nas minhas tarefas: endpoint de "atividade recente" (o Effy
   tinha `loadAtividadeRecente`).
10. **Resumos prontos no servidor**: os números de `TasksSummary`, `AuditSummary` e dos widgets
    devem vir calculados, com os mesmos filtros da lista, para os números da tela concordarem.

---

## 18. Checklist de implementação

- [ ] Contrato em `packages/shared` primeiro (tipos de §1, rótulos `TASK_STATUS_LABELS`,
      `TASK_PRIORITY_LABELS`, `RECURRENCE_PERIOD_LABELS`).
- [ ] `nav.ts` (item, posição, `mobile`), `mobile-nav.tsx` (o "+" com Tarefa), `quick-bar.tsx`
      (+ Tarefa), `command-palette.tsx`, `notifications.tsx`.
- [ ] `app/router.tsx`: as 6 rotas com `lazy`.
- [ ] `components/ui/`: `member-avatar.tsx`, `search-select.tsx` e os submenus e o grupo de rádio em
      `dropdown-menu.tsx`.
- [ ] `features/tasks/`: `api.ts` (hooks com `qk`), `pages/`, `components/` (§4.2).
- [ ] Widgets: `types.ts`, `specs.ts` (grupo e especificações), `catalog.tsx`, `tasks-widgets.tsx`.
- [ ] Estados de cada bloco: carregando, vazio, erro e leitura; hover, foco e desabilitado de cada
      controle.
- [ ] Verificação: `node ~/.claude/skills/design-taste-frontend/scripts/lint.mjs --app
      apps/web/src/features/tasks` (0 FAIL) e `inspect.mjs --app` em `/tarefas`,
      `/tarefas/auditoria` e `/tarefas/relatorios`, em 1440, 768 e 390.
- [ ] `pnpm typecheck && pnpm test`.
- [ ] Depois de implementado, levar `TaskRow`, `TaskStatusButton`, `MatrixStatusCell`,
      `MemberAvatar` e `SearchSelect` para a tabela de componentes de `docs/design-system.md`.
