# Módulo Tarefas: especificação de UI

> Dono: `ui-saas-designer`. Status: especificação, revisão 2 (estrutura em duas áreas). Nada disto
> está implementado.
> Base visual: `docs/design-system.md` (a seção **5. Revisão livro-razão** prevalece) e os tokens de
> `apps/web/src/styles/index.css`. Origem funcional: o sistema antigo **Effy** (telas
> `view-solicitacoes`, `view-obrigacoes`, `view-acompanhamento`, `view-relatorios`,
> `view-departamentos`, `view-categorias`, `view-dashboard`, `view-perfil` e o modal de tarefa).
> As funcionalidades são as do Effy e a estrutura também (menu vertical de ícones à esquerda, as
> tarefas como área principal); muda o design. Referências de **estrutura**, não de visual: Onvio e
> Domínio Processos, Tareffa, Gestta e G-Click (painel do colaborador, painel do gestor por
> departamento, responsável e cliente, calendário de obrigações, modelos de processo com etapas,
> prazo legal × meta). Sindicatos e contrato do Effy ficam fora. "Empresa" do Effy é o **cliente**
> do Efficio (contato `kind = client`, com regime), cadastrado só no financeiro, e "usuário" é o
> **membro** do espaço.

**Changelog**

- **Revisão 2 (28/10/2026): estrutura em duas áreas**, a pedido do usuário. Continuam valendo, com
  ajustes pontuais: linha de tarefa (§5), lista, quadro e calendário (§7 e §8), `TaskSheet` (§9),
  auditoria (§11), relatórios (§14), acessibilidade (§16) e microinterações (§17).
  - **Duas áreas**: Gestão de tarefas (raiz, para todos) e Financeiro (só administradores; o papel
    `viewer` aparece como Colaborador), cada uma com o próprio trilho de ícones; botão de troca no
    rodapé do trilho; "Acesso restrito", e não 404, para o colaborador numa URL do financeiro
    (§2.1 a §2.3 e §2.7). A `TasksNav` sai.
  - **Rotas**: Gestão em `/` e `/tarefas/*`; o financeiro mantém as rotas de hoje e só o painel vai
    para `/financeiro` (§2.5). Celular: `Início · Tarefas · (+) · Clientes · Mais`, com a troca de
    área no "Mais" (§2.4).
  - **Permissões por papel**: o colaborador usa Tarefas por completo; cadastros e exclusões só
    administradores; papéis renomeados (§2.6).
  - **Novo §6, Início por departamento.** As seções seguintes desceram um número (Tarefas virou §7 e
    o checklist, §19).
  - **Recorrentes** com departamento, responsável padrão, semanal, prazo legal, meta, regra de dia
    não útil e exceções; cada ocorrência vai para o responsável do cliente no departamento (§10).
    Novo sinal "Fora da meta" e textos de meta e prazo legal (§0, §1 e §3.5).
  - **Contagem** por tarefa por cliente em todas as telas (§0, item 7); canceladas fora de
    "Concluídas" (§1). Departamento escolhido na tarefa; um membro pode estar em mais de um.
  - **Fluxos viram Processos**, com departamento por etapa (§12).
  - **Clientes** da Gestão em leitura, sem honorários, com responsáveis por departamento, ficha e
    definição em lote; **Cadastros** ganha a aba Equipe (§13).
  - **Widgets** de tarefas saem do dashboard financeiro; as anotações vão para o menu do avatar
    (§15). Pendências (§18) e checklist (§19) refeitos.
  - Correção: os dias da semana dos exemplos (28/10/2026 é quarta-feira; 30/10, sexta).

---

## 0. Decisões principais (leitura rápida)

1. **Duas áreas no mesmo app.** **Gestão de tarefas** é a área principal e a página inicial de
   todos após o login. **Financeiro** é o Efficio atual, só para administradores (papéis `owner` e
   `editor`). O papel `viewer` aparece como **Colaborador** e usa a Gestão inteira. Cada área tem o
   próprio trilho de ícones, no mesmo componente de hoje (`sidebar.tsx`, com o "mais").
2. **Troca de área por um botão fixo no rodapé do trilho**, só para administradores: "Financeiro"
   na Gestão e "Gestão de tarefas" no Financeiro, sempre no mesmo lugar. Ele leva à última página
   visitada naquela área. O colaborador nunca vê o financeiro; uma URL financeira mostra **Acesso
   restrito**, não 404.
3. **Rotas com o menor impacto**: a Gestão fica em `/` (Início) e `/tarefas/*`; o financeiro mantém
   todas as rotas atuais e só o painel muda de `/` para `/financeiro` (§2.5).
4. **Início por departamento** (`/`): números do departamento, Minhas tarefas, obrigações da
   competência, carga por responsável e por cliente, com seletor de departamento para
   administradores e para quem está em mais de um. Substitui o dashboard financeiro como página
   inicial.
5. **Clientes vêm do financeiro.** Na Gestão, a tela Clientes é somente leitura e não mostra
   honorários; cadastrar, alterar e inativar continua no financeiro, por administradores. O que é da
   Gestão é o **responsável por departamento de cada cliente**, que distribui as tarefas
   recorrentes.
6. **Recorrentes com prazo legal e meta.** Cada obrigação tem departamento, responsável padrão,
   periodicidade (semanal, mensal, trimestral, anual), prazo legal, meta interna (N dias antes) e
   regra de dia não útil. Cada ocorrência (cliente × competência) vai para o responsável do cliente
   naquele departamento ou, se não houver, para o responsável padrão.
7. **Uma unidade de contagem: a tarefa por cliente.** Uma avulsa conta 1; uma recorrente conta 1 por
   cliente. Início, resumo da lista, quadro, auditoria e relatórios contam do mesmo jeito. As listas
   agrupam as ocorrências da mesma recorrente numa linha, que diz quantos clientes soma; em Minhas,
   só os seus ("DCTFWeb · 8 de 12 dos seus clientes pendentes").
8. **A linha de tarefa é a linha de Contas a pagar** (`TransactionRow`): botão de estado à esquerda
   (no lugar do 👍/👎), ícone neutro da categoria, título com selos, subtítulo truncado, colunas que
   aparecem pela largura do contêiner, prazo à direita no lugar do valor e menu "⋯".
9. **"Atrasada" e "Fora da meta" são sinais, não estados.** Atrasada é a tarefa aberta depois do
   prazo legal (ou do vencimento, na avulsa), em `danger`. Fora da meta é a recorrente aberta depois
   da meta e antes do prazo legal, em `warning`. Cada sinal aparece uma vez por objeto, no texto do
   prazo. Não existe coluna, opção nem selo "Atrasada".
10. **Cor só no que exige atenção**: os estados usam glifos de forma diferente e só dois tons
    (`primary-soft` para "Em andamento", `success-soft` para "Concluída"). Vermelho só para atraso;
    âmbar só para "Urgente", "Vence hoje" e "Fora da meta". Categorias usam ícone neutro.
11. **"Minhas tarefas" é um escopo, não uma tela**: `Minhas | Meu departamento | Todas`, combinado
    com a visualização `Lista | Quadro | Calendário`. O padrão é Minhas + Lista, agrupada por prazo
    (Atrasadas, Fora da meta, Hoje, Próximos 7 dias, Mais tarde, Sem vencimento), como no Effy.
12. **Auditoria mensal**: no desktop, uma **matriz cliente × tarefa recorrente**; cada célula avança
    A fazer → Em andamento → Concluída com um clique e, concluída, mostra as iniciais de quem
    concluiu. **Reabrir** pede confirmação num popover, porque a conclusão é registro de auditoria.
    A visão "Por tarefa" e o celular usam acordeão.
13. **Permissões em duas regras.** O colaborador usa Tarefas por completo (criar, editar, concluir,
    comentar, anexar, mover, marcar na auditoria, aplicar processos); cadastros e exclusões são só
    de administradores. Restrição de **papel** esconde o controle e a página diz uma vez quem
    altera; restrição **temporária** (assinatura inativa) mostra o controle desabilitado com o
    motivo, como hoje.
14. **Uma forma de salvar por tela**: a tarefa existente e os responsáveis de cliente salvam cada
    campo sozinhos, com atualização otimista e o carimbo "Salvo". Criar tarefa é formulário com
    "Criar tarefa". Cadastros (recorrentes, modelos, departamentos, categorias) usam o Sheet com
    Cancelar e Salvar, como o resto do app.
15. **Concluir, mover, alterar o estado na matriz e trocar o responsável de um cliente são
    otimistas, com toast "Desfazer"** (`sonner`, o mesmo de "Cards organizados.").
16. **Nenhum token novo.** Tudo sai de `--app-*`, `--brand-*` e da escala `text-micro…text-kpi`.

---

## 1. Vocabulário e dados que a UI usa

| Termo na tela | O que é | Origem (Effy) |
| --- | --- | --- |
| Gestão de tarefas (Gestão) | Área principal do app: Início, Tarefas, Auditoria, Recorrentes, Processos, Clientes, Relatórios e Cadastros. Visível para todos | o próprio Effy |
| Financeiro | Área com o Efficio atual (contas, extrato, clientes com honorários…). Só administradores | — |
| Administrador | Membro com papel `owner` (aparece como **Proprietário**) ou `editor` (aparece como **Administrador**). Acessa o financeiro e mantém os cadastros | perfil administrador |
| Colaborador | Membro com papel `viewer`. Usa toda a Gestão; não vê o financeiro nem honorários | usuário comum |
| Tarefa | Trabalho avulso: título, descrição, cliente ou **Interna**, departamento, responsável, categoria, prioridade, estado, início, vencimento, horário opcional | `Task` |
| Responsável | Membro do espaço que deve fazer | `assignee` |
| Departamento | Equipe (Fiscal, Pessoal, Contábil). A tarefa e a recorrente **pertencem** a um departamento, escolhido no cadastro; na avulsa, ele vem preenchido com o departamento do responsável quando o responsável está em um só. Um membro pode estar em mais de um departamento | `deptId` |
| Responsável do cliente | Para cada cliente e departamento, o membro que recebe as recorrentes daquele cliente (a "carteira" de cada um) | novo |
| Concluída por / em | Quem clicou e quando (data e hora), que pode não ser o responsável | `concluidaPor/Em` |
| Tarefa recorrente (obrigação) | Definição: nome, descrição, departamento, responsável padrão, periodicidade (Semanal, Mensal, Trimestral, Anual), prazo legal, meta interna, regra de dia não útil, a quem se aplica (regimes e/ou clientes, com exceções) e categoria | `ObligationDef` |
| Prazo legal | Data-limite da obrigação na competência, já ajustada pela regra de dia não útil | data-base |
| Meta | Data em que o escritório quer entregar: N dias corridos antes do prazo legal; se cair em dia não útil, antecipa. Com N = 0, a meta é o próprio prazo legal | novo |
| Data de trabalho | A data que ordena e agrupa as listas: o vencimento (avulsa) ou a meta (ocorrência) | — |
| Competência | Mês `AAAA-MM` em que o prazo legal cai (nas semanais, a semana, de segunda a domingo) | `competencia` |
| Ocorrência | Uma recorrente para um cliente numa competência, com estado, responsável efetivo, prazo legal e meta. As listas agrupam as ocorrências da mesma recorrente numa linha (X de Y concluídas) | `recurringAsTasks` |
| Responsável efetivo | Quem responde pela ocorrência: quem foi atribuído só naquela competência; senão, o responsável do cliente no departamento; senão, o responsável padrão | novo |
| Estado na matriz | Cliente × recorrente × competência: A fazer, Em andamento, Concluída | `StatusMatrixEntry` |
| Registro de conclusão | Quem concluiu e quando, por célula; some ao reabrir | `AuditConclusion` |
| Processo | Sequência de etapas; a etapa N+1 só vira tarefa quando a N é concluída | `TaskFlow/Step` |
| Modelo de processo | Roteiro reaproveitável com prazo relativo em dias; ao aplicar, escolhe-se só o cliente | `TaskFlowTemplate` |
| Compromisso | Tarefa com horário (HH:MM–HH:MM) no dia do vencimento | `horaInicio/Fim` |
| Anotação | Nota pessoal, visível só para quem escreveu | `UserNote` |

**Regras que a UI aplica:**
- Uma tarefa está **atrasada** quando está aberta (A fazer, Em andamento ou Aguardando cliente) e o
  vencimento (avulsa) ou o prazo legal (ocorrência) é anterior a hoje. Tarefa sem vencimento nunca
  atrasa.
- Uma ocorrência está **fora da meta** quando está aberta, a meta é anterior a hoje e o prazo legal
  é hoje ou depois.
- **Concluída no prazo** é a concluída até o vencimento ou o prazo legal, inclusive; depois disso,
  **com atraso**. A meta não entra nessa conta, porque é interna.
- **Concluídas** contam só as concluídas; as **canceladas** têm número próprio. O Effy somava as
  duas; separá-las é o que permite dividir as concluídas em no prazo e com atraso.
- Uma ocorrência só existe para clientes **ativos** cujo início de contrato é anterior ou igual à
  competência. O prazo legal é obrigatório na recorrente (o Effy aceitava recorrente sem data-base;
  ver §18).
- O estado da tarefa tem 5 valores (`pendente`, `andamento`, `aguardando_cliente`, `concluida`,
  `cancelada`). A periodicidade tem 4 (`semanal`, `mensal`, `trimestral`, `anual`); Semestral e
  Eventual, do formulário antigo, continuam fora (o eventual é tarefa avulsa ou processo).

**Campos que cada linha precisa (para o contrato em `packages/shared`):** id, título, cliente
(`id`, nome fantasia ou razão) ou nulo, departamento (`id`, nome), categoria (`id`, nome, ícone, cor),
responsável (`id`, nome), prioridade, estado, vencimento, horário, `completedAt`, `completedBy`
(nome), contagens (subtarefas feitas/total, comentários, anexos) e, se houver, processo (`id`,
título, etapa N de M). A linha agrupada de recorrente precisa de: id da definição, nome,
periodicidade, competência, prazo legal, meta, departamento, as contagens no escopo pedido (total,
concluídas, em andamento, atrasadas, fora da meta) e os responsáveis efetivos com quantas
ocorrências cada um tem. Cada ocorrência por cliente traz cliente, estado, responsável efetivo com
a origem (`manual`, `cliente` ou `padrao`), prazo legal, meta e o registro de conclusão.

---

## 2. Navegação e rotas

### 2.1 Duas áreas

| | Gestão de tarefas | Financeiro |
| --- | --- | --- |
| Quem vê | todos os membros | administradores (`owner`, `editor`) |
| Página inicial | **Início** (`/`) | **Painel financeiro** (`/financeiro`, o dashboard atual) |
| Trilho | `GESTAO_NAV_ITEMS` (§2.2) | `FINANCE_NAV_ITEMS` (o `NAV_ITEMS` de hoje, com o painel em `/financeiro` e o rótulo "Painel financeiro") |
| Barra flutuante (desktop) | Buscar, `+ Tarefa`, `Compromisso`, `Processo` e o sino (§2.8) | a de hoje: Buscar, `+ Despesa`, `+ Receita`, `Transferir`, `Fatura` e o sino |
| Barra inferior (celular) | `Início · Tarefas · (+) · Clientes · Mais` (§2.4) | a de hoje: `Painel · Receber · (+) · Clientes · Mais` |

- **Área de cada rota**: `areaOf(pathname)` em `nav.ts`. `/` e `/tarefas/*` são da Gestão;
  `/financeiro` e os caminhos de `FINANCE_NAV_ITEMS` com subcaminhos (inclui `/cartoes/:id`,
  `/relatorios/cliente/:id` e o antigo `/contatos`) são do Financeiro; `/configuracoes` é comum e
  mantém o trilho da última área usada (para o colaborador, sempre a Gestão). A página 404 também
  usa o trilho da última área.
- **`AppShell`** calcula a área uma vez e a passa a `Sidebar`, `QuickBar`, `MobileNav`,
  `CommandPalette` e `Notifications`. Os componentes são os mesmos nas duas áreas; mudam a lista de
  itens e as ações. `TransactionActionsProvider` e `ImportActionsProvider` continuam no shell, mas
  os Sheets e as consultas deles só montam para administradores.
- **Sem cor por área.** As duas usam os mesmos tokens, sem faixa nem fundo próprio. A área se
  reconhece pelos ícones do trilho, pelo rótulo sob o logotipo (§2.3) e pelo `h1`.
- **Após o login**, todos vão para `/`, ou para o `from` guardado pelo `AppShell` quando o membro
  pode abrir aquela página. Um colaborador com `from` financeiro vai para `/`, e não para "Acesso
  restrito" logo na entrada.

### 2.2 Trilho da Gestão (`GESTAO_NAV_ITEMS` em `components/layout/nav.ts`)

O mesmo `Sidebar` de hoje: 76px, ícones de 20px em botões de 44px a cada 50px, tooltip à direita,
`splitRail` e o botão "mais" com chevron quando a altura não basta. Os itens vão em ordem de uso,
para que o "mais" leve primeiro o que é menos usado:

| # | Rótulo (tooltip, "mais" e ⌘K) | `short` | Rota | Ícone (lucide) | Barra do celular | `keywords` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Início | Início | `/` | `House` | 1ª | `painel resumo departamento hoje minhas` |
| 2 | Tarefas | Tarefas | `/tarefas` (`end`: ativo só nela) | `ListChecks` | 2ª | `solicitacoes pedidos afazeres prazos kanban quadro calendario agenda compromissos` |
| 3 | Auditoria mensal | Auditoria | `/tarefas/auditoria` | `ClipboardCheck` | — | `competencia matriz obrigacoes entregas conclusao acompanhamento` |
| 4 | Tarefas recorrentes | Recorrentes | `/tarefas/recorrentes` | `Repeat` | — | `obrigacoes prazo legal meta das dctfweb folha periodicidade calendario` |
| 5 | Processos | Processos | `/tarefas/processos` | `Workflow` | — | `fluxos modelos etapas roteiro abertura alteracao` |
| 6 | Clientes | Clientes | `/tarefas/clientes` | `Building2` | 3ª | `empresas cnpj regime contatos responsaveis carteira` |
| 7 | Relatórios de tarefas | Relatórios | `/tarefas/relatorios` | `ChartColumn` | — | `produtividade entregas atrasos exportar csv pdf` |
| 8 | Cadastros | Cadastros | `/tarefas/cadastros` | `FolderCog` | — | `departamentos categorias equipe usuarios membros` |

- **`NavItem` ganha `end?: boolean`** (ativo só no caminho exato). O item Tarefas precisa disso,
  porque as outras páginas da Gestão ficam sob `/tarefas/`. O Início já é exato (`isActivePath`
  trata `/`).
- **Rodapé do trilho** (fora da área medida, nunca vai para o "mais"), de cima para baixo: o botão
  de troca de área (só administradores, §2.3), Configurações e o avatar. O menu do avatar ganha
  **Minhas anotações**, que abre o `NotesSheet` (§15), nas duas áreas.
- **Altura**: os 8 itens ocupam 400px. Com logotipo e rodapé, tudo cabe a partir de cerca de 760px
  de altura de janela; abaixo disso, Cadastros e Relatórios vão primeiro para o "mais". Início,
  Tarefas e Auditoria ficam sempre visíveis.
- **Sem contadores no trilho**: as atrasadas aparecem no sino e no Início.
- A `nav` tem `aria-label="Navegação da gestão de tarefas"` (no Financeiro, "Navegação do
  financeiro"). O logotipo leva à página inicial da área atual (`aria-label` "Efficio — início da
  gestão" ou "Efficio — painel financeiro").
- **A `TasksNav` da versão anterior sai**: cada página tem o próprio ícone no trilho. Ficam só as
  subdivisões que já eram controles da página: a visualização Lista, Quadro e Calendário em
  Tarefas e as abas de Cadastros.

### 2.3 Troca de área: botões "Financeiro" e "Gestão de tarefas"

`AreaSwitchButton`, em `sidebar.tsx`.

| | Na Gestão | No Financeiro |
| --- | --- | --- |
| Ícone | `Wallet` | `BriefcaseBusiness` |
| Tooltip e `aria-label` | Ir para o financeiro | Ir para a gestão de tarefas |
| Destino | a última página do financeiro nesta sessão, senão `/financeiro` | a última página da Gestão nesta sessão, senão `/` |

- **Quem vê**: só administradores (`canAccessFinance`). Para o colaborador o botão não existe e o
  rodapé fica com Configurações e o avatar.
- **Lugar**: no rodapé do trilho, acima de Configurações, separado da navegação por um filete
  (`h-px w-6 bg-border`, `my-1`). É o mesmo lugar nas duas áreas, então quem troca sempre encontra
  o botão ali, e ele nunca vai para o "mais".
- **Aparência**: 44×44, `rounded-md bg-surface text-muted ring-1 ring-border shadow-xs`; hover
  `text-fg ring-border-strong`; foco com o anel global; transição de 150ms. Um item do trilho é
  transparente em repouso e só ganha fundo quando ativo. O botão de troca tem fundo e borda sempre,
  para ser lido como "botão que muda de lugar" e não como mais uma página da área. **Nunca fica
  ativo**, porque aponta sempre para a outra área.
- **Rótulo da área**: sob o logotipo, `text-micro font-semibold text-muted`, com "Gestão" ou
  "Financeiro". Só aparece para quem tem as duas áreas (o colaborador só conhece uma). Com o
  rótulo, o logotipo passa de `mb-6` para `mb-5`.
- **Memória**: `sessionStorage` `effinance.area.last.v1:<espaço>:<usuário>` =
  `{ gestao, financeiro }` com o caminho e a query, gravado a cada navegação e lido com
  `safeInternalPath` (precisa ser um caminho da própria área; senão vale a página inicial dela).
  Trocar de espaço limpa.
- **Movimento**: nenhum além da troca de página. O trilho troca os ícones na hora.
- **⌘K**: "Ir para o financeiro" e "Ir para a gestão de tarefas", só para administradores.

### 2.4 Celular (`components/layout/mobile-nav.tsx`)

- **Barra inferior da Gestão**: `Início · Tarefas · (+) · Clientes · Mais`. Os itens com `mobile`
  são Início, Tarefas e Clientes; o `slice` atual (2 antes do "+" e 1 depois) já produz a ordem.
  Clientes fica na barra porque consultar o contato e o responsável de um cliente é o uso típico
  no celular; a auditoria, que no celular é acordeão, fica no "Mais".
- **"+" da Gestão** (`aria-label="Criar"`, `WriteGate scope="tasks"`): menu com **Tarefa**
  (`ListChecks`), **Compromisso** (`CalendarClock`, que abre o `TaskSheet` com o horário
  09:00–10:00 de hoje) e, depois de um `DropdownMenuSeparator`, **Aplicar modelo de processo**
  (`Workflow`).
- **Barra inferior do Financeiro** (administradores): a de hoje, com o "+" de Receita, Despesa,
  Transferência e Investimento.
- **Menu "Mais"** (Sheet "Menu", com a descrição "Gestão de tarefas" ou "Financeiro"), de cima para
  baixo:
  1. **Espaço** (`WorkspaceList`, como hoje).
  2. **Área**, só para administradores: duas linhas de 48px, "Gestão de tarefas"
     (`BriefcaseBusiness`) e "Financeiro" (`Wallet`). A atual tem `bg-primary-soft
     text-primary-soft-fg` e `aria-current="true"`; tocar na outra leva à última página dela e
     fecha o menu.
  3. Separador, **Buscar** e **Notificações** (os grupos do sino, §2.8).
  4. Separador, os itens da área atual (a lista inteira do trilho), **Configurações** e **Minhas
     anotações**.
  5. **Sair**.

### 2.5 Rotas (`app/router.tsx`, páginas com `lazy`)

**Gestão** (páginas em `features/tasks/pages/`):

| Rota | Página | `h1` | Parâmetros de URL |
| --- | --- | --- | --- |
| `/` | `home.tsx` | Início | `departamento=<id>\|todos` |
| `/tarefas` | `tasks.tsx` | Tarefas | `escopo=minhas\|departamento\|todas`, `visao=lista\|quadro\|calendario`, `situacao=abertas\|atrasadas\|aguardando\|concluidas\|todas`, `busca`, `cliente` (id ou `interna`), `responsavel` (id ou `nenhum`), `departamento`, `categoria`, `prioridade`, `tipo=avulsas\|recorrentes\|processos`, `mes=AAAA-MM`, `vencimento=AAAA-MM-DD`, `pagina` |
| `/tarefas/auditoria` | `audit.tsx` | Auditoria mensal | `competencia=AAAA-MM`, `visao=cliente\|tarefa`, `regime`, `departamento`, `responsavel`, `pendentes=1`, `busca`, `recorrente` (abre a tarefa expandida) |
| `/tarefas/recorrentes` | `recurring.tsx` | Tarefas recorrentes | `busca`, `periodicidade`, `departamento`, `responsavel`, `regime` |
| `/tarefas/processos` | `processes.tsx` | Processos | `aplicar=<modeloId>` (abre o diálogo) |
| `/tarefas/clientes` | `clients.tsx` | Clientes | `busca`, `situacao=ativos\|inativos\|todos`, `regime`, `departamento`, `responsavel`, `sem-responsavel=1`, `cliente=<id>` (abre a ficha), `pagina` |
| `/tarefas/relatorios` | `task-reports.tsx` | Relatórios de tarefas | os filtros do relatório |
| `/tarefas/cadastros` | `registry.tsx` | Cadastros | `aba=departamentos\|categorias\|equipe` |

**Financeiro**: `/financeiro` (o `DashboardPage` de hoje, que sai do `index`) e todas as outras
rotas como estão: `/extrato`, `/contas-a-pagar`, `/contas-a-receber`, `/transferencias`, `/contas`,
`/cartoes`, `/cartoes/:id`, `/categorias`, `/metas`, `/clientes`, `/fornecedores`, `/contatos`
(redirecionamento), `/relatorios` e `/relatorios/cliente/:id`. Todas ficam dentro de uma rota de
layout sem caminho, `{ element: <FinanceGate />, children: [...] }` (§2.7). **Comuns**:
`/configuracoes` e `*`.

**Por que o financeiro não ganhou prefixo.** Mantendo as rotas, continuam valendo os 84 caminhos
escritos em 28 arquivos do web (widgets, alertas, links de relatório, `notifications.tsx`,
`quick-bar.tsx`, testes…), os 7 `href` dos insights da API (`apps/api/src/modules/reports/insights.ts`)
e os favoritos dos usuários. Mudam só o `to` do painel em `nav.ts` (`'/'` → `'/financeiro'`) e o
`index` do roteador. As referências a `/` que existem hoje ("Voltar ao início", sair do espaço,
convite aceito) já querem dizer "início do app" e passam a levar ao Início, que é o certo. O custo é
a área não ser só um prefixo: `areaOf` consulta a lista do financeiro, que já existe. As páginas da
Gestão ficam sob `/tarefas/` para nunca colidirem com as do financeiro (`/clientes`, `/relatorios`
e `/categorias` já são dele).

- **Abrir uma tarefa de qualquer página da Gestão**, inclusive do Início: `?tarefa=<id>` abre o
  `TaskSheet` por cima da página. `?nova=1` abre em modo criação, aceitando `&vencimento=`,
  `&cliente=`, `&departamento=` e `&horario=1`. Fechar o Sheet remove o parâmetro com `replace`.
- **Ocorrência recorrente**: `?recorrente=<id>&competencia=AAAA-MM` abre o
  `RecurringOccurrenceSheet`.
- **Lembrar a escolha**: escopo e visualização de Tarefas ficam em `localStorage`
  (`effinance.tasks.view.v1:<espaço>:<usuário>` = `{ escopo, visao }`) e o departamento do Início em
  `effinance.tasks.home.v1:<espaço>:<usuário>` = `{ departamento }`, lidos com validação, como o
  layout do dashboard. Os filtros ficam só na URL.

### 2.6 Permissões

| Ação | Colaborador (`viewer`) | Administrador (`owner`, `editor`) |
| --- | --- | --- |
| Ver todas as páginas da Gestão, em todos os escopos | sim | sim |
| Criar, editar, concluir, reabrir e cancelar tarefa; mover no quadro; subtarefas; comentar; anexar | sim | sim |
| Excluir tarefa | não (usa **Cancelar tarefa**) | sim |
| Remover comentário ou anexo | os próprios | todos |
| Mudar o estado de ocorrências (lista, Sheet, matriz) | sim | sim |
| Reabrir uma célula concluída da auditoria | só as que ele concluiu | todas |
| Atribuir uma ocorrência a outra pessoa só naquela competência | sim | sim |
| Aplicar modelo de processo; criar processo avulso | sim | sim |
| Recorrentes, modelos de processo, departamentos e categorias (criar, editar, excluir) | só vê | sim |
| Responsáveis por departamento dos clientes | só vê | sim |
| Departamentos de cada membro (Cadastros › Equipe) | só vê | sim |
| Papéis e convites | não | o proprietário, em Configurações › Membros (como hoje) |
| Clientes: cadastrar, alterar, inativar | não; vê na Gestão, sem honorários | sim, no Financeiro |
| Financeiro (qualquer página, inclusive leitura) | não: Acesso restrito (§2.7) | sim |
| Exportar relatórios de tarefas | sim | sim |

- **`usePermissions()`** ganha `isAdmin` (`owner` ou `editor`), `canAccessFinance` (o mesmo, espelho
  do `canAccessFinance` de `apps/api/src/lib/finance-access.ts`), `canWriteTasks` (assinatura ativa,
  qualquer papel) e `canManage` (`isAdmin` e assinatura ativa). `canWrite` continua valendo para o
  financeiro.
- **`WriteGate` ganha `scope?: 'finance' | 'tasks' | 'admin'`** (padrão `finance`, que é o
  comportamento de hoje). Na Gestão, `tasks` vale para o trabalho do dia a dia e `admin` para
  cadastros e exclusões.
- **Dois tipos de bloqueio, dois tratamentos:**
  1. **Por papel (permanente)**: o controle **não aparece** para o colaborador (botões de criar
     dos cadastros, "Excluir" nos menus, seletores de responsável, que viram texto). A página diz
     isso uma vez, na descrição do `PageHeader`: "Somente administradores alteram este cadastro."
     Um botão desabilitado para sempre seria ruído em toda visita.
  2. **Por assinatura inativa (temporário, para todos)**: o controle aparece desabilitado com o
     motivo no tooltip (`SUBSCRIPTION_REASON`), como hoje.
- **Textos**: `ADMIN_ONLY_REASON = 'Somente administradores alteram este cadastro.'` e
  `FINANCE_ONLY_REASON = 'O financeiro é restrito aos administradores do espaço.'` (o mesmo texto de
  `FINANCE_FORBIDDEN_MESSAGE` na API). `VIEWER_REASON` ("somente leitura") deixa de ser verdade para
  o colaborador e sai. O toast global de 403 em `app-shell.tsx` passa a mostrar a mensagem do
  servidor para todos os papéis.
- **Nomes dos papéis** (`MEMBER_ROLE_LABELS` e `MEMBER_ROLE_HINTS` em `packages/shared/src/saas.ts`),
  os mesmos na Equipe e em Configurações › Membros:

  | Papel | Rótulo | Dica |
  | --- | --- | --- |
  | `owner` | Proprietário | Administrador com controle da assinatura, dos membros e do espaço |
  | `editor` | Administrador | Acessa o financeiro e mantém clientes e cadastros da gestão |
  | `viewer` | Colaborador | Usa toda a gestão de tarefas; não vê o financeiro nem honorários |

- **Configurações para o colaborador**: Perfil, Segurança, Membros (lista, sem editar) e
  Privacidade. **Integrações** (Open Finance e importações) some, porque é do financeiro.

### 2.7 Acesso restrito (colaborador numa URL do financeiro)

`FinanceGate` envolve as rotas do financeiro. Para administradores, só renderiza o `Outlet`. Para o
colaborador:

- O trilho é o da Gestão, sem item ativo. A URL **não muda** (sem redirecionar): se o papel mudar e o
  `refreshMe` trouxer o novo papel, a página abre ali mesmo.
- O conteúdo segue o molde do `NotFound` (centralizado, `py-24 text-center`): `LockKeyhole` de 20px
  num círculo neutro de 40px (`bg-bg-subtle text-muted`); `h1` **Acesso restrito** (`text-2xl
  font-semibold tracking-tight`); "O financeiro é restrito aos administradores do espaço." em
  `text-sm text-muted`; e, quando a lista de membros carrega, "Para pedir acesso, fale com **Ana
  Paula Ribeiro** ou **Bruno Carvalho**." (até dois administradores pelo nome e "ou outro
  administrador" quando houver mais). Ações: `primary` **Ir para o início** e `ghost` **Voltar**
  (`history.back()`, oculto sem histórico).
- `document.title` é "Acesso restrito · Efficio". Nenhum toast e nenhuma requisição financeira: o
  gate fica acima das páginas, então as consultas delas nem montam.
- **Não é 404** porque a página existe: "Página não encontrada" faria a pessoa achar que o link
  está quebrado e não diria a quem pedir.
- Chega-se aqui por favorito antigo, link colado numa conversa ou histórico do navegador. O ⌘K, o
  trilho e os menus do colaborador não oferecem nenhuma página do financeiro.

### 2.8 Barra flutuante, ⌘K e sino

- **`quick-bar.tsx`** por área. Na Gestão: Buscar, separador, `+ Tarefa` (texto `text-fg`),
  `Compromisso` (`CalendarClock`) e `Processo` (`Workflow`, que abre "Escolha o modelo", §12.3), os
  dois em `text-muted hover:text-fg`, todos com `WriteGate scope="tasks"`, e o sino. Sem cor
  semântica: verde e vermelho são de receita e despesa. No Financeiro, a barra de hoje, sem
  `+ Tarefa` (para criar tarefa, troca-se de área ou usa-se o ⌘K).
- **`command-palette.tsx`**:
  - **Ações**: na Gestão, `Nova tarefa`, `Novo compromisso`, `Aplicar modelo de processo` e, para
    administradores, `Nova tarefa recorrente`. As ações financeiras (`Nova receita`…) só para
    administradores. As da área atual vêm primeiro.
  - **Ir para**: o grupo "Gestão de tarefas" (as 8 páginas) e, só para administradores, o grupo
    "Financeiro" (as 12) e "Ir para o financeiro" ou "Ir para a gestão de tarefas". A área atual vem
    primeiro.
  - **Busca**: tarefas por título num grupo "Tarefas", quando o `/search` incluir tarefas (§18). Um
    cliente encontrado abre a ficha da Gestão (`/tarefas/clientes?cliente=<id>`) para o colaborador
    e, na Gestão, também para administradores; no Financeiro, o administrador continua indo ao
    cadastro financeiro. Lançamentos, contas e categorias só aparecem para administradores (a API
    já os omite para o colaborador).
- **`notifications.tsx`**: grupos conforme o acesso. **Tarefas** para todos: `Atrasadas atribuídas a
  você (N)`, que leva a `/tarefas?escopo=minhas&situacao=atrasadas`, e `Novos comentários nas suas
  tarefas`, que abre a tarefa. **Contas vencidas** só para administradores: `useOverdueBills` passa
  a ter `enabled: canAccessFinance` (hoje a consulta daria 403 para o colaborador). O grupo da área
  atual vem primeiro. O contador soma os dois para administradores e o `aria-label` separa:
  `Notificações (2 tarefas atrasadas, 3 contas vencidas)`.

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
| Semanal (várias semanas no mês) | pílula de 52px `bg-bg-subtle text-mini font-semibold tabular` com "2/4"; com todas concluídas, `bg-success-soft text-success` e `Check`. O clique abre um popover com uma `MatrixStatusCell` por semana ("Semana de 05/10") | "2 de 4 semanas concluídas" |

O atraso na matriz é **da coluna** (todos os clientes têm a mesma meta e o mesmo prazo legal na
competência). Por isso ele aparece uma vez, no cabeçalho da coluna ("Prazo legal venceu há 8 dias",
em `danger`, ou "Meta venceu há 2 dias", em `warning`), e as células continuam neutras. Uma coluna
inteira de vermelho seria textura, não sinal. O tooltip de cada célula diz o responsável efetivo:
"A fazer · Ana Paula Ribeiro (responsável do cliente no Fiscal)".

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
| Processo | tarefa que é etapa de um processo | `neutral` | `Workflow` e "Etapa 2/4"; `title` = nome do processo |
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

**Ocorrência recorrente: meta e prazo legal.** A data da coluna é a **meta** (a data de trabalho).
O texto fala dos dois prazos e a cor segue o mais grave:

| Situação (aberta) | `beside` (ao lado da data da meta) | `inline` (linha estreita) | Classe |
| --- | --- | --- | --- |
| Antes da meta | Meta em N dias · legal 20/10 | Meta 15/10 · legal 20/10 | `text-xs text-muted` (`font-medium text-warning` de 1 a 5 dias, como na avulsa) |
| Meta hoje | Meta hoje · legal 20/10 | o mesmo | `text-xs font-semibold text-warning` |
| Fora da meta | Meta venceu há 2 dias · legal em 3 dias | o mesmo | `text-xs font-semibold text-warning` |
| Prazo legal hoje | Prazo legal hoje | o mesmo | `text-xs font-semibold text-warning` |
| Atrasada (prazo legal vencido) | Prazo legal venceu há N dias | o mesmo | `text-xs font-semibold text-danger` |
| Meta igual ao prazo legal (0 dias) | como a avulsa, com "Prazo legal" no lugar de "Vence": "Prazo legal em 3 dias" | "Prazo legal 20/10" | as da avulsa |
| Concluída | Concluída em 14/10 (ou "Concluída em 22/10, com atraso", depois do prazo legal) | o mesmo | `text-xs text-muted`: o atraso já passou e não pede ação |

O tooltip da data explica os ajustes: "Meta 15/10 (5 dias antes) · Prazo legal 20/10 (todo dia 20)"
ou "Prazo legal 19/11 (o dia 20 é feriado; antecipado)".

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
- **Responsável do cliente** (tela Clientes e ficha): `MemberAvatar sm` e o nome curto; sem
  responsável, o círculo tracejado e "Sem responsável" em `text-subtle`, sem cor de alerta na célula
  (o alerta aparece uma vez, no resumo da tela).
- **Papel**: "Proprietário", "Administrador" ou "Colaborador" em `text-body-sm text-muted`. É texto,
  não selo colorido: o papel não pede ação.

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
| `SegmentedControl` | `components/ui/segmented-control.tsx` | escopo, situação, visualização, abas, periodicidade, regra de dia não útil, departamento do Início (até 4) |
| `Select`, `Input`, `Textarea`, `Field` | `components/ui/select.tsx`, `input.tsx` | filtros e formulários |
| `Sheet` | `components/ui/sheet.tsx` | tarefa (`lg`), recorrente (`lg`), modelo e processo (`lg`), ficha do cliente (`lg`), departamento e categoria (`md`), anotações (`md`), filtros no celular (`md`) |
| `Modal`, `ConfirmDialog` | `components/ui/dialog.tsx` | aplicar modelo, responsável em lote, confirmar exclusões |
| `Badge` | `components/ui/badge.tsx` | selos (§3.3 e §3.4) |
| `CategoryIcon` | `components/ui/category-icon.tsx` | ícone da categoria (neutro) |
| `IconPicker`, `ColorPicker` | `components/ui/icon-picker.tsx`, `color-picker.tsx` | categoria de tarefa |
| `Checkbox`, `Switch` | `components/ui/checkbox.tsx`, `switch.tsx` | subtarefas, listas de clientes, seleção em lote, "Só com pendências" |
| `EmptyState`, `Skeleton`, `SkeletonRows` | `components/ui/empty-state.tsx`, `skeleton.tsx` | vazios e carregamento |
| `ProgressBar` | `components/ui/progress-bar.tsx` | subtarefas e primeiros passos (`size="sm"`, `tone="brand"`) |
| `Tooltip`, `DropdownMenu*` | `components/ui/tooltip.tsx`, `dropdown-menu.tsx` | tooltips e menus "⋯" |
| `PeriodNavigator` | `components/ui/period-navigator.tsx` | competência (`modes={['month']}`) e calendário |
| `PeriodFilter`, `presetRange` | `features/reports/components/period-filter.tsx` | período dos relatórios de tarefas |
| `WidgetCard`, `FitList` | `features/dashboard/layout/widget-card.tsx` | blocos do Início: cabeçalho fixo e lista cortada ao que cabe, com "+ N" |
| `ListSkeleton`, `BodyEmpty` | `features/dashboard/widgets/shared.tsx` | estados dos blocos do Início |
| `ChartBox`, `axisProps`, `CHART_TEXT` | `components/charts/chart-utils.tsx` | gráficos dos relatórios de tarefas |
| `WriteGate`, `usePermissions` | `features/auth/permissions.tsx` | permissões, com as extensões de §2.6 |
| `toast` (sonner), `toastError` | `lib/notify.ts` | feedback e desfazer |
| `usePrintInLight` | `features/reports/pages/client-report.tsx` (extrair para `lib/`) | "Imprimir ou salvar PDF" |
| Classe de alternância do resumo (`toggleClass`) | `features/clients/clients-summary.tsx` (extrair) | células dos resumos que filtram ou levam à lista |
| `ClientProfile` | extrair de `features/clients/client-details-dialog.tsx` | os blocos de dados do cliente (identificação, contatos, endereço e situação) **sem honorários**, na ficha do cliente da Gestão (§13.2). O diálogo do financeiro passa a usar o mesmo bloco, mais os honorários |

**Alterados** (a forma não muda; passam a receber a área ou o papel): `Sidebar` (área, rótulo sob o
logotipo e botão de troca, §2.2 e §2.3), `MobileNav` (barra e "+" por área, seção Área no "Mais",
§2.4), `QuickBar`, `CommandPalette` e `Notifications` (§2.8), `usePermissions` e `WriteGate` (§2.6),
`MEMBER_ROLE_LABELS` e `MEMBER_ROLE_HINTS` (§2.6).

### 4.2 Novos

`features/tasks/` guarda os componentes do módulo. `components/ui/` guarda os genéricos, marcados
com (ui). `components/layout/` guarda os da casca.

| Componente | Props principais | Estados |
| --- | --- | --- |
| `AreaSwitchButton` (layout) | `area` | repouso, hover, foco; não renderiza para o colaborador (§2.3) |
| `FinanceGate`, `RestrictedAccess` (layout) | — | administrador (passa), colaborador (§2.7), sessão carregando (o `FullPageLoader` de hoje) |
| `TaskStatusGlyph` | `status`, `className` | os 5 glifos de §3.1 |
| `TaskStatusButton` | `status`, `onToggle(next)`, `size: 'sm'\|'md'`, `loading`, `disabled`, `disabledReason`, `taskTitle` | os 5 estados, hover (prévia `Check`), "pop" ao alternar, `loading` (opacidade 70%), desabilitado |
| `TaskDueLabel` | `task`, `beside?: boolean` | as tabelas de §3.5, inclusive meta e prazo legal |
| `PriorityBadge` | `priority`, `show?: 'row'\|'detail'` | §3.3 |
| `MemberAvatar` (ui) | `name`, `size`, `unassigned?` | iniciais, sem responsável |
| `SearchSelect` (ui) | `value`, `onChange`, `options: {value,label,hint?,leading?}[]`, `groups?`, `placeholder`, `searchPlaceholder`, `emptyText`, `size_` | fechado, aberto com busca, vazio ("Nenhum cliente encontrado"), desabilitado. Visual da lista do `Select` (raio xl, sombra lg) com campo de busca no topo, como o `CategoryPicker` |
| `ClientPicker` | sobre `SearchSelect`: `allowInternal`, `allowAll` | "Interna (sem cliente)" fixa no topo, clientes ativos com regime em `text-muted` |
| `MemberPicker` | sobre `SearchSelect`: `allowNone`, `allowAll`, `meFirst`, `departmentId?` | "Atribuir a mim" no topo; com `departmentId`, os membros do departamento primeiro (grupo "Do Fiscal") e depois "Outros membros"; avatar e departamentos como dica |
| `DepartmentSwitcher` | `value`, `options`, `allowAll`, `onChange` | sem controle (um departamento), `SegmentedControl` (até 4 opções), `Select` (5 ou mais) |
| `HomeSummary` | `summary`, `departmentId` | carregando (esqueletos do tamanho final), zero, com atrasadas (§6.3) |
| `ObligationProgressRow` | `occurrence` (agrupada), `onOpen` | aberta, fora da meta, atrasada, completa |
| `SetupChecklist` | `steps` | passos feitos e pendentes, oculto |
| `TaskRow` | `task`, `density`, `hideAssignee?`, `showDue?`, `muted?` | §5 |
| `RecurringOccurrenceRow` | `occurrence`, `density`, `scope` | §5.6 |
| `TaskRowMenu` | `task` | itens de §5.4; "Excluir" só para administradores |
| `TaskGroup` | `title`, `count`, `tone?: 'danger'\|'warning'`, `collapsible`, `children`, `onShowMore?`, `remaining?` | aberto, recolhido, "Mostrar mais (N)" |
| `TasksSummary` | `summary`, `filter`, `onFilter`, `scope` | carregando (esqueleto do mesmo tamanho), zero, com atrasadas |
| `TaskFilters` | estado da URL e `onChange` | 2 linhas no desktop; no celular, botão "Filtros (N)" que abre o Sheet |
| `TaskBoard`, `TaskBoardColumn`, `TaskCard` | `tasks`, `onMove(task, status)` | §8 |
| `TaskCalendar` | `month`, `tasks`, `onCreateAt(date)` | §7.6 |
| `TaskSheet` | `taskId \| null`, `defaults?`, `onOpenChange` | criar, ver e editar, só leitura, carregando, erro, não encontrada |
| `TaskProperties` | `task`, `onPatch(field, value)`, `readOnly` | com Departamento (§9.1) |
| `FlowStepper` | `flow` (etapas com estado) | feita, atual, aguardando |
| `SubtaskList` | `taskId`, `items` | vazia, com itens, salvando, erro |
| `AttachmentList` | `taskId`, `items` | vazia, enviando (barra), erro de tamanho ou tipo |
| `CommentThread` | `taskId`, `items` | vazia ("Nenhum comentário ainda."), enviando |
| `SavedStamp` | `state: 'idle'\|'saving'\|'saved'\|'error'` | "Salvando…", "Salvo", "Não foi salvo" (com `aria-live`) |
| `RecurringTaskSheet` | `definition \| null`, `readOnly` | criar, editar, leitura (colaborador), validação |
| `RecurrenceRuleFields` | `value`, `onChange` | periodicidade, prazo legal, meta, dia não útil e a prévia das próximas 3 competências (§10.3) |
| `RecurringRow` | `definition`, `month` | §10.2 |
| `RecurringOccurrenceSheet` | `definitionId`, `competence`, `scope` | lista de clientes com `MatrixStatusCell` e o responsável efetivo |
| `AuditSummary` | `summary`, `filter`, `onFilter` | igual ao `ClientsSummary` |
| `AuditMatrix` | `clients`, `definitions`, `cells`, `onCycle`, `onReopen` | §11 |
| `MatrixStatusCell` | `state`, `concludedBy?`, `concludedAt?`, `onCycle`, `onOpenRecord`, `weeks?` | §3.2, salvando, semanal (contagem que abre as semanas) |
| `ConclusionPopover` | `record`, `onReopen`, `canReopen` | com e sem "Reabrir" (§2.6) |
| `AuditAccordion` | `mode: 'cliente'\|'tarefa'`, os dados | recolhido, aberto |
| `FlowTemplateRow`, `FlowTemplateSheet`, `FlowStepsEditor`, `ApplyTemplateDialog`, `FlowBuilderSheet` | §12 (na tela, "processo") | §12 |
| `ClientCoverageSummary`, `TaskClientRow`, `TaskClientSheet` | §13.1 e §13.2 | §13.1 e §13.2 |
| `ClientResponsibleCell` | `clientId`, `department`, `member`, `editable` | texto (colaborador), seletor (administrador), salvando, erro |
| `AssignResponsibleDialog` | `clientIds` | §13.3 |
| `DepartmentRow`, `DepartmentSheet`, `TaskCategoryRow`, `TaskCategorySheet` | §13.4 e §13.5 | §13.4 e §13.5 |
| `TeamRow`, `MemberDepartmentsPicker` | §13.6 | §13.6 |
| `BreakdownList` | `rows: {id,label,leading?,done?,open,overdue}[]`, `max=8`, `onSelect?`, `selected?`, `href?` | §14 e Início |
| `StatusBar100` | `parts: {label,value,color}[]` | barra 100% de 12px com junções de 2px e a legenda em tabela |
| `NotesSheet`, `NoteSheet` | — e `note \| null` | lista; criar, editar, excluir (§15) |

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
lugar do valor de Contas a pagar porque é o dado-chave da linha. `hideAssignee` (escopo Minhas e o
bloco "Minhas tarefas" do Início) remove a coluna Responsável e o avatar.

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
- **Selos**, nesta ordem: Prioridade (Urgente, Alta), Processo, Aguardando cliente ou Cancelada
  (quando a coluna Situação está oculta) e a contagem de subtarefas. Abaixo de `@md` ficam só os de
  ação (Urgente e Aguardando cliente, este só com ícone), como em `TransactionRow`.
- **Subtítulo** (`mt-0.5 block truncate text-xs text-muted`): `categoria · cliente`, em que o
  cliente só entra quando a coluna Cliente está oculta. Sem categoria e com o cliente na coluna, o
  subtítulo não aparece e a linha fica mais baixa. Não se usa a descrição no subtítulo. Nos escopos
  Todas e Meus departamentos (com mais de um), o departamento entra no fim: `categoria · cliente ·
  Fiscal`.
- **Linha do prazo** (abaixo de `@xl`): `TaskDueLabel` inline e, abaixo de `@sm`,
  ` · Ana` em `text-muted`.

### 5.4 Interações

| Alvo | Ação |
| --- | --- |
| Botão de estado | conclui ou reabre (otimista, toast com "Desfazer", §17). `e.stopPropagation()` |
| Área do título (`<button>` com `flex-1`) | abre o `TaskSheet` (`?tarefa=<id>`) |
| Menu `⋯` (`aria-label="Ações de {título}"`) | **Abrir**, **Mudar situação ›** (subitens com o glifo: A fazer, Em andamento, Aguardando cliente, Concluída, Cancelada), **Atribuir a mim** (se não for o responsável), **Duplicar** e, só para administradores, separador e **Excluir** (`tone="danger"`). O colaborador cancela pelo "Mudar situação ›" |
| Hover | `bg-surface-muted`; menu com opacidade de 70% para 100% (como `RowMenu`) |
| Leitura (assinatura inativa) | o título vira `div` e o botão de estado fica desabilitado com o motivo |

### 5.5 Densidade compacta (blocos do Início e ficha do cliente)

`density="compact"`: `px-2 py-2`; estado `sm` (32px); `CategoryIcon sm` a partir de `@sm`; sem
colunas Cliente e Situação; vencimento em coluna a partir de `@2xl`; responsável só como avatar
(oculto em "Minhas tarefas"); selos só Urgente e Processo (este só com ícone); menu mantido.
Em Minhas tarefas do Início (cerca de 760px em 1440 e 515px em 1024), o prazo fica em coluna em
1440 e em linha em 1024; na ficha do cliente (Sheet de 620px), em linha.

### 5.6 Linha de recorrente agrupada (`RecurringOccurrenceRow`)

Uma linha por recorrente e competência, somando as ocorrências **do escopo**: em Minhas, só os
clientes de que você é o responsável efetivo; com o filtro Responsável, os daquela pessoa; em Meu
departamento e Todas, todos os clientes. A situação da lista também filtra: em Abertas, a linha soma
as pendentes; em Concluídas, as concluídas.

- **À esquerda**: um **anel de progresso** de 36px, que não é botão. Trilho `stroke-bg-subtle`,
  arco `stroke-data` na fração concluída, 3px. Quando todos concluíram, vira o glifo "Concluída".
  Tooltip "4 de 12 clientes concluídos".
- **Título**: o nome e o selo Recorrente. **Subtítulo**: "8 de 12 dos seus clientes pendentes ·
  Fiscal" (Minhas) ou "18 de 30 clientes pendentes · Fiscal".
- **Colunas**: Cliente mostra "12 clientes" em `text-muted`; Responsável mostra a pilha dos
  responsáveis efetivos (até 3 e "+N", com o tooltip "Ana P. 12 · Bruno C. 8 · Marina S. 3
  (padrão)") e some em Minhas; Situação mostra "4/12 concluídas" (`tabular`); Vencimento mostra a
  **meta** com o `TaskDueLabel` de meta e prazo legal (§3.5).
- **Clique** em qualquer parte: abre o `RecurringOccurrenceSheet` (§10.4) no mesmo escopo. O menu tem
  **Abrir na auditoria** (`/tarefas/auditoria?visao=tarefa&recorrente=<id>&competencia=<mês>`) e
  **Ver tarefa recorrente** (abre o cadastro; editar é só para administradores).
- **Contagem**: nos títulos de grupo e nos resumos, a linha conta o número de clientes que soma
  (§0, item 7).

### 5.7 Cabeçalho da lista

O mesmo do `TransactionListPage`: `hidden @xl:flex border-b px-5.5 py-2.5 text-xs font-medium
text-muted`, com as colunas "Tarefa" (`flex-1`, depois dos 36 + 40px), "Cliente" (`@3xl`),
"Responsável" (`@2xl`), "Situação" (`@4xl`) e "Vencimento" (`text-right`), mais 32px vazios no
lugar do menu. A frase fica em caixa normal, sem caixa alta.

---

## 6. Início (`/`)

**Pergunta da tela:** "Como está o trabalho do meu departamento, e o que eu faço primeiro?"
**Achado:** as atrasadas do departamento (quantas, a mais antiga e com quem ela está), na célula
principal do resumo.
**Ação mais frequente:** concluir uma tarefa minha (botão na linha de "Minhas tarefas") ou criar uma
("Nova tarefa").

É a página inicial de todos após o login, inclusive dos administradores (o painel financeiro vai
para `/financeiro`). O layout é **fixo**, não personalizável como o dashboard: a mesma página para a
equipe inteira permite que todos falem dela do mesmo jeito ("olha o bloco Por responsável"). Os
blocos usam as peças dos widgets (`WidgetCard`, `FitList`, `ListSkeleton`, `BodyEmpty`), não a
grade arrastável. A estrutura junta numa página só o painel do colaborador e o painel do gestor do
Onvio Processos, do Tareffa e do Gestta.

### 6.1 Escopo: o departamento

- O Início mostra **um departamento por vez**: as tarefas avulsas do departamento e as ocorrências
  da competência atual das recorrentes do departamento. "Minhas tarefas" é a exceção: mostra tudo o
  que é seu, em qualquer departamento.
- **Padrão**: o departamento do usuário; com mais de um, o último escolhido (`localStorage`, §2.5)
  e, na primeira vez, o primeiro em ordem alfabética. Administrador sem departamento: **Todos os
  departamentos**.
- **`DepartmentSwitcher`** no cabeçalho, para administradores e para quem está em mais de um
  departamento:
  - até 4 opções (contando o "Todos" dos administradores): `SegmentedControl size="sm"` com os
    nomes;
  - 5 ou mais: `Select size_="sm"` (`w-56`), com "Todos os departamentos" no topo para
    administradores;
  - o colaborador só escolhe entre os próprios departamentos; com um só, não há controle e o nome
    vai na descrição.
- `?departamento=` na URL deixa a visão compartilhável, e todos os links da página levam o
  departamento junto.
- **Espaço sem departamentos**: o Início mostra o escritório inteiro e, para administradores, o passo
  "Departamentos" dos primeiros passos (§6.8).
- **Membro sem departamento** num espaço que tem departamentos: o resumo e os blocos mostram o
  escritório inteiro, e uma linha `text-body-sm text-muted` com `Info`, abaixo do resumo, diz "Você
  ainda não está em um departamento. Peça a um administrador para incluir você em Cadastros ›
  Equipe."

### 6.2 Estrutura

Página `flex flex-col gap-5`; os blocos ficam numa grade de 12 colunas a partir de 1024px, com
`gap-5`.

1. `PageHeader`
   - `title`: **Início**.
   - `description`, sobre os dados: "Quarta-feira, 28 de outubro · Fiscal, 5 pessoas" ("Todos os
     departamentos, 14 pessoas" ou, sem departamentos, "todo o escritório").
   - `actions`: `DepartmentSwitcher` e `primary` **Nova tarefa** (`Plus`, `WriteGate
     scope="tasks"`), que abre o `TaskSheet` com o departamento escolhido já preenchido.
2. `HomeSummary` (§6.3), na largura toda.
3. `SetupChecklist` (§6.8), só para administradores e só enquanto houver passo pendente.
4. **Linha A**: **Minhas tarefas** (`lg:col-span-7`, §6.4) e **Obrigações de outubro**
   (`lg:col-span-5`, §6.5), com a mesma altura fixa (`lg:h-[26rem]`) e listas cortadas pelo
   `FitList`, para os dois cartões terminarem na mesma linha.
5. **Linha B**: **Por responsável** e **Por cliente** (`lg:col-span-6` cada, §6.6 e §6.7), com
   `lg:h-[22rem]`.

A ordem segue as perguntas na ordem em que surgem: quanto está atrasado no departamento, o que é
meu, como vai a competência, com quem está o trabalho e em quais clientes ele se acumula.

### 6.3 Resumo (`HomeSummary`)

Painel único com divisórias, construído como o `ClientsSummary` (`overflow-hidden rounded-xl border
bg-surface`, células `p-4 sm:p-5`, rótulo `text-body-sm font-medium text-muted`). Conta tarefas na
unidade de §0, item 7, no departamento escolhido. Cada célula é um `Link` para a lista de Tarefas já
filtrada (`escopo=departamento&departamento=<id>` mais o filtro da célula), com o hover da classe de
alternância do `ClientsSummary` e o `aria-label` com o número ("Atrasadas no Fiscal: 7. Ver na lista
de tarefas.").

| Célula | Rótulo | Número | Linha de baixo | Leva a |
| --- | --- | --- | --- | --- |
| 1 (principal) | Atrasadas, com `Info` e tooltip "Abertas depois do prazo: o vencimento, nas avulsas, ou o prazo legal, nas recorrentes." | `tabular text-[32px] font-semibold` (28px entre 1024 e 1279), em `text-danger` se maior que 0 e em tinta se 0 | se maior que 0: "A mais antiga venceu há 12 dias: **Balancete de setembro** · com Bruno C." (o título é um botão `text-brand-text` que abre a tarefa); se 0: "Nada atrasado no Fiscal." | `situacao=atrasadas` |
| 2 | Fora da meta, com `Info` e tooltip "Recorrentes abertas depois da meta interna, ainda dentro do prazo legal." | `text-kpi`, em `text-warning` se maior que 0 | "prazo legal em até 3 dias" (o menor prazo entre elas) ou nada | `tipo=recorrentes` (a lista abre com o grupo "Fora da meta" logo abaixo de "Atrasadas") |
| 3 | Vencem hoje, com `Info` e tooltip "Avulsas com vencimento hoje e recorrentes com meta hoje." | `text-kpi` | "2 compromissos" quando houver | `vencimento=<hoje>` |
| 4 | Próximos 7 dias | `text-kpi` | "até 04/11" | `situacao=abertas` (a lista agrupa "Próximos 7 dias") |
| 5 | Em aberto | `text-kpi` | "5 aguardando cliente" (link para `situacao=aguardando`) | `situacao=abertas` |
| 6 | Concluídas em outubro, com `Info` e tooltip "No prazo: concluídas até o prazo legal (ou o vencimento, nas avulsas). Canceladas não entram." | `text-kpi` | uma barra de 6px em duas partes, sem trilho (no prazo em `bg-data`, com atraso em `bg-danger`) e, embaixo, "36 no prazo · 5 com atraso" (`tabular`, em `text-muted`) | `situacao=concluidas&mes=2026-10` |

**Grade**: em `lg`, `grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,0.75fr))_minmax(0,1.3fr)]`; em
`md`, 3 colunas em 2 linhas, com a principal abrindo a primeira; abaixo de `md`, a principal na
largura toda, as células 2 a 5 em 2 × 2 e Concluídas na largura toda (a contagem depois da
principal fica par). Zero é dado: "0" em tinta, com a frase da célula. "Fora da meta" fica ao lado
das atrasadas porque é o próximo risco; os totais vêm depois. O vermelho aparece no número das
atrasadas e no trecho da barra de concluídas com atraso, e em mais nada.

### 6.4 Minhas tarefas

- `WidgetCard` com o título **Minhas tarefas** e o subtítulo "3 atrasadas · 2 para hoje" (o trecho
  das atrasadas em `text-danger`) ou "Nada atrasado"; para quem está em mais de um departamento,
  acrescenta "· em todos os seus departamentos". Ação: `SegmentedControl size="sm"` **Abertas** ·
  **Hoje** · **Atrasadas** (preferência local).
- Corpo: `FitList` de `TaskRow density="compact" hideAssignee`, com as avulsas e as recorrentes
  agrupadas pelos seus clientes ("DCTFWeb · 8 de 12 dos seus clientes"). Ordem: atrasadas, fora da
  meta, de hoje, próximas (pela data de trabalho) e, por último, sem vencimento. Sem títulos de
  grupo: o prazo de cada linha já diz onde ela está.
- Rodapé do `FitList`: "+ 14 tarefas", que leva a `/tarefas?escopo=minhas`.
- Concluir na linha funciona como na lista (otimista, toast com "Desfazer"); a linha abre o
  `TaskSheet` por cima do Início.
- **Vazio**: "Nada em aberto com você." e, embaixo, as suas concluídas dos últimos 7 dias em linhas
  esmaecidas (`muted`), sob o título "Concluídas por você nesta semana" (`text-caption
  text-muted`). Sem nenhuma das duas: `BodyEmpty` "Nada atribuído a você" com "Quando alguém
  atribuir uma tarefa a você, ela aparece aqui." e `outline sm` **Nova tarefa**.

### 6.5 Obrigações da competência

- `WidgetCard` com o título **Obrigações de outubro** (a competência atual, que vira no dia 1º) e o
  subtítulo "182 de 240 concluídas (76%) · 12 atrasadas" (o trecho das atrasadas em `text-danger`).
  Ação: `ghost sm` **Abrir auditoria**, para
  `/tarefas/auditoria?competencia=2026-10&departamento=<id>`.
- Linhas (`ObligationProgressRow`, 52px, `px-3`): o nome (`text-sm font-semibold`, truncado), com o
  selo da periodicidade só quando não for Mensal; embaixo, o `TaskDueLabel` inline de meta e prazo
  legal (§3.5), com a cor do pior caso entre os pendentes; à direita (`w-28`), "18/23" (`tabular
  text-[13px] font-medium`) sobre uma barra de 6px com trilho `bg-bg-subtle` e preenchimento
  `bg-data`.
- Ordem: as que têm prazo legal vencido e pendentes primeiro, depois pela meta; as completas (23/23)
  por último, com o glifo "Concluída" e o texto em `text-muted`. As semanais aparecem pela semana
  atual.
- Em "Todos os departamentos", o subtítulo de cada linha começa pelo departamento ("Fiscal · Meta
  15/10 · legal 20/10").
- O clique abre o `RecurringOccurrenceSheet` (§10.4) com o departamento como escopo.
- **Vazio** (departamento sem recorrentes): `EmptyState` ocupando o corpo, com `Repeat`, "Nenhuma
  tarefa recorrente no Fiscal" e "As obrigações do departamento (DAS, DCTFWeb, folha) aparecem aqui
  com o progresso da competência." Para administradores, `outline sm` **Cadastrar tarefas
  recorrentes**.

### 6.6 Por responsável

- `WidgetCard` **Por responsável**, subtítulo "Em aberto no Fiscal". Ação: `ghost sm` **Ver equipe**
  (`/tarefas/cadastros?aba=equipe`).
- Corpo: `BreakdownList` (§14.1) com `MemberAvatar sm` antes do nome: barra empilhada sem trilho
  (dentro do prazo em `bg-data`, atrasadas em `bg-danger`; a maior ocupa o espaço), o total em
  tinta à direita (`tabular`) e "2 atrasadas" em `text-mini text-danger` quando houver. Ordem: do
  maior total para o menor.
- **Sem responsável** vem primeiro quando houver (círculo tracejado e o texto em `text-subtle`),
  porque é trabalho que ninguém vai pegar sozinho.
- Os membros do departamento sem nada em aberto ficam no fim, com "0" em tinta e a barra vazia:
  mostram quem tem folga.
- O clique leva a `/tarefas?escopo=departamento&departamento=<id>&responsavel=<id>`.

### 6.7 Por cliente

- `WidgetCard` **Por cliente**, subtítulo "Clientes com mais pendências no Fiscal".
- Corpo: o mesmo `BreakdownList`, sem avatar: o nome do cliente (fantasia ou razão), a barra, o
  total e "3 atrasadas". Até 6 linhas e "Outros (N clientes)" somando o resto. "Interna" entra como
  uma linha comum, com o nome em `text-subtle`.
- O tooltip do nome diz o responsável do cliente no departamento: "Responsável no Fiscal: Ana Paula
  Ribeiro".
- O clique leva a `/tarefas?escopo=departamento&departamento=<id>&cliente=<id>`.
- **Vazio**: "Nenhum cliente com pendências no Fiscal." numa faixa tracejada de uma linha.

### 6.8 Primeiros passos (`SetupChecklist`)

Para administradores, enquanto algum passo estiver pendente, entre o resumo e a linha A: um `Card
p-4` com o título "Primeiros passos da gestão", "2 de 4" (`tabular`) e uma `ProgressBar sm` com a
fração real, e os passos lado a lado (empilhados abaixo de 768px).

| Passo | Feito quando | Link |
| --- | --- | --- |
| Departamentos | existe ao menos um | `/tarefas/cadastros?aba=departamentos` |
| Equipe nos departamentos | todos os membros estão em algum departamento | `/tarefas/cadastros?aba=equipe` |
| Responsáveis dos clientes | todo cliente ativo tem responsável em cada departamento que tem recorrentes | `/tarefas/clientes?sem-responsavel=1` |
| Tarefas recorrentes | existe ao menos uma | `/tarefas/recorrentes` |

Cada passo tem o glifo de estado (anel vazio ou "Concluída"), o nome e o link. `ghost sm`
**Ocultar** guarda a escolha (`localStorage`). O colaborador não vê esta faixa: num espaço sem
tarefas, ele vê o vazio de cada bloco.

### 6.9 Estados e larguras

| Estado | O que aparece |
| --- | --- |
| Carregando | o cabeçalho na hora; o resumo com esqueletos do tamanho final; cada bloco com o próprio cabeçalho e `ListSkeleton` |
| Erro | `ErrorState` compacto dentro do bloco que falhou; os outros continuam |
| Espaço sem nenhuma tarefa | o resumo com zeros (são dados), os primeiros passos para administradores e o vazio de cada bloco |
| Leitura (assinatura inativa) | "Nova tarefa" e os botões de estado desabilitados com o motivo |

| | 1440 (conteúdo de 1316px) | 1024 (900px) | 768 (720px, sem trilho) | 390 (358px) |
| --- | --- | --- | --- | --- |
| Cabeçalho | título à esquerda; seletor e Nova tarefa à direita | igual | as ações descem para baixo do título | título; o seletor em largura total embaixo; "Nova tarefa" sai (o "+" da barra inferior cria) |
| Resumo | 6 células em linha | 6 células, a principal em 28px | 3 × 2 | a principal inteira, 2 × 2 e Concluídas inteira |
| Linha A | 7 + 5 colunas, 26rem | 7 + 5 (cerca de 515 e 365px; o prazo de Minhas tarefas fica em linha) | empilhadas, altura pelo conteúdo, até 6 linhas | empilhadas, até 5 linhas; Minhas tarefas primeiro |
| Linha B | 6 + 6, 22rem | 6 + 6 | empilhadas, até 6 linhas | empilhadas, até 5 linhas |

---

## 7. Tela Tarefas (`/tarefas`)

**Pergunta da tela:** "O que eu (ou o escritório) preciso fazer, e o que já passou do prazo?"
**Achado:** a tarefa atrasada mais antiga do escopo, na célula principal do resumo.
**Ação mais frequente:** concluir uma tarefa (botão na linha) ou criar uma ("Nova tarefa").

### 7.1 Estrutura (de cima para baixo, `flex flex-col gap-5`)

1. `PageHeader`
   - `title`: **Tarefas**.
   - `description`, sobre os dados: "Quarta-feira, 28 de outubro · atribuídas a você", "… ·
     departamento Fiscal" ou "… · todo o escritório".
   - `actions`: `outline` **Aplicar modelo de processo** (`Workflow`), que abre o diálogo de
     escolha de modelo e depois o `ApplyTemplateDialog`, e `primary` **Nova tarefa** (`Plus`). Os
     dois com `WriteGate scope="tasks"`: o colaborador usa os dois.
2. `TasksSummary` (§7.2).
3. `TaskFilters` num `Card className="p-4"` (§7.3).
4. O conteúdo da visualização: Lista (§7.4), Quadro (§8) ou Calendário (§7.6).

### 7.2 Resumo (`TasksSummary`)

É um painel único com divisórias, construído como o `ClientsSummary`
(`overflow-hidden rounded-xl border bg-surface`). Os números saem dos **mesmos filtros da lista,
exceto a situação**, para a contagem e a lista concordarem. Recorrentes contam um por cliente (§0,
item 7), como no Início; a linha agrupada da lista diz quantos clientes soma.

| Célula | Rótulo (`text-body-sm font-medium text-muted`) | Número | Linha de baixo | Clique |
| --- | --- | --- | --- | --- |
| 1 (principal) | Atrasadas, com `Info` e tooltip "Abertas depois do prazo: o vencimento, nas avulsas, ou o prazo legal, nas recorrentes." | `tabular text-[32px] font-semibold` (28px entre 1024 e 1279), em `text-danger` se maior que 0 e em tinta se for 0 | se maior que 0: "A mais antiga venceu há 12 dias: **Balancete de setembro** · Padaria Pão Dourado" (o título é um botão `text-brand-text` que abre a tarefa); se 0: "Nada atrasado." | alterna `situacao=atrasadas` (`aria-pressed`) |
| 2 | Em aberto | `text-kpi` | "3 vencem hoje · 4 fora da meta · **5 aguardando cliente**" (o trecho "fora da meta" em `text-warning`; o último alterna `situacao=aguardando`, com o estilo do link "N inativos") | alterna `situacao=abertas` |
| 3 | Concluídas em outubro | `text-kpi` | "14 no prazo · 2 com atraso" (canceladas fora da conta) | alterna `situacao=concluidas` |
| 4 | "Em aberto por responsável" (escopos Departamento e Todas) ou "Em aberto por cliente" (Minhas) | — | até 5 linhas, como as dos regimes: nome (`9rem`), barra `bg-data` sem trilho (a maior ocupa o espaço), contagem em tinta e, se houver, "3 atr." em `text-mini text-danger` | cada linha filtra por responsável ou cliente (`aria-pressed`); clicar de novo limpa |

**Grade**: em `lg`, `grid-cols-[minmax(0,1.15fr)_10rem_10rem_minmax(0,1fr)]`; em `md`, 3 colunas
com a célula 4 embaixo ocupando a largura toda (`md:col-span-3`, linhas em 2 colunas); abaixo de
`md`, a célula 1 ocupa a largura, as células 2 e 3 ficam lado a lado e a célula 4 some (o filtro
continua no Sheet de filtros). **Sem nenhuma tarefa no espaço**, o resumo não aparece e o vazio da
lista leva a primeira ação (como em Clientes).

### 7.3 Filtros (`TaskFilters`)

**Linha 1** (`flex flex-wrap items-center justify-between gap-3`):
- à esquerda, o `SegmentedControl` "Escopo": `Minhas` · `Meu departamento` (oculto se o membro não
  tiver departamento; vira `Meus departamentos` para quem está em mais de um e soma todos) ·
  `Todas`;
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
mostra "(2)" quando há filtros ativos nele; abre um popover com Departamento, em Todas e em Meus
departamentos, Tipo: "Todas, Avulsas, Recorrentes, Etapas de processo", e Mês de vencimento:
"Qualquer mês" e os meses com tarefas mais o atual) e, se houver filtro, `ghost sm` **Limpar**
(`X`). Os controles têm 36px (`size_="sm"`, como em Contas a pagar).

**Celular (390)**: linha 1 com o Escopo em largura total (3 opções cabem); linha 2 com a busca
(`flex-1`), o botão `outline` **Filtros** (com "(N)") e a Visualização. "Filtros" abre um `Sheet`
"Filtros" com Situação (lista de rádios), Cliente, Responsável, Departamento, Categoria,
Prioridade, Tipo e Mês, e no rodapé `ghost` Limpar e `primary` **Ver 23 tarefas** (a contagem é
atualizada ao vivo).

### 7.4 Lista

Um `Card className="@container overflow-hidden"` com o cabeçalho (§5.7) e `p-1.5` com os grupos.

- **Agrupamento** (situação Abertas, Atrasadas ou Aguardando, ordenado pela data de trabalho):
  grupos **Atrasadas** (título em `text-danger`), **Fora da meta** (título em `text-warning`; só
  recorrentes), **Hoje**, **Próximos 7 dias**, **Mais tarde** e **Sem vencimento**. Grupos sem itens
  não aparecem. A contagem do grupo soma tarefas na unidade de §0, item 7 (uma linha agrupada de 18
  clientes conta 18).
  - `TaskGroup`: um `<section aria-labelledby>` com cabeçalho de 36px
    (`px-3 text-body-sm font-semibold`, com a contagem em `text-muted tabular`) e chevron para
    recolher (`aria-expanded`). O estado de recolhido dura a sessão.
  - Cada grupo traz até 50 linhas; depois vem `ghost sm` **Mostrar mais (N)**.
- **Lista simples** (Concluídas e Todas): sem grupos. Concluídas ordena por "concluída em", da mais
  recente para a mais antiga; Todas, por vencimento. Paginação de 50, igual à de Contas a pagar:
  "Página 1 de 3 · 124 tarefas" com ‹ ›.
- Durante uma nova busca (`isPlaceholderData`), a lista fica com `opacity-60`, como hoje.

### 7.5 Estados e textos da tela

| Estado | O que aparece |
| --- | --- |
| Carregando | resumo com esqueletos do tamanho final (como o `ClientsSummary`) e `SkeletonRows rows={6} className="p-3"` na lista; os filtros aparecem na hora |
| Erro | `ErrorState` dentro do Card da lista, com "Tentar novamente"; o resumo some se também falhar |
| Espaço sem nenhuma tarefa nem recorrente | `EmptyState` com `ListChecks`, "Nenhuma tarefa ainda", "Crie tarefas para o escritório, atribua responsáveis e acompanhe os prazos de cada cliente. As tarefas recorrentes do mês também aparecem aqui." e `outline` **Nova tarefa**; abaixo, só para administradores, o `link` **Cadastrar tarefas recorrentes** |
| Minhas, nada aberto | `CircleCheck`, "Nada atribuído a você", "Quando alguém atribuir uma tarefa a você, ela aparece aqui com o prazo." e `outline` **Nova tarefa** |
| Atrasadas vazio | `CircleCheck`, "Nenhuma tarefa atrasada", "Tudo dentro do prazo." (sem ação) |
| Filtros sem resultado | `SearchX`, "Nenhuma tarefa com esses filtros", e `outline` **Limpar filtros** |
| Leitura (assinatura inativa) | "Nova tarefa" desabilitada com o motivo (`WriteGate scope="tasks"`), botões de estado desabilitados com o motivo |

### 7.6 Calendário (`visao=calendario`)

- **A partir de 1024px**: um `PeriodNavigator modes={['month']}` acima de uma grade de 7 colunas
  (Dom a Sáb; a semana começa no domingo, como em `packages/shared`). Cada dia tem no mínimo 112px
  em 1440 e 88px em 1024; o fim de semana usa `bg-surface-muted`; **hoje** tem uma borda superior
  de 2px em `bg-data` e o número em `font-semibold text-fg`.
  - Até 3 itens por dia (2 em 1024): compromissos primeiro ("09:00 Reunião com Clínica Sorriso
    Pleno"), depois por prioridade. Cada item tem 24px, `rounded-sm bg-bg-subtle text-caption
    truncate`; uma tarefa vencida e aberta tem o texto em `text-danger`; uma concluída, em
    `text-muted`.
  - Uma recorrente é um item só, no dia da meta ("DCTFWeb · 12/30"); com `tipo=recorrentes`, a
    grade vira o calendário de obrigações do escritório. "+ N mais" abre um popover com as
    linhas compactas do dia.
  - Ao passar o mouse sobre um dia, aparece "+" (`icon-sm ghost`, `aria-label="Novo compromisso em
    30/10"`, `WriteGate scope="tasks"`), que abre o `TaskSheet` com o vencimento naquele dia e o horário
    09:00–10:00 já preenchido, como no Effy.
  - Tarefas sem vencimento não entram; o cabeçalho mostra o link "3 sem vencimento", que volta para
    a lista filtrada.
- **Abaixo de 1024px**: uma **agenda** em lista, com os dias com itens como `TaskGroup`
  ("Sex, 30/10") e linhas compactas; o "+" fica no cabeçalho de cada dia.
- **Vazio do mês**: a grade continua desenhada e mostra uma faixa de uma linha, "Nenhuma tarefa com
  vencimento em novembro."

### 7.7 Responsivo

| | 1440 (conteúdo de 1316px) | 1024 (900px) | 768 (720px, sem trilho) | 390 (358px) |
| --- | --- | --- | --- | --- |
| Cabeçalho | título à esquerda, 2 ações à direita | igual | as ações descem para baixo do título | só **Nova tarefa**; "Aplicar modelo de processo" vai para um `⋯` ao lado |
| Resumo | 4 células em linha | 4 células, com o número principal em 28px | 3 células e a lista por responsável embaixo | célula 1 inteira, depois 2 e 3; lista oculta |
| Filtros | 2 linhas | linha 2 em 2 colunas | linha 2 em 2 colunas | escopo, busca, "Filtros (N)" e visualização |
| Lista | todas as colunas | sem Situação | sem Cliente e sem Situação | estado, título, subtítulo e prazo em linha |
| Quadro | §8.5 | §8.5 | §8.5 | §8.5 |
| Calendário | grade (3 itens por dia) | grade (2 itens por dia) | agenda | agenda |

---

## 8. Quadro (kanban)

### 8.1 Colunas

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

### 8.2 Cartão (`TaskCard`)

`rounded-lg border border-border bg-surface p-3`, sem sombra em repouso, `hover:border-border-strong`.

```
Balancete de setembro                       ← text-body-sm font-semibold, até 2 linhas
[Urgente] [Etapa 2/4]                        ← selos (§3.3, §3.4)
▢ Padaria Pão Dourado                        ← Building2 14px + text-caption text-muted truncate ("Interna" em subtle)
Venceu há 3 dias · 25/10      ☑ 2/5  💬 3  ◯AP  ← TaskDueLabel inline; contagens text-mini muted; MemberAvatar sm
```

- **Atrasada**: só o `TaskDueLabel` em `danger`. Não há borda colorida, fundo nem ponto. Na
  coluna Concluída, o prazo vira "Concluída em 14/10".
- **Recorrente**: um cartão por recorrente **e estado**, somando os clientes do escopo naquele
  estado: "DCTFWeb · 18 clientes" em A fazer, "DCTFWeb · 4 clientes" em Em andamento e "DCTFWeb ·
  8 clientes" em Concluída. O anel de progresso fica no lugar do selo, o prazo é o de meta e prazo
  legal (§3.5) e o avatar vira a pilha dos responsáveis. O cartão **não é arrastável**
  (`aria-disabled`, tooltip "Concluída por cliente: abra para marcar") e o clique abre o
  `RecurringOccurrenceSheet` já filtrado naquele estado.
- **Abrir**: um `<button>` cobrindo o cartão abre o `TaskSheet`.
- **Menu** `⋯` (aparece no hover e no foco; sempre visível em `pointer-coarse`): **Mover para ›**
  (os estados), **Atribuir a mim** e, para administradores, **Excluir**. É a alternativa acessível
  ao arrastar.

### 8.3 Arrastar entre colunas

| Entrada | Comportamento |
| --- | --- |
| Mouse ou caneta | arrastar o cartão inteiro depois de 4px de movimento. O cartão sobe (`shadow-lg`, `ring-1 ring-border-strong`, sem girar); no lugar de origem fica um contorno tracejado da mesma altura; a coluna de destino recebe `bg-primary-soft/50` e uma vaga tracejada na posição em que o cartão vai cair (pela ordenação). Perto da borda do quadro, ele rola sozinho na horizontal. Esc cancela |
| Toque | **só pela alça** (`GripVertical`, no canto do cartão em `pointer-coarse`), a mesma regra do dashboard. Arrastar o resto do cartão rola a página |
| Teclado | Tab até a alça "Mover {título}" e **Espaço** para pegar (anúncio "Balancete de setembro selecionada. Use seta para a esquerda ou direita para escolher a coluna, Espaço para soltar e Esc para cancelar."). **←** e **→** mudam a coluna de destino, com a mesma prévia do mouse e o anúncio "Em andamento, posição 3 de 6". **Espaço** ou **Enter** soltam e **Esc** cancela |
| Ao soltar | atualização otimista, com o toast "Movida para Em andamento." e "Desfazer" (§17). Soltar em Concluída grava quem concluiu e quando; numa etapa de processo, o toast fala da próxima etapa |
| Erro | o cartão volta para a coluna original (animação de 200ms) e aparece `toastError` |

Com `prefers-reduced-motion`, nada desliza: o cartão aparece direto na nova coluna.

### 8.4 Contagens

A contagem do cabeçalho soma as tarefas visíveis com os filtros atuais (escopo, cliente,
responsável, "Só atrasadas"…), na unidade de §0, item 7: um cartão avulso conta 1 e um cartão de
recorrente conta os clientes que mostra. É recalculada a cada mudança. Mover um cartão atualiza as
duas contagens de forma otimista.

### 8.5 Larguras

| Viewport | Quadro |
| --- | --- |
| 1440 | 4 colunas de cerca de 299px mais Cancelada recolhida (56px): `4 × 299 + 56 + 4 × 16 = 1316`. Tudo cabe |
| 1024 | colunas de 280px; o quadro rola na horizontal dentro do próprio contêiner (`overflow-x-auto`, `scroll-snap-type: x proximity`) e a página nunca rola de lado |
| 768 | o mesmo, com cerca de 2,5 colunas visíveis |
| 390 | **uma coluna por vez**: uma linha de abas que rola (`SegmentedControl size="sm"`, com "A fazer 12", "Em andamento 5"…), seguida dos cartões em largura total. Mover é pelo menu do cartão ("Mover para ›") |

**Carregando**: as colunas e os cabeçalhos aparecem na hora, com 3 esqueletos de 72px por coluna.
**Erro**: um `ErrorState` só, na largura do quadro.

---

## 9. Detalhe e edição da tarefa (`TaskSheet`)

`Sheet width="lg"` (620px; tela cheia abaixo de 640px). Abre por `?tarefa=<id>` ou `?nova=1`.

### 9.1 Tarefa existente: cada campo salva sozinho

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
     | Departamento | `Select` com os departamentos (obrigatório quando o espaço tem departamentos) | ao escolher um responsável com um departamento só e o campo vazio, ele é preenchido; nunca muda sozinho depois de preenchido |
     | Responsável | `MemberPicker` (`allowNone`, `meFirst`, `departmentId`) | membros do departamento primeiro. Se a pessoa não for do departamento, a dica diz "Bruno não é do Fiscal; a tarefa continua no Fiscal." com o botão `link` **Mudar para Pessoal** (o departamento dela; com mais de um, um menu) |
     | Cliente | `ClientPicker` (`allowInternal`) | "Interna (sem cliente)" |
     | Vencimento | `Input type="date"` | se vencida e aberta, dica em `danger`: "Venceu há 3 dias" |
     | Categoria | `Select` "Sem categoria" | opções com o `CategoryIcon` colorido (é o seletor) |
     | Horário | botão `ghost sm` **Definir horário**, que mostra dois `Input type="time"` ("das" e "às") e o botão **Remover horário** | erro: "A hora de término deve ser posterior à de início." |
     | Início | `Input type="date"`, opcional, recolhido em **Mais campos** | o campo `startDate` existe, mas o Effy não o mostrava |
  2. **`FlowStepper`** (só em etapa de processo): um bloco `rounded-lg bg-surface-muted p-3` com
     "Processo: **Abertura de empresa** · etapa 2 de 5" e a lista de etapas. Etapas feitas têm o
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
     linha mostra uma `ProgressBar sm`. O limite de tamanho vem da API e aparece na dica. Remover
     aparece para quem anexou e para administradores. Vazio: "Nenhum anexo."
  6. **Comentários**: lista com `MemberAvatar md`, nome, tempo relativo ("há 2 h", "ontem",
     "12/10") e o texto (`whitespace-pre-wrap`, sem HTML). No fim fica o campo: avatar, `Textarea`
     "Escreva um comentário…" e o botão `outline sm` **Comentar** (⌘/Ctrl+Enter também envia). O
     comentário entra na lista na hora (otimista); se falhar, volta para o campo com
     `toastError`. O autor e os administradores podem excluir um comentário (no "⋯" que aparece
     no hover). Vazio: "Nenhum comentário ainda."
  7. **Rodapé de informações** (`text-caption text-subtle`): "Criada por Ana Paula Ribeiro em
     12/10/2026 · Concluída por Bruno Carvalho em 20/10/2026 às 14:32".
- **Rodapé fixo**: à esquerda, o `SavedStamp`; à direita, um `⋯` (Duplicar, Copiar link, Cancelar
  tarefa e, só para administradores, Excluir)
  e o botão principal **Concluir tarefa** (`primary`, `CircleCheck`). Em tarefa concluída ou
  cancelada, ele vira `outline` **Reabrir**. Concluir pelo Sheet tem o mesmo efeito da linha (toast
  com Desfazer) e deixa o Sheet aberto.
- **Salvar sozinho**: cada mudança dispara um PATCH otimista; o carimbo mostra "Salvando…" e depois
  "Salvo". Em erro, o campo volta ao valor anterior, o carimbo diz "Não foi salvo" (em
  `text-danger`) e aparece `toastError`. Não há botão Salvar.

### 9.2 Criar tarefa

- Título "Nova tarefa", descrição "Atribua um responsável e um prazo."
- Corpo: **Nome** (`Input`, `data-autofocus`, placeholder "Ex.: Balancete de setembro,
  Alteração contratual"), `TaskProperties` (Situação já em A fazer, Prioridade em Média e os
  valores vindos da URL, do "+" da coluna ou do dia; o Departamento vem do Início ou do filtro
  ativo, senão do responsável) e Descrição. Abaixo, a nota em `text-subtle`
  "Subtarefas, anexos e comentários ficam disponíveis depois de criar."
- Rodapé: `ghost` **Cancelar** e `primary` **Criar tarefa**.
- Validação inline: "Informe o nome da tarefa.", "Escolha o departamento." e a regra do horário.
- Ao criar, o Sheet **continua aberto**, já no modo edição (para adicionar subtarefas e anexos), e
  aparece o toast "Tarefa criada."

### 9.3 Estados

| Estado | Comportamento |
| --- | --- |
| Carregando | as propriedades mostram esqueletos de 40px e as seções, de 3 linhas; o título aparece se já estiver no cache da lista |
| Erro | `ErrorState` no corpo, com "Tentar novamente" |
| Não encontrada (404 ou 400) | `EmptyState` com `ListChecks`, "Tarefa não encontrada", "Ela pode ter sido excluída." e `outline` **Voltar às tarefas** |
| Leitura (assinatura inativa) | controles desabilitados com os valores, sem campo de comentário nem "Anexar", rodapé com o `readOnlyReason` em `text-caption` |
| Excluir (só administradores) | `ConfirmDialog` "Excluir “Balancete de setembro”?", com "Subtarefas, comentários e anexos também serão excluídos. Esta ação não pode ser desfeita." e o botão **Excluir tarefa**. Depois fecha o Sheet e mostra o toast "Tarefa excluída." |

---

## 10. Tarefas recorrentes (`/tarefas/recorrentes`)

**Pergunta da tela:** "Quais obrigações o escritório repete, de qual departamento, para quem, com que
prazo, e como está o mês?"
É o cadastro das obrigações (como o "Obrigações" do Onvio, do Tareffa e do Gestta). O colaborador vê
tudo e não altera.

### 10.1 Estrutura

1. `PageHeader`: **Tarefas recorrentes**, com a descrição "14 tarefas recorrentes · outubro: 182 de
   240 concluídas" (para o colaborador, mais " · Somente administradores alteram este cadastro.").
   Ações: `outline` **Ver no calendário** (`CalendarDays`, leva a
   `/tarefas?escopo=todas&tipo=recorrentes&visao=calendario`, o calendário de obrigações) e
   `primary` **Nova tarefa recorrente** (só administradores, `WriteGate scope="admin"`).
2. Filtros num `Card p-4`, em uma linha: busca ("Buscar tarefa recorrente"), `SegmentedControl`
   Periodicidade (Todas · Semanal · Mensal · Trimestral · Anual), `Select` Departamento,
   `MemberPicker` Responsável (padrão ou de algum cliente), `Select` Regime e Limpar.
3. Lista num `Card @container` com cabeçalho (a partir de `@xl`): "Tarefa recorrente",
   "Departamento" (`@3xl`), "Aplica-se a" (`@4xl`), "Responsáveis" (`@2xl`), "Outubro" (o
   progresso, `@xl`) e "Prazo legal e meta" (`text-right`).

### 10.2 Linha (`RecurringRow`), no padrão de §5

- À esquerda, `CategoryIcon` neutro com o ícone da categoria (ou `Repeat`, sem categoria). Não há
  botão de estado, porque a definição não tem estado.
- **Título** com o selo da periodicidade (`neutral`: "Semanal", "Mensal", "Trimestral", "Anual");
  **subtítulo** com a descrição truncada ou, quando a coluna Departamento está oculta,
  "Fiscal · Impostos" (departamento · categoria).
- **Departamento** (`w-32`): o nome, em texto.
- **Aplica-se a** (`w-44`): "Simples Nacional e MEI · 23 clientes", "4 clientes específicos" ou
  "Simples Nacional e mais 2 · 25 clientes", com "· 2 exceções" quando houver.
- **Responsáveis** (`w-36`): a pilha dos responsáveis efetivos da competência (até 3 e "+N";
  tooltip "Ana P. 12 · Bruno C. 8 · Marina S. 3 (padrão)") e, embaixo, "Padrão: Marina S." em
  `text-mini text-muted`. Sem responsável padrão e sem responsáveis de cliente: "Sem responsável",
  em `text-subtle`.
- **Progresso do mês** (`w-36`): "18 de 23" (`tabular`) sobre uma barra de 6px com trilho
  `bg-bg-subtle` e preenchimento `bg-data`; "· 3 atrasadas" em `text-mini text-danger` quando
  houver. Se não ocorre no mês: "Não ocorre em outubro", em `text-subtle`.
- **Prazo legal e meta** (`w-40 text-right`): na 1ª linha (`text-[13px] font-medium tabular`) o
  prazo legal pela periodicidade ("Toda sexta", "Dia 20", "Dia 30 · jan, abr, jul, out", "31/05");
  na 2ª (`text-xs text-muted`) a meta e a regra ("meta 5 dias antes · antecipa", "meta no prazo ·
  posterga", "meta 2 dias antes · mantém").
- O clique abre o `RecurringTaskSheet` (em leitura para o colaborador). O menu tem **Editar** (ou
  **Ver**, para o colaborador), **Ver na auditoria**, **Ver no calendário** e, para
  administradores, **Duplicar** e **Excluir**.

### 10.3 `RecurringTaskSheet` (`width="lg"`)

Título "Nova tarefa recorrente", "Editar tarefa recorrente" ou, para o colaborador, o nome da
recorrente. Descrição: "Vira uma coluna da auditoria mensal e uma tarefa por cliente a cada
competência, para o responsável do cliente no departamento." Rodapé: **Cancelar** e **Salvar tarefa
recorrente**; na edição, uma nota `text-caption text-subtle` acima dos botões: "As mudanças valem a
partir de outubro para as tarefas ainda não concluídas; as concluídas não mudam." Para o
colaborador, os campos ficam desabilitados com os valores, e o rodapé mostra só **Fechar** e o
`ADMIN_ONLY_REASON` em `text-caption`.

O corpo tem quatro grupos (`gap-6`), cada um com um título `text-body-sm font-semibold`:

**O quê**

| Campo | Controle | Texto |
| --- | --- | --- |
| Nome* | `Input` (`data-autofocus`) | placeholder "Ex.: DCTFWeb, DAS do Simples, Folha de pagamento" · erro "Informe o nome da tarefa." |
| Descrição | `Textarea` de 2 linhas | "Detalhes ou observações (opcional)" |
| Departamento* | `Select` com os departamentos | dica "Recebe as tarefas desta obrigação. O responsável de cada cliente vem deste departamento." · erro "Escolha o departamento." Some quando o espaço não tem departamentos |
| Categoria | `Select` "Sem categoria" | opções com o `CategoryIcon` colorido (é o seletor) |

**Quando** (`RecurrenceRuleFields`)

| Campo | Controle | Texto |
| --- | --- | --- |
| Periodicidade* | `SegmentedControl` Semanal · Mensal · Trimestral · Anual | — |
| Prazo legal* | Semanal: `Select` do dia da semana (segunda a sexta). Mensal: `Select` do dia (1 a 31 e "Último dia do mês"). Trimestral: o dia e o 1º mês (`Select` jan, fev ou mar), que se repete a cada 3 meses. Anual: dia e mês | dica calculada: "Todo dia 20.", "Dia 30 de jan, abr, jul e out." ou "Todo ano em 31/05." Em meses mais curtos, um dia que não existe vira o último dia do mês, e a dica avisa: "Em fevereiro, dia 28." · erro "Informe o prazo legal." |
| Meta interna | `Input type="number" min=0` (80px) com o sufixo "dias antes do prazo legal" | padrão 0, com a dica "Com 0, a meta é o próprio prazo legal."; máximo de 30 dias (6 na semanal) · erro "Use de 0 a 30 dias." |
| Se cair em dia não útil | `SegmentedControl` **Antecipar** · **Postergar** · **Manter** (padrão Antecipar) | dica da opção escolhida: "Vai para o dia útil anterior.", "Vai para o próximo dia útil." ou "Fica na data, mesmo em fim de semana ou feriado." Vale para o prazo legal; a meta sempre antecipa |
| Prévia | bloco `rounded-lg bg-surface-muted p-3 text-caption text-muted`, só leitura | as próximas 3 competências, com os ajustes à vista: "Outubro: meta 15/10 (qui) · prazo legal 20/10 (ter). Novembro: meta 13/11 (sex) · prazo legal 19/11 (qui; 20/11 é feriado). Dezembro: meta 11/12 (sex) · prazo legal 18/12 (sex; 20/12 é domingo)." |

**Quem**

| Campo | Controle | Texto |
| --- | --- | --- |
| Responsável padrão | `MemberPicker` (`departmentId` do departamento escolhido; `allowNone`: "Sem responsável padrão") | dica "Recebe as tarefas dos clientes que não têm responsável no Fiscal." Na edição, mais a distribuição atual: "Hoje: Ana Paula 12 · Bruno 8 · padrão 3 · sem responsável 2", com o link **Definir responsáveis dos clientes** (`/tarefas/clientes?departamento=<id>&sem-responsavel=1`) |

**Para quais clientes**

| Campo | Controle | Texto |
| --- | --- | --- |
| Regimes | `Checkbox` por regime de `TAX_REGIMES`, cada um com "· 18 clientes ativos" em `text-muted` | — |
| Clientes específicos | busca e lista de `Checkbox` com rolagem própria (`max-h-72`), cada cliente com o regime em `text-muted`; "N selecionados", **Marcar os visíveis** e **Limpar** | somam-se aos regimes |
| Exceções | recolhido atrás de `ghost sm` **Adicionar exceção**; a mesma lista de clientes | "Clientes do regime que não fazem esta obrigação." |
| Resumo | uma linha `text-body-sm` | "Aplica-se a **25 clientes ativos**: 23 pelo regime, mais 2 específicos, menos 0 exceções." · erro "Escolha ao menos um regime ou cliente." |

**Excluir** (`ConfirmDialog`, só administradores): "Excluir “DCTFWeb”?" com "O histórico de estados e
conclusões desta tarefa recorrente também será excluído (24 competências). Esta ação não pode ser
desfeita." e o botão **Excluir tarefa recorrente**. Ver §18 sobre arquivar em vez de excluir.

### 10.4 `RecurringOccurrenceSheet` (`width="lg"`)

Abre pela linha agrupada (§5.6), pelo cartão do quadro, pelo calendário e pelas obrigações do Início.

- Título: "DCTFWeb · outubro de 2026". Descrição: "Fiscal · meta 15/10 · prazo legal 20/10", com
  "Prazo legal venceu há 8 dias" em `danger` (ou "Meta venceu há 2 dias" em `warning`) quando há
  pendentes.
- `headerExtra`: `SegmentedControl` **Seus clientes (12)** (só quando você é responsável por algum)
  · **Pendentes (18)** · **Todos (30)**, a busca de cliente e um `MemberPicker` "Responsável". O
  escopo de quem abriu define a opção inicial.
- Corpo: uma linha por cliente, com `MatrixStatusCell`, o nome (botão que abre a ficha do cliente,
  §13.2), o regime em `text-muted`, o **responsável efetivo** (`MemberAvatar sm` e o nome curto;
  tooltip com a origem: "Responsável do cliente no Fiscal", "Responsável padrão" ou "Atribuída só
  nesta competência por Ana P.") e, se concluída, "Concluída por Ana P. em 12/10, 14:32" em
  `text-mini text-muted`. O "⋯" da linha tem **Atribuir a mim**, **Atribuir a…** (só esta
  competência; não muda o responsável do cliente) e **Ver cliente**.
- Rodapé: `link` **Abrir na auditoria**.

### 10.5 Estados e larguras

- **Vazio**: `Repeat`, "Nenhuma tarefa recorrente", "Cadastre as obrigações que se repetem (DAS,
  DCTFWeb, folha), o departamento que cuida delas e a quais clientes se aplicam. Elas aparecem na
  auditoria mensal e nas tarefas de cada responsável." e `outline` **Nova tarefa recorrente**. Para
  o colaborador, a mesma frase começa por "Os administradores cadastram…" e não há botão.
- **Carregando**: `SkeletonRows`. **Erro**: `ErrorState`. **Sem resultado nos filtros**: "Nenhuma
  tarefa recorrente com esses filtros" e **Limpar filtros**.
- **Larguras**: as colunas seguem §5.2. Em 1024 a linha fica sem "Aplica-se a" e sem Departamento
  (os dois vão para o subtítulo); em 390, os filtros viram busca e "Filtros (N)", e "Ver no
  calendário" vai para um `⋯` ao lado do botão principal.

---

## 11. Auditoria mensal (`/tarefas/auditoria`)

**Pergunta da tela:** "Na competência, o que cada cliente já entregou, o que falta e quem concluiu?"
**Peça própria do produto:** a matriz cliente × tarefa recorrente.

### 11.1 Estrutura

1. `PageHeader`
   - **Auditoria mensal**.
   - `description` com o achado: "Outubro de 2026: 182 de 240 concluídas (76%). 12 pendências já
     passaram do prazo legal."
   - `actions`: `PeriodNavigator modes={['month']}` (competência, `?competencia=`). O padrão é o
     mês atual e "Hoje" volta a ele. Tooltip do rótulo: "Competência: mês em que o prazo legal
     cai".
2. `AuditSummary` (como o `ClientsSummary`):

   | Célula | Conteúdo | Clique |
   | --- | --- | --- |
   | Concluídas (principal) | "182 de 240" em 32px, com "76% da competência" embaixo | — |
   | Pendências atrasadas | "12", em `text-danger` se maior que 0, com "em 5 clientes · 7 fora da meta" embaixo (o segundo trecho em `text-warning`) | liga "Só com pendências" e ordena os clientes com pendência vencida primeiro |
   | Clientes com pendências | "9 de 40" | liga "Só com pendências" |
   | Por departamento | linhas: nome, barra `bg-data` (concluídas sobre o total do departamento) e "64/80" | filtra o departamento (`aria-pressed`) |
3. Barra de ferramentas num `Card p-4`: `SegmentedControl` Visão **Por cliente** · **Por tarefa**,
   busca ("Buscar cliente" ou "Buscar tarefa recorrente", conforme a visão), `Select` Regime
   ("Todos os regimes" e `TAX_REGIME_LABELS`), `Select` Departamento (vem com o departamento do
   Início quando se chega por ele), `MemberPicker` Responsável ("Só os meus" no topo), `Switch` "Só
   com pendências" e **Limpar**. Com Responsável, ficam os clientes em que a pessoa responde por ao
   menos uma coluna visível, e as células de outros responsáveis ficam com `opacity-50` (continuam
   clicáveis: o colaborador pode marcar a de um colega).
4. O conteúdo da visão.

### 11.2 Por cliente, a partir de 1024px: `AuditMatrix`

Fica num `Card overflow-hidden` com rolagem própria nos dois eixos. A página nunca rola de lado.

- **Linhas**: clientes ativos que já eram clientes na competência, em ordem alfabética (com "Só com
  pendências", os de pendência vencida vêm primeiro). Cada linha tem 52px.
- **1ª coluna, fixa à esquerda** (264px, `sticky left-0 bg-surface`, com borda direita
  `border-border-strong` quando a tabela está rolada): o nome (`text-sm font-semibold`, botão que
  abre a ficha do cliente da Gestão, §13.2, sem honorários) e, embaixo, "Simples Nacional ·
  12.345.678/0001-90" (`text-xs text-muted tabular`).
- **Colunas**: as recorrentes que ocorrem na competência, ordenadas pela meta e depois pelo nome,
  com 104px cada. O cabeçalho (72px, fixo no topo) tem o nome curto (até 2 linhas, `text-caption
  font-semibold`, tooltip com o nome completo, o departamento e o responsável padrão), o prazo da
  coluna ("Meta 15/10 · legal 20/10"; com pendentes, "Prazo legal venceu há 8 dias" em `danger` ou
  "Meta venceu há 2 dias" em `warning`) e "18/23" (`text-mini tabular text-muted`).
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
| Clique ou **Enter** numa célula Concluída | abre o `ConclusionPopover`: "Concluída por **Ana Paula Ribeiro** em 12/10/2026 às 14:32" e o botão `outline sm` **Reabrir**, que volta para A fazer, apaga o registro e mostra o toast "DCTFWeb reaberta para Padaria Pão Dourado.". Esc fecha. Reabrir **nunca** acontece num clique só, porque a conclusão é registro de auditoria. O botão só aparece para quem concluiu e para administradores; os outros veem "Só quem concluiu ou um administrador pode reabrir." em `text-caption text-muted` |
| Teclas **1**, **2** e **3** na célula em foco | definem A fazer, Em andamento ou Concluída direto (em célula Concluída, **1** e **2** abrem o popover) |
| Salvando | a célula fica com `aria-busy` e opacidade de 70%; em erro, volta ao estado anterior e aparece `toastError` |

### 11.3 Por tarefa (todas as larguras): `AuditAccordion mode="tarefa"`

- Cada recorrente da competência é uma linha (padrão de §5) com `CategoryIcon` neutro (`Repeat`),
  o nome e o selo da periodicidade, "Fiscal · padrão: Ana Paula" no subtítulo, "18/23" com barra
  (trilho `bg-bg-subtle`, preenchimento `bg-data`) e a meta à direita com o `TaskDueLabel` de meta e
  prazo legal (§3.5). O chevron fica em `aria-expanded`.
- Aberta, mostra os clientes daquela tarefa, um por linha, com `MatrixStatusCell` à esquerda, o
  nome, o regime, o responsável efetivo (avatar e nome curto) e a linha de conclusão em
  `text-mini text-muted` ("Concluída por Ana P. em 12/10, 14:32"). É o mesmo componente do
  `RecurringOccurrenceSheet`.
- Com "Só com pendências", a tarefa aberta mostra só os clientes pendentes, e somem as tarefas sem
  pendentes.
- `?recorrente=<id>` abre aquela tarefa e rola até ela.

### 11.4 Por cliente abaixo de 1024px (tablet e celular)

`AuditAccordion mode="cliente"`. Cada cliente é uma linha com o avatar de iniciais (36px,
`bg-primary-soft`), o nome, "Simples Nacional · 7 de 9" e uma barra de 64px à direita. Aberta, lista
as recorrentes do cliente com `MatrixStatusCell` de 40px (área de toque), nome, departamento,
responsável e o prazo de meta e prazo legal à direita, além da linha de conclusão. A matriz não
aparece abaixo de 1024px.

### 11.5 Estados e larguras

| Estado | Texto |
| --- | --- |
| Nenhuma recorrente cadastrada | `ClipboardCheck`, "A auditoria começa pelas tarefas recorrentes", "Cadastre as obrigações do escritório e a quais clientes se aplicam; elas viram as colunas desta tela." e, para administradores, `outline` **Cadastrar tarefas recorrentes** (o colaborador lê "Os administradores cadastram as obrigações…" e não tem botão) |
| Nenhum cliente ativo | `Building2`, "Nenhum cliente ativo nesta competência" e `outline` **Ir para Clientes** (`/tarefas/clientes`; os clientes são cadastrados no financeiro) |
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

## 12. Processos e modelos (`/tarefas/processos`)

**Pergunta da tela:** "Que roteiros o escritório reaproveita, e como aplico um a um cliente?"
"Processo" é o nome que o escritório já usa (Onvio Processos, Domínio Processos) para o que o Effy
chamava de fluxo de tarefas. No código, os componentes continuam `Flow*`.

### 12.1 Estrutura

1. `PageHeader`: **Processos**, com a descrição "Roteiros em etapas: cada etapa vira tarefa quando a
   anterior é concluída. 3 modelos · 5 processos em andamento." As ações são `outline` **Criar
   processo avulso** (todos, `WriteGate scope="tasks"`) e `primary` **Novo modelo** (só
   administradores). Para o colaborador, a descrição termina em "Somente administradores alteram os
   modelos."
2. **Modelos**: `Card` com `CardHeader` "Modelos de processo" e a lista.
   - Linha (`FlowTemplateRow`): `CategoryIcon` neutro com `Workflow`; título com o selo "5 etapas";
     subtítulo com a descrição; coluna **Departamentos** (`w-36`, `@4xl`): "Societário e Fiscal";
     coluna **Prazo total** (`w-36`, `@2xl`): "até 16 dias" com "somando os prazos" embaixo; coluna
     **Uso** (`w-36`, `@3xl`): "Aplicado 7 vezes" ou "Nunca aplicado"; botão `outline sm`
     **Aplicar** sempre visível (é a ação principal da linha, para todos, `WriteGate
     scope="tasks"`) e o menu (Editar, Duplicar e Excluir para administradores; **Ver etapas**
     para o colaborador). O clique na linha abre o editor, em leitura para o colaborador.
3. **Em andamento** (opcional, ver §18): `Card` "Processos em andamento". Cada linha tem o título
   ("Abertura de empresa · Construtora Vale Verde"), um mini-progresso de etapas (5 pontos de 8px:
   feitas em `bg-data`, a atual com anel `ring-2 ring-data`, as que aguardam em
   `bg-border-strong`) com "Etapa 2 de 5", a tarefa atual (nome, `MemberAvatar sm` e
   `TaskDueLabel`) e o clique abre a tarefa atual.

### 12.2 Editor de modelo (`FlowTemplateSheet`, `width="lg"`, só administradores editam)

- Título "Novo modelo de processo" ou "Editar modelo de processo". Descrição: "O cliente não é
  definido aqui: é escolhido ao aplicar o modelo e vale para todas as etapas."
- Campos: **Nome do modelo*** ("Ex.: Abertura de empresa") e **Descrição** ("Para que serve este
  roteiro").
- **Etapas** (`FlowStepsEditor`), com a dica "O prazo de cada etapa conta em dias corridos a partir
  da conclusão da anterior. Na primeira, conta do dia em que o modelo for aplicado. Use 0 para
  vencer no mesmo dia."
  - Cada etapa é um bloco `rounded-lg border p-3` em duas linhas. Na 1ª: a alça `GripVertical`, um
    círculo com o número (24px, `bg-bg-subtle text-mini font-semibold`), **Nome** (`flex-1`, "Nome
    da tarefa desta etapa"), **Prazo** (`Input type="number" min=0 max=365`, 80px, com o sufixo
    "dias") e um `⋯` (Categoria…, Mover para cima, Mover para baixo, Remover etapa). Na 2ª, alinhada
    ao nome: **Departamento** (`Select`), **Responsável** (`MemberPicker` com o `departmentId` da
    etapa) e **Prioridade** (`Select`). Escolher um responsável de um departamento só preenche o
    Departamento vazio, como na tarefa (§9.1). Em largura de celular, a 2ª linha empilha os três.
  - Reordenar arrastando pela alça ou, pelo teclado, com **Alt+↑** e **Alt+↓** na alça (anúncio
    "Etapa movida para a posição 2 de 5").
  - `ghost` **+ Adicionar etapa**, que já vem com 1 dia de prazo, o departamento da etapa anterior e
    o foco no nome.
- **Prévia** (`text-caption text-muted`, `bg-surface-muted rounded-lg p-3`): "Se aplicado hoje
  (28/10): a etapa 1 vence em 29/10; as outras contam da conclusão da anterior (+2, +3, +5 e +6
  dias)."
- Validação: "Informe o nome do modelo.", "Adicione pelo menos uma etapa.", "Informe o nome da
  tarefa desta etapa.", "Escolha o departamento desta etapa." e "O prazo deve ficar entre 0 e 365
  dias."
- Rodapé: **Cancelar** e **Salvar modelo**. Para o colaborador: os campos em leitura e só
  **Fechar**.

### 12.3 Aplicar modelo (`ApplyTemplateDialog`, `Modal` com `max-w-lg`)

- Título "Aplicar “Abertura de empresa”". Descrição: "A primeira tarefa é criada agora; as outras,
  quando a anterior for concluída."
- **Cliente*** (`ClientPicker`, sem "Interna", "Selecione o cliente…") e **Nome do processo**
  (opcional; o padrão é "Abertura de empresa · {cliente}").
- **Tarefas que serão criadas** (lista numerada): "1. Solicitar documentos · Societário · Marina S.
  · vence 29/10 (criada agora)" e "2. Consulta de viabilidade · Societário · Rafael L. · 2 dias
  após a etapa 1", e assim por diante.
- Rodapé: **Cancelar** e `primary` **Aplicar ao cliente**. Erro de validação: "Selecione o cliente
  para aplicar o modelo."
- Ao concluir: fecha e mostra o toast "Modelo aplicado. A primeira tarefa já foi criada." com a
  ação **Ver tarefa**.
- Pelo cabeçalho de Tarefas, pela barra flutuante ("Processo") ou pelo "+" do celular, um passo
  antes aparece um `Modal` com a busca e a lista de modelos ("Escolha o modelo").

### 12.4 Processo avulso (`FlowBuilderSheet`, `width="lg"`)

- Título "Novo processo". Descrição: "Cada etapa só aparece para o responsável quando a anterior for
  concluída."
- Campos: **Nome do processo*** ("Ex.: Alteração contratual da Padaria Pão Dourado"), **Cliente**
  (`ClientPicker` com "Interna", vale para todas as etapas) e as **Etapas**, no mesmo
  `FlowStepsEditor`. No `⋯` de cada etapa há "Outro cliente…" para quando uma etapa for de outro
  cliente (o Effy permitia um cliente por etapa).
- `Checkbox` "Salvar também como modelo" (só administradores).
- Rodapé: **Cancelar** e **Criar processo**. Toast: "Processo criado. A primeira tarefa já está com
  Marina."

### 12.5 Estados

- **Sem modelos**: `Workflow`, "Nenhum modelo de processo", "Cadastre roteiros como Abertura de
  empresa ou Alteração contratual e aplique a qualquer cliente com um clique." e `outline` **Novo
  modelo** (administradores; o colaborador lê "Os administradores cadastram os modelos…" e pode
  usar **Criar processo avulso**).
- **Sem processos em andamento**: uma linha só no Card, "Nenhum processo em andamento."
- **Excluir modelo**: "Excluir o modelo “Abertura de empresa”?" com "Os processos já aplicados
  continuam; só o roteiro deixa de existir."
- **Larguras**: as colunas seguem §5.2; em 390, "Aplicar" fica visível e as colunas vão para o
  subtítulo ("5 etapas · até 16 dias · aplicado 7 vezes").

---

## 13. Clientes e cadastros

### 13.1 Clientes (`/tarefas/clientes`)

**Pergunta da tela:** "Quem cuida de cada cliente em cada departamento, e como falo com ele?"
**Achado:** clientes ativos sem responsável em algum departamento (as recorrentes deles vão para o
responsável padrão, ou para ninguém).
**Ação mais frequente:** achar um cliente e ver contato e responsáveis; para administradores,
definir responsáveis.

O cadastro é o do financeiro (`contacts` com `kind = client`): a Gestão só lê. A tela não mostra
honorários a ninguém, nem a administradores (a API já os omite para o colaborador; para o
administrador, eles ficam no financeiro). Cadastrar, alterar e inativar continua em `/clientes`, no
financeiro, só para administradores. O que esta tela **edita** é da Gestão: o responsável de cada
cliente em cada departamento.

1. `PageHeader`: **Clientes**. Descrição: "40 clientes ativos · cadastro mantido pelos
   administradores no financeiro". Ação, só para administradores: `outline` **Editar no
   financeiro** (`Wallet`), que leva a `/clientes`. Para o colaborador, nenhuma ação.
2. `ClientCoverageSummary`, no molde do `ClientsSummary` (3 células):

   | Célula | Número | Linha de baixo | Clique |
   | --- | --- | --- | --- |
   | Clientes ativos (principal) | "40" em 32px | "2 inativos" (alterna a situação para Inativos, como o link de hoje) | — |
   | Sem responsável | "6", em `text-warning` se maior que 0 | "em 4 clientes · as recorrentes vão para o responsável padrão" | alterna `sem-responsavel=1` (`aria-pressed`) |
   | Por departamento | linhas: nome, barra com trilho `bg-bg-subtle` e preenchimento `bg-data` (clientes ativos com responsável sobre o total) e "34/40" | — | filtra o departamento (`aria-pressed`) |

   "Sem responsável" conta vagas (cliente × departamento que tem recorrentes que se aplicam ao
   cliente), não clientes; por isso a linha de baixo diz em quantos clientes elas estão.
3. Barra de ferramentas no topo do `Card` da lista (como em Clientes do financeiro): busca ("Buscar
   por razão social, fantasia ou CNPJ"), `SegmentedControl size="sm"` Ativos · Inativos · Todos,
   `Select` Regime, `Select` Departamento, `MemberPicker` Responsável ("Clientes de Ana Paula", a
   carteira dela), `Switch` "Só sem responsável" e, à direita, "40 clientes".
4. Lista, no padrão de §5 (`TaskClientRow`):

   ```
   [AP] Padaria Pão Dourado          │ 12.345.678/0001-90 │ Simples Nacional │ ◯ Ana P.  │ ◯ Bruno C. │ ◌ Sem resp. │ ⋯
        Pão Dourado Comércio Ltda    │                    │ Anexo I          │ (Fiscal)  │ (Pessoal)  │ (Contábil)  │
   ```

   - **Identificação** (`flex-1`): o círculo de iniciais de 36px de Clientes do financeiro, o nome
     (fantasia ou razão, `text-sm font-semibold`) e, embaixo, a razão social quando há fantasia, ou
     "Inativo desde 12/08/2026" nos inativos (nome em `text-muted` e `Badge neutral` "Inativo").
   - **CNPJ** (`w-40 tabular text-muted`, a partir de `@3xl`).
   - **Regime** (`w-36`, a partir de `@2xl`), com "Anexo I" embaixo no Simples.
   - **Uma coluna por departamento** (`w-36` cada, a partir de `@4xl`; o cabeçalho é o nome do
     departamento): `ClientResponsibleCell` com `MemberAvatar sm` e o nome curto, ou o círculo
     tracejado e "Sem responsável" em `text-subtle`. A célula não leva cor de alerta: o alerta
     aparece uma vez, no resumo. Departamento sem recorrentes que se apliquem ao cliente mostra "—".
     Com mais de 4 departamentos, ou abaixo de `@4xl`, as colunas viram uma só, "Responsáveis"
     (`w-28`, a partir de `@xl`), com a pilha de avatares (tooltip "Fiscal: Ana P. · Pessoal: Bruno
     C. · Contábil: sem responsável") e "1 sem responsável" em `text-mini text-warning` quando
     houver. Com o filtro Departamento, só a coluna dele aparece.
   - **Menu `⋯`**: **Ver ficha**, **Ver tarefas do cliente**
     (`/tarefas?escopo=todas&cliente=<id>`), **Ver na auditoria** (`/tarefas/auditoria?busca=<nome>`)
     e, para administradores, separador e **Editar no financeiro** (`/clientes?editar=<id>`).
   - O clique na linha abre a ficha (`?cliente=<id>`, §13.2).
   - **Administrador**: a célula de departamento é um botão ("Responsável pelo Fiscal de Padaria
     Pão Dourado: Ana Paula. Alterar.") que abre o `MemberPicker` (`departmentId`, `allowNone`
     "Sem responsável"). A escolha salva na hora (otimista, toast com "Desfazer", §17). Um
     `Checkbox` antes das iniciais seleciona a linha para o lote (§13.3); ele aparece no hover e no
     foco, fica visível quando há seleção e sempre em `pointer-coarse`.
   - **Colaborador**: a célula é texto e não há caixas de seleção.
   - Paginação de 50, como em Contas a pagar.

### 13.2 Ficha do cliente (`TaskClientSheet`, `width="lg"`)

Abre pela linha, pela auditoria, pelo `RecurringOccurrenceSheet` e pela busca (⌘K). Título: o nome.
Descrição: "Simples Nacional · 12.345.678/0001-90 · Ativo" (ou "Inativo desde 12/08/2026").

Corpo, de cima para baixo (`gap-6`):

1. **Contatos**: e-mail (`mailto:`) e telefone (`tel:`) da empresa e o responsável na empresa
   (nome, e-mail e telefone), cada um com o botão de copiar (`Copy`, `icon-sm ghost`, toast
   "Copiado."). Vazio: "Nenhum contato cadastrado." e, para administradores, o link **Cadastrar no
   financeiro**.
2. **Responsáveis por departamento**: uma linha por departamento (o nome em `w-28 text-body-sm
   text-muted` e a `ClientResponsibleCell`), com a dica "Recebe as tarefas recorrentes deste cliente
   no departamento. Sem responsável, vale o responsável padrão de cada tarefa recorrente." Para
   administradores, cada linha é um `MemberPicker` que salva sozinho (`SavedStamp` no rodapé).
3. **Tarefas**: "6 em aberto · 2 atrasadas" (o trecho das atrasadas em `text-danger`), até 5
   `TaskRow density="compact"` e o link **Ver tarefas do cliente**; embaixo, "Obrigações de outubro:
   7 de 9 concluídas" com o link **Ver na auditoria**.
4. **Dados cadastrais** (`ClientProfile`): razão social, nome fantasia, CNPJ (com copiar), abertura,
   atividade principal, regime (e anexo), cliente desde (o início do contrato, que decide de quando
   em diante as recorrentes se aplicam), endereço e situação (com o motivo da inativação). Sem
   honorários, sem vencimento do honorário e sem desconto.

Rodapé: à esquerda, o `SavedStamp` (administradores); à direita, `outline` **Editar no financeiro**
(administradores, leva a `/clientes?editar=<id>`) e `ghost` **Fechar**.

**Efeito de trocar o responsável** (na célula, na ficha ou em lote): as ocorrências **em aberto**
daquele cliente e departamento, da competência atual em diante, passam para a pessoa nova, menos as
atribuídas à mão numa competência. Concluídas não mudam. O toast diz quantas mudaram (§17).

### 13.3 Responsável em lote (`AssignResponsibleDialog`, `Modal` com `max-w-md`)

Com linhas selecionadas, o cabeçalho da lista vira uma barra de seleção: "3 clientes selecionados",
`outline sm` **Definir responsável…** e `ghost sm` **Limpar seleção**. O diálogo:

- Título "Definir responsável para 3 clientes".
- **Departamento*** (`Select`) e **Responsável*** (`MemberPicker` do departamento; `allowNone`
  "Remover responsável").
- Resumo `text-body-sm`: "Ana Paula passa a responder pelo Fiscal de 3 clientes. 14 tarefas em
  aberto mudam de responsável."
- Rodapé: **Cancelar** e `primary` **Aplicar a 3 clientes**. Toast "Responsável definido para 3
  clientes." com **Desfazer**.

### 13.4 Cadastros (`/tarefas/cadastros`): Departamentos

A página **Cadastros** tem, logo abaixo do `PageHeader`, um `SegmentedControl` com as abas
**Departamentos** · **Categorias** · **Equipe** (`?aba=`). A descrição e a ação mudam com a aba, como
em Relatórios. Para o colaborador, as três abas abrem em leitura, sem botões de criar, e a
descrição termina em "Somente administradores alteram estes cadastros."

- Descrição: "4 departamentos · cada tarefa e cada recorrente pertence a um departamento." Ação:
  **Novo departamento**.
- Linha (`DepartmentRow`): `CategoryIcon` neutro com `UsersRound`; o nome; o subtítulo com os
  membros ("Ana Paula, Bruno e mais 2" ou "Sem membros"); as colunas **Membros** (pilha de avatares,
  `@2xl`), **Em aberto** (`tabular`, com "3 atrasadas" em `text-mini text-danger` embaixo),
  **Recorrentes** (contagem, `@3xl`) e **Clientes com responsável** ("34/40", `@4xl`, com
  `text-warning` no número quando faltar algum); e o menu (Editar, Excluir).
- **`DepartmentSheet`** (`md`): **Nome*** ("Ex.: Fiscal") e **Membros**, uma lista com busca em que
  cada membro aparece com `Checkbox`, avatar, nome e, se estiver em outros departamentos, "também em
  Contábil" em `text-muted`. Dica: "Um membro pode estar em mais de um departamento." Rodapé:
  **Cancelar** e **Salvar departamento**.
- **Excluir com vínculos** (regra do Effy): um `Modal` informativo "Não é possível excluir Fiscal"
  com "2 membros, 5 tarefas recorrentes, 12 tarefas e 40 responsáveis de clientes ainda estão neste
  departamento. Mova-os antes de excluir." e o botão **Entendi**. Sem vínculos: `ConfirmDialog`
  "Excluir o departamento Fiscal?".
- **Vazio**: `UsersRound`, "Nenhum departamento", "Departamentos agrupam a equipe (Fiscal, Pessoal,
  Contábil). Cada tarefa e cada recorrente pertence a um, e o Início mostra o trabalho de cada
  departamento." e **Novo departamento**.

### 13.5 Cadastros: Categorias de tarefa

- Descrição: "Rótulos para filtrar e analisar as tarefas." Ação: **Nova categoria**.
- Linha: `CategoryIcon` neutro com o ícone da categoria, o nome, o subtítulo "12 tarefas" e o menu.
- **`TaskCategorySheet`** (`md`): **Nome*** ("Ex.: Abertura, Alteração, Certidões, Atendimento"),
  **Ícone** (`IconPicker`), **Cor** (`ColorPicker`) e a **Prévia** (`CategoryIcon tinted` com o
  nome).
- **Excluir**: "Excluir a categoria Certidões?" com "12 tarefas ficarão sem categoria."
- **Vazio**: `Tags`, "Nenhuma categoria" e "Categorias são rótulos livres para filtros e
  relatórios."

### 13.6 Cadastros: Equipe (usuários)

**Pergunta da aba:** "Quem está em cada departamento, com que papel, e quanto cada um carrega?"

- Descrição: "8 pessoas · 2 administradores e 6 colaboradores". Ação, só para o proprietário:
  `outline` **Convidar pessoa** (`MailPlus`), que leva a `/configuracoes?aba=membros`, onde o
  convite já existe. Para os outros administradores, no lugar do botão, o texto `text-body-sm
  text-muted` "Convites e papéis ficam com o proprietário em Configurações › Membros."
- Quando houver, uma nota acima da lista, no molde da nota de honorários do `ClientsSummary`
  (`CircleAlert` em `text-warning`): "2 pessoas sem departamento não aparecem no Início de nenhum
  departamento." com `outline sm` **Ver quem** (filtra a lista).
- Linha (`TeamRow`, no padrão de §5):
  - `MemberAvatar md`, o nome (com o `Badge tone="brand"` "Você", como em Configurações) e o e-mail
    no subtítulo;
  - **Papel** (`w-32`, a partir de `@2xl`): "Proprietário", "Administrador" ou "Colaborador" em
    `text-body-sm text-muted`, com a dica do papel no tooltip. É texto, não selo: o papel não pede
    ação;
  - **Departamentos** (`w-48`, a partir de `@xl`): "Fiscal, Pessoal", truncado, ou "Sem
    departamento" em `text-subtle`. Para administradores é um botão que abre o
    `MemberDepartmentsPicker` (popover com a lista de departamentos em `Checkbox`; cada marcação
    salva na hora, e ao fechar aparece o toast "Bruno agora está em Fiscal e Pessoal.");
  - **Carteira** (`w-28`, a partir de `@3xl`): "18 clientes", link para
    `/tarefas/clientes?responsavel=<id>`;
  - **Em aberto** (`w-28 text-right tabular`, a partir de `@3xl`), com "2 atrasadas" em `text-mini
    text-danger` embaixo;
  - menu: **Ver tarefas** (`/tarefas?escopo=todas&responsavel=<id>`), **Ver clientes**, **Editar
    departamentos** (administradores) e **Alterar papel** (proprietário, leva a Configurações ›
    Membros).
- Remover alguém do espaço continua só em Configurações › Membros. Lá, a lista ganha a coluna
  "Departamentos" (texto) com o link **Gerenciar na equipe**.
- **Vazio** (só você no espaço): `UsersRound`, "Só você neste espaço" e "Convide a equipe e distribua
  as pessoas pelos departamentos.", com **Convidar pessoa** para o proprietário.

---

## 14. Relatórios de tarefas (`/tarefas/relatorios`)

**Pergunta da tela:** "Como o escritório entregou no período, e onde o atraso se concentra?"

### 14.1 Estrutura

1. `PageHeader`
   - **Relatórios de tarefas**.
   - Descrição com o achado: "Outubro de 2026: 86 tarefas, 61 concluídas (73% das não canceladas),
     7 delas com atraso. Fiscal concentra 9 das 12 atrasadas."
   - Ações: `PeriodFilter` (o mesmo de Relatórios; o padrão é **Mês**), `outline` **Exportar CSV**
     (`Download`) e `outline` **Imprimir ou salvar PDF** (`Printer`, `window.print()` com
     `usePrintInLight`).
2. Filtros num `Card p-4`: Departamento, Responsável, Categoria, Cliente, **Situação** (`Select`
   com grupos, como no Effy: "Em aberto (todas)", "Concluídas (todas)" e "Atrasadas", seguidos de
   A fazer, Em andamento, Aguardando cliente, Concluída e Cancelada), Prioridade, Tipo (Avulsas,
   Recorrentes ou Etapas de processo) e Limpar. Cada ocorrência recorrente conta como uma tarefa por
   cliente (§0, item 7).
3. Resumo (um painel com divisórias e 5 células): **Concluídas no período** como principal ("61 de
   83", com "73% · 54 no prazo, 7 com atraso" embaixo; as canceladas ficam fora da conta);
   **Em aberto** "22"; **Atrasadas** "12" (`danger` se maior que 0); **Canceladas** "3"; **Total**
   "86". As 4 primeiras alternam o filtro de situação (`aria-pressed`).
4. Grade de blocos (2 colunas a partir de 1024px, 1 abaixo), cada um num `Card p-5` com
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
5. **Detalhamento** (`Card`): o cabeçalho "Detalhamento" com "86 tarefas" à direita. É uma
   **tabela, não uma lista**, porque é o que vai para o PDF e o CSV, com as mesmas colunas: Tarefa,
   Cliente, Departamento, Categoria, Responsável, Prioridade, Vencimento (o prazo legal, nas
   recorrentes), Meta (só recorrentes; "—" nas avulsas), Situação, Concluída em, No prazo ("Sim" ou
   "Não"; vazio nas abertas) e Concluída por. Uma ocorrência recorrente é uma linha por cliente.
   Cabeçalho em `text-xs text-muted` sem faixa; datas `tabular` à direita; régua de 1px entre
   linhas; o cabeçalho fica fixo na rolagem. São 50 linhas por página. O clique numa linha abre o
   `TaskSheet` (avulsa) ou o `RecurringOccurrenceSheet` (recorrente).

### 14.2 Exportação

- **CSV** com as colunas do detalhamento, `;` como separador, BOM UTF-8 e proteção contra injeção
  de fórmula (prefixar `'` em valores que começam com `= + - @`, tab ou CR, como no Effy). O nome do
  arquivo é `relatorio-tarefas-AAAA-MM-DD.csv` e o toast diz "CSV exportado.". Sem dados, o botão
  fica desabilitado com o tooltip "Não há dados para exportar com os filtros atuais."
- **PDF** (impressão): `@page { size: A4 landscape }` só nesta página. O trilho, os filtros e os botões
  ficam `print:hidden`. Saem o título, a descrição (com o período), o resumo, os blocos (2 por
  linha) e a tabela, além da nota "Gerado em 28/10/2026 às 15:40."

### 14.3 Estados e larguras

- **Sem tarefas no período**: o resumo mostra zeros (que são dados reais); os blocos ficam com o
  contorno e a frase "Nenhuma tarefa no período."; o detalhamento mostra o `EmptyState` "Nenhuma
  tarefa com vencimento em outubro" com **Ver últimos 3 meses**, que muda o período.
- **Carregando**: esqueletos do tamanho final em cada bloco. **Erro**: `ErrorState` por bloco.
- **Larguras**: em 1440 e 1024, 2 colunas de blocos; em 768, 1 coluna; em 390, os botões de
  exportar vão para um `⋯` ao lado do período, e a tabela vira **linhas de duas linhas** (tarefa e
  situação na primeira; "Padaria Pão Dourado · Ana P. · vence 25/10" na segunda), sem perder campos.

---

## 15. Widgets: o Início e o painel financeiro

A versão anterior punha 8 widgets de tarefas no dashboard financeiro, porque ele era a página
inicial de todos. Agora a página inicial é o Início (§6), e o dashboard financeiro é só dos
administradores. Os widgets de tarefas **saem do catálogo do dashboard**: o grupo `tarefas` não entra
em `layout/specs.ts` e nenhum id novo entra em `layout/types.ts`.

| Widget da versão anterior | Para onde foi |
| --- | --- |
| `minhas-tarefas` | Início, bloco Minhas tarefas (§6.4) |
| `tarefas-atrasadas` | Início, célula Atrasadas do resumo (§6.3), que leva à lista filtrada |
| `situacao-tarefas` | Relatórios de tarefas, bloco Por situação (§14.1) |
| `tarefas-por-dia` | sai: o Calendário de Tarefas (§7.6) e a célula "Próximos 7 dias" do Início respondem à mesma pergunta |
| `processos-departamento` | Início, bloco Obrigações da competência (§6.5), e o resumo por departamento da Auditoria (§11.1) |
| `agenda-tarefas` | Tarefas, visualização Calendário (a agenda em lista abaixo de 1024px, §7.6) |
| `clientes-pendencias` | Início, bloco Por cliente (§6.7) |
| `anotacoes` | menu do avatar, menu "Mais" do celular e ⌘K: **Minhas anotações**, nas duas áreas |

**Nenhum widget de tarefas no painel financeiro.** O painel responde "como está o caixa do
escritório"; o administrador começa o dia no Início, que já mostra as tarefas. Um widget de tarefas
no painel repetiria os números do Início em outro lugar e com outro recorte (um número, um lugar).
Se um dia fizer falta, o candidato é um só, "Clientes com tarefas atrasadas" ao lado dos cards de
clientes, e só depois de confirmado com o usuário.

**Peças que o Início aproveita dos widgets**: `WidgetCard` (cabeçalho fixo com título, subtítulo e
ação; sem alça de mover nem olho de ocultar, porque o Início não é personalizável), `FitList`,
`ListSkeleton`, `BodyEmpty` e o `ErrorState` compacto.

**`NotesSheet`** (`md`): título "Minhas anotações", descrição "Visíveis somente para você.", a ação
`ghost sm` **+ Nova** e a lista (título, a primeira linha em `text-muted` e "editada há 2 dias").
Vazio: "Nenhuma anotação" e "Guarde lembretes e endereços de portais. Só você vê." O clique numa
anotação abre o **`NoteSheet`** (`md`): título "Nova anotação" ou "Editar anotação", descrição
"Visível somente para você.", campos **Título*** ("Ex.: Portal da prefeitura", máximo de 200
caracteres) e **Anotação** (`Textarea` de 8 linhas). Rodapé: **Excluir** à esquerda (só na edição),
depois **Cancelar** e **Salvar**.

---

## 16. Acessibilidade

| Elemento | Semântica e teclado |
| --- | --- |
| Trilho de cada área | `nav` com `aria-label` da área ("Navegação da gestão de tarefas"), links com `aria-label` e `aria-current="page"`; Tab entre os itens; o "mais" é `button` com o número de itens no nome |
| Botão de troca de área | `Link` com `aria-label="Ir para o financeiro"` (ou "…para a gestão de tarefas"), fora da `nav` da área; nunca `aria-current` |
| Seção Área do "Mais" (celular) | lista de dois links; a área atual com `aria-current="true"` e o texto "(atual)" em `sr-only` |
| Acesso restrito | página com `h1` "Acesso restrito"; o foco vai para o `h1` ao abrir, como em qualquer navegação; os nomes dos administradores são texto, não links |
| Escopo, Situação, Visualização, Visão, Departamento do Início | `SegmentedControl` (`radiogroup`, setas ← →, já implementado) ou `Select` |
| Células do resumo que filtram | `button` com `aria-pressed` e `aria-label` com o número: "Atrasadas: 7. Filtrar a lista." |
| Células do resumo do Início | `Link` com `aria-label` com o número e o destino: "Atrasadas no Fiscal: 7. Ver na lista de tarefas." |
| Responsável do cliente (célula editável) | `button` com `aria-label="Responsável pelo Fiscal de Padaria Pão Dourado: Ana Paula. Alterar."` que abre o `MemberPicker`; no colaborador, texto com o mesmo conteúdo |
| Seleção em lote (Clientes) | `Checkbox` com `aria-label="Selecionar Padaria Pão Dourado"`; a barra de seleção anuncia "3 clientes selecionados" em `aria-live="polite"` |
| Grupo da lista | `section aria-labelledby` com cabeçalho `h2` (visualmente 14px); recolher com `aria-expanded` e `aria-controls` |
| `TaskStatusButton` | `button` com `aria-pressed={concluída}` e `aria-label="{Estado}: {título}. Ativar para concluir."` (ou "…para reabrir."); desabilitado com o motivo no `aria-label` (como o `PaidToggle`) |
| Título da linha | `button` cujo nome é o título; abre o Sheet |
| Menu `⋯` | `aria-label="Ações de {título}"`; "Mudar situação ›" e "Mover para ›" são submenus com itens `menuitemradio`. O wrapper `components/ui/dropdown-menu.tsx` ainda não exporta isso: adicionar `DropdownMenuSub`, `DropdownMenuSubTrigger`, `DropdownMenuSubContent`, `DropdownMenuRadioGroup` e `DropdownMenuRadioItem` (Radix), com o mesmo visual do `DropdownMenuItem` |
| Quadro | cada coluna é `section aria-labelledby` ("A fazer, 12 tarefas, 3 atrasadas"); cartões em `ul`/`li`; a alça é `button` "Mover {título}" com o fluxo de teclado de §8.3; anúncios num `aria-live="polite"` compartilhado |
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

## 17. Microinterações e feedback

**Atualização otimista com desfazer.** Na mutação, `onMutate` atualiza o cache da lista, do
quadro, dos resumos e dos blocos do Início; `onError` restaura e chama `toastError(error)`; `onSettled`
invalida as chaves de tarefas e o resumo. Os toasts com "Desfazer" duram 6s
(`toast(msg, { duration: 6000, action: { label: 'Desfazer', onClick } })`).

| Ação | Feedback imediato | Toast |
| --- | --- | --- |
| Concluir (linha, cartão ou Sheet) | o botão faz "pop" (`animate-pop`) e vira verde; **a linha fica no lugar, esmaecida (`opacity-70`), enquanto o toast estiver aberto**, e só depois some (a altura vai a 0 em 200ms) | "Tarefa concluída." com **Desfazer** |
| Concluir etapa de processo | igual | "Tarefa concluída. Próxima etapa criada para Rafael: Contrato social (vence 04/11)." com **Ver etapa** (sem desfazer, ver §18) |
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
| Excluir (administradores) | confirmação antes | "Tarefa excluída." |
| Trocar o responsável de um cliente (célula ou ficha) | o avatar troca na hora; a célula fica com `aria-busy` e opacidade de 70% até salvar | "Fiscal de Padaria Pão Dourado: agora com Ana Paula. 5 tarefas em aberto passaram para ela." com **Desfazer** |
| Responsável em lote | o diálogo fecha e as células mudam | "Responsável definido para 3 clientes." com **Desfazer** |
| Departamentos de um membro | o texto da célula muda a cada marcação | ao fechar o popover: "Bruno agora está em Fiscal e Pessoal." |
| Atribuir uma ocorrência a alguém (só a competência) | o avatar da linha troca | "DCTFWeb de Padaria Pão Dourado em outubro: agora com Bruno." com **Desfazer** |
| Trocar de área | a página da outra área abre e o trilho troca os ícones, sem animação | nenhum |
| Aplicar modelo | o diálogo fecha | "Modelo aplicado. A primeira tarefa já foi criada." com **Ver tarefa** |
| Exportar CSV | download | "CSV exportado." |
| Sem permissão | — | o toast global de acesso que já existe (`app-shell.tsx`), agora com a mensagem do servidor (§2.6) |

**Outros detalhes:** o hover das linhas e cartões só troca o fundo ou a borda (sem elevação em
repouso); menus e popovers usam `shadow-lg`; nada tem animação de entrada ao carregar a página;
números que mudam usam `tabular` para não pular; skeletons sem gradiente (`animate-shimmer` de
opacidade, o que já existe).

---

## 18. Pendências para backend e produto

**Acesso e papéis**

1. **Financeiro só para administradores**: em andamento no backend (`apps/api/src/lib/finance-access.ts`
   com `financeOnly(app)` nas rotas financeiras, leitura incluída). Falta: `/search` sem resultados
   financeiros para o colaborador; clientes sem honorários para ele (confirmar se `notes` do
   cliente também sai, porque pode citar valores); e a regra do `from` no login (§2.1).
2. **O colaborador precisa escrever na Gestão.** Hoje `viewer` não escreve nada. As rotas da Gestão
   precisam de duas guardas: escrita de tarefas para qualquer membro com assinatura ativa, e
   cadastros e exclusões só para `owner` e `editor` (§2.6). Inclui: excluir tarefa só administrador;
   remover comentário e anexo, o autor ou administrador; reabrir célula concluída, quem concluiu ou
   administrador. Resolver com `backend-senior` e `security-node-api`.
3. **Rótulos dos papéis** em `packages/shared/src/saas.ts` (§2.6). O papel continua `owner`, `editor`
   e `viewer` no banco; muda só o que a tela diz.

**Dados novos**

4. **Departamentos**: tabela própria e vínculo **N:N** membro × departamento (um membro pode estar
   em mais de um); `departmentId` obrigatório na tarefa avulsa e na recorrente quando o espaço tem
   departamentos.
5. **Responsável do cliente por departamento**: cliente × departamento → membro, com a lista, a
   alteração unitária e a alteração em lote. Ao trocar, reatribuir as ocorrências em aberto da
   competência atual em diante, menos as atribuídas à mão, e devolver quantas mudaram (o toast usa).
6. **Ocorrência por cliente** com responsável efetivo, origem (`manual`, `cliente`, `padrao`) e a
   atribuição só numa competência.
7. **Prazo legal, meta e dia não útil**: um calendário de feriados no servidor (nacionais fixos e
   móveis). Decidir se entram feriados estaduais e municipais, pela cidade do escritório; até lá, a
   prévia do cadastro (§10.3) mostra só os nacionais e diz isso numa dica.
8. **Semanal**: competência por semana (segunda a domingo) e, na matriz mensal, a contagem por
   cliente ("2/4") com as semanas no popover (§3.2).
9. **Prazo legal obrigatório**: recorrentes trazidas do Effy sem data-base precisam receber um
   prazo antes de gerar ocorrências; listar essas na tela de Recorrentes com o aviso "Sem prazo
   legal: não gera tarefas" até alguém corrigir.
10. **Competência fiscal**: a competência aqui é o mês do prazo legal (regra do Effy). Se o
    escritório preferir ver a competência de referência (setembro, para um DAS que vence em
    outubro), basta um texto auxiliar "ref. 09/2026" na auditoria e no Sheet; confirmar com o
    usuário.

**Comportamento**

11. **Unidade de contagem** (§0, item 7): os resumos do Início, de Tarefas, da Auditoria e dos
    Relatórios vêm calculados no servidor, com os mesmos filtros da lista, para os números das
    telas concordarem.
12. **Concluir ocorrência pela lista ou pelo Sheet**: usa o mesmo endpoint da matriz (estado por
    cliente × recorrente × competência). Confirmar que o registro de conclusão é gravado pelo
    servidor com o usuário da sessão.
13. **Desfazer**: o PATCH de estado precisa aceitar voltar ao estado anterior e, na matriz, apagar o
    registro de conclusão (o modelo do Effy já faz isso ao sair de "concluído"). O mesmo vale para
    desfazer a troca de responsável do cliente.
14. **Reabrir etapa de processo**: o que acontece com a etapa seguinte já criada? Até haver regra, o
    toast de etapa concluída não oferece "Desfazer".
15. **"Processos em andamento"** (§12.1, item 3): o Effy retirou essa lista em 01/08/2026 a pedido
    do escritório. Confirmar com o usuário antes de implementar. O módulo funciona sem ela (o
    processo aparece no `FlowStepper` da tarefa e no selo "Etapa N/M").
16. **Excluir tarefa recorrente** apaga o histórico da auditoria (cascata no Effy). Considerar
    **arquivar** (some das próximas competências e mantém o passado). Se aceito, a ação vira
    "Arquivar" e o filtro ganha "Arquivadas".
17. **Busca global** (`/search`, ⌘K): incluir tarefas por título.
18. **Notificações** de comentários nas minhas tarefas: endpoint de "atividade recente" (o Effy
    tinha `loadAtividadeRecente`).
19. **Anotações**: as pessoas guardam acessos de portais nelas (o Effy sugeria isso). Cifrar o
    conteúdo por campo, como os outros dados pessoais, e não sugerir senhas nos textos da tela
    (§15 já não sugere).

---

## 19. Checklist de implementação

- [ ] Contrato em `packages/shared` primeiro: tipos de §1 (com departamento, prazo legal, meta,
      responsável efetivo e origem), rótulos `TASK_STATUS_LABELS`, `TASK_PRIORITY_LABELS`,
      `RECURRENCE_PERIOD_LABELS` (4 valores), `NON_BUSINESS_DAY_RULE_LABELS` e os novos
      `MEMBER_ROLE_LABELS` e `MEMBER_ROLE_HINTS`.
- [ ] Permissões: `usePermissions` (`isAdmin`, `canAccessFinance`, `canWriteTasks`, `canManage`),
      `WriteGate scope`, os textos de §2.6 e o toast de 403 em `app-shell.tsx`.
- [ ] Casca: `nav.ts` (`GESTAO_NAV_ITEMS`, `FINANCE_NAV_ITEMS`, `areaOf`, `end` no `NavItem`, o
      painel em `/financeiro`, testes em `nav.test.ts`), `sidebar.tsx` (área, rótulo, botão de troca,
      Minhas anotações no avatar), `mobile-nav.tsx` (barra e "+" por área, seção Área),
      `quick-bar.tsx`, `command-palette.tsx`, `notifications.tsx` (`enabled` no `useOverdueBills`).
- [ ] `app/router.tsx`: o Início no `index`, as 7 rotas `/tarefas/*` com `lazy`, `/financeiro` e
      as rotas financeiras dentro do `FinanceGate`, com a página "Acesso restrito".
- [ ] Configurações: Integrações oculta para o colaborador; a coluna "Departamentos" em Membros.
- [ ] `components/ui/`: `member-avatar.tsx`, `search-select.tsx` e os submenus e o grupo de rádio em
      `dropdown-menu.tsx`.
- [ ] `features/clients/`: extrair `ClientProfile` do `client-details-dialog.tsx`.
- [ ] `features/tasks/`: `api.ts` (hooks com `qk`), `pages/` (Início, Tarefas, Auditoria,
      Recorrentes, Processos, Clientes, Relatórios, Cadastros) e `components/` (§4.2).
- [ ] Estados de cada bloco: carregando, vazio, erro e leitura; hover, foco e desabilitado de cada
      controle; e as duas vistas de cada tela, colaborador e administrador.
- [ ] Verificação: `node ~/.claude/skills/design-taste-frontend/scripts/lint.mjs --app
      apps/web/src/features/tasks` (0 FAIL) e `inspect.mjs --app` em `/`, `/tarefas`,
      `/tarefas/auditoria`, `/tarefas/clientes` e `/tarefas/relatorios`, em 1440, 768 e 390, como
      administrador e como colaborador, além de `/contas-a-pagar` como colaborador (Acesso
      restrito).
- [ ] `pnpm typecheck && pnpm test`.
- [ ] Depois de implementado, levar `TaskRow`, `TaskStatusButton`, `MatrixStatusCell`,
      `MemberAvatar`, `SearchSelect` e `AreaSwitchButton` para a tabela de componentes de
      `docs/design-system.md`, e a casca em duas áreas para a seção "2. Layout (app shell)" dele.
