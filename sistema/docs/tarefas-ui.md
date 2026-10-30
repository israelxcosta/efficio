# Módulo Tarefas: especificação de UI

> Dono: `ui-saas-designer`. Status: **revisão 3**. A **fase 1 está implementada e publicada** (duas
> áreas, Acesso restrito, Início, Tarefas em lista e quadro, detalhe da tarefa, Clientes e
> Cadastros). Esta revisão descreve o que existe, corrige a especificação onde o código divergiu por
> boa razão e completa a **fase 2** (recorrentes, auditoria, calendário, processos, relatórios,
> anexos, histórico e anotações) e a **fase 3** (sindicatos, dados fiscais e documentos do cliente,
> escritório e contrato, permissões por pessoa e perfil). Cada seção diz a fase no título; sem
> marca, vale desde a fase 1.
> Base visual: `docs/design-system.md` (a seção **5. Revisão livro-razão** prevalece) e os tokens de
> `apps/web/src/styles/index.css`. Origem funcional: o sistema antigo **Effy** (telas
> `view-solicitacoes`, `view-obrigacoes`, `view-acompanhamento`, `view-relatorios`,
> `view-departamentos`, `view-categorias`, `view-dashboard`, `view-perfil`, `view-empresas`,
> `view-usuarios`, `view-sindicatos`, `view-config` e o modal de tarefa; as telas `view-fin-*` não
> entram, porque o financeiro do Efficio as substitui).
> As funcionalidades são as do Effy e a estrutura também (menu vertical de ícones à esquerda, as
> tarefas como área principal); muda o design. Referências de **estrutura**, não de visual: Onvio e
> Domínio Processos, Tareffa, Gestta e G-Click (painel do colaborador, painel do gestor por
> departamento, responsável e cliente, calendário de obrigações, modelos de processo com etapas,
> prazo legal × meta, vínculo com "a partir de" e "encerra em", encerramento por empresa). "Empresa"
> do Effy é o **cliente** do Efficio (contato `kind = client`, com regime), cadastrado só no
> financeiro, e "usuário" é o **membro** do espaço.

**Changelog**

- **Revisão 3 (30/10/2026): fase 1 conferida no código, fases 2 e 3 completas.**
  - **Alinhada ao que foi implementado** (código em `apps/web/src/features/tasks/**` e capturas da
    fase 1):
    - **Um departamento por membro** (`task_department_members` tem um registro por pessoa). O
      seletor de departamento do Início é só dos administradores, "Meus departamentos" sai do
      escopo de Tarefas e a Equipe usa um `Select` por pessoa (§0, §1, §6.1, §7.3, §13.4, §13.6).
    - **O departamento da tarefa avulsa vem do responsável**: o campo mostra "Vem do responsável:
      Contábil." e só a tarefa sem responsável escolhe a fila (§1 e §9.1). A recorrente continua com
      o departamento escolhido no cadastro.
    - **Início da fase 1**: "Aguardando cliente" ocupa a célula de "Fora da meta" (que depende das
      recorrentes) e Minhas tarefas tem duas linhas de altura ao lado de Por responsável e Por
      cliente. A fase 2 devolve "Fora da meta" e entra com Obrigações da competência (§6.2 e §6.3).
    - Textos e detalhes que ficaram como no código: "Concluídas em outubro" do resumo de Tarefas diz
      "de 14 que vencem no mês" (§7.2); a barra flutuante tem `+ Tarefa` e `Compromisso` (§2.8); o
      "Mais" do celular tem Tarefas atrasadas e Contas vencidas (§2.4); "Sem responsável" em Clientes
      conta todos os departamentos (§13.1); o detalhe tem um "Histórico" de 3 linhas (§9.1); os
      papéis aparecem como Proprietário, Administrador e Colaborador pelo
      `features/auth/roles.ts` (§2.6).
  - **Fase 2 completa e alinhada ao backend em andamento** (contrato provisório em
    `packages/shared`): a **ocorrência é uma tarefa** (abre no `TaskSheet`, com campos travados);
    "Fora da meta" e Obrigações da competência no Início (§6.3 e §6.5); Calendário com feriados
    nacionais (§7.6); anexos e linha do tempo no detalhe (§9.1); Recorrentes com 6 periodicidades
    (semanal a anual), competência de referência, "começa em" e "encerra em", exceções e prévia com
    feriados; **Encerrar** no lugar de excluir quando já há ocorrências (§10); auditoria com **mês
    concluído por cliente** (derivado: todas as células concluídas) e **reabertura com motivo e
    histórico** (§11.5 e §11.6); etapas de processo com o departamento do responsável ou uma fila
    (§12); relatórios de **pontualidade** por mês, departamento, responsável e cliente, e de quem
    concluiu (§14); Minhas anotações (§15.2).
  - **Fase 3, seções novas**: Sindicatos e convenções coletivas (§13.7); dados fiscais, acessos e
    documentos do cliente (§13.8); Escritório e modelo de contrato (§13.9); permissões por pessoa
    (§13.10); faixa de vencimentos no Início e no sino (§6.10 e §2.8); perfil com foto e sem cor de
    destaque (§15.3).
  - Trilho final da Gestão com 8 itens e nenhum novo na fase 3 (§2.2); celular, rotas e permissões
    com a fase de cada item (§2.4 a §2.6); 375px como largura de celular de referência em todas as
    tabelas; pendências de backend por fase (§18) e checklist por fase (§19).
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
  - **Recorrentes** com departamento, responsável padrão, prazo legal, meta, regra de dia não útil e
    exceções; cada ocorrência vai para o responsável do cliente no departamento (§10). Novo sinal
    "Fora da meta" e textos de meta e prazo legal (§0, §1 e §3.5).
  - **Contagem** por tarefa por cliente em todas as telas (§0, item 7); canceladas fora de
    "Concluídas" (§1).
  - **Fluxos viram Processos** (§12).
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
   próprio trilho de ícones, no mesmo componente (`sidebar.tsx`, com o "mais").
2. **Troca de área por um botão fixo no rodapé do trilho**, só para administradores: "Financeiro"
   na Gestão e "Gestão de tarefas" no Financeiro, sempre no mesmo lugar. Ele leva à última página
   visitada naquela área. O colaborador nunca vê o financeiro; uma URL financeira mostra **Acesso
   restrito**, não 404.
3. **Rotas com o menor impacto**: a Gestão fica em `/` (Início) e `/tarefas/*`; o financeiro mantém
   todas as rotas e só o painel mudou de `/` para `/financeiro` (§2.5).
4. **Início por departamento** (`/`): números do departamento, Minhas tarefas, carga por responsável
   e por cliente e, na fase 2, as obrigações da competência. **Cada membro está em um departamento
   só**; o seletor de departamento é dos administradores, que também veem "Todos". Substituiu o
   dashboard financeiro como página inicial.
5. **Clientes vêm do financeiro.** Na Gestão, a tela Clientes é somente leitura e não mostra
   honorários; cadastrar, alterar e inativar continua no financeiro, por administradores, inclusive
   os dados fiscais, os acessos e os documentos da fase 3 (§13.8). O que é da Gestão é o
   **responsável por departamento de cada cliente**, que distribui as tarefas recorrentes.
6. **Recorrentes com prazo legal e meta** (fase 2). Cada obrigação tem departamento, responsável
   padrão, periodicidade (semanal, mensal, bimestral, trimestral, semestral ou anual), prazo legal,
   meta interna (N dias antes), regra de dia não útil com feriados nacionais, competência de
   referência ("ref. 09/2026"), a quem se aplica (regimes, clientes e exceções) e de qual competência
   a qual vale. **Cada ocorrência (cliente × período) é uma tarefa**, com subtarefas, anexos,
   comentários e histórico, e vai para o responsável do cliente naquele departamento ou, se não
   houver, para o responsável padrão.
7. **Uma unidade de contagem: a tarefa por cliente.** Uma avulsa conta 1; uma recorrente conta 1 por
   cliente. Início, resumo da lista, quadro, auditoria e relatórios contam do mesmo jeito. As listas
   agrupam as ocorrências da mesma recorrente numa linha, que diz quantos clientes soma; em Minhas,
   só os seus ("DCTFWeb · 8 de 12 dos seus clientes pendentes").
8. **A linha de tarefa é a linha de Contas a pagar** (`TransactionRow`): botão de estado à esquerda
   (no lugar do 👍/👎), ícone neutro da categoria, título com selos, subtítulo truncado, colunas que
   aparecem pela largura do contêiner, prazo à direita no lugar do valor e menu "⋯". Toda lista nova
   (recorrentes, modelos, sindicatos, documentos) segue esse esqueleto.
9. **"Atrasada" e "Fora da meta" são sinais, não estados.** Atrasada é a tarefa aberta depois do
   prazo legal (ou do vencimento, na avulsa), em `danger`. Fora da meta é a recorrente aberta depois
   da meta e antes do prazo legal, em `warning`. Cada sinal aparece uma vez por objeto, no texto do
   prazo. Não existe coluna, opção nem selo "Atrasada".
10. **Cor só no que exige atenção**: os estados usam glifos de forma diferente e só dois tons
    (`primary-soft` para "Em andamento", `success-soft` para "Concluída"). Vermelho só para atraso e
    vencido; âmbar só para "Urgente", "Vence hoje", "Fora da meta" e documentos ou convenções que
    vencem em até 30 dias. Categorias e tipos de documento usam ícone neutro.
11. **"Minhas tarefas" é um escopo, não uma tela**: `Minhas | Meu departamento | Todas`, combinado
    com a visualização `Lista | Quadro | Calendário` (o calendário entra na fase 2). O padrão é
    Minhas + Lista, agrupada por prazo (Atrasadas, Fora da meta, Hoje, Próximos 7 dias, Mais tarde,
    Sem vencimento), como no Effy.
12. **Auditoria mensal** (fase 2): no desktop, uma **matriz cliente × tarefa recorrente**; cada
    célula avança A fazer → Em andamento → Concluída com um clique e, concluída, mostra as iniciais
    de quem concluiu. Quando todas as células de um cliente estão concluídas, o **mês do cliente
    fica concluído** (com a data da última conclusão). **Reabrir** uma célula concluída pede o
    **motivo** e fica no histórico da ocorrência, porque a conclusão é registro de auditoria; só quem
    concluiu ou um administrador reabre. A visão "Por tarefa" e o celular usam acordeão.
13. **Permissões: o papel define o padrão e a pessoa pode ter ajustes** (fase 3). O colaborador usa
    Tarefas por completo (criar, editar, concluir, comentar, anexar, mover, marcar na auditoria,
    aplicar processos); cadastros, exclusões, financeiro, acessos dos
    clientes e escritório são de administradores. Cada uma dessas coisas é uma chave que pode ser
    ligada ou desligada para uma pessoa (§13.10), com os padrões iguais ao comportamento de hoje.
    Restrição **permanente** esconde o controle e a página diz uma vez quem altera; restrição
    **temporária** (assinatura inativa) mostra o controle desabilitado com o motivo.
14. **Uma forma de salvar por tela**: a tarefa existente e os responsáveis de cliente salvam cada
    campo sozinhos, com atualização otimista e o carimbo "Salvo". Criar tarefa é formulário com
    "Criar tarefa". Cadastros (recorrentes, modelos, departamentos, categorias, sindicatos,
    permissões) usam o Sheet com Cancelar e Salvar; o escritório e o modelo de contrato, botão de
    salvar explícito, como o resto de Configurações.
15. **Concluir, mover, alterar o estado na matriz e trocar o responsável de um cliente são
    otimistas, com toast "Desfazer"** (`sonner`, o mesmo de "Cards organizados."). Desfazer uma
    conclusão logo depois não pede motivo; reabrir depois pede, e não tem desfazer: é uma decisão
    registrada.
16. **Nenhum token novo.** Tudo sai de `--app-*`, `--brand-*` e da escala `text-micro…text-kpi`.
17. **A fase 3 não acrescenta itens ao trilho.** Sindicatos é uma aba de Cadastros; Escritório e
    contrato ficam em Configurações (só administradores, porque são dados do financeiro); dados
    fiscais e documentos do cliente são editados no cadastro do financeiro e lidos na ficha da
    Gestão; as permissões ficam no cadastro da pessoa (Configurações › Membros e Cadastros ›
    Equipe).
18. **Acessos de clientes nunca aparecem em listas.** O código de acesso do Simples e a senha do
    contador ficam cifrados, mascarados na ficha e só se revelam por um clique de quem tem a
    permissão, com registro de quem viu (§13.8).

**Mapa das fases**

| Fase | O que entra | Onde |
| --- | --- | --- |
| 1 (publicada) | Duas áreas, Acesso restrito, Início (resumo, Minhas tarefas, Por responsável, Por cliente, primeiros passos), Tarefas em lista e quadro, detalhe com subtarefas e comentários, Clientes com responsáveis, ficha e definição em lote, Cadastros (Departamentos, Categorias, Equipe) | §2, §5 a §9, §13.1 a §13.6 |
| 2 | Tarefas recorrentes, Auditoria mensal, Calendário, Processos e modelos, Relatórios de tarefas, Fora da meta e Obrigações no Início, anexos e histórico na tarefa, Minhas anotações | §6.3, §6.5, §7.6, §9.1, §10 a §12, §14, §15.2 |
| 3 | Sindicatos e convenções, dados fiscais, acessos e documentos do cliente, vencimentos no Início e no sino, Escritório e modelo de contrato, contrato do cliente, permissões por pessoa, foto no perfil | §6.10, §13.7 a §13.10, §15.3 |

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
| Departamento | Equipe (Fiscal, Pessoal, Contábil). Cada membro está em **no máximo um** departamento. A tarefa avulsa fica no departamento do responsável (o campo diz "Vem do responsável: Fiscal."); sem responsável, fica na fila do departamento escolhido. A recorrente tem o departamento escolhido no cadastro | `deptId` |
| Responsável do cliente | Para cada cliente e departamento, o membro que recebe as recorrentes daquele cliente e é sugerido nas tarefas avulsas dele (a "carteira" de cada um) | novo |
| Concluída por / em | Quem clicou e quando (data e hora), que pode não ser o responsável | `concluidaPor/Em` |
| Tarefa recorrente (obrigação) | Definição: nome, descrição, departamento, responsável padrão, periodicidade (Semanal, Mensal, Bimestral, Trimestral, Semestral, Anual), prazo legal (obrigatório), meta interna, regra de dia não útil, competência de referência, a quem se aplica (regimes e/ou clientes, com exceções), competência em que começa e, se for o caso, em que encerra, e categoria | `ObligationDef` |
| Prazo legal | Data-limite da obrigação na competência, já ajustada pela regra de dia não útil (fins de semana e feriados nacionais) | data-base |
| Meta | Data em que o escritório quer entregar: N dias corridos antes do prazo legal; se cair em dia não útil, antecipa. Com N = 0, a meta é o próprio prazo legal | novo |
| Data de trabalho | A data que ordena e agrupa as listas: o vencimento (avulsa) ou a meta (ocorrência) | — |
| Competência | Mês `AAAA-MM` em que o prazo legal cai (a coluna da auditoria). Na semanal, cada semana (de segunda a domingo) é um período, e a competência é o mês do prazo legal dela | `competencia` |
| Competência de referência | O mês a que a obrigação se refere: a competência menos N meses (o padrão é 1: o DAS que vence em outubro é "ref. 09/2026"). Aparece como texto auxiliar | novo |
| Ocorrência | Uma recorrente para um cliente num período. **É uma tarefa** (abre no `TaskSheet`, com subtarefas, anexos, comentários e histórico), com os campos que vêm da recorrente travados (nome, cliente, categoria, departamento e datas). As listas agrupam as ocorrências da mesma recorrente numa linha (X de Y concluídas) | `recurringAsTasks` |
| Responsável efetivo | Quem responde pela ocorrência: quem foi atribuído só naquela competência; senão, o responsável do cliente no departamento; senão, o responsável padrão | novo |
| Estado na matriz | O estado da ocorrência na célula cliente × recorrente: o clique avança A fazer → Em andamento → Concluída; Aguardando cliente e Cancelada vêm do detalhe da tarefa | `StatusMatrixEntry` |
| Registro de conclusão | Quem concluiu e quando, por ocorrência. Ao reabrir, sai da célula; a conclusão e a reabertura, com o motivo, ficam no histórico da ocorrência | `AuditConclusion` |
| Mês concluído | A competência de um cliente com todas as ocorrências concluídas (as canceladas não contam), com a data e a hora da última conclusão. É derivado: reabrir uma célula tira o cliente de "mês concluído" | novo (o "encerramento" do Domínio, sem a trava manual) |
| Reabertura | Volta de uma ocorrência concluída para um estado aberto, com quem, quando e o motivo (obrigatório, menos no desfazer logo depois de concluir), guardada no histórico. Só quem concluiu ou um administrador reabre | novo (Domínio: "Reabrir") |
| Histórico (linha do tempo) | Eventos da tarefa: criação (e de onde veio), campos alterados, situação, responsável, reabertura com o motivo, comentários, anexos e etapas de processo | `AuditLog` (parcial) |
| Anexo | Arquivo de uma tarefa, com quem anexou, quando e o tamanho | `Attachment` |
| Processo | Sequência de etapas; a etapa N+1 só vira tarefa quando a N é concluída | `TaskFlow/Step` |
| Modelo de processo | Roteiro reaproveitável com prazo relativo em dias; ao aplicar, escolhe-se só o cliente | `TaskFlowTemplate` |
| Compromisso | Tarefa com horário (HH:MM–HH:MM) no dia do vencimento | `horaInicio/Fim` |
| Anotação | Nota pessoal, visível só para quem escreveu, no espaço em que foi escrita | `UserNote` |
| Sindicato | Entidade sindical: razão social, CNPJ, sigla, categoria representada, base territorial, contato, mês da data-base e os clientes cujos empregados seguem a convenção | `Union` |
| Data-base | Mês (1 a 12) em que a convenção coletiva se renova. O vencimento é o dia 1º desse mês, no ano da convenção acompanhada | `dataBaseMes` |
| Convenção coletiva | Um ciclo por ano ("Convenção Coletiva 2026/2027"), marcado como publicado. Enquanto o ciclo acompanhado não for marcado, o sindicato continua no alerta, mesmo vencido | `UnionConvention` |
| Documento do cliente | Certificado digital, certidão, alvará, licença ou laudo, com tipo, vencimento e observação | `CompanyReport` ("laudo") |
| Acesso do cliente | Código de acesso do Simples Nacional e senha do contador: cifrados, mascarados e revelados só por quem tem a permissão | `codigoAcesso`, `senhaContador` |
| Escritório | Dados de quem opera o sistema: razão social, CNPJ, inscrições, endereço, contato, responsável, chave Pix e logo. Aparecem no contrato e nos PDFs | `Office` |
| Modelo de contrato | O contrato de prestação de serviços único do escritório, em blocos de texto com campos que o sistema preenche com os dados do cliente, do escritório e do honorário | `contractBody` |
| Permissão e ajuste | Permissão é uma chave (Financeiro, Cadastros da gestão…); o papel dá o padrão e o ajuste liga ou desliga a chave para uma pessoa | `User.permissions` |

**Regras que a UI aplica:**
- Uma tarefa está **atrasada** quando está aberta (A fazer, Em andamento ou Aguardando cliente) e o
  vencimento (avulsa) ou o prazo legal (ocorrência) é anterior a hoje. Tarefa sem vencimento nunca
  atrasa. "Hoje" é a data no fuso do escritório (`America/Sao_Paulo`), como na API.
- Uma ocorrência está **fora da meta** quando está aberta, a meta é anterior a hoje e o prazo legal
  é hoje ou depois.
- **Concluída no prazo** é a concluída até o vencimento ou o prazo legal, inclusive (sem vencimento
  conta no prazo); depois disso, **com atraso**. A meta não entra nessa conta, porque é interna.
- **Concluídas** contam só as concluídas; as **canceladas** têm número próprio. O Effy somava as
  duas; separá-las é o que permite dividir as concluídas em no prazo e com atraso.
- Uma ocorrência só existe para clientes **ativos** cujo início de contrato é anterior ou igual à
  competência, entre a competência em que a recorrente começa e a última, inclusive, e fora das
  exceções. As ocorrências são geradas por competência (ao abrir a competência ou por um comando);
  uma exceção ou um encerramento vale para as que ainda não foram geradas.
- **O prazo legal é obrigatório**: sem ele, nada é gerado.
- **Mês concluído** é a consequência de concluir a última célula do cliente; reabrir qualquer célula
  desfaz o mês concluído. Editar a recorrente depois não muda as ocorrências já concluídas.
- **Documento vencido** é o que tem vencimento anterior a hoje; **vence em até 30 dias** vai de hoje
  a hoje + 30, inclusive. Documento sem vencimento não entra nos alertas. A convenção usa as mesmas
  faixas a partir do dia 1º do mês da data-base (as faixas vêm calculadas da API, no fuso do
  escritório).
- O estado da tarefa (avulsa, etapa ou ocorrência) tem 5 valores: A fazer, Em andamento, Aguardando
  cliente, Concluída e Cancelada. A periodicidade tem 6: Semanal, Mensal, Bimestral, Trimestral,
  Semestral e Anual (o eventual é tarefa avulsa ou processo).

**O que cada linha mostra** (o contrato fica em `packages/shared`, seção "Tasks", e ainda pode mudar
de nome na fase 2; a tela depende dos dados, não dos nomes): título, tipo (avulsa, etapa de processo
ou ocorrência), cliente (nome fantasia ou razão) ou Interna, departamento, categoria (nome, ícone,
cor), responsável, prioridade, estado, vencimento (o prazo legal, na ocorrência), horário, quem
concluiu e quando, as contagens (subtarefas feitas e total, comentários, anexos) e, se houver, o
processo (nome, etapa N de M) ou a ocorrência (recorrente, período, competência de referência, meta,
"fora da meta" e de onde vem o responsável). A linha agrupada de recorrente traz: nome,
periodicidade, período, competência de referência, prazo legal, meta, departamento, categoria, as
contagens no escopo pedido (total, concluídas, com atraso, canceladas, em andamento, pendentes),
"atrasada" e "fora da meta", o responsável padrão e os responsáveis efetivos com quantas ocorrências
cada um tem.

---

## 2. Navegação e rotas

### 2.1 Duas áreas

| | Gestão de tarefas | Financeiro |
| --- | --- | --- |
| Quem vê | todos os membros | administradores (`owner`, `editor`); na fase 3, quem tem a permissão Financeiro (§13.10) |
| Página inicial | **Início** (`/`) | **Painel financeiro** (`/financeiro`, o dashboard) |
| Trilho | `GESTAO_NAV_ITEMS` (§2.2) | `FINANCE_NAV_ITEMS` (o painel em `/financeiro` com o rótulo "Painel financeiro") |
| Barra flutuante (desktop) | Buscar, `+ Tarefa`, `Compromisso` e o sino; `Processo` entra na fase 2 (§2.8) | Buscar, `+ Despesa`, `+ Receita`, `Transferir`, `Fatura` e o sino |
| Barra inferior (celular) | `Início · Tarefas · (+) · Clientes · Mais` (§2.4) | `Painel · Receber · (+) · Clientes · Mais` |

- **Área de cada rota**: `areaOf(pathname)` em `nav.ts`, que compara o caminho como o roteador
  (sem query, decodificado e em minúsculas). `/` e `/tarefas/*` são da Gestão; `/financeiro` e os
  caminhos de `FINANCE_NAV_ITEMS` com subcaminhos (inclui `/cartoes/:id`, `/relatorios/cliente/:id`,
  o antigo `/contatos` e, na fase 3, `/clientes/:id/contrato`) são do Financeiro; `/configuracoes` e
  `/configuracoes/contrato` são comuns e mantêm o trilho da última área usada (para o colaborador,
  sempre a Gestão). A página 404 também usa o trilho da última área.
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

O mesmo `Sidebar`: 76px, ícones de 20px em botões de 44px a cada 50px, tooltip à direita,
`splitRail` e o botão "mais" com chevron quando a altura não basta. Os itens vão em ordem de uso,
para que o "mais" leve primeiro o que é menos usado. **Hoje (fase 1)** o trilho tem Início, Tarefas,
Clientes e Cadastros, nessa ordem. Na fase 2 os 4 itens novos entram nas posições abaixo, que são a
**ordem final**. A fase 3 não acrescenta itens.

| # | Rótulo (tooltip, "mais" e ⌘K) | `short` | Rota | Ícone (lucide) | Barra do celular | Fase | `keywords` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Início | Início | `/` (`end`) | `House` | 1ª | 1 | `painel resumo departamento hoje minhas` |
| 2 | Tarefas | Tarefas | `/tarefas` (`end`: ativo só nela) | `ListChecks` | 2ª | 1 | `solicitacoes pedidos afazeres prazos kanban quadro agenda compromissos` (fase 2: mais `calendario`) |
| 3 | Auditoria mensal | Auditoria | `/tarefas/auditoria` | `ClipboardCheck` | — | 2 | `competencia matriz obrigacoes entregas conclusao acompanhamento encerramento` |
| 4 | Tarefas recorrentes | Recorrentes | `/tarefas/recorrentes` | `Repeat` | — | 2 | `obrigacoes prazo legal meta das dctfweb folha periodicidade calendario feriados` |
| 5 | Processos | Processos | `/tarefas/processos` | `Workflow` | — | 2 | `fluxos modelos etapas roteiro abertura alteracao` |
| 6 | Clientes | Clientes | `/tarefas/clientes` | `Building2` | 3ª | 1 | `empresas cnpj regime contatos responsaveis carteira` (fase 3: mais `documentos certificado certidoes alvara inscricao`) |
| 7 | Relatórios de tarefas | Relatórios | `/tarefas/relatorios` | `ChartColumn` | — | 2 | `produtividade pontualidade entregas atrasos exportar csv pdf` |
| 8 | Cadastros | Cadastros | `/tarefas/cadastros` | `FolderCog` | — | 1 | `departamentos categorias equipe usuarios membros` (fase 3: mais `sindicatos convencoes data-base permissoes`) |

- **Fase 3 sem itens novos**: Sindicatos é a 4ª aba de Cadastros (§13.7); Escritório, Perfil e
  Membros ficam em Configurações, no rodapé do trilho; as permissões abrem do cadastro da pessoa
  (§13.10). Os vencimentos chegam pelo Início e pelo sino (§6.10 e §2.8), não por uma página.
- **Páginas ocultas por pessoa** (fase 3): as páginas desligadas em "Páginas da gestão" (§13.10)
  saem do trilho, do "Mais" e do ⌘K daquela pessoa. Início e Tarefas nunca saem.
- **`NavItem` tem `end?: boolean`** (ativo só no caminho exato). O item Tarefas precisa disso,
  porque as outras páginas da Gestão ficam sob `/tarefas/`.
- **Rodapé do trilho** (fora da área medida, nunca vai para o "mais"), de cima para baixo: o filete
  e o botão de troca de área (só administradores, §2.3), Configurações e o avatar. O menu do avatar
  tem Perfil, tema, Configurações e Sair; a fase 2 acrescenta **Minhas anotações** (`NotebookPen`),
  que abre o `NotesSheet` (§15.2), nas duas áreas.
- **Altura**: os 8 itens ocupam 400px. Com logotipo e rodapé, tudo cabe a partir de cerca de 760px
  de altura de janela; abaixo disso, Cadastros e Relatórios vão primeiro para o "mais". Início,
  Tarefas e Auditoria ficam sempre visíveis.
- **Sem contadores no trilho**: as atrasadas e os vencimentos aparecem no sino e no Início.
- A `nav` tem `aria-label="Navegação da gestão de tarefas"` (no Financeiro, "Navegação do
  financeiro"). O logotipo leva à página inicial da área atual (`aria-label` "Efficio — início da
  gestão" ou "Efficio — painel financeiro").
- **Não há `TasksNav`**: cada página tem o próprio ícone no trilho. Ficam só as subdivisões que já
  são controles da página: a visualização Lista, Quadro e Calendário em Tarefas e as abas de
  Cadastros.

### 2.3 Troca de área: botões "Financeiro" e "Gestão de tarefas"

`AreaSwitchButton`, em `sidebar.tsx`.

| | Na Gestão | No Financeiro |
| --- | --- | --- |
| Ícone | `Wallet` | `BriefcaseBusiness` |
| Tooltip e `aria-label` | Ir para o financeiro | Ir para a gestão de tarefas |
| Destino | a última página do financeiro nesta sessão, senão `/financeiro` | a última página da Gestão nesta sessão, senão `/` |

- **Quem vê**: só administradores (`canAccessFinance`; na fase 3, quem tem `finance`). Para o
  colaborador o botão não existe e o rodapé fica com Configurações e o avatar.
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
- **⌘K**: "Ir para o financeiro" e "Ir para a gestão de tarefas", só para quem tem o financeiro.

### 2.4 Celular (`components/layout/mobile-nav.tsx`)

Largura de referência: **375px**. Toda tela das três fases funciona nela sem rolagem horizontal da
página: a matriz da auditoria vira acordeão, as tabelas viram linhas de duas linhas e os quadros
largos (quadro de tarefas, matriz) rolam dentro do próprio contêiner.

- **Barra inferior da Gestão**: `Início · Tarefas · (+) · Clientes · Mais`. Os itens com `mobile`
  são Início, Tarefas e Clientes; o `slice` (2 antes do "+" e 1 depois) produz a ordem. Clientes
  fica na barra porque consultar o contato e o responsável de um cliente é o uso típico no celular;
  a auditoria, que no celular é acordeão, fica no "Mais".
- **"+" da Gestão** (`aria-label="Criar"`, `WriteGate scope="tasks"`): menu com **Tarefa**
  (`ListChecks`) e **Compromisso** (`CalendarClock`, que abre o `TaskSheet` com o horário
  09:00–10:00 de hoje). Fase 2: depois de um `DropdownMenuSeparator`, **Aplicar modelo de processo**
  (`Workflow`).
- **Barra inferior do Financeiro** (administradores): com o "+" de Receita, Despesa, Transferência e
  Investimento.
- **Menu "Mais"** (Sheet "Menu", com a descrição "Gestão de tarefas" ou "Financeiro"), de cima para
  baixo, como está implementado:
  1. **Espaço** (`WorkspaceList`, com "Nova empresa").
  2. **Área**, só para administradores: duas linhas de 48px, "Gestão de tarefas"
     (`BriefcaseBusiness`) e "Financeiro" (`Wallet`). A atual tem `bg-primary-soft
     text-primary-soft-fg` e `aria-current="true"`; tocar na outra leva à última página dela e
     fecha o menu.
  3. Separador, **Buscar**, **Tarefas atrasadas** (`ListChecks`, com a contagem num círculo
     `bg-danger text-white` quando houver; leva a `/tarefas?escopo=minhas&situacao=atrasadas`) e
     **Contas vencidas** (`Bell`, só administradores). Fase 3: **Vencimentos** (`FileClock`, com a
     contagem de documentos e convenções vencidos), que abre o `DeadlinesSheet` (§6.10).
  4. Separador, os itens da área atual (a lista inteira do trilho, menos as páginas ocultas para a
     pessoa) e **Configurações**. Fase 2: **Minhas anotações** (`NotebookPen`) depois de
     Configurações.
  5. **Sair**.

### 2.5 Rotas (`app/router.tsx`, páginas com `lazy`)

**Gestão** (páginas em `features/tasks/pages/`):

| Rota | Página | `h1` | Fase | Parâmetros de URL |
| --- | --- | --- | --- | --- |
| `/` | `home.tsx` | Início | 1 | `departamento=<id>\|todos` (só administradores escolhem) |
| `/tarefas` | `tasks.tsx` | Tarefas | 1 | `escopo=minhas\|departamento\|todas`, `visao=lista\|quadro` (fase 2: `calendario`), `situacao=abertas\|atrasadas\|aguardando\|concluidas\|todas`, `busca`, `cliente` (id ou `interna`), `responsavel` (id ou `nenhum`), `departamento`, `categoria`, `prioridade`, `mes=AAAA-MM`, `vencimento=AAAA-MM-DD`, `pagina`; fase 2: `tipo=avulsas\|recorrentes\|processos` |
| `/tarefas/auditoria` | `audit.tsx` | Auditoria mensal | 2 | `competencia=AAAA-MM`, `visao=cliente\|tarefa`, `regime`, `departamento`, `responsavel`, `clientes=pendentes\|concluidos`, `busca`, `recorrente` (abre a tarefa expandida) |
| `/tarefas/recorrentes` | `recurring.tsx` | Tarefas recorrentes | 2 | `busca`, `periodicidade=semanal\|mensal\|bimestral\|trimestral\|semestral\|anual`, `departamento`, `responsavel`, `regime`, `situacao=ativas\|encerradas`, `recorrente=<id>` (abre o cadastro) |
| `/tarefas/processos` | `processes.tsx` | Processos | 2 | `aplicar=<modeloId>` (abre o diálogo), `modelo=<id>` (abre o editor), `processos=andamento\|concluidos` |
| `/tarefas/clientes` | `clients.tsx` | Clientes | 1 | `busca`, `situacao=ativos\|inativos\|todos`, `regime`, `departamento`, `responsavel`, `sem-responsavel=1`, `cliente=<id>` (abre a ficha), `pagina`; fase 3: `documentos=vencidos\|30-dias` |
| `/tarefas/relatorios` | `task-reports.tsx` | Relatórios de tarefas | 2 | `periodo`, `de`, `ate` (como em Relatórios), `departamento`, `responsavel`, `categoria`, `cliente`, `situacao`, `prioridade`, `tipo`, `pagina` |
| `/tarefas/cadastros` | `registry.tsx` | Cadastros | 1 | `aba=departamentos\|categorias\|equipe` (fase 3: `sindicatos`); fase 3: `sindicato=<id>` (abre o cadastro), `pessoa=<id>` (abre as permissões) |

**Financeiro**: `/financeiro` (o `DashboardPage`) e as outras rotas como estão: `/extrato`,
`/contas-a-pagar`, `/contas-a-receber`, `/transferencias`, `/contas`, `/cartoes`, `/cartoes/:id`,
`/categorias`, `/metas`, `/clientes`, `/fornecedores`, `/contatos` (redirecionamento), `/relatorios`
e `/relatorios/cliente/:id`. Fase 3: `/clientes/:id/contrato` (página de impressão do contrato,
§13.9). Todas ficam dentro da rota de layout `{ element: <FinanceGate />, children: [...] }` (§2.7).

**Comuns**: `/configuracoes` (`aba=perfil|seguranca|membros|assinatura|integracoes|privacidade`;
fase 3: `aba=escritorio` e `pessoa=<id>` na aba Membros), `/configuracoes/contrato` (fase 3, editor
do modelo de contrato, com o `RestrictedAccess` de §2.7 para quem não tem a permissão Escritório e
contrato) e `*`.

**Por que o financeiro não ganhou prefixo.** Mantendo as rotas, continuam valendo os caminhos
escritos nos arquivos do web (widgets, alertas, links de relatório, `notifications.tsx`,
`quick-bar.tsx`, testes…), os `href` dos insights da API (`apps/api/src/modules/reports/insights.ts`)
e os favoritos dos usuários. Mudaram só o `to` do painel em `nav.ts` e o `index` do roteador. As
páginas da Gestão ficam sob `/tarefas/` para nunca colidirem com as do financeiro (`/clientes`,
`/relatorios` e `/categorias` já são dele).

- **Abrir uma tarefa de qualquer página da Gestão**, inclusive do Início: `?tarefa=<id>` abre o
  `TaskSheet` por cima da página. `?nova=1` abre em modo criação, aceitando `&vencimento=`,
  `&cliente=`, `&departamento=`, `&horario=1` e `&duplicar=<id>`; a fase 3 acrescenta `&titulo=`
  (tarefa de renovação de documento e de reajuste de convenção). Fechar o Sheet remove o parâmetro
  com `replace`.
- **Recorrente num período** (fase 2): `?recorrente=<id>&periodo=AAAA-MM` (na semanal, a
  segunda-feira da semana, `AAAA-MM-DD`) abre o `RecurringOccurrenceSheet`. Uma ocorrência de um
  cliente é uma tarefa e abre com `?tarefa=<id>`.
- **Vencimentos** (fase 3): `?vencimentos=documentos|convencoes` abre o `DeadlinesSheet` (§6.10) em
  qualquer página da Gestão.
- **Lembrar a escolha**: escopo e visualização de Tarefas ficam em `localStorage`
  (`effinance.tasks.view.v1:<espaço>:<usuário>` = `{ escopo, visao }`) e o departamento do Início em
  `effinance.tasks.home.v1:<espaço>:<usuário>` = `{ departamento }`, lidos com validação. Os filtros
  ficam só na URL.

### 2.6 Permissões

Até a fase 2, a permissão vem só do papel. Na fase 3, cada linha da tabela é uma **chave** que o
cadastro da pessoa pode ligar ou desligar (§13.10); **os padrões continuam exatamente como nesta
tabela**, que é o comportamento de hoje.

| Ação | Colaborador (`viewer`) | Administrador (`owner`, `editor`) | Chave (fase 3) |
| --- | --- | --- | --- |
| Ver as páginas da Gestão, em todos os escopos | sim | sim | `page.*` (só visibilidade; Início e Tarefas sempre) |
| Criar, editar, concluir, reabrir e cancelar tarefa; mover no quadro; subtarefas; comentar; anexar | sim | sim | — (todos) |
| Excluir tarefa ou processo | não (usa **Cancelar tarefa**) | sim | `deleteTasks` |
| Remover anexo de outra pessoa | não (só os próprios) | sim | `deleteTasks` |
| Mudar o estado de ocorrências (lista, Sheet, matriz) | sim | sim | — |
| Reabrir uma ocorrência concluída por outra pessoa (com motivo) | não (só as que ele concluiu) | sim | `reopenOthers` |
| Atribuir uma ocorrência a outra pessoa só naquela competência | sim | sim | — |
| Aplicar modelo de processo; criar processo avulso | sim | sim | — |
| Recorrentes, modelos de processo, departamentos, categorias e sindicatos (criar, editar, encerrar); marcar convenção publicada | só vê | sim | `registry` |
| Excluir esses cadastros | não | sim | `deleteRegistry` |
| Responsáveis por departamento dos clientes; departamento de cada pessoa | só vê | sim | `registry` |
| Clientes: cadastrar, alterar e inativar, inclusive dados fiscais, acessos e documentos | não; vê na Gestão, sem honorários | sim, no Financeiro | `finance` |
| Revelar os acessos de um cliente (código do Simples, senha do contador) | não | sim | `clientCredentials` |
| Ver documentos, vencimentos e convenções | sim | sim | — |
| Dados do escritório e modelo de contrato | não | sim | `office` |
| Gerar o contrato de um cliente | não | sim, no Financeiro | `finance` |
| Financeiro (qualquer página, inclusive leitura) | não: Acesso restrito (§2.7) | sim | `finance` |
| Papéis, convites e permissões por pessoa | não | o proprietário, em Configurações › Membros | `members` |
| Exportar relatórios de tarefas | sim | sim | — |

- **`usePermissions()`** tem `isAdmin` (`owner` ou `editor`), `canAccessFinance` (o mesmo, espelho
  do `canAccessFinance` de `apps/api/src/lib/finance-access.ts`), `canWriteTasks` (assinatura ativa,
  qualquer papel) e `canManage` (`isAdmin` e assinatura ativa). `canWrite` continua valendo para o
  financeiro. **Fase 3**: ganha `can(key)`, lido do mapa de permissões efetivas de `GET /auth/me`;
  `isAdmin` continua existindo só para textos ("Somente administradores…"), e `canAccessFinance`
  passa a ser `can('finance')`.
- **`WriteGate`** tem `scope?: 'finance' | 'tasks' | 'admin'` (padrão `finance`). Na Gestão, `tasks`
  vale para o trabalho do dia a dia e `admin` para cadastros e exclusões. **Fase 3**: ganha
  `permission?: PermissionKey`; `scope="admin"` vira atalho de `permission="registry"`.
- **Dois tipos de bloqueio, dois tratamentos:**
  1. **Por papel ou permissão (permanente)**: o controle **não aparece** (botões de criar dos
     cadastros, "Excluir" nos menus, seletores de responsável, que viram texto). A página diz isso
     uma vez, na descrição do `PageHeader`: "Somente administradores alteram este cadastro." Um
     botão desabilitado para sempre seria ruído em toda visita.
  2. **Por assinatura inativa (temporário, para todos)**: o controle aparece desabilitado com o
     motivo no tooltip (`SUBSCRIPTION_REASON`).
- **Textos**: `ADMIN_ONLY_REASON = 'Somente administradores alteram este cadastro.'` e
  `FINANCE_ONLY_REASON = 'O financeiro é restrito aos administradores do espaço.'` (o mesmo texto de
  `FINANCE_FORBIDDEN_MESSAGE` na API). Com ajustes por pessoa, "administradores" continua sendo a
  palavra certa para quem não tem a permissão: é quem ela procura. O toast global de 403 em
  `app-shell.tsx` mostra a mensagem do servidor para todos os papéis.
- **Nomes dos papéis**, os mesmos na Equipe e em Configurações › Membros. Hoje vêm de
  `apps/web/src/features/auth/roles.ts`, porque `MEMBER_ROLE_LABELS` e `MEMBER_ROLE_HINTS` em
  `packages/shared/src/saas.ts` ainda dizem "Editor" e "Leitor" (§18):

  | Papel | Rótulo | Dica |
  | --- | --- | --- |
  | `owner` | Proprietário | Administrador com controle da assinatura, dos membros e do espaço |
  | `editor` | Administrador | Acessa o financeiro e mantém clientes e cadastros da gestão |
  | `viewer` | Colaborador | Usa toda a gestão de tarefas; não vê o financeiro nem honorários |

- **Configurações para o colaborador**: Perfil, Segurança, Membros (lista, sem editar) e
  Privacidade. Assinatura e Integrações (Open Finance e importações) ficam ocultas, porque são do
  financeiro. A aba **Escritório** (fase 3) aparece só para quem tem `office`.

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
- **Fase 3, o mesmo componente (`RestrictedAccess`) com outra frase** para:
  - o editor do modelo de contrato (`/configuracoes/contrato`) sem a permissão `office`: "O modelo
    de contrato e os dados do escritório são restritos aos administradores do espaço.";
  - uma página da Gestão oculta para a pessoa (§13.10): "Esta página foi ocultada para você pelos
    administradores do espaço.";
  - a página de contrato do cliente sem `finance` já cai no `FinanceGate`.

### 2.8 Barra flutuante, ⌘K e sino

- **`quick-bar.tsx`** por área. Na Gestão (implementado): Buscar, separador, `+ Tarefa` (texto
  `text-fg`), `Compromisso` (`CalendarClock`, `text-muted hover:text-fg`), todos com `WriteGate
  scope="tasks"`, e o sino. **Fase 2**: `Processo` (`Workflow`, que abre "Escolha o modelo", §12.3)
  depois de Compromisso. Sem cor semântica: verde e vermelho são de receita e despesa. No
  Financeiro, a barra de sempre, sem `+ Tarefa` (para criar tarefa, troca-se de área ou usa-se o
  ⌘K).
- **`command-palette.tsx`**:
  - **Ações da gestão**: `Nova tarefa` e `Novo compromisso`. Fase 2: `Aplicar modelo de processo`,
    `Minhas anotações`, `Nova anotação` e, para quem tem `registry`, `Nova tarefa recorrente`. Fase
    3: `Ver vencimentos` (abre o `DeadlinesSheet`) e, para `registry`, `Novo sindicato`. As ações
    financeiras (`Nova receita`…) só para administradores. As da área atual vêm primeiro.
  - **Ir para**: o grupo "Gestão de tarefas" (as páginas visíveis para a pessoa) e, só para quem tem
    o financeiro, o grupo "Financeiro" e "Ir para o financeiro" ou "Ir para a gestão de tarefas". A
    área atual vem primeiro.
  - **Busca** (fase 2): tarefas por título num grupo "Tarefas" (com o prazo e o cliente; abre o
    `TaskSheet`) e recorrentes por nome num grupo "Tarefas recorrentes" (abre o cadastro). Um
    cliente encontrado abre a ficha da Gestão (`/tarefas/clientes?cliente=<id>`) para o colaborador
    e, na Gestão, também para administradores; no Financeiro, o administrador vai ao cadastro
    financeiro. Lançamentos, contas e categorias só aparecem para administradores (a API já os
    omite). Fase 3: sindicatos por nome e sigla, que abrem o cadastro em Cadastros › Sindicatos.
    **Acessos de clientes nunca entram na busca.**
- **`notifications.tsx`** (o sino), com grupos conforme o acesso:
  - **Tarefas**, para todos (implementado): `Atrasadas atribuídas a você (N)`, que leva a
    `/tarefas?escopo=minhas&situacao=atrasadas`, e os comentários recentes de outras pessoas nas suas
    tarefas (`GET /tasks/activity`), que abrem a tarefa.
  - **Contas vencidas**, só para administradores: `useOverdueBills` tem `enabled: canAccessFinance`.
  - **Vencimentos** (fase 3), para todos: `Documentos de clientes vencidos (N)` e `Convenções
    coletivas vencidas (N)`, mais uma linha `text-caption text-muted` "e 5 vencem em até 30 dias";
    cada linha abre o `DeadlinesSheet` (§6.10) na aba certa.
  - O grupo da área atual vem primeiro. O contador soma tarefas atrasadas, contas vencidas (para
    administradores) e, na fase 3, documentos e convenções **vencidos** (os que vencem em até 30 dias
    ficam fora do número, para ele continuar dizendo "já passou"). O `aria-label` separa:
    `Notificações (2 tarefas atrasadas, 3 contas vencidas, 1 documento vencido)`.

---

## 3. Cor, selos e glifos (só tokens existentes)

### 3.1 Estado da tarefa

O botão à esquerda da linha (`TaskStatusButton`) mostra o estado por **forma** (glifo) e só pinta
os dois estados que importam.

| Estado (valor) | Rótulo | Glifo (`TaskStatusGlyph`, 16px, traço 1,75) | Fundo e cor do botão | Texto na coluna Situação |
| --- | --- | --- | --- | --- |
| `todo` | A fazer | anel vazio (`Circle`) | `bg-bg-subtle text-muted` | `text-muted` |
| `in_progress` | Em andamento | anel com a metade direita cheia (`Contrast`) | `bg-primary-soft text-primary-soft-fg` | `text-brand-text` |
| `waiting_client` | Aguardando cliente | `CirclePause` | `bg-bg-subtle text-muted` | `text-muted` |
| `done` | Concluída | `CircleCheck` preenchido (`fill="currentColor" fillOpacity={0.15}`) | `bg-success-soft text-success` | `text-success` |
| `canceled` | Cancelada | `CircleX` | `bg-bg-subtle text-subtle`, desabilitado | `text-subtle` |
| (derivado) | Atrasada | não tem glifo | não muda | não aparece: vai no prazo, em `danger` |

- **Hover e foco nos estados abertos**: o glifo vira `Check` (prévia da ação) e o fundo vai para
  `bg-success-soft/60`. Tooltip `Concluir`.
- **Concluída**: tooltip `Reabrir`. Ao reabrir, a tarefa volta ao estado anterior à conclusão (o
  Effy guardava `_prevStatus`; sem esse dado, volta para A fazer).
- **Cancelada**: não alterna. Tooltip `Cancelada. Reabra pelo menu`.

### 3.2 Estado na matriz da auditoria (`MatrixStatusCell`, fase 2)

A célula mostra o estado da ocorrência (que é uma tarefa). O clique avança só pelos três estados do
dia a dia; Aguardando cliente e Cancelada são definidos no detalhe da tarefa e aparecem na célula.

| Estado | Visual (célula de 32×32, ou 40×40 em `pointer-coarse`) | Texto acessível |
| --- | --- | --- |
| A fazer | anel `border border-border-strong`, vazio | "A fazer" |
| Em andamento | `bg-primary-soft text-primary-soft-fg`, glifo `Contrast` | "Em andamento" |
| Aguardando cliente | `bg-bg-subtle text-muted`, glifo `CirclePause`; o clique avança para Em andamento | "Aguardando cliente" |
| Concluída | pílula `bg-success-soft text-success` com `Check` e as **iniciais de quem concluiu** (`text-mini font-semibold`, 52px de largura) | "Concluída por Ana Paula Ribeiro em 12/10/2026 às 14:32" |
| Cancelada | `CircleX` em `text-subtle`, sem fundo; não conta no progresso nem impede o mês concluído; o clique abre a tarefa | "Cancelada" |
| Não se aplica | `—` em `text-subtle`, sem botão | "Não se aplica" |

O atraso na matriz é **da coluna** (todos os clientes têm a mesma meta e o mesmo prazo legal no
período). Por isso ele aparece uma vez, no cabeçalho da coluna ("Prazo legal venceu há 8 dias", em
`danger`, ou "Meta venceu há 2 dias", em `warning`), e as células continuam neutras. Uma coluna
inteira de vermelho seria textura, não sinal. O tooltip de cada célula diz o responsável efetivo e a
origem: "A fazer · Ana Paula Ribeiro (responsável do cliente no Fiscal)".

**Semanal**: cada semana é uma coluna própria ("Folha semanal · semana de 05/10"), com a mesma célula;
não há contagem "2/4" dentro de uma célula.

**Mês concluído** é da linha e é derivado: quando a última célula do cliente fica concluída, a coluna
de progresso troca "9/9" por `LockKeyhole` de 14px e "Concluído em 28/10" (`text-caption
text-muted`). Sem cor nova: o cadeado é a forma que diz "fechado". Reabrir uma célula (com motivo,
§11.6) volta a coluna para "8/9". A célula reaberta alguma vez não ganha marca; o histórico fica no
popover.

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
| Recorrente | linha de ocorrência (fase 2) | `neutral` | `Repeat` e "Recorrente". Abaixo de `@md`, só o ícone, com o texto `sr-only` |
| Processo | tarefa que é etapa de um processo (fase 2) | `neutral` | `Workflow` e "Etapa 2/4"; `title` = nome do processo |
| Aguardando cliente | estado `waiting_client` **e** coluna Situação oculta | `neutral` | `Hourglass` e "Aguardando cliente" (só o ícone abaixo de `@md`) |
| Cancelada | estado `canceled` **e** coluna Situação oculta | `neutral` | "Cancelada" |
| Subtarefas | tem subtarefas | texto `text-mini text-muted`, sem pílula | `ListChecks` e "2/5" (só a partir de `@md`) |
| Compromisso | tem horário | vai no prazo, não é selo | "14:00–15:00" |
| Periodicidade | linha de recorrente que não é mensal (fase 2) | `neutral` | "Trimestral" ou "Anual" |
| Encerrada | recorrente encerrada (fase 2) | `neutral` | "Encerrada em 09/2026" |
| Inativo | cliente ou sindicato inativo | `neutral` | "Inativo" |
| Acompanhando | o ciclo de convenção acompanhado (fase 3) | `neutral` | "Acompanhando" |
| Ajustado | permissão diferente do padrão do papel (fase 3) | `neutral` | "Ajustado" |
| Você | a própria pessoa nas listas de membros | `brand` | "Você" |

Regra: **um só texto de estado por linha**. Quando a coluna Situação aparece (a partir de `@4xl`),
os selos "Aguardando cliente" e "Cancelada" somem. Vencido e "vence em N dias" (documentos e
convenções) **não são selos**: vão no texto do prazo, como em `TaskDueLabel`.

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
  com 13px. Nada abaixo de 11px. **Fase 3**: com foto (§15.3), a imagem preenche o círculo
  (`object-cover`, `alt=""`, porque o nome está ao lado ou no `title`); enquanto carrega ou se
  falhar, ficam as iniciais.
- **Sem responsável**: círculo de 24px com borda tracejada (`border border-dashed
  border-border-strong`), `UserRound` em `text-subtle` e o texto "Sem responsável" em `text-subtle`.
- **Pilha de avatares** (`AvatarStack`): até 4, `-space-x-1.5`, `ring-2 ring-surface`, e "+N" num
  círculo `bg-bg-subtle text-muted`.
- **Cliente**: nome fantasia, ou a razão social quando não houver fantasia (como em
  `clients-summary.tsx`). **Interna** (sem cliente) é um valor real e aparece como "Interna" em
  `text-subtle`, não como `—`.
- **Responsável do cliente** (tela Clientes e ficha): `MemberAvatar sm` e o nome curto; sem
  responsável, o círculo tracejado e "Sem responsável" em `text-subtle`, sem cor de alerta na célula
  (o alerta aparece uma vez, no resumo da tela).
- **Papel**: "Proprietário", "Administrador" ou "Colaborador" em `text-body-sm text-muted`. É texto,
  não selo colorido: o papel não pede ação. Com ajustes (fase 3), "Colaborador · 2 ajustes".
- **Sindicato** (fase 3): a sigla (até 4 letras) num círculo de 36px `bg-bg-subtle text-muted
  text-mini font-bold`, para não se confundir com o círculo azul dos clientes.

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
| `Card`, `CardHeader` | `components/ui/card.tsx` | barra de filtros, lista, blocos de relatório, cartões de Configurações |
| `SegmentedControl` | `components/ui/segmented-control.tsx` | escopo, situação, visualização, abas, periodicidade, regra de dia não útil, departamento do Início (até 4) |
| `Select`, `Input`, `Textarea`, `Field` | `components/ui/select.tsx`, `input.tsx` | filtros e formulários |
| `Sheet` | `components/ui/sheet.tsx` (`md` 460px, `lg` 620px, `xl` 1040px; tela cheia abaixo de 640px) | tarefa, recorrente, modelo, processo, ficha do cliente e sindicato (`lg`); departamento, categoria, anotações, vencimentos, permissões e filtros no celular (`md`) |
| `Modal`, `ConfirmDialog` | `components/ui/dialog.tsx` | aplicar modelo, responsável em lote, encerrar recorrente, convenções coletivas, o que falta para o contrato, recorte da foto, confirmar exclusões |
| `Badge` | `components/ui/badge.tsx` | selos (§3.3 e §3.4) |
| `CategoryIcon` | `components/ui/category-icon.tsx` | ícone da categoria e do tipo de documento (neutro) |
| `IconPicker`, `ColorPicker` | `components/ui/icon-picker.tsx`, `color-picker.tsx` | categoria de tarefa |
| `Checkbox`, `Switch` | `components/ui/checkbox.tsx`, `switch.tsx` | subtarefas, listas de clientes, seleção em lote, convenções publicadas, permissões |
| `EmptyState`, `Skeleton`, `SkeletonRows` | `components/ui/empty-state.tsx`, `skeleton.tsx` | vazios e carregamento |
| `ProgressBar` | `components/ui/progress-bar.tsx` | subtarefas, envio de anexo e primeiros passos (`size="sm"`) |
| `Tooltip`, `DropdownMenu*` | `components/ui/tooltip.tsx`, `dropdown-menu.tsx` | tooltips e menus "⋯" |
| `PeriodNavigator` | `components/ui/period-navigator.tsx` | competência (`modes={['month']}`) e calendário |
| `PeriodFilter`, `presetRange` | `features/reports/components/period-filter.tsx` | período dos relatórios de tarefas |
| `WidgetCard`, `FitList` | `features/dashboard/layout/widget-card.tsx` | blocos do Início: cabeçalho fixo e lista cortada ao que cabe, com "+ N" |
| `ListSkeleton`, `BodyEmpty` | `features/dashboard/widgets/shared.tsx` | estados dos blocos do Início |
| `ChartBox`, `axisProps`, `CHART_TEXT` | `components/charts/chart-utils.tsx` | gráficos dos relatórios de tarefas |
| `WriteGate`, `usePermissions` | `features/auth/permissions.tsx` | permissões, com as extensões de §2.6 |
| `toast` (sonner), `toastError` | `lib/notify.ts` | feedback e desfazer |
| `usePrintInLight` | `features/reports/pages/client-report.tsx` (extrair para `lib/`) | "Imprimir ou salvar PDF" dos relatórios e do contrato |
| Classe de alternância do resumo (`toggleClass`) | `features/clients/clients-summary.tsx` (extrair) | células dos resumos que filtram ou levam à lista |
| `ClientProfile`, `ProfileSection`, `ProfileItem` | `features/clients/client-profile.tsx` | dados do cliente sem honorários na ficha da Gestão; na fase 3, as seções Inscrições e acessos e Documentos no "Consultar" do financeiro |
| Importar da Receita (consulta de CNPJ) | `features/clients/client-sheet.tsx` (extrair o botão e o hook) | cadastro de sindicato e dados do escritório (fase 3) |
| `ClientSheet` | `features/clients/client-sheet.tsx` | ganha as seções Inscrições e acessos e Documentos com vencimento (fase 3, §13.8) |

**Alterados** (a forma não muda; passam a receber a área, o papel ou a permissão): `Sidebar` (área,
rótulo sob o logotipo e botão de troca, §2.2 e §2.3; Minhas anotações no menu do avatar na fase 2),
`MobileNav` (barra e "+" por área, seção Área no "Mais", §2.4), `QuickBar`, `CommandPalette` e
`Notifications` (§2.8), `usePermissions` e `WriteGate` (§2.6), a aba Perfil e a aba Membros de
Configurações (foto e permissões, fase 3) e o `ClientDetailsDialog` do financeiro (Inscrições e
acessos, Documentos e **Gerar contrato**, fase 3).

### 4.2 Novos

`features/tasks/` guarda os componentes do módulo. `components/ui/` guarda os genéricos, marcados
com (ui). `components/layout/` guarda os da casca. A coluna Fase diz quando o componente entra; os
da fase 1 já existem (alguns com outro nome de arquivo, indicado entre parênteses).

| Componente | Fase | Props principais | Estados |
| --- | --- | --- | --- |
| `AreaSwitchButton` (layout) | 1 | `area`, `to` | repouso, hover, foco; não renderiza para quem não tem o financeiro (§2.3) |
| `FinanceGate`, `RestrictedAccess` (layout) | 1 | `message?` | passa, restrito (§2.7), sessão carregando |
| `TaskStatusGlyph`, `TaskStatusButton` (`task-status.tsx`) | 1 | `status`, `onToggle(next)`, `size`, `loading`, `disabled`, `disabledReason`, `taskTitle` | os 5 estados, hover (prévia `Check`), "pop", carregando, desabilitado |
| `TaskDueLabel` | 1 | `task`, `beside?` | as tabelas de §3.5; meta e prazo legal na fase 2 |
| `PriorityBadge` | 1 | `priority`, `show?: 'row'\|'detail'` | §3.3 |
| `MemberAvatar`, `AvatarStack` (ui) | 1 | `name`, `size`, `unassigned?`, `photoUrl?` (fase 3) | iniciais, sem responsável, foto |
| `SearchSelect` (ui) | 1 | `value`, `onChange`, `options`, `groups?`, `placeholder`, `searchPlaceholder`, `emptyText`, `size_`, gatilho próprio | fechado, aberto com busca, vazio, desabilitado |
| `ClientPicker`, `MemberPicker` (`pickers.tsx`) | 1 | `allowInternal`, `allowAll`, `allowNone`, `meFirst`, `departmentId?` | "Interna (sem cliente)" no topo; membros do departamento primeiro |
| `DepartmentSwitcher` (em `home.tsx`) | 1 | `value`, `options`, `onChange` | só administradores: `SegmentedControl` (até 4 opções com "Todos") ou `Select` (5 ou mais) |
| `HomeSummary` (em `home.tsx`) | 1; 2 | `home`, `today` | carregando, zero, com atrasadas; "Fora da meta" na fase 2 (§6.3) |
| `SetupChecklist` (em `home.tsx`) | 1 | `options`, `storeKey` | passos feitos e pendentes, oculto |
| `TaskRow`, `TaskRowMenu` | 1 | `task`, `density`, `hideAssignee?`, `muted?` | §5 |
| `TaskGroup` | 1 | `title`, `count`, `tone?`, `collapsible`, `onShowMore?`, `remaining?` | aberto, recolhido, "Mostrar mais (N)" |
| `TasksSummary`, `TaskFilters` | 1 | estado da URL | §7.2 e §7.3 |
| `TaskBoard`, `TaskBoardColumn`, `TaskCard` | 1 | `tasks`, `onMove(task, status)` | §8 |
| `TaskSheet`, `TaskProperties`, `SubtaskList`, `CommentThread`, `SavedStamp` | 1 | `taskId \| null`, `defaults?` | criar, ver e editar, leitura, carregando, erro, não encontrada |
| `ClientCoverageSummary`, `TaskClientRow`, `TaskClientSheet` (`clients.tsx`, `task-client-sheet.tsx`) | 1 | §13.1 e §13.2 | §13.1 e §13.2 |
| `ClientResponsibleCell`, `AssignResponsibleDialog` (`client-responsible.tsx`) | 1 | `clientId`, `department`, `member`, `editable`; `clientIds` | texto, seletor, salvando, erro |
| `DepartmentRow`, `DepartmentSheet`, `TaskCategoryRow`, `TaskCategorySheet` (`registry.tsx`, `registry-sheets.tsx`) | 1 | §13.4 e §13.5 | §13.4 e §13.5 |
| `TeamRow`, `MemberDepartmentSelect` (`registry.tsx`) | 1 | `member`, `onChange` | texto (colaborador), `Select` (administrador), salvando |
| `BreakdownList`, `BreakdownItem` | 1 | `rows`, `max` | §6.6 e §14 |
| `ObligationProgressRow` | 2 | `occurrence`, `onOpen` | aberta, fora da meta, atrasada, completa |
| `RecurringOccurrenceRow` | 2 | `occurrence`, `density`, `scope` | §5.6 |
| `TaskCalendar`, `CalendarDayCell`, `TaskAgenda` | 2 | `month`, `tasks`, `occurrences`, `holidays`, `onCreateAt(date)` | §7.6 |
| `FlowStepper` | 2 | `flow` | feita, atual, aguardando |
| `AttachmentList`, `AttachmentDropZone` | 2 | `taskId`, `items`, `limits` | vazia, arrastando, enviando (barra), erro de tamanho, tipo ou rede, confirmar remoção |
| `TaskTimeline` | 2 | `taskId` | carregando, com eventos, só a criação, erro, "Ver todo o histórico (N)" |
| `RecurringTaskSheet`, `RecurrenceRuleFields`, `RecurrenceTermFields`, `ClientExceptionsField` | 2 | `definition \| null`, `readOnly` | criar, editar, leitura, validação; prévia com feriados e referência (§10.3) |
| `RecurringRow`, `EndRecurringDialog` | 2 | `definition`, `month` | ativa, encerrada, não ocorre no mês |
| `RecurringOccurrenceSheet` | 2 | `definitionId`, `competence`, `scope` | lista de clientes com `MatrixStatusCell` e o responsável efetivo |
| `AuditSummary`, `AuditMatrix`, `MatrixStatusCell`, `AuditAccordion` | 2 | §11 | §3.2 e §11 |
| `ClientMonthCell` | 2 | `client`, `competence` | progresso, mês concluído (cadeado e data) |
| `ConclusionPopover`, `ReopenReasonForm`, `AuditHistoryList` | 2 | `occurrence`, `onReopen(reason)`, `canReopen` | com e sem "Reabrir", motivo, histórico da ocorrência (§11.6) |
| `FlowTemplateRow`, `FlowTemplateSheet`, `FlowStepsEditor`, `ApplyTemplateDialog`, `TemplatePickerDialog`, `FlowBuilderSheet`, `FlowRow` | 2 | §12 | §12 |
| `PunctualityList`, `MonthlyPunctualityChart`, `StatusBar100` | 2 | `rows`, `order`; `months`; `parts` | §14 |
| `NotesSheet`, `NoteSheet` | 2 | — e `note \| null` | lista, busca, criar, editar, excluir (§15.2) |
| `DeadlineAlertStrip`, `DeadlinesSheet`, `DeadlineRow` | 3 | `alerts`; `tab` | sem nada (não renderiza), com vencidos, com "em até 30 dias", carregando, erro (§6.10) |
| `UnionSummary`, `UnionRow`, `UnionSheet`, `ConventionCyclesDialog` | 3 | §13.7 | §13.7 |
| `ClientFiscalFields`, `SecretInput`, `ClientDocumentsEditor` (financeiro) | 3 | campos do formulário | vazio, cadastrado (mascarado), alterar, remover, validação (§13.8) |
| `CredentialField`, `ClientDocumentsList`, `ClientUnionsList` (ficha da Gestão) | 3 | `clientId`, `field`, `canReveal` | mascarado, revelando, revelado (some em 30 s), sem permissão, não cadastrado, erro |
| `OfficeForm`, `OfficeLogoField`, `ContractTemplateCard` (Configurações) | 3 | dados do escritório | vazio, salvando, erro, faltam dados para o contrato |
| `ContractTemplateEditor`, `ContractBlockList`, `ContractFieldPicker`, `ContractWarnings`, `ContractPreview`, `WatermarkField`, `ImportContractTextDialog` | 3 | modelo | carregando, erro (não abre), editando, mudanças não salvas, salvando (§13.9) |
| `ContractRequirementsDialog`, `ClientContractPage` (financeiro) | 3 | `clientId` | faltam dados, pronto para imprimir |
| `MemberAccessSheet`, `PermissionSwitchRow` | 3 | `memberId` | padrão, ajustado, salvando, sem permissão (§13.10) |
| `ProfilePhotoField`, `PhotoCropDialog` | 3 | — | sem foto, com foto, recortando, enviando, erro (§15.3) |

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
| 375 | cerca de 331px | estado, título, subtítulo e linha do prazo |

### 5.3 Título, selos e subtítulo

- **Título**: `text-sm font-semibold text-fg truncate`. Em concluída ou cancelada, `text-muted`
  (sem riscado, para continuar legível).
- **Selos**, nesta ordem: Prioridade (Urgente, Alta), Processo, Aguardando cliente ou Cancelada
  (quando a coluna Situação está oculta) e a contagem de subtarefas. Abaixo de `@md` ficam só os de
  ação (Urgente e Aguardando cliente, este só com ícone), como em `TransactionRow`.
- **Subtítulo** (`mt-0.5 block truncate text-xs text-muted`): `categoria · cliente`, em que o
  cliente só entra quando a coluna Cliente está oculta. Sem categoria e com o cliente na coluna, o
  subtítulo não aparece e a linha fica mais baixa. Não se usa a descrição no subtítulo. No escopo
  Todas, sem filtro de departamento, o departamento entra no fim: `categoria · cliente · Fiscal`
  (como está implementado: "Fechamento contábil · Contábil").
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

### 5.6 Linha de recorrente agrupada (`RecurringOccurrenceRow`, fase 2)

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

- O Início mostra **um departamento por vez**: as tarefas avulsas do departamento e, na fase 2, as
  ocorrências da competência atual das recorrentes do departamento. "Minhas tarefas" é a exceção:
  mostra tudo o que é seu.
- **Padrão**: o departamento do usuário (cada membro está em um só). Administrador sem departamento:
  **Todos os departamentos**. Administrador com departamento: o último escolhido (`localStorage`,
  §2.5) e, na primeira vez, o próprio.
- **`DepartmentSwitcher`** no cabeçalho, **só para administradores** (a API responde 403 quando um
  colaborador pede outro departamento):
  - até 4 opções contando "Todos": `SegmentedControl size="sm"` com "Todos" e os nomes (rola na
    horizontal dentro do próprio contêiner a 375px);
  - 5 ou mais: `Select size_="sm"` (`w-56`; largura total no celular), com "Todos os departamentos"
    no topo.
  - O colaborador não tem controle; o nome do departamento vai na descrição.
- `?departamento=` na URL deixa a visão compartilhável entre administradores, e todos os links da
  página levam o departamento junto.
- **Espaço sem departamentos**: o Início mostra o escritório inteiro ("todo o escritório" na
  descrição) e, para administradores, o passo "Departamentos" dos primeiros passos (§6.8).
- **Membro sem departamento** num espaço que tem departamentos (`view: 'mine'` da API): o resumo e os
  blocos mostram só o que é dele, e uma linha `text-body-sm text-muted` com `Info`, abaixo do resumo,
  diz "Você ainda não está em um departamento. Peça a um administrador para incluir você em
  Cadastros › Equipe."

### 6.2 Estrutura

Página `flex flex-col gap-5`; os blocos ficam numa grade de 12 colunas a partir de 1024px, com
`gap-5`.

1. `PageHeader`
   - `title`: **Início**.
   - `description`, sobre os dados: "Quinta-feira, 29 de outubro · Fiscal, 2 pessoas" ("… · Todos os
     departamentos, 14 pessoas", "… · todo o escritório" sem departamentos, ou "… · suas tarefas"
     para o membro sem departamento).
   - `actions`: `DepartmentSwitcher` (administradores) e `primary` **Nova tarefa** (`Plus`,
     `WriteGate scope="tasks"`, oculto abaixo de 640px), que abre o `TaskSheet` com o departamento
     escolhido já preenchido.
2. `HomeSummary` (§6.3), na largura toda.
3. Fase 3: a faixa de vencimentos (`DeadlineAlertStrip`, §6.10), só quando houver algo vencido ou
   vencendo em até 30 dias.
4. `SetupChecklist` (§6.8), só para administradores e só enquanto houver passo pendente.
5. Os blocos:
   - **Fase 1 (implementado)**: **Minhas tarefas** (`lg:col-span-7 lg:row-span-2`, altura
     `lg:h-[calc(42rem+1.25rem)]`) à esquerda e, à direita, **Por responsável** e **Por cliente**
     (`lg:col-span-5`, `lg:h-[21rem]` cada). Com três blocos, a coluna alta de Minhas tarefas fecha
     a grade sem buracos.
   - **Fase 2**: entra **Obrigações de outubro** e a grade vira duas linhas de pares. **Linha A**:
     Minhas tarefas (`lg:col-span-7`) e Obrigações de outubro (`lg:col-span-5`, §6.5), com
     `lg:h-[26rem]`. **Linha B**: Por responsável e Por cliente (`lg:col-span-6` cada), com
     `lg:h-[22rem]`. Com quatro blocos, cada linha responde a uma pergunta (o que eu faço e como vai
     a competência; com quem está o trabalho e onde ele se acumula), e as listas são cortadas pelo
     `FitList` para os pares terminarem juntos.

A ordem segue as perguntas na ordem em que surgem: quanto está atrasado no departamento, o que vence
(fase 3), o que é meu, como vai a competência, com quem está o trabalho e em quais clientes ele se
acumula.

### 6.3 Resumo (`HomeSummary`)

Painel único com divisórias, construído como o `ClientsSummary` (`overflow-hidden rounded-xl border
bg-surface`, células `p-4 sm:p-5`, rótulo `text-body-sm font-medium text-muted`). Conta tarefas na
unidade de §0, item 7, no departamento escolhido. Cada célula é um `Link` para a lista de Tarefas já
filtrada (o escopo do Início mais o filtro da célula), com hover `bg-surface-muted` e o
`aria-label` com o número ("Atrasadas no Fiscal: 2. Ver na lista de tarefas.").

**Fase 1 (implementado)**:

| Célula | Rótulo | Número | Linha de baixo | Leva a |
| --- | --- | --- | --- | --- |
| 1 (principal) | Atrasadas, com `Info` e tooltip "Abertas depois do vencimento." | `tabular text-[32px] font-semibold` (28px entre 1024 e 1279), em `text-danger` se maior que 0 e em tinta se 0 | se maior que 0: "A mais antiga venceu há 3 dias: **Apuração do ICMS de setembro de 2026** · com Ana R." (o título é um botão `text-brand-text` sublinhado que abre a tarefa; sem responsável, "· sem responsável"); se 0: "Nada atrasado no Fiscal." | `situacao=atrasadas` |
| 2 | Vencem hoje, com `Info` e tooltip "Tarefas abertas com vencimento hoje." | `text-kpi` | "até o fim do dia" ou "nada para hoje" | `vencimento=<hoje>` |
| 3 | Próximos 7 dias | `text-kpi` | "até 05/11" | a lista do escopo (agrupada em "Próximos 7 dias") |
| 4 | Em aberto | `text-kpi` | "2 em andamento" | a lista do escopo |
| 5 | Aguardando cliente | `text-kpi` | "à espera de retorno" ou "nada parado" | `situacao=aguardando` |
| 6 | Concluídas em outubro, com `Info` e tooltip "No prazo: concluídas até o vencimento (sem vencimento contam no prazo). Canceladas não entram." | `text-kpi` | barra de 6px em duas partes, sem trilho (no prazo em `bg-data`, com atraso em `bg-danger`, junção de 2px) e, embaixo, "1 no prazo · 2 com atraso" (`tabular`, `text-muted`) | `situacao=concluidas&mes=2026-10` |

**Fase 2** (com as recorrentes): "Fora da meta" ocupa a célula 2, logo depois das atrasadas, porque é
o próximo risco; "Aguardando cliente" vai para a linha de baixo de Em aberto. A ordem fica
Atrasadas, Fora da meta, Vencem hoje, Próximos 7 dias, Em aberto e Concluídas.

| Célula | Muda para |
| --- | --- |
| 1 Atrasadas | tooltip "Abertas depois do prazo: o vencimento, nas avulsas, ou o prazo legal, nas recorrentes." A mais antiga pode ser uma ocorrência, que é uma tarefa de um cliente: "A mais antiga venceu há 8 dias: **DCTFWeb** · Padaria Pão Dourado · com Ana R." (o título abre o `TaskSheet` dela) |
| 2 Fora da meta (nova) | `Info` com "Recorrentes abertas depois da meta interna, ainda dentro do prazo legal."; número `text-kpi`, em `text-warning` se maior que 0; linha de baixo "prazo legal em até 3 dias" (o menor prazo entre elas), "nada fora da meta" ou, sem recorrentes no departamento, "nenhuma recorrente no Fiscal"; leva a `tipo=recorrentes` (a lista abre com o grupo "Fora da meta" logo abaixo de "Atrasadas") |
| 3 Vencem hoje | tooltip "Avulsas com vencimento hoje e recorrentes com meta hoje."; linha de baixo "2 compromissos" quando houver |
| 5 Em aberto | linha de baixo "2 em andamento · **1 aguardando cliente**" (o segundo trecho é um link para `situacao=aguardando`, com o estilo do link "N inativos" de Clientes) |
| 6 Concluídas | tooltip "No prazo: concluídas até o prazo legal (ou o vencimento, nas avulsas; sem vencimento contam no prazo). Canceladas não entram." |

**Grade**: em `lg`, `grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,0.75fr))_minmax(0,1.3fr)]`; em
`md`, 3 colunas em 2 linhas, com a principal abrindo a primeira; abaixo de `md`, a principal na
largura toda, as células 2 a 5 em 2 × 2 e Concluídas na largura toda. Zero é dado: "0" em tinta, com
a frase da célula. O vermelho aparece no número das atrasadas e no trecho da barra de concluídas com
atraso; o âmbar, só no número de Fora da meta.

### 6.4 Minhas tarefas

- `WidgetCard` com o título **Minhas tarefas** e o subtítulo "1 atrasada · 2 para hoje" (o trecho
  das atrasadas em `text-danger`) ou "Nada atrasado". Mostra tudo o que é seu, em qualquer
  departamento. Ação: `SegmentedControl size="sm"` **Abertas** · **Hoje** · **Atrasadas**.
- Corpo: `FitList` de `TaskRow density="compact" hideAssignee`. Ordem: atrasadas, de hoje, próximas
  (pela data de trabalho) e, por último, sem vencimento. Sem títulos de grupo: o prazo de cada linha
  já diz onde ela está. **Fase 2**: entram as recorrentes agrupadas pelos seus clientes
  (`RecurringOccurrenceRow`, "DCTFWeb · 8 de 12 dos seus clientes"), com as fora da meta depois das
  atrasadas.
- Rodapé do `FitList`: "+ 14 tarefas", que leva a `/tarefas?escopo=minhas` (com o filtro da aba).
- Concluir na linha funciona como na lista (otimista, toast com "Desfazer"); a linha abre o
  `TaskSheet` por cima do Início.
- **Vazios** (implementados): sem nada em aberto, "Nada em aberto com você." e, embaixo, as suas
  concluídas dos últimos 7 dias em linhas esmaecidas (`muted`), sob o título "Suas tarefas
  concluídas nesta semana" (`text-caption text-muted`). Sem nenhuma das duas: `BodyEmpty` "Nada
  atribuído a você" com "Quando alguém atribuir uma tarefa a você, ela aparece aqui." e `outline sm`
  **Nova tarefa**. Aba vazia: "Nada vence hoje." ou "Nada atrasado.".

### 6.5 Obrigações da competência (fase 2)

- `WidgetCard` com o título **Obrigações de outubro** (a competência atual, que vira no dia 1º) e o
  subtítulo "182 de 240 concluídas (76%) · 12 atrasadas" (o trecho das atrasadas em `text-danger`;
  sem atrasadas, "· nada atrasado"; com canceladas, "· 2 canceladas" fora da conta). Ação: `ghost sm`
  **Abrir auditoria**, para
  `/tarefas/auditoria?competencia=2026-10&departamento=<id>`.
- Linhas (`ObligationProgressRow`, 52px, `px-3`): o nome (`text-sm font-semibold`, truncado), com o
  selo da periodicidade só quando não for Mensal; embaixo, o `TaskDueLabel` inline de meta e prazo
  legal (§3.5), com a cor do pior caso entre os pendentes; à direita (`w-28`; `w-24` abaixo de
  640px), "18/23" (`tabular text-[13px] font-medium`) sobre uma barra de 6px com trilho
  `bg-bg-subtle` e preenchimento `bg-data`.
- Ordem: as que têm prazo legal vencido e pendentes primeiro, depois pela meta; por fim as completas
  (23/23), com o glifo "Concluída" e o texto em `text-muted`. As semanais aparecem uma vez por
  semana da competência ("Folha semanal · semana de 26/10").
- Em "Todos os departamentos", o subtítulo de cada linha começa pelo departamento ("Fiscal · Meta
  15/10 · legal 20/10").
- O clique abre o `RecurringOccurrenceSheet` (§10.4) com o departamento como escopo.
- Rodapé do `FitList`: "+ 6 obrigações", que leva à auditoria na visão "Por tarefa".
- **Vazio** (departamento sem recorrentes): `EmptyState` ocupando o corpo, com `Repeat`, "Nenhuma
  tarefa recorrente no Fiscal" e "As obrigações do departamento (DAS, DCTFWeb, folha) aparecem aqui
  com o progresso da competência." Para quem tem `registry`, `outline sm` **Cadastrar tarefas
  recorrentes**. O bloco não some: o Início é igual para todos (§6).
- **Carregando**: o cabeçalho na hora e `ListSkeleton` com linhas de 52px. **Erro**: `ErrorState`
  compacto no corpo.
- **Dados**: os números e as linhas vêm prontos com a página de início da API (as ocorrências
  agrupadas do departamento na competência, já ordenadas), contando uma por cliente e com as
  canceladas à parte.

### 6.6 Por responsável

- `WidgetCard` **Por responsável**, subtítulo "Em aberto no Fiscal". Ação: `ghost sm` **Ver equipe**
  (`/tarefas/cadastros?aba=equipe`; abaixo de 384px desce para uma 2ª linha, como no `WidgetCard`).
- Corpo: `BreakdownItem` com `MemberAvatar sm` antes do nome: barra empilhada sem trilho (dentro do
  prazo em `bg-data`, atrasadas em `bg-danger`; a maior ocupa o espaço), o total em tinta à direita
  (`tabular`) e "1 atrasada" em `text-mini text-danger` quando houver. Ordem: do maior total para o
  menor. Na fase 2, cada ocorrência conta para o seu responsável efetivo.
- **Sem responsável** vem primeiro quando houver (círculo tracejado e o texto em `text-subtle`),
  porque é trabalho que ninguém vai pegar sozinho.
- Os membros do departamento sem nada em aberto ficam no fim, com "0" em tinta e a barra vazia:
  mostram quem tem folga.
- O clique leva a `/tarefas?escopo=todas&departamento=<id>&responsavel=<id>`.
- **Vazio**: `BodyEmpty` "Ninguém com tarefas em aberto".

### 6.7 Por cliente

- `WidgetCard` **Por cliente**, subtítulo "Clientes com mais pendências no Fiscal".
- Corpo: o mesmo `BreakdownItem`, sem avatar: o nome do cliente (fantasia ou razão), a barra, o
  total e "1 atrasada". Até 6 linhas e "Outros (N clientes)" somando o resto quando houver mais de
  7. "Interna" entra como uma linha comum, com o nome em `text-subtle`.
- O tooltip do nome diz o responsável do cliente no departamento: "Responsável no Fiscal: Ana Paula
  Ribeiro" (ou "ninguém").
- O clique leva a `/tarefas?escopo=todas&departamento=<id>&cliente=<id>`.
- **Vazio**: "Nenhum cliente com pendências no Fiscal." numa faixa tracejada de uma linha
  (`rounded-lg border border-dashed border-border-strong/80`).

### 6.8 Primeiros passos (`SetupChecklist`)

Para administradores, enquanto algum passo estiver pendente, entre o resumo e os blocos: um `Card
p-4` com o título "Primeiros passos da gestão", "2 de 3" (`tabular`), uma `ProgressBar sm` com a
fração real e `ghost sm` **Ocultar**, e os passos lado a lado (empilhados abaixo de 768px).

| Passo | Fase | Feito quando | Link |
| --- | --- | --- | --- |
| Departamentos | 1 | existe ao menos um | `/tarefas/cadastros?aba=departamentos` |
| Equipe nos departamentos | 1 | todos os membros estão em um departamento | `/tarefas/cadastros?aba=equipe` |
| Responsáveis dos clientes | 1 | todo cliente ativo tem responsável em cada departamento | `/tarefas/clientes?sem-responsavel=1` |
| Tarefas recorrentes | 2 | existe ao menos uma ativa | `/tarefas/recorrentes` |
| Dados do escritório | 3 | razão social, CNPJ, endereço e responsável preenchidos (só para quem tem `office`) | `/configuracoes?aba=escritorio` |

Cada passo tem o glifo de estado (anel vazio ou "Concluída"), o nome e o link. **Ocultar** guarda a
escolha (`localStorage` `effinance.tasks.setup.v1:<espaço>`). O colaborador não vê esta faixa: num
espaço sem tarefas, ele vê o vazio de cada bloco.

### 6.9 Estados e larguras

| Estado | O que aparece |
| --- | --- |
| Carregando | o cabeçalho na hora; o resumo com esqueletos do tamanho final; cada bloco com o próprio cabeçalho e `ListSkeleton` |
| Erro | `ErrorState` no lugar do resumo, se ele falhar; `ErrorState` compacto dentro do bloco que falhou; os outros continuam |
| Espaço sem nenhuma tarefa | o resumo com zeros (são dados), os primeiros passos para administradores e o vazio de cada bloco |
| Leitura (assinatura inativa) | "Nova tarefa" e os botões de estado desabilitados com o motivo |

| | 1440 (conteúdo de 1316px) | 1024 (900px) | 768 (720px, sem trilho) | 375 (343px) |
| --- | --- | --- | --- | --- |
| Cabeçalho | título à esquerda; seletor e Nova tarefa à direita | igual | as ações descem para baixo do título | título; o seletor em largura total embaixo; "Nova tarefa" sai (o "+" da barra inferior cria) |
| Resumo | 6 células em linha | 6 células, a principal em 28px | 3 × 2 | a principal inteira, 2 × 2 e Concluídas inteira |
| Vencimentos (fase 3) | uma linha | uma linha | até 2 linhas | até 3 linhas; "Ver vencimentos" em linha própria |
| Blocos (fase 1) | 7 + 5 (Minhas tarefas alta) | igual | empilhados, altura pelo conteúdo, até 6 linhas | empilhados, até 5 linhas; Minhas tarefas primeiro |
| Linha A (fase 2) | 7 + 5, 26rem | 7 + 5 (cerca de 515 e 365px; o prazo de Minhas tarefas fica em linha) | empilhadas, até 6 linhas | empilhadas, até 5 linhas; Minhas tarefas primeiro |
| Linha B (fase 2) | 6 + 6, 22rem | 6 + 6 | empilhadas, até 6 linhas | empilhadas, até 5 linhas |

### 6.10 Vencimentos de documentos e convenções (fase 3)

**Pergunta:** "Algum certificado, certidão, alvará ou convenção coletiva venceu ou vence logo?" Os
documentos são dos clientes (§13.8) e as convenções, dos sindicatos (§13.7). Não é uma página nova:
uma faixa no Início, um grupo no sino (§2.8) e um Sheet que os dois abrem.

**`DeadlineAlertStrip`**, entre o resumo e os primeiros passos, **só quando há algo vencido ou que
vence em até 30 dias** (documentos de clientes ativos e convenções de sindicatos ativos com clientes
vinculados). Vale para o escritório inteiro, em qualquer departamento, e para todos os membros:
datas de documentos não são dado financeiro.

- Uma linha, sem título de card: `flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border
  border-border bg-surface px-4 py-3 text-body-sm`.
- À esquerda, `CircleAlert` de 16px, em `text-danger` se houver algo vencido e em `text-warning` se
  só houver "em até 30 dias".
- O texto: "**Vencimentos:** 2 documentos vencidos · 3 vencem em até 30 dias · convenção do SINDCOM
  vencida há 12 dias". Cada trecho é um `button` (`font-medium text-fg underline
  decoration-border-strong underline-offset-4`) que abre o `DeadlinesSheet` na aba e no grupo
  certos; o número dos vencidos fica em `text-danger`. Com uma convenção, ela vai pelo nome; com
  mais, "2 convenções vencidas".
- À direita (`ml-auto`), `ghost sm` **Ver vencimentos**. A 375px a faixa quebra em até 3 linhas e o
  botão vai para uma linha própria, alinhado à esquerda.
- Não há "dispensar": é pendência real. Some sozinha quando o documento é renovado ou a convenção é
  marcada como publicada.
- Carregando: a faixa não aparece (nada de esqueleto que pode virar nada). Erro: não aparece; o sino
  continua tentando.

**`DeadlinesSheet`** (`md`, 460px; tela cheia abaixo de 640px), aberto pela faixa, pelo sino, pelo ⌘K
("Ver vencimentos"), pelo "Mais" do celular e por `?vencimentos=documentos|convencoes`:

- Título "Vencimentos". Descrição: "Documentos dos clientes e convenções coletivas. Os
  administradores atualizam as datas no cadastro."
- `headerExtra`: `SegmentedControl` **Documentos (5)** · **Convenções (1)**, com as contagens de
  vencidos e de até 30 dias.
- Corpo: grupos `TaskGroup` **Vencidos** (título em `text-danger`), **Em até 30 dias** (título em
  `text-warning`), **Em 31 a 60 dias** e, só em Documentos, **Sem vencimento informado** (recolhido).
  Grupos vazios não aparecem.
- **Linha de documento** (`DeadlineRow`, 52px, padrão de §5): `CategoryIcon sm` neutro com o ícone
  do tipo (`KeyRound` para certificado digital, `FileCheck2` para certidões, `BadgeCheck` para
  alvarás e licenças, `ClipboardList` para laudos de saúde e segurança, `FileText` para outro), o
  tipo ("Certificado digital") e, embaixo, o cliente e a observação ("Padaria Pão Dourado · A1");
  à direita, a data (`text-[13px] font-medium tabular`) e, embaixo, "Venceu há 3 dias" (`text-xs
  font-semibold text-danger`), "Vence hoje" (`font-semibold text-warning`), "Vence em 12 dias"
  (`font-medium text-warning`, até 30 dias) ou "Vence em 45 dias" (`text-muted`). Menu `⋯`: **Ver
  cliente** (abre a ficha da Gestão na seção Documentos), **Criar tarefa de renovação** (abre o
  `TaskSheet` com `?nova=1&titulo=Renovar certificado digital&cliente=<id>&vencimento=<7 dias antes
  do vencimento, ou hoje se já venceu>`) e, para quem tem `finance`, **Editar no financeiro**.
- **Linha de convenção**: `CategoryIcon sm` neutro com `Scale`, "SINDCOM · Comerciários" e, embaixo,
  "Convenção 2026/2027 · 6 clientes"; à direita, "01/11/2026" e o mesmo texto de prazo. Menu `⋯`:
  **Ver sindicato** (`/tarefas/cadastros?aba=sindicatos&sindicato=<id>`) e, para quem tem
  `registry`, **Marcar 2026/2027 como publicada** (otimista, toast com "Desfazer").
- **Vazios**: "Nada vence nos próximos 60 dias." (`CircleCheck`) com "Documentos e convenções que
  vencerem aparecem aqui."; sem nenhum documento cadastrado no escritório: "Nenhum documento
  cadastrado" e "Os administradores cadastram certificados, certidões e alvarás no cadastro do
  cliente, no financeiro."; sem sindicatos: "Nenhum sindicato cadastrado" com o link **Ir para
  Sindicatos**.
- **Carregando**: `SkeletonRows rows={5}`. **Erro**: `ErrorState` no corpo.

---

## 7. Tela Tarefas (`/tarefas`)

**Pergunta da tela:** "O que eu (ou o escritório) preciso fazer, e o que já passou do prazo?"
**Achado:** a tarefa atrasada mais antiga do escopo, na célula principal do resumo.
**Ação mais frequente:** concluir uma tarefa (botão na linha) ou criar uma ("Nova tarefa").

### 7.1 Estrutura (de cima para baixo, `flex flex-col gap-5`)

1. `PageHeader`
   - `title`: **Tarefas**.
   - `description`, sobre os dados: "Quinta-feira, 29 de outubro · atribuídas a você", "… ·
     departamento Fiscal" ou "… · todo o escritório".
   - `actions`: `primary` **Nova tarefa** (`Plus`, `WriteGate scope="tasks"`). **Fase 2**: antes
     dele, `outline` **Aplicar modelo de processo** (`Workflow`), que abre "Escolha o modelo" e
     depois o `ApplyTemplateDialog` (§12.3). O colaborador usa os dois.
2. `TasksSummary` (§7.2).
3. `TaskFilters` num `Card className="p-4"` (§7.3).
4. O conteúdo da visualização: Lista (§7.4), Quadro (§8) ou, na fase 2, Calendário (§7.6).

### 7.2 Resumo (`TasksSummary`)

É um painel único com divisórias, construído como o `ClientsSummary`
(`overflow-hidden rounded-xl border bg-surface`). Os números saem dos **mesmos filtros da lista,
exceto a situação**, para a contagem e a lista concordarem. Na fase 2, recorrentes contam um por
cliente (§0, item 7), como no Início; a linha agrupada da lista diz quantos clientes soma.

| Célula | Rótulo (`text-body-sm font-medium text-muted`) | Número | Linha de baixo | Clique |
| --- | --- | --- | --- | --- |
| 1 (principal) | Atrasadas | `tabular text-[32px] font-semibold` (28px entre 1024 e 1279), em `text-danger` se maior que 0 e em tinta se for 0 | se maior que 0: "A mais antiga venceu há 8 dias: **Reclassificar lançamentos de despesas**" (o título é um botão `text-brand-text` que abre a tarefa); se 0: "Nada atrasado." | alterna `situacao=atrasadas` (`aria-pressed`) |
| 2 | Em aberto | `text-kpi` | "1 vence hoje · **2 aguardando cliente**" (o último trecho alterna `situacao=aguardando`, com o estilo do link "N inativos"). Fase 2: "· 4 fora da meta", com o trecho em `text-warning` | alterna `situacao=abertas` |
| 3 | Concluídas em outubro, com `Info` | `text-kpi` | "de 14 que vencem no mês" (implementado; canceladas fora da conta) | alterna `situacao=concluidas` |
| 4 | "Em aberto por responsável" (escopos Departamento e Todas) ou "Em aberto por cliente" (Minhas) | — | até 5 linhas, como as dos regimes: nome (`9rem`, com `MemberAvatar sm` no caso de responsável), barra `bg-data` sem trilho (a maior ocupa o espaço), contagem em tinta e, se houver, "2 atr." em `text-mini text-danger` | cada linha filtra por responsável ou cliente (`aria-pressed`); clicar de novo limpa |

**Grade**: em `lg`, `grid-cols-[minmax(0,1.15fr)_10rem_10rem_minmax(0,1fr)]`; em `md`, 3 colunas
com a célula 4 embaixo ocupando a largura toda (`md:col-span-3`, linhas em 2 colunas); abaixo de
`md`, a célula 1 ocupa a largura, as células 2 e 3 ficam lado a lado e a célula 4 some (o filtro
continua no Sheet de filtros). **Sem nenhuma tarefa no espaço**, o resumo não aparece e o vazio da
lista leva a primeira ação (como em Clientes).

### 7.3 Filtros (`TaskFilters`)

**Linha 1** (`flex flex-wrap items-center justify-between gap-3`):
- à esquerda, o `SegmentedControl` "Escopo": `Minhas` · `Meu departamento` (oculto se o membro não
  tiver departamento) · `Todas`;
- à direita, o `SegmentedControl size="sm"` "Situação": `Abertas` · `Atrasadas` ·
  `Aguardando cliente` · `Concluídas` · `Todas`. No Quadro ele é trocado por
  `Switch` "Só atrasadas", porque as colunas já são os estados;
- e o `SegmentedControl` "Visualização" só com ícones: `List` (Lista) e `SquareKanban` (Quadro); na
  fase 2, `CalendarDays` (Calendário). O rótulo vai em `sr-only` e `title`.

**Linha 2** (`mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto_auto]`):
busca (`Search`, placeholder "Buscar pelo nome da tarefa", espera de 300ms), `ClientPicker` ("Todos
os clientes", "Internas", e os clientes), `MemberPicker` ("Todos os responsáveis", "Sem
responsável", oculto em Minhas), `Select` Categoria ("Todas as categorias"), `Select` Prioridade
("Todas as prioridades"), o botão `outline sm` **Mais filtros** (`ListFilter`, mostra "(2)" quando
há filtros ativos nele; abre um popover com Departamento, fora de "Meu departamento", e Mês de
vencimento: "Qualquer mês" e os meses com tarefas mais o atual; a fase 2 acrescenta Tipo: "Todas,
Avulsas, Recorrentes, Etapas de processo") e, se houver filtro, `ghost sm` **Limpar** (`X`). Os
controles têm 36px (`size_="sm"`, como em Contas a pagar).

**Celular (375)**: linha 1 com o Escopo em largura total (3 opções cabem); linha 2 com a busca
(`flex-1`), o botão `outline` **Filtros** (com "(N)") e a Visualização. "Filtros" abre um `Sheet`
"Filtros" com Situação, Cliente, Responsável, Departamento, Categoria, Prioridade, Mês e, na fase 2,
Tipo, e no rodapé `ghost` Limpar e `primary` **Ver 23 tarefas** (a contagem é atualizada ao vivo).

### 7.4 Lista

Um `Card className="@container overflow-hidden"` com o cabeçalho (§5.7) e `p-1.5` com os grupos.

- **Agrupamento** (situação Abertas, Atrasadas ou Aguardando, ordenado pela data de trabalho):
  grupos **Atrasadas** (título em `text-danger`), **Fora da meta** (fase 2; título em `text-warning`;
  só recorrentes), **Hoje**, **Próximos 7 dias**, **Mais tarde** e **Sem vencimento**. Grupos sem
  itens não aparecem. A contagem do grupo soma tarefas na unidade de §0, item 7 (uma linha agrupada
  de 18 clientes conta 18).
  - `TaskGroup`: um `<section aria-labelledby>` com cabeçalho de 36px
    (`px-3 text-body-sm font-semibold`, com a contagem em `text-muted tabular`) e chevron para
    recolher (`aria-expanded`). O estado de recolhido dura a sessão.
  - Cada grupo traz até 50 linhas; depois vem `ghost sm` **Mostrar mais (N)**.
- **Lista simples** (Concluídas e Todas): sem grupos. Concluídas ordena por "concluída em", da mais
  recente para a mais antiga; Todas, por vencimento. Paginação de 50, igual à de Contas a pagar:
  "Página 1 de 3 · 124 tarefas" com ‹ ›.
- Durante uma nova busca (`isPlaceholderData`), a lista fica com `opacity-60`.

### 7.5 Estados e textos da tela

| Estado | O que aparece |
| --- | --- |
| Carregando | resumo com esqueletos do tamanho final (como o `ClientsSummary`) e `SkeletonRows rows={6} className="p-3"` na lista; os filtros aparecem na hora |
| Erro | `ErrorState` dentro do Card da lista, com "Tentar novamente"; o resumo some se também falhar |
| Espaço sem nenhuma tarefa nem recorrente | `EmptyState` com `ListChecks`, "Nenhuma tarefa ainda", "Crie tarefas para o escritório, atribua responsáveis e acompanhe os prazos de cada cliente." e `outline` **Nova tarefa** (implementado). Fase 2: a frase ganha "As tarefas recorrentes do mês também aparecem aqui." e, abaixo, para quem tem `registry`, o `link` **Cadastrar tarefas recorrentes** |
| Minhas, nada aberto | `CircleCheck`, "Nada atribuído a você", "Quando alguém atribuir uma tarefa a você, ela aparece aqui com o prazo." e `outline` **Nova tarefa** |
| Atrasadas vazio | `CircleCheck`, "Nenhuma tarefa atrasada", "Tudo dentro do prazo." (sem ação) |
| Filtros sem resultado | `SearchX`, "Nenhuma tarefa com esses filtros", e `outline` **Limpar filtros** |
| Situação sem itens (Aguardando, Concluídas) | `ListChecks`, "Nenhuma tarefa nesta situação" e "Troque a situação ou o escopo para ver outras tarefas." (implementado) |
| Leitura (assinatura inativa) | "Nova tarefa" desabilitada com o motivo (`WriteGate scope="tasks"`), botões de estado desabilitados com o motivo |

### 7.6 Calendário (`visao=calendario`, fase 2)

**Pergunta:** "O que vence em cada dia do mês, e onde há folga para marcar um compromisso?" Responde
também pelo antigo widget de agenda e, com `tipo=recorrentes`, vira o **calendário de obrigações**
do escritório.

- **A partir de 1024px**: um `Card` com, no topo (`p-4 flex items-center justify-between`), o
  `PeriodNavigator modes={['month']}` ("Hoje" volta ao mês atual) e, à direita, o link "3 sem
  vencimento" (`text-body-sm text-brand-text`, volta para a lista com `situacao=abertas` e o grupo
  "Sem vencimento") e a legenda de uma linha `text-caption text-muted` ("● compromisso · Repeat
  recorrente, no dia da meta"). Embaixo, a grade de 7 colunas (Dom a Sáb; a semana começa no
  domingo, como em `packages/shared`), com os nomes dos dias em `text-caption font-medium
  text-muted` e réguas de 1px `border-border` entre as células.
  - **Dia**: no mínimo 112px de altura em 1440 e 88px em 1024; número em `text-caption tabular
    text-muted` no canto superior esquerdo; fim de semana e **feriado nacional** com
    `bg-surface-muted`; no feriado, o nome ao lado do número (`text-micro text-subtle truncate`,
    "Finados"); **hoje** com borda superior de 2px em `bg-data` e o número em `font-semibold
    text-fg`; dias de outros meses em `text-subtle`, sem itens.
  - **Itens**: até 3 por dia em 1440 e 2 em 1024. Cada item tem 24px, `rounded-sm bg-bg-subtle px-1.5
    text-caption truncate`, e é um `button` que abre o `TaskSheet` (avulsa) ou o
    `RecurringOccurrenceSheet` (recorrente). Ordem: compromissos primeiro ("09:00 Reunião com
    Clínica Sorriso Pleno"), depois atrasadas, depois por prioridade. Uma tarefa vencida e aberta
    tem o texto em `text-danger`; uma concluída, em `text-muted` (sem riscado).
  - **Recorrente**: um item só, no dia da **meta**, com `Repeat` de 12px e "DCTFWeb · 12/30" (as
    concluídas sobre o total do escopo). Fora da meta, o texto vai em `text-warning`; com o prazo
    legal vencido, em `text-danger`. O tooltip diz "Meta 15/10 · prazo legal 20/10 · 12 de 30
    clientes concluídos". As semanais aparecem em cada semana, no dia da meta daquela semana.
  - **"+ 2 mais"** (`text-caption font-medium text-brand-text`) abre um popover (`w-80`, `shadow-lg`)
    com o dia por extenso ("Sexta-feira, 30 de outubro") e as linhas compactas do dia (`TaskRow
    density="compact"` e `RecurringOccurrenceRow`).
  - **Criar no dia**: ao passar o mouse ou focar um dia, aparece "+" no canto superior direito
    (`icon-sm ghost`, `aria-label="Novo compromisso em 30/10"`, `WriteGate scope="tasks"`), que abre
    o `TaskSheet` com o vencimento naquele dia e o horário 09:00–10:00 já preenchido, como no Effy.
    Em `pointer-coarse` o "+" fica sempre visível.
- **Abaixo de 1024px**: **agenda** em lista (`TaskAgenda`), no mesmo `Card`, com o
  `PeriodNavigator` no topo. Cada dia com itens é um `TaskGroup` com o título "Sex, 30/10" (e "·
  Finados" no feriado) e o "+" à direita do título; as linhas são compactas. Dias sem itens não
  aparecem. A 375px a agenda ocupa a largura toda e as linhas mostram estado, título e prazo.
- **Vazio do mês**: na grade, as células continuam desenhadas e uma faixa de uma linha no topo diz
  "Nenhuma tarefa com vencimento em novembro."; na agenda, `EmptyState` com o mesmo texto e
  `outline` **Novo compromisso**.
- **Carregando**: a grade desenhada na hora, com 1 esqueleto de 24px em cada dia útil. **Erro**:
  `ErrorState` dentro do `Card`, no lugar da grade.
- Os filtros de §7.3 valem (escopo, cliente, responsável…); a situação Abertas é o padrão, e
  Concluídas mostra as concluídas no dia do vencimento.
- **Feriados**: os nacionais, da mesma lista usada pelos prazos das recorrentes (§10.3).
- **Dados**: a API devolve, para o intervalo da grade (até 62 dias), as tarefas pelo vencimento (com
  os compromissos primeiro em cada dia), as recorrentes agrupadas pela meta e a contagem "sem
  vencimento". Quando há mais tarefas do que o limite da resposta, uma faixa de uma linha no topo da
  grade diz "Há mais tarefas neste mês do que cabem no calendário. Use os filtros para ver todas." e
  o link **Ver na lista** (a lista do mês, paginada).

### 7.7 Responsivo

| | 1440 (conteúdo de 1316px) | 1024 (900px) | 768 (720px, sem trilho) | 375 (343px) |
| --- | --- | --- | --- | --- |
| Cabeçalho | título à esquerda, ações à direita | igual | as ações descem para baixo do título | só **Nova tarefa**; "Aplicar modelo de processo" (fase 2) vai para um `⋯` ao lado |
| Resumo | 4 células em linha | 4 células, com o número principal em 28px | 3 células e a lista por responsável embaixo | célula 1 inteira, depois 2 e 3; lista oculta |
| Filtros | 2 linhas | linha 2 em 2 colunas | linha 2 em 2 colunas | escopo, busca, "Filtros (N)" e visualização |
| Lista | todas as colunas | sem Situação | sem Cliente e sem Situação | estado, título, subtítulo e prazo em linha |
| Quadro | §8.5 | §8.5 | §8.5 | §8.5 |
| Calendário (fase 2) | grade (3 itens por dia) | grade (2 itens por dia) | agenda | agenda |

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
- **Recorrente** (fase 2): um cartão por recorrente **e estado**, somando os clientes do escopo naquele
  estado: "DCTFWeb · 18 clientes" em A fazer, "DCTFWeb · 4 clientes" em Em andamento e "DCTFWeb ·
  8 clientes" em Concluída. O anel de progresso fica no lugar do selo, o prazo é o de meta e prazo
  legal (§3.5) e o avatar vira a pilha dos responsáveis. O cartão **não é arrastável**
  (`aria-disabled`, tooltip "Concluída por cliente: abra para marcar") e o clique abre o
  `RecurringOccurrenceSheet` já filtrado naquele estado.
- **Abrir**: um `<button>` cobrindo o cartão abre o `TaskSheet`.
- **Menu** `⋯` (aparece no hover e no foco; sempre visível em `pointer-coarse`): **Mover para ›**
  (os estados), **Atribuir a mim** e, para quem tem `deleteTasks`, **Excluir**. É a alternativa acessível
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
| 375 | **uma coluna por vez**: uma linha de abas que rola (`SegmentedControl size="sm"`, com "A fazer 12", "Em andamento 5"…), seguida dos cartões em largura total. Mover é pelo menu do cartão ("Mover para ›") |

**Carregando**: as colunas e os cabeçalhos aparecem na hora, com 3 esqueletos de 72px por coluna.
**Erro**: um `ErrorState` só, na largura do quadro.

---

## 9. Detalhe e edição da tarefa (`TaskSheet`)

`Sheet width="lg"` (620px; tela cheia abaixo de 640px). Abre por `?tarefa=<id>` ou `?nova=1`.

### 9.1 Tarefa existente: cada campo salva sozinho

- **Título do Sheet**: o nome da tarefa. Ao passar o mouse aparece um lápis; clicar no nome ou em
  "Renomear" troca por um `Input` de 18px; **Enter** salva e **Esc** cancela.
- **Descrição do Sheet**: "Pão Quente · Contábil" ou "Interna · Fiscal".
- **Corpo**, de cima para baixo, com `gap-6` entre seções:
  1. **`TaskProperties`**: uma grade de 2 colunas de `Field` (1 coluna abaixo de 640px), com
     controles de 40px.

     | Campo | Controle | Observação |
     | --- | --- | --- |
     | Situação | `Select` com os 5 estados | não existe a opção "Atrasada" |
     | Prioridade | `Select` | Baixa, Média, Alta, Urgente |
     | Responsável | `MemberPicker` (`allowNone`, `meFirst`, `departmentId`) | membros do departamento da tarefa primeiro, com avatar |
     | Departamento | `Select` | **vem do responsável**: com responsável num departamento, o campo fica desabilitado com o departamento dele e a dica "Vem do responsável: Contábil."; sem responsável, é a fila e fica editável, com a dica "Fila do departamento enquanto não houver responsável."; sem departamentos no espaço, "Nenhum departamento cadastrado" |
     | Cliente | `ClientPicker` (`allowInternal`) | "Interna (sem cliente)" |
     | Vencimento | `Input type="date"` | se vencida e aberta, dica em `danger`: "Venceu há 5 dias" |
     | Categoria | `Select` "Sem categoria" | opções com o `CategoryIcon` colorido (é o seletor) |
     | Horário | botão `ghost sm` **Definir horário**, que mostra dois `Input type="time"` ("das" e "às") e o botão **Remover horário** | erro: "A hora de término deve ser posterior à de início." |
     | Início | `Input type="date"`, opcional, recolhido em **Mais campos** (`link`) | o campo `startDate` existe, mas o Effy não o mostrava |
  2. **`FlowStepper`** (fase 2, só em etapa de processo): um bloco `rounded-lg bg-surface-muted p-3`
     com "Processo: **Abertura de empresa** · etapa 2 de 5" e a lista de etapas. Etapas feitas têm o
     glifo Concluída e "concluída em 25/10" (o clique abre a etapa); a atual tem o próprio glifo e
     "esta tarefa"; as que aguardam têm o anel em `text-subtle` e "começa quando esta for concluída
     · prazo de 3 dias".
  3. **Descrição**: `Textarea` que cresce com o texto ("Descreva o que precisa ser feito…") e
     salva ao perder o foco. É gravada cifrada.
  4. **Subtarefas**: o título "Subtarefas", com "2 de 5" em `text-muted` e um `ProgressBar sm`.
     Cada linha tem `Checkbox`, o texto (riscado e em `text-muted` quando feita) e um `X` que
     aparece no hover e no foco (`aria-label="Remover subtarefa {texto}"`). No fim, o campo
     "Adicionar subtarefa" (`Plus`): **Enter** adiciona e mantém o foco, **Esc** limpa. Vazio:
     "Nenhuma subtarefa."
  5. **Anexos** (fase 2, `AttachmentList`):
     - Título "Anexos" com a contagem em `font-normal text-muted` ("Anexos 2", como em Comentários)
       e, à direita, `outline sm` **Anexar arquivo** (`Paperclip`), que abre o seletor de arquivos
       (vários de uma vez, até 5).
     - Cada anexo é uma linha de 48px (`flex items-center gap-3 rounded-lg px-2
       hover:bg-surface-muted`): ícone neutro de 16px num quadrado de 32px `rounded-md bg-bg-subtle
       text-muted` pelo tipo (`FileText` para PDF, Word e texto, `FileImage` para imagem,
       `FileSpreadsheet` para Excel e CSV, `FileCode` para XML, `FileArchive` para ZIP); o nome
       (`text-sm font-medium`, truncado no meio para manter a extensão: "contrato-soc…alteracao.pdf");
       embaixo, "48 KB · Ana P. · 12/10" (`text-caption text-muted`); à direita, `icon-sm ghost`
       **Baixar** (`Download`, `aria-label="Baixar contrato-social.pdf"`) e, quando a API diz que a
       pessoa pode remover (quem anexou ou um administrador), `icon-sm ghost` **Remover** (`X`).
     - **Remover** confirma na própria linha: o conteúdo vira "Remover contrato-social.pdf?" com
       `danger sm` **Remover** e `ghost sm` **Cancelar**. Sem modal e sem desfazer (o arquivo é
       apagado). O evento fica no histórico.
     - **Arrastar** arquivos sobre a seção mostra uma área tracejada (`rounded-lg border
       border-dashed border-border-strong bg-surface-muted py-6 text-center text-body-sm
       text-muted`) com "Solte para anexar". O botão continua sendo o caminho acessível.
     - **Enviando**: a linha aparece na hora com o nome, uma `ProgressBar sm` e "Enviando… 45%", e
       um `X` que cancela.
     - **Erros**, conferidos no navegador antes de enviar e de novo pela API, na linha, em
       `text-caption text-danger`, com **Tentar de novo** e dispensar: "O arquivo passa de 10 MB.",
       "Tipo de arquivo não aceito. Envie PDF, imagem (PNG, JPG ou WebP), Word, Excel, XML, TXT, CSV
       ou ZIP.", "Esta tarefa já tem 50 anexos.", "Os anexos desta tarefa já somam 50 MB." e "Não foi
       possível enviar. Confira a conexão e tente de novo." Os limites e os tipos vêm do contrato
       (hoje: 10 MB por arquivo, 50 MB e 50 arquivos por tarefa); a API confere o conteúdo pela
       assinatura do arquivo, não só pela extensão.
     - **Baixar** sempre como download (`Content-Disposition: attachment`); nada é aberto dentro do
       app (sem prévia de HTML, SVG ou PDF embutido).
     - **Vazio**: "Nenhum anexo. Arraste arquivos para cá ou use Anexar arquivo. Até 10 MB por
       arquivo."
     - A 375px, o botão fica na linha do título e o seletor do sistema oferece a câmera.
  6. **Comentários** (implementado): lista com `MemberAvatar md`, nome, tempo relativo ("há 2 h",
     "ontem", "12/10") e o texto (`whitespace-pre-wrap`, sem HTML). No fim fica o campo: avatar,
     `Textarea` "Escreva um comentário…" e o botão `outline sm` **Comentar** (⌘/Ctrl+Enter também
     envia). O comentário entra na lista na hora (otimista); se falhar, volta para o campo com
     `toastError`. Vazio: "Nenhum comentário ainda." Comentários são gravados cifrados. **Fase 2**:
     o autor e os administradores excluem um comentário pelo `⋯` que aparece no hover e no foco
     ("Excluir comentário", confirmação na própria linha: "Excluir este comentário?" com **Excluir**
     e **Cancelar**).
  7. **Histórico**, separado por `border-t pt-4`:
     - **Fase 1 (implementado)**: três linhas em `text-caption text-subtle`: "Criada por Ana Paula
       Ribeiro em 12/10/2026 às 09:15", "Concluída por Bruno Carvalho em 20/10/2026 às 14:32" (se
       concluída) e "Última alteração em 21/10/2026 às 10:02".
     - **Fase 2, linha do tempo** (`TaskTimeline`): um `ol` com os eventos, **do mais recente para o
       mais antigo**, 5 visíveis e `ghost sm` **Ver todo o histórico (17)**, que expande ali mesmo.
       Cada item é `grid grid-cols-[12px_minmax(0,1fr)] gap-3`: à esquerda, um ponto de 8px
       `rounded-full bg-border-strong` sobre um trilho vertical de 1px `bg-border` (que não continua
       depois do último); o ponto de conclusão é `bg-success`, o único com cor. À direita, a frase em
       `text-body-sm text-fg`, com o nome de quem fez em `font-semibold`, e embaixo "há 2 h ·
       29/10/2026 às 14:32" (`text-caption text-subtle`, com `<time>`).
     - Frases, pelo que a API registra (exatas): "**Ana P.** criou a tarefa" (ou "Criada pela tarefa
       recorrente DCTFWeb", "Criada pelo processo Abertura de empresa", sem autor) · "**Ana P.**
       alterou o vencimento e a prioridade" (os campos mudados, com os nomes da tela, sem os valores)
       · "**Bruno C.** mudou a situação de A fazer para Em andamento" · "**Bruno C.** concluiu a
       tarefa" · "**Ana P.** reabriu a tarefa (voltou para Em andamento): “Guia emitida com valor
       errado”" · "**Ana P.** cancelou a tarefa" · "**Ana P.** atribuiu a Bruno C." · "**Bruno C.**
       assumiu a tarefa" · "**Ana P.** tirou o responsável (estava com Bruno C.)" · "Responsável
       trocado para Marina S.: novo responsável do cliente no Fiscal" (mudança automática, sem autor,
       com o motivo que a API manda) · "**Ana P.** comentou" · "**Ana P.** excluiu um comentário" ·
       "**Ana P.** anexou contrato-social.pdf" (ou "removeu…") · "Etapa 2 de Abertura de empresa
       começou" e "**Marina S.** concluiu a etapa 1 de Abertura de empresa".
     - A descrição aparece só como "alterou a descrição", nunca o texto (é cifrada). Subtarefas não
       entram (têm seção própria).
     - Tarefa anterior à fase 2, sem eventos: as três linhas da fase 1. Carregando: 3 linhas de
       esqueleto. Erro: "Não foi possível carregar o histórico." com `link` **Tentar de novo**.
- **Ocorrência de recorrente** (fase 2): é uma tarefa e abre neste mesmo Sheet, com diferenças:
  - Descrição do Sheet: "Padaria Pão Dourado · Fiscal · DCTFWeb de outubro de 2026 (ref. 09/2026)".
  - Os campos que vêm da recorrente (nome, cliente, categoria, departamento, início, vencimento e
    horário) ficam desabilitados com a dica "Vem da tarefa recorrente." e, no lugar do Vencimento,
    o prazo duplo: "Meta 15/10 · prazo legal 20/10" com o `TaskDueLabel` de §3.5. Um `link`
    **Ver tarefa recorrente** abre o cadastro. Situação, prioridade, responsável, descrição,
    subtarefas, anexos e comentários funcionam como numa tarefa avulsa.
  - Trocar o **Responsável** aqui vale só para esta ocorrência; a dica diz de onde ele veio
    ("Responsável do cliente no Fiscal", "Responsável padrão" ou "Atribuída só nesta competência").
  - **Reabrir** uma ocorrência concluída: só quem concluiu ou um administrador vê o botão; ele abre
    o `ReopenReasonForm` (§11.6) num `Modal max-w-md`. Logo depois de concluir, o "Desfazer" do toast
    não pede motivo.
  - No `⋯`, não há Duplicar nem Excluir: ocorrência se cancela (Cancelada não conta no progresso).
- **Rodapé fixo**: à esquerda, o `SavedStamp`; à direita, um `⋯` (Duplicar, Copiar link, Cancelar
  tarefa e, para quem tem `deleteTasks`, Excluir) e o botão principal **Concluir tarefa** (`primary`,
  `CircleCheck`). Em tarefa concluída ou cancelada, ele vira `outline` **Reabrir**. Concluir pelo
  Sheet tem o mesmo efeito da linha (toast com Desfazer) e deixa o Sheet aberto.
- **Salvar sozinho**: cada mudança dispara um PATCH otimista; o carimbo mostra "Salvando…" e depois
  "Salvo". Em erro, o campo volta ao valor anterior, o carimbo diz "Não foi salvo" (em
  `text-danger`) e aparece `toastError`. Não há botão Salvar.

### 9.2 Criar tarefa

- Título "Nova tarefa", descrição "Atribua um responsável e um prazo."
- Corpo: **Nome** (`Input`, `data-autofocus`, placeholder "Ex.: Balancete de setembro,
  Alteração contratual"), `TaskProperties` (Situação já em A fazer, Prioridade em Média e os
  valores vindos da URL, do "+" da coluna ou do dia; o Departamento vem do responsável ou, sem ele,
  do Início ou do filtro ativo) e Descrição. Abaixo, a nota em `text-subtle` "Subtarefas e
  comentários ficam disponíveis depois de criar." (fase 2: "Subtarefas, anexos e comentários…").
- Com `&titulo=` (fase 3: renovação de documento, reajuste de convenção), o Nome já vem preenchido e
  o foco vai para o Responsável.
- Rodapé: `ghost` **Cancelar** e `primary` **Criar tarefa**.
- Validação inline: "Informe o nome da tarefa." e a regra do horário.
- Ao criar, o Sheet **continua aberto**, já no modo edição (para adicionar subtarefas e anexos), e
  aparece o toast "Tarefa criada."

### 9.3 Estados

| Estado | Comportamento |
| --- | --- |
| Carregando | as propriedades mostram esqueletos de 40px e as seções, de 3 linhas; o título aparece se já estiver no cache da lista |
| Erro | `ErrorState` no corpo, com "Tentar novamente" |
| Não encontrada (404 ou 400) | `EmptyState` com `ListChecks`, "Tarefa não encontrada", "Ela pode ter sido excluída." e `outline` **Voltar às tarefas** |
| Leitura (assinatura inativa) | controles desabilitados com os valores, sem campo de comentário nem "Anexar arquivo" (baixar continua), rodapé com o `readOnlyReason` em `text-caption` |
| Excluir (`deleteTasks`) | `ConfirmDialog` "Excluir “Balancete de setembro”?", com "Subtarefas, comentários e anexos também serão excluídos. Esta ação não pode ser desfeita." e o botão **Excluir tarefa**. Depois fecha o Sheet e mostra o toast "Tarefa excluída." |
| Larguras | `Sheet width="lg"` (620px); tela cheia abaixo de 640px, com as propriedades em 1 coluna e o rodapé fixo com o carimbo, o `⋯` e o botão principal |

---

## 10. Tarefas recorrentes (`/tarefas/recorrentes`, fase 2)

**Pergunta da tela:** "Quais obrigações o escritório repete, de qual departamento, para quem, com que
prazo, e como está o mês?"
**Achado:** quantas ocorrências da competência já foram concluídas e quais recorrentes têm atraso.
**Ação mais frequente:** abrir uma recorrente para ver a distribuição do mês; para quem tem
`registry`, cadastrar ou ajustar uma.

É o cadastro das obrigações (como o "Obrigações" do Onvio, do Tareffa e do Gestta). O colaborador vê
tudo e não altera. O contrato está em `packages/shared` (provisório enquanto o backend da fase 2
anda); o que a tela ainda pede além dele está em §18.

### 10.1 Estrutura

1. `PageHeader`: **Tarefas recorrentes**, com a descrição "14 ativas · outubro: 182 de 240
   concluídas" (para quem não tem `registry`, mais " · Somente administradores alteram este
   cadastro."). Ações: `outline` **Ver no calendário** (`CalendarDays`, leva a
   `/tarefas?escopo=todas&tipo=recorrentes&visao=calendario`, o calendário de obrigações) e
   `primary` **Nova tarefa recorrente** (`WriteGate scope="admin"`).
2. Filtros num `Card p-4`: busca ("Buscar tarefa recorrente"), `Select` Periodicidade ("Todas as
   periodicidades", Semanal, Mensal, Bimestral, Trimestral, Semestral, Anual), `Select` Departamento
   ("Todos os departamentos"), `MemberPicker` Responsável (padrão ou de algum cliente no mês),
   `Select` Regime ("Todos os regimes"), `SegmentedControl size="sm"` **Ativas (14)** ·
   **Encerradas (3)** e **Limpar**. Em 1440, uma linha; em 1024 e 768, duas; a 375px, a busca e
   "Filtros (N)", que abre o Sheet com os outros.
3. Lista num `Card @container` com cabeçalho (a partir de `@xl`): "Tarefa recorrente",
   "Departamento" (`@3xl`), "Aplica-se a" (`@4xl`), "Responsáveis" (`@2xl`), "Outubro" (o
   progresso, `@xl`) e "Prazo legal e meta" (`text-right`). Ordem: por nome.

### 10.2 Linha (`RecurringRow`), no padrão de §5

- À esquerda, `CategoryIcon` neutro com o ícone da categoria (ou `Repeat`, sem categoria). Não há
  botão de estado, porque a definição não tem estado.
- **Título** com o selo da periodicidade quando não for Mensal ("Semanal", "Bimestral",
  "Trimestral", "Semestral", "Anual") e, nas encerradas, o selo "Encerrada em 09/2026" (título em
  `text-muted`). **Subtítulo**: a descrição truncada ou, quando a coluna Departamento está oculta,
  "Fiscal · Impostos" (departamento · categoria); com início futuro, "Começa em novembro de 2026";
  com encerramento marcado, "Encerra em dezembro de 2026".
- **Departamento** (`w-32`): o nome, em texto.
- **Aplica-se a** (`w-44`): "Simples Nacional e MEI · 23 clientes", "4 clientes específicos" ou
  "Simples Nacional e mais 2 · 25 clientes", com "· 2 exceções" quando houver.
- **Responsáveis** (`w-36`): a pilha dos responsáveis efetivos da competência (até 3 e "+N";
  tooltip "Ana P. 12 · Bruno C. 8 · Marina S. 3 (padrão)") e, embaixo, "Padrão: Marina S." em
  `text-mini text-muted`; com clientes sem responsável no departamento, "2 sem responsável no
  Fiscal" em `text-mini text-warning`. Sem responsável padrão e sem responsáveis de cliente: "Sem
  responsável", em `text-subtle`.
- **Progresso do mês** (`w-36`): "18 de 23" (`tabular`, as canceladas fora do total) sobre uma barra
  de 6px com trilho `bg-bg-subtle` e preenchimento `bg-data`; "· 3 atrasadas" em `text-mini
  text-danger` quando houver. Se não ocorre no mês: "Não ocorre em outubro", em `text-subtle`.
- **Prazo legal e meta** (`w-40 text-right`): na 1ª linha (`text-[13px] font-medium tabular`) o
  prazo legal pela periodicidade ("Toda sexta", "Dia 20", "Dia 31 ou o último", "Dia 20 · jan, mar,
  mai, jul, set, nov", "Dia 30 · jan, abr, jul, out", "Dia 31 · jan e jul", "31/05"); na 2ª (`text-xs
  text-muted`) a meta, a regra e a referência ("meta 5 dias antes · antecipa · ref. mês anterior",
  "meta no prazo · posterga").
- O clique abre o `RecurringTaskSheet` (em leitura para quem não tem `registry`). O menu tem
  **Editar** (ou **Ver**), **Ver na auditoria**, **Ver no calendário** e, para `registry`,
  **Duplicar** e **Encerrar…** (nas encerradas, **Reativar**); **Excluir** só aparece para
  `deleteRegistry` e só quando a recorrente ainda não gerou nenhuma tarefa.

### 10.3 `RecurringTaskSheet` (`width="lg"`)

Título "Nova tarefa recorrente", "Editar tarefa recorrente" ou, em leitura, o nome da recorrente.
Descrição: "Vira uma coluna da auditoria mensal e uma tarefa por cliente a cada período, para o
responsável do cliente no departamento." Rodapé: **Cancelar** e **Salvar tarefa recorrente**; na
edição, uma nota `text-caption text-subtle` acima dos botões: "As mudanças valem para as tarefas
desta recorrente ainda não concluídas, a partir de outubro; as concluídas não mudam." Em leitura, os
campos ficam desabilitados com os valores, e o rodapé mostra só **Fechar** e o `ADMIN_ONLY_REASON`
em `text-caption`.

O corpo tem cinco grupos (`gap-6`), cada um com um título `text-body-sm font-semibold`:

**O quê**

| Campo | Controle | Texto |
| --- | --- | --- |
| Nome* | `Input` (`data-autofocus`) | placeholder "Ex.: DCTFWeb, DAS do Simples, Folha de pagamento" · erro "Informe o nome da tarefa." |
| Descrição | `Textarea` de 2 linhas | "Detalhes ou observações (opcional)". Vai para a descrição de cada tarefa gerada |
| Departamento* | `Select` com os departamentos | dica "Recebe as tarefas desta obrigação. O responsável de cada cliente vem deste departamento." · erro "Escolha o departamento." Some quando o espaço não tem departamentos |
| Categoria | `Select` "Sem categoria" | opções com o `CategoryIcon` colorido (é o seletor) |

**Quando** (`RecurrenceRuleFields`)

| Campo | Controle | Texto |
| --- | --- | --- |
| Periodicidade* | `SegmentedControl size="sm"` Semanal · Mensal · Bimestral · Trimestral · Semestral · Anual (padrão Mensal); abaixo de 640px, `Select` | — |
| Prazo legal* | Semanal: `Select` do dia da semana (segunda a domingo). Mensal: `Select` do dia (1 a 31; o 31 diz "31 ou o último dia do mês"). Bimestral, Trimestral e Semestral: o dia e o **1º mês** (`Select` de janeiro a dezembro), que se repete a cada 2, 3 ou 6 meses. Anual: dia e mês | dica calculada: "Toda sexta-feira.", "Todo dia 20.", "Dia 20 de jan, mar, mai, jul, set e nov.", "Dia 30 de jan, abr, jul e out.", "Dia 31 de jan e jul." ou "Todo ano em 31/05." Em meses mais curtos, o dia vira o último dia do mês, e a dica avisa: "Em fevereiro, dia 28." · erros "Informe o prazo legal.", "Escolha o dia da semana." e "Informe o mês do prazo legal." |
| Meta interna | `Input type="number" min=0` (80px) com o sufixo "dias antes do prazo legal" | padrão 0, com a dica "Com 0, a meta é o próprio prazo legal." · erro "Use de 0 a 30 dias." (na semanal, "Use de 0 a 6 dias.") |
| Se cair em dia não útil | `SegmentedControl` **Antecipar** · **Postergar** · **Manter** (padrão Antecipar) | dica da opção escolhida: "Vai para o dia útil anterior.", "Vai para o próximo dia útil." ou "Fica na data, mesmo em fim de semana ou feriado." Vale para o prazo legal; a meta sempre antecipa |
| Competência de referência | `Select`: "Mesmo mês do prazo", "Mês anterior" (padrão), "2 meses antes" … "12 meses antes" | dica "O DAS que vence em outubro se refere a setembro: aparece como ref. 09/2026." Na semanal, desabilitado com "Na semanal, a referência é a própria semana." |
| Prévia | bloco `rounded-lg bg-surface-muted p-3 text-caption text-muted`, só leitura | os próximos 3 períodos a partir do maior entre o atual e o de início, com os ajustes à vista: "Outubro (ref. 09/2026): meta 15/10 (qui) · prazo legal 20/10 (ter). Novembro (ref. 10/2026): meta 13/11 (sex) · prazo legal 19/11 (qui; 20/11 é feriado: Dia Nacional de Zumbi e da Consciência Negra). Dezembro (ref. 11/2026): meta 11/12 (sex) · prazo legal 18/12 (sex; 20/12 é domingo)." Na semanal, as 3 próximas semanas ("Semana de 02/11: meta 05/11 (qui) · prazo legal 06/11 (sex)"). Embaixo, "Considera fins de semana e feriados nacionais" com `Info` (tooltip com a lista do ano: "Confraternização Universal 01/01, Carnaval 16 e 17/02, Paixão de Cristo 03/04, Tiradentes 21/04, Dia do Trabalho 01/05, Corpus Christi 04/06, Independência do Brasil 07/09, Nossa Senhora Aparecida 12/10, Finados 02/11, Proclamação da República 15/11, Consciência Negra 20/11 e Natal 25/12. Carnaval e Corpus Christi entram porque não há expediente bancário.") e "Feriados estaduais e municipais ainda não entram." |

**Vigência** (`RecurrenceTermFields`)

| Campo | Controle | Texto |
| --- | --- | --- |
| Começa em | `Select` de competências (de 12 meses atrás a 24 meses à frente; padrão: a atual) | dica "Competências antes desta não geram tarefas." |
| Encerra em | `Select` "Sem data para encerrar" e as competências a partir de "Começa em" | dica "Última competência com tarefas. Depois dela, a recorrente sai da auditoria e das listas; o histórico fica." · erro "O encerramento deve ser depois do início." |

**Quem**

| Campo | Controle | Texto |
| --- | --- | --- |
| Responsável padrão | `MemberPicker` (`departmentId` do departamento escolhido; `allowNone`: "Sem responsável padrão") | dica "Recebe as tarefas dos clientes que não têm responsável no Fiscal." Na edição, mais a distribuição da competência atual: "Hoje: Ana Paula 12 · Bruno 8 · padrão 3 · sem responsável 2", com o link **Definir responsáveis dos clientes** (`/tarefas/clientes?departamento=<id>&sem-responsavel=1`) |

**Para quais clientes** (`ClientExceptionsField` para as exceções)

| Campo | Controle | Texto |
| --- | --- | --- |
| Regimes | `Checkbox` por regime de `TAX_REGIMES`, cada um com "· 18 clientes ativos" em `text-muted` | — |
| Clientes específicos | busca e lista de `Checkbox` com rolagem própria (`max-h-72`), cada cliente com o regime em `text-muted`; "N selecionados", **Marcar os visíveis** e **Limpar** | somam-se aos regimes |
| Exceções | recolhido atrás de `ghost sm` **Adicionar exceção**; o `ClientPicker` acrescenta clientes que a regra alcança, e cada exceção é uma linha com o nome, o regime e `icon-sm ghost` `X` | dica "Clientes do regime que não fazem esta obrigação. Vale para as competências que ainda não foram geradas; as tarefas já criadas continuam." · erro "Um cliente não pode estar nos específicos e nas exceções." |
| Resumo | uma linha `text-body-sm` | "Aplica-se a **25 clientes ativos** em outubro: 23 pelo regime, mais 2 específicos, menos 0 exceções." · erro "Escolha ao menos um regime ou cliente." |

A 375px o Sheet ocupa a tela, os grupos empilham, a periodicidade vira `Select`, a prévia quebra em
linhas e as listas de clientes usam a largura toda.

**Encerrar** (`EndRecurringDialog`, `Modal max-w-md`, para `registry`): título "Encerrar
“DCTFWeb”"; `Select` "Última competência" com "Outubro de 2026 (atual)" e os meses seguintes; o texto
muda com a escolha: "A partir de novembro de 2026, DCTFWeb não gera mais tarefas. Outubro e os meses
anteriores continuam na auditoria e nos relatórios." Rodapé: **Cancelar** e `primary` **Encerrar**.
Toast "DCTFWeb encerrada a partir de novembro." com **Desfazer**. Grava o "Encerra em".

**Reativar** (encerradas): `ConfirmDialog` "Reativar “DCTFWeb”?" com "Ela volta a gerar tarefas a
partir de outubro de 2026." e o botão **Reativar** (tira o "Encerra em").

**Excluir** (`deleteRegistry`, só antes de gerar tarefas): `ConfirmDialog` "Excluir “DCTFWeb”?" com
"Ela ainda não gerou tarefas. Esta ação não pode ser desfeita." e o botão **Excluir tarefa
recorrente**. Depois de gerar, o menu oferece só Encerrar; se a API recusar, o toast diz "Esta tarefa
recorrente já gerou tarefas. Encerre em vez de excluir."

### 10.4 `RecurringOccurrenceSheet` (`width="lg"`)

A recorrente num período, com uma linha por cliente. Abre pela linha agrupada (§5.6), pelo cartão do
quadro, pelo calendário e pelas obrigações do Início.

- Título: "DCTFWeb · outubro de 2026" (na semanal, "Folha semanal · semana de 26/10"). Descrição:
  "Fiscal · ref. 09/2026 · meta 15/10 · prazo legal 20/10", com "Prazo legal venceu há 8 dias" em
  `danger` (ou "Meta venceu há 2 dias" em `warning`) quando há pendentes.
- `headerExtra`: `SegmentedControl size="sm"` **Seus clientes (12)** (só quando você é responsável
  por algum) · **Pendentes (18)** · **Todos (30)**, a busca de cliente e um `MemberPicker`
  "Responsável". O escopo de quem abriu define a opção inicial.
- Corpo: uma linha por cliente (52px), com `MatrixStatusCell`, o nome do cliente (botão que abre a
  **ocorrência** no `TaskSheet`, por cima deste Sheet; ao fechar, volta para a lista), o regime em
  `text-muted`, o **responsável efetivo** (`MemberAvatar sm` e o nome curto; tooltip com a origem:
  "Responsável do cliente no Fiscal", "Responsável padrão" ou "Atribuída só nesta competência") e,
  se concluída, "Concluída por Ana P. em 12/10, 14:32" em `text-mini text-muted`; se a ocorrência
  tem comentários ou anexos, as contagens em `text-mini text-muted` (`MessageSquare` 3, `Paperclip`
  1). Cliente com o mês concluído: `LockKeyhole` de 12px antes do nome. Canceladas aparecem só em
  Todos, com o nome em `text-muted`. Clicar numa célula concluída abre o `ConclusionPopover` (§11.6).
- O "⋯" da linha tem **Abrir tarefa**, **Atribuir a mim**, **Atribuir a…** (só esta ocorrência; não
  muda o responsável do cliente), **Ver cliente** (a ficha, §13.2) e, na fase 3, **Ver acessos do
  cliente** (a ficha na seção Inscrições e acessos, §13.8).
- Rodapé: `link` **Abrir na auditoria**.
- A 375px, o `headerExtra` empilha (segmentado, busca, responsável) e cada linha mostra a célula de
  40px, o nome, o regime e o responsável em duas linhas.

### 10.5 Estados e larguras

- **Vazio**: `Repeat`, "Nenhuma tarefa recorrente", "Cadastre as obrigações que se repetem (DAS,
  DCTFWeb, folha), o departamento que cuida delas e a quais clientes se aplicam. Elas aparecem na
  auditoria mensal e nas tarefas de cada responsável." e `outline` **Nova tarefa recorrente**. Sem
  `registry`, a frase começa por "Os administradores cadastram…" e não há botão.
- **Encerradas vazio**: "Nenhuma tarefa recorrente encerrada."
- **Carregando**: `SkeletonRows`. **Erro**: `ErrorState`. **Sem resultado nos filtros**: "Nenhuma
  tarefa recorrente com esses filtros" e **Limpar filtros**.
- **Larguras**: as colunas seguem §5.2. Em 1024 a linha fica sem "Aplica-se a" e sem Departamento
  (os dois vão para o subtítulo); em 768, também sem Responsáveis; a 375px, a linha mostra o ícone,
  o título com o selo, o subtítulo e, embaixo, "18 de 23 · Dia 20, meta 5 dias antes", e "Ver no
  calendário" vai para um `⋯` ao lado do botão principal.

---

## 11. Auditoria mensal (`/tarefas/auditoria`, fase 2)

**Pergunta da tela:** "Na competência, o que cada cliente já entregou, o que falta e quem concluiu?"
**Achado:** as pendências que já passaram do prazo legal, e em quantos clientes.
**Ação mais frequente:** marcar a célula de um cliente; no fim do mês, conferir quais clientes já
estão com o mês concluído.
**Peça própria do produto:** a matriz cliente × tarefa recorrente, com o mês concluído por cliente
(o "encerramento" do Domínio Processos, aqui derivado das conclusões) e a reabertura com motivo.

### 11.1 Estrutura

1. `PageHeader`
   - **Auditoria mensal**.
   - `description` com o achado: "Outubro de 2026: 182 de 240 concluídas (76%). 12 pendências já
     passaram do prazo legal." (sem atraso: "… Nenhuma pendência passou do prazo legal.")
   - `actions`: `PeriodNavigator modes={['month']}` (competência, `?competencia=`). O padrão é o
     mês atual e "Hoje" volta a ele. Tooltip do rótulo: "Competência: mês em que o prazo legal
     cai".
2. `AuditSummary` (como o `ClientsSummary`; vale para a competência inteira, como o resumo de
   Clientes):

   | Célula | Conteúdo | Clique |
   | --- | --- | --- |
   | Concluídas (principal) | "182 de 240" em 32px, com "76% da competência" embaixo (as canceladas fora da conta; com elas, "· 3 canceladas") | — |
   | Pendências atrasadas | "12", em `text-danger` se maior que 0, com "em 5 clientes · 7 fora da meta" embaixo (o segundo trecho em `text-warning`) | liga `clientes=pendentes` e ordena os clientes com pendência vencida primeiro |
   | Clientes | "12 de 40 com o mês concluído" (`text-kpi` no "12"), com "**9 com pendências**" embaixo (o trecho alterna `clientes=pendentes`) | alterna `clientes=concluidos` |
   | Por departamento | linhas: nome, barra `bg-data` (concluídas sobre o total do departamento) e "64/80" | filtra o departamento (`aria-pressed`) |
3. Barra de ferramentas num `Card p-4`: `SegmentedControl` Visão **Por cliente** · **Por tarefa**,
   busca ("Buscar cliente" ou "Buscar tarefa recorrente", conforme a visão), `Select` Regime
   ("Todos os regimes" e `TAX_REGIME_LABELS`), `Select` Departamento (vem com o departamento do
   Início quando se chega por ele), `MemberPicker` Responsável ("Só os meus" no topo), `Select`
   Clientes ("Todos os clientes", "Com pendências", "Mês concluído") e **Limpar**. Com Responsável,
   ficam os clientes em que a pessoa responde por ao menos uma coluna visível, e as células de outros
   responsáveis ficam com `opacity-50` (continuam clicáveis: o colaborador pode marcar a de um
   colega).
4. O conteúdo da visão.

### 11.2 Por cliente, a partir de 1024px: `AuditMatrix`

Fica num `Card overflow-hidden` com rolagem própria nos dois eixos. A página nunca rola de lado.

- **Linhas**: os clientes com ocorrências na competência, em ordem alfabética (com "Com pendências",
  os de pendência vencida vêm primeiro). Cada linha tem 52px.
- **1ª coluna, fixa à esquerda** (264px, `sticky left-0 bg-surface`, com borda direita
  `border-border-strong` quando a tabela está rolada): o nome (`text-sm font-semibold`, botão que
  abre a ficha do cliente da Gestão, §13.2, sem honorários) e, embaixo, "Simples Nacional ·
  12.345.678/0001-90" (`text-xs text-muted tabular`).
- **Colunas**: uma por recorrente e período (as semanais, uma por semana), ordenadas pela meta e
  depois pelo nome, com 104px cada. O cabeçalho (72px, fixo no topo) tem o nome curto (até 2 linhas,
  `text-caption font-semibold`, tooltip com o nome completo, o departamento, o responsável padrão e
  a referência "ref. 09/2026"), o prazo da coluna ("Meta 15/10 · legal 20/10"; com pendentes, "Prazo
  legal venceu há 8 dias" em `danger` ou "Meta venceu há 2 dias" em `warning`; na semanal, "semana
  de 05/10") e "18/23" (`text-mini tabular text-muted`).
- **Última coluna, fixa à direita** (104px, `ClientMonthCell`): o mês do cliente. Em andamento,
  "7/9" (`text-[13px] font-medium tabular`) com uma barra de 48px `bg-data` embaixo; com o mês
  concluído, `LockKeyhole` de 14px e "Concluído em 28/10" (`text-caption text-muted`; tooltip
  "Última conclusão em 28/10/2026 às 16:40").
- **Células**: `MatrixStatusCell` centralizada (§3.2).
- **Leitura cruzada**: o hover ou foco numa célula realça (`bg-surface-muted`) a linha e o cabeçalho
  da coluna.
- **Sem regras entre colunas**; uma régua de 1px entre linhas (`border-border`).

**Interação da célula**

| Ação | Efeito |
| --- | --- |
| Clique, **Enter** ou **Espaço** numa célula A fazer, Em andamento ou Aguardando cliente | avança: A fazer → Em andamento → Concluída (Aguardando cliente vai para Em andamento), otimista |
| Chegar a Concluída | o servidor grava quem concluiu e quando; a célula mostra ✓ e as iniciais; toast "DCTFWeb concluída para Padaria Pão Dourado." com **Desfazer** (volta ao estado anterior sem pedir motivo). Se era a última pendente do cliente, a coluna de progresso vira o cadeado com "pop" e o toast diz "DCTFWeb concluída. Outubro concluído para Padaria Pão Dourado." |
| Clique ou **Enter** numa célula Concluída | abre o `ConclusionPopover` (§11.6): quem concluiu, quando, o histórico e **Reabrir**, que pede o motivo. Reabrir **nunca** acontece num clique só, porque a conclusão é registro de auditoria |
| Clique numa célula Cancelada | abre a ocorrência no `TaskSheet` (para reabrir, é por lá) |
| Teclas **1**, **2** e **3** na célula em foco | definem A fazer, Em andamento ou Concluída direto (em célula Concluída, **1** e **2** abrem o popover) |
| **Shift+Enter** na célula | abre a ocorrência no `TaskSheet` (comentários, anexos, responsável) |
| Salvando | a célula fica com `aria-busy` e opacidade de 70%; em erro, volta ao estado anterior e aparece `toastError` |

### 11.3 Por tarefa (todas as larguras): `AuditAccordion mode="tarefa"`

- Cada recorrente da competência é uma linha (padrão de §5) com `CategoryIcon` neutro (`Repeat`),
  o nome e o selo da periodicidade, "Fiscal · padrão: Ana Paula" no subtítulo, "18/23" com barra
  (trilho `bg-bg-subtle`, preenchimento `bg-data`) e a meta à direita com o `TaskDueLabel` de meta e
  prazo legal (§3.5). O chevron fica em `aria-expanded`.
- Aberta, mostra os clientes daquela tarefa, um por linha, com `MatrixStatusCell` à esquerda, o
  nome (com `LockKeyhole` de 12px quando o mês do cliente está concluído), o regime, o responsável
  efetivo (avatar e nome curto) e a linha de conclusão em `text-mini text-muted` ("Concluída por
  Ana P. em 12/10, 14:32"). É o mesmo componente do `RecurringOccurrenceSheet`.
- Com "Com pendências", a tarefa aberta mostra só os clientes pendentes, e somem as tarefas sem
  pendentes.
- `?recorrente=<id>` abre aquela tarefa e rola até ela.

### 11.4 Por cliente abaixo de 1024px (tablet e celular)

`AuditAccordion mode="cliente"`. Cada cliente é uma linha de 56px com o avatar de iniciais (36px,
`bg-primary-soft`), o nome, "Simples Nacional · 7 de 9" e uma barra de 64px à direita; com o mês
concluído, a barra dá lugar a `LockKeyhole` e "Concluído em 28/10". Aberta, lista as recorrentes do
cliente com `MatrixStatusCell` de 40px (área de toque), nome, departamento, responsável e o prazo de
meta e prazo legal à direita, além da linha de conclusão; tocar no nome da recorrente abre a
ocorrência no `TaskSheet`.

A matriz não aparece abaixo de 1024px. A 375px, o nome trunca, a barra fica com 48px e as linhas das
recorrentes mostram o prazo embaixo do nome, em vez de à direita.

### 11.5 Mês concluído do cliente

**Por quê:** é o sinal "este cliente está entregue em outubro", que o gestor procura no fim do mês
(o "encerramento" do Domínio Processos). Aqui ele é **derivado**: não há botão de fechar nem trava
manual. O que protege a entrega é a reabertura com motivo (§11.6), que só quem concluiu ou um
administrador faz.

- **Quando**: todas as ocorrências do cliente na competência estão Concluídas; as Canceladas não
  contam e as "Não se aplica" não existem. O momento é o da última conclusão.
- **Onde aparece**: a coluna de progresso da matriz e a linha do acordeão (cadeado e "Concluído em
  28/10"), a célula "Clientes" do resumo ("12 de 40 com o mês concluído"), o filtro "Mês concluído"
  e a ficha do cliente (§13.2: "Obrigações de outubro: 9 de 9 concluídas · mês concluído em 28/10").
- **Como sai**: reabrindo qualquer célula do cliente (com motivo), ou se uma tarefa nova da
  competência for gerada para ele. A coluna volta ao progresso ("8/9").
- **O que não muda**: as ocorrências continuam concluídas nas listas e nos relatórios; editar a
  recorrente depois (meta, responsável) não altera as já concluídas.

### 11.6 Reabrir com motivo e histórico

A conclusão de uma ocorrência é registro de auditoria: reabrir pede o motivo, e conclusões e
reaberturas ficam no histórico da ocorrência (a mesma linha do tempo do `TaskSheet`, §9.1), que não
se apaga.

- **`ConclusionPopover`** (`w-80`, `shadow-lg`, `role="dialog"`), aberto pela célula concluída:
  - cabeçalho `text-caption text-muted`: "DCTFWeb · Padaria Pão Dourado · outubro de 2026";
  - "Concluída por **Ana Paula Ribeiro** em 12/10/2026 às 14:32" (`text-body-sm`);
  - `outline sm` **Reabrir**, só quando a API diz que a pessoa pode (quem concluiu ou quem tem
    `reopenOthers`); os outros leem "Só quem concluiu ou um administrador pode reabrir." em
    `text-caption text-muted`;
  - `link` **Abrir tarefa** (a ocorrência no `TaskSheet`);
  - **Histórico** (`AuditHistoryList`, título `text-caption font-semibold text-muted`), do mais
    recente para o mais antigo, só conclusões e reaberturas, até 5 e **Ver tudo (8)** (que abre a
    linha do tempo no `TaskSheet`): "Reaberta por Bruno C. em 14/10 às 09:10: “Guia emitida com
    valor errado”" e "Concluída por Ana P. em 12/10 às 14:32", em `text-caption` (o motivo em
    `text-fg`, o resto em `text-muted`). Sem reaberturas, a seção não aparece.
- **`ReopenReasonForm`**: **Reabrir** troca o corpo do popover por um `Textarea` de 2 linhas com o
  rótulo **Motivo da reabertura*** (placeholder "Ex.: guia emitida com valor errado", até 500
  caracteres), um `Select` "Voltar para" (A fazer, padrão, ou Em andamento), `primary sm`
  **Reabrir** e `ghost sm` **Voltar**. Erro: "Escreva o motivo da reabertura." Ao confirmar, a
  célula volta ao estado escolhido, o registro de conclusão sai da célula, o motivo vai para o
  histórico, o mês do cliente deixa de estar concluído e aparece o toast "DCTFWeb reaberta para
  Padaria Pão Dourado." (sem desfazer: para voltar, conclui-se de novo).
- **Desfazer logo depois de concluir** (o toast de 6s) não pede motivo; a API aceita esse desfazer
  de quem concluiu por alguns minutos.
- O mesmo popover aparece no `RecurringOccurrenceSheet` (§10.4) e no acordeão; no `TaskSheet` da
  ocorrência, **Reabrir** abre o mesmo formulário num `Modal max-w-md`.
- Esc fecha; o foco vai para o primeiro botão ao abrir e volta à célula ao fechar.

### 11.7 Estados e larguras

| Estado | Texto |
| --- | --- |
| Nenhuma recorrente cadastrada | `ClipboardCheck`, "A auditoria começa pelas tarefas recorrentes", "Cadastre as obrigações do escritório e a quais clientes se aplicam; elas viram as colunas desta tela." e, para `registry`, `outline` **Cadastrar tarefas recorrentes** (os outros leem "Os administradores cadastram as obrigações…" e não têm botão) |
| Nenhum cliente ativo | `Building2`, "Nenhum cliente ativo nesta competência" e `outline` **Ir para Clientes** (`/tarefas/clientes`; os clientes são cadastrados no financeiro) |
| Filtros sem resultado | "Nenhum cliente encontrado para os filtros selecionados." e **Limpar filtros** |
| Tudo concluído (com "Com pendências") | `CircleCheck`, "Nenhuma pendência em outubro" e "Todas as tarefas recorrentes da competência foram concluídas." |
| Nenhum mês concluído (com "Mês concluído") | "Nenhum cliente com o mês concluído em outubro." e "O mês de um cliente fica concluído quando todas as tarefas recorrentes dele estão concluídas." |
| Carregando | o cabeçalho da matriz aparece na hora (as colunas vêm das definições); as linhas são esqueletos de 52px |
| Erro | `ErrorState` dentro do Card |

| | 1440 | 1024 | 768 | 375 |
| --- | --- | --- | --- | --- |
| Resumo | 4 células | 4 células | 3 células e departamentos embaixo | 2 × 2, departamentos ocultos |
| Barra de ferramentas | 1 linha | 2 linhas | 2 linhas | Visão em largura total, depois busca e "Filtros (N)" |
| Por cliente | matriz, com cerca de 8 colunas de 104px visíveis e rolagem | matriz, com cerca de 5 colunas visíveis e rolagem | acordeão | acordeão |
| Por tarefa | acordeão | acordeão | acordeão | acordeão |

---

## 12. Processos e modelos (`/tarefas/processos`, fase 2)

**Pergunta da tela:** "Que roteiros o escritório reaproveita, como aplico um a um cliente, e que
processos estão andando?"
"Processo" é o nome que o escritório já usa (Onvio Processos, Domínio Processos) para o que o Effy
chamava de fluxo de tarefas. No código e no contrato, os nomes continuam `Flow*` (`TaskFlow`,
`FlowTemplate`).

**Etapas sequenciais**: só a etapa 1 vira tarefa ao criar ou aplicar; a etapa N+1 vira tarefa quando
a N é concluída, com o responsável, a prioridade e o prazo cadastrados. O prazo de cada etapa conta
da conclusão da anterior (na primeira, do dia em que o processo foi criado), no fuso do escritório.
O **departamento da etapa vem do responsável**, como na tarefa avulsa (§9.1); a etapa sem
responsável escolhe a fila do departamento.

### 12.1 Estrutura

1. `PageHeader`: **Processos**, com a descrição "Roteiros em etapas: cada etapa vira tarefa quando a
   anterior é concluída. 3 modelos · 5 processos em andamento." As ações são `outline` **Criar
   processo avulso** (todos, `WriteGate scope="tasks"`) e `primary` **Novo modelo** (`registry`).
   Sem `registry`, a descrição termina em "Somente administradores alteram os modelos."
2. **Modelos**: `Card` com `CardHeader` "Modelos de processo" e a lista.
   - Linha (`FlowTemplateRow`): `CategoryIcon` neutro com `Workflow`; título com o selo "5 etapas";
     subtítulo com a descrição; coluna **Departamentos** (`w-36`, `@4xl`): os departamentos das
     etapas ("Societário e Fiscal"; "Sem departamento definido" em `text-subtle`);
     coluna **Prazo total** (`w-36`, `@2xl`): "até 16 dias" com "somando os prazos" embaixo; coluna
     **Uso** (`w-36`, `@3xl`): "Aplicado 7 vezes" ou "Nunca aplicado"; botão `outline sm`
     **Aplicar** sempre visível (é a ação principal da linha, para todos, `WriteGate
     scope="tasks"`) e o menu (Editar, Duplicar e, para `deleteRegistry`, Excluir; **Ver etapas**
     para quem não tem `registry`). O clique na linha abre o editor, em leitura sem `registry`.
3. **Processos**: `Card` com `CardHeader` "Processos" e, à direita, `SegmentedControl size="sm"`
   **Em andamento (5)** · **Concluídos** (`processos=`). Ver §18 sobre confirmar esta lista com o
   usuário: o Effy a tirou em 01/08/2026.
   - Linha (`FlowRow`, padrão de §5): à esquerda, um mini-progresso de etapas (pontos de 8px com 4px
     de espaço: feitas em `bg-data`, a atual com anel `ring-2 ring-data`, as que aguardam em
     `bg-border-strong`; até 8 pontos e "+N"); título "Abertura de empresa · Construtora Vale Verde"
     e subtítulo "Etapa 2 de 5 · Consulta de viabilidade"; colunas **Responsável** da etapa atual
     (`MemberAvatar sm` e nome curto, `@2xl`) e **Prazo da etapa** (`TaskDueLabel`, `w-36
     text-right`, `@xl`); menu (**Abrir etapa atual**, **Ver etapas** e, para `deleteTasks`,
     **Excluir processo**). O clique abre a tarefa da etapa atual.
   - Concluídos: o mini-progresso todo em `bg-data`, o subtítulo "Concluído em 28/10/2026" e, no
     lugar do prazo, "5 etapas em 16 dias".
   - **Ver etapas** abre um `Sheet md` só de leitura com o `FlowStepper` completo (§9.1).
   - **Excluir processo**: `ConfirmDialog` "Excluir o processo “Abertura de empresa · Construtora
     Vale Verde”?" com "As tarefas já criadas continuam; as etapas que ainda não começaram deixam de
     existir." e o botão **Excluir processo**.

### 12.2 Editor de modelo (`FlowTemplateSheet`, `width="lg"`, `registry` edita)

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
    "dias") e um `⋯` (Categoria…, Descrição…, Mover para cima, Mover para baixo, Remover etapa). Na
    2ª, alinhada ao nome: **Responsável** (`MemberPicker`, `allowNone` "Sem responsável") e
    **Prioridade** (`Select`) e **Departamento**: com responsável num departamento, texto
    `text-caption text-muted` "Fiscal (do responsável)"; sem responsável, um `Select size_="sm"`
    "Fila" com os departamentos (a etapa vira tarefa na fila escolhida). A 375px, a 2ª linha
    empilha.
  - Reordenar arrastando pela alça ou, pelo teclado, com **Alt+↑** e **Alt+↓** na alça (anúncio
    "Etapa movida para a posição 2 de 5").
  - `ghost` **+ Adicionar etapa**, que já vem com 1 dia de prazo, o responsável da etapa anterior e
    o foco no nome. Até 30 etapas.
- **Prévia** (`text-caption text-muted`, `bg-surface-muted rounded-lg p-3`): "Se aplicado hoje
  (29/10): a etapa 1 vence em 30/10; as outras contam da conclusão da anterior (+2, +3, +5 e +6
  dias)."
- Validação: "Informe o nome do modelo.", "Adicione pelo menos uma etapa.", "Informe o nome da
  tarefa desta etapa." e "O prazo deve ficar entre 0 e 365 dias."
- Rodapé: **Cancelar** e **Salvar modelo**, com a nota "Processos já aplicados não mudam." Em
  leitura: os campos desabilitados e só **Fechar**.

### 12.3 Aplicar modelo (`ApplyTemplateDialog`, `Modal` com `max-w-lg`)

- Título "Aplicar “Abertura de empresa”". Descrição: "A primeira tarefa é criada agora; as outras,
  quando a anterior for concluída."
- **Cliente*** (`ClientPicker`, sem "Interna", "Selecione o cliente…") e **Nome do processo**
  (opcional; o padrão é "Abertura de empresa · {cliente}").
- **Tarefas que serão criadas** (lista numerada, `text-body-sm`): "1. Solicitar documentos ·
  Marina S. · vence 30/10 (criada agora)" e "2. Consulta de viabilidade · Rafael L. · 2 dias após a
  etapa 1", e assim por diante.
- Rodapé: **Cancelar** e `primary` **Aplicar ao cliente**. Erro de validação: "Selecione o cliente
  para aplicar o modelo."
- Ao concluir: fecha e mostra o toast "Modelo aplicado. A primeira tarefa já foi criada." com a
  ação **Ver tarefa**.
- Pelo cabeçalho de Tarefas, pela barra flutuante ("Processo") ou pelo "+" do celular, um passo
  antes aparece o `TemplatePickerDialog` (`Modal max-w-md`): título "Escolha o modelo", busca e a
  lista de modelos (nome, "5 etapas · até 16 dias"); vazio: "Nenhum modelo de processo." com, para
  `registry`, **Novo modelo**, e para todos **Criar processo avulso**.
- A 375px, o `Modal` ocupa a tela e a lista de etapas rola dentro do corpo.

### 12.4 Processo avulso (`FlowBuilderSheet`, `width="lg"`)

- Título "Novo processo". Descrição: "Cada etapa só aparece para o responsável quando a anterior for
  concluída."
- Campos: **Nome do processo*** ("Ex.: Alteração contratual da Padaria Pão Dourado"), **Cliente**
  (`ClientPicker` com "Interna", vale para todas as etapas) e as **Etapas**, no mesmo
  `FlowStepsEditor`, com uma diferença: o **Prazo** de cada etapa tem `SegmentedControl size="sm"`
  **Em dias** · **Data** (data fixa, `Input type="date"`). No `⋯` de cada etapa há "Outro cliente…"
  para quando uma etapa for de outro cliente (o Effy permitia um cliente por etapa).
- `Checkbox` "Salvar também como modelo" (só `registry`); com alguma etapa em data fixa, o erro
  "Para salvar como modelo, use prazos em dias."
- Rodapé: **Cancelar** e **Criar processo**. Toast: "Processo criado. A primeira tarefa já está com
  Marina."

### 12.5 Estados

- **Sem modelos**: `Workflow`, "Nenhum modelo de processo", "Cadastre roteiros como Abertura de
  empresa ou Alteração contratual e aplique a qualquer cliente com um clique." e `outline` **Novo
  modelo** (`registry`; os outros leem "Os administradores cadastram os modelos…" e podem usar
  **Criar processo avulso**).
- **Sem processos em andamento**: uma linha só no Card, "Nenhum processo em andamento." (em
  Concluídos: "Nenhum processo concluído.").
- **Excluir modelo**: "Excluir o modelo “Abertura de empresa”?" com "Os processos já aplicados
  continuam; só o roteiro deixa de existir."
- **Carregando**: `SkeletonRows` nos dois Cards. **Erro**: `ErrorState` por Card.
- **Larguras**: as colunas seguem §5.2; a 375px, "Aplicar" fica visível e as colunas vão para o
  subtítulo ("5 etapas · até 16 dias · aplicado 7 vezes"); nos processos, o mini-progresso fica
  acima do título e o prazo, embaixo.

---

## 13. Clientes, cadastros e escritório

§13.1 a §13.6 estão implementados (fase 1), com os acréscimos das fases 2 e 3 marcados. §13.7 a
§13.10 são da fase 3.

### 13.1 Clientes (`/tarefas/clientes`)

**Pergunta da tela:** "Quem cuida de cada cliente em cada departamento, e como falo com ele?"
**Achado:** vagas sem responsável (cliente × departamento); na fase 3, também documentos vencidos.
**Ação mais frequente:** achar um cliente e ver contato e responsáveis; para administradores,
definir responsáveis.

O cadastro é o do financeiro (`contacts` com `kind = client`): a Gestão só lê. A tela não mostra
honorários a ninguém, nem a administradores (a API já os omite para o colaborador; para o
administrador, eles ficam no financeiro). Cadastrar, alterar e inativar continua em `/clientes`, no
financeiro, para quem tem `finance`. O que esta tela **edita** é da Gestão: o responsável de cada
cliente em cada departamento.

1. `PageHeader`: **Clientes**. Descrição: "8 clientes ativos · cadastro mantido pelos
   administradores no financeiro". Ação, só para administradores: `outline` **Editar no
   financeiro** (`Wallet`), que leva a `/clientes`. Para o colaborador, nenhuma ação.
2. `ClientCoverageSummary`, no molde do `ClientsSummary`:

   | Célula | Número | Linha de baixo | Clique |
   | --- | --- | --- | --- |
   | Clientes ativos (principal) | "8" em 32px | "2 inativos" (link que alterna a situação para Inativos) | — |
   | Sem responsável, com `Info` | "4", em `text-warning` se maior que 0 | "em 4 clientes" | alterna `sem-responsavel=1` (`aria-pressed`) |
   | Documentos (fase 3) | "2 vencidos", em `text-danger` se maior que 0 (com zero, "0 vencidos" em tinta) | "**3 vencem em até 30 dias**" (alterna `documentos=30-dias`) | alterna `documentos=vencidos` |
   | Com responsável, por departamento | linhas: nome, barra com trilho `bg-bg-subtle` e preenchimento `bg-data` (clientes ativos com responsável sobre o total) e "8/8" (em `text-warning` quando falta algum) | — | cada linha filtra o departamento (`aria-pressed`) |

   "Sem responsável" conta **vagas** (cliente ativo × departamento, em todos os departamentos, como
   está implementado: o responsável também é a sugestão nas tarefas avulsas, não só nas
   recorrentes); por isso a linha de baixo diz em quantos clientes elas estão. Grade: 3 células na
   fase 1; na fase 3, 4 células em `lg` (`grid-cols-[minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.4fr)]`),
   2 × 2 em `md` e uma por linha abaixo disso.
3. Barra de ferramentas no topo do `Card` da lista (como em Clientes do financeiro): busca ("Buscar
   por razão social, fantasia ou CNPJ"), `SegmentedControl size="sm"` Ativos · Inativos · Todos,
   `Select` Regime, `Select` Departamento, `MemberPicker` Responsável (a carteira da pessoa),
   `Switch` "Só sem responsável" e, à direita, "8 clientes".
4. Lista, no padrão de §5 (`TaskClientRow`):

   ```
   [AP] Padaria Pão Dourado          │ 12.345.678/0001-90 │ Simples Nacional │ ◯ Ana P.  │ ◯ Bruno C. │ ◌ Sem resp. │ ⋯
        Pão Dourado Comércio Ltda    │                    │ Anexo I          │ (Fiscal)  │ (Pessoal)  │ (Contábil)  │
   ```

   - **Identificação** (`flex-1`): o círculo de iniciais de 36px de Clientes do financeiro, o nome
     (fantasia ou razão, `text-sm font-semibold`) e, embaixo, a razão social quando há fantasia, ou
     "Inativo desde 12/08/2026" nos inativos (nome em `text-muted` e `Badge neutral` "Inativo").
     Com o filtro Documentos (fase 3), o subtítulo diz o documento mais urgente: "Certificado
     digital venceu há 3 dias" (`text-danger`) ou "Alvará vence em 12 dias" (`text-warning`).
   - **CNPJ** (`w-40 tabular text-muted`, a partir de `@3xl`).
   - **Regime** (`w-36`, a partir de `@2xl`), com "Anexo I" embaixo no Simples.
   - **Uma coluna por departamento** (`w-36` cada, a partir de `@4xl`; o cabeçalho é o nome do
     departamento): `ClientResponsibleCell` com `MemberAvatar sm` e o nome curto, ou o círculo
     tracejado e "Sem responsável" em `text-subtle`. A célula não leva cor de alerta: o alerta
     aparece uma vez, no resumo. Com mais de 4 departamentos, ou abaixo de `@4xl`, as colunas viram
     uma só, "Responsáveis" (`w-28`, a partir de `@xl`), com a pilha de avatares (tooltip "Fiscal:
     Ana P. · Pessoal: Bruno C. · Contábil: sem responsável") e "1 sem responsável" em `text-mini
     text-warning` quando houver. Com o filtro Departamento, só a coluna dele aparece.
   - **Nenhum acesso, inscrição ou documento vira coluna**: ficam na ficha (§13.8).
   - **Menu `⋯`**: **Ver ficha**, **Ver tarefas do cliente**
     (`/tarefas?escopo=todas&cliente=<id>`), **Ver na auditoria** (fase 2,
     `/tarefas/auditoria?busca=<nome>`) e, para administradores, separador e **Editar no
     financeiro** (`/clientes?editar=<id>`).
   - O clique na linha abre a ficha (`?cliente=<id>`, §13.2).
   - **Administrador**: a célula de departamento é um botão ("Responsável pelo Fiscal de Padaria
     Pão Dourado: Ana Paula. Alterar.") que abre o `MemberPicker` (`departmentId`, `allowNone`
     "Sem responsável"). A escolha salva na hora (otimista, toast com "Desfazer", §17). Um
     `Checkbox` antes das iniciais seleciona a linha para o lote (§13.3); ele aparece no hover e no
     foco, fica visível quando há seleção e sempre em `pointer-coarse`.
   - **Colaborador**: a célula é texto e não há caixas de seleção.
   - Paginação de 50, como em Contas a pagar.
5. **Vazio**: "Nenhum cliente cadastrado" com "Os clientes são cadastrados pelos administradores no
   financeiro."; filtros sem resultado: "Nenhum cliente com esses filtros" e **Limpar filtros**.
6. **Larguras**: em 1440, todas as colunas; em 1024, a coluna única "Responsáveis"; em 768, sem CNPJ;
   a 375px, iniciais, nome, razão social e a pilha de responsáveis embaixo, e a barra de ferramentas
   vira busca e "Filtros (N)".

### 13.2 Ficha do cliente (`TaskClientSheet`, `width="lg"`)

Abre pela linha, pela auditoria, pelo `RecurringOccurrenceSheet` e pela busca (⌘K). Título: o nome.
Descrição: "Lucro Presumido · 45.723.174/0001-10 · Ativo" (ou "Inativo desde 12/08/2026").

Corpo, de cima para baixo (`gap-6`; cada seção com título `h3 text-body-sm font-semibold`):

1. **Contatos** (implementado): e-mail (`mailto:`) e telefone (`tel:`) da empresa, cada um com o
   botão de copiar (`Copy`, `icon-sm ghost`, toast "Copiado."), e um bloco `rounded-lg
   bg-surface-muted p-3` "Responsável na empresa" com nome, e-mail e telefone. Vazio: "Nenhum
   contato cadastrado." e, para administradores, o link **Cadastrar no financeiro**.
2. **Responsáveis por departamento** (implementado): uma linha por departamento (o nome em `w-28
   text-body-sm text-muted` e a `ClientResponsibleCell`), com a dica "Quem cuida deste cliente em
   cada departamento: a sugestão de responsável ao criar uma tarefa para ele." Na fase 2 a dica
   ganha: "… e quem recebe as tarefas recorrentes dele. Sem responsável, vale o responsável padrão
   de cada recorrente." Para administradores, cada linha é um `MemberPicker` que salva sozinho.
3. **Tarefas** (implementado): "5 em aberto · 1 atrasada" (o trecho das atrasadas em
   `text-danger`), até 5 `TaskRow density="compact"` e o link **Ver tarefas do cliente**. Fase 2:
   embaixo, "Obrigações de outubro: 7 de 9 concluídas" (ou "… 9 de 9 concluídas · mês concluído em
   28/10") com o link **Ver na auditoria**.
4. **Documentos** (fase 3, §13.8.3).
5. **Inscrições e acessos** (fase 3, §13.8.3).
6. **Sindicatos** (fase 3, §13.8.3).
7. **Dados cadastrais** (implementado, `ClientProfile` sem contatos e sem observações): razão
   social, nome fantasia, CNPJ, abertura, atividade principal, endereço, regime (e anexo), cliente
   desde (o início do contrato, que decide de quando em diante as recorrentes se aplicam) e a
   inativação, com o motivo. Sem honorários, sem vencimento do honorário e sem desconto.

Rodapé: à direita, `outline` **Editar no financeiro** (administradores, leva a
`/clientes?editar=<id>`) e `ghost` **Fechar**. Cliente que não existe (link antigo): `EmptyState`
"Cliente não encontrado" com "Ele pode ter sido excluído.".

**Efeito de trocar o responsável** (na célula, na ficha ou em lote): na fase 2, as ocorrências **em
aberto** daquele cliente e departamento, da competência atual em diante, passam para a pessoa nova,
menos as atribuídas à mão numa competência. Concluídas não mudam. O toast diz quantas mudaram (§17).

### 13.3 Responsável em lote (`AssignResponsibleDialog`, `Modal` com `max-w-md`)

Com linhas selecionadas, o cabeçalho da lista vira uma barra de seleção: "3 clientes selecionados",
`outline sm` **Definir responsável…** e `ghost sm` **Limpar seleção**. O diálogo:

- Título "Definir responsável para 3 clientes".
- **Departamento*** (`Select`) e **Responsável*** (`MemberPicker` do departamento; `allowNone`
  "Remover responsável").
- Resumo `text-body-sm`: "Ana Paula passa a responder pelo Fiscal de 3 clientes." Na fase 2, mais
  "14 tarefas recorrentes em aberto mudam de responsável."
- Rodapé: **Cancelar** e `primary` **Aplicar a 3 clientes**. Toast "Responsável definido para 3
  clientes." com **Desfazer**.

### 13.4 Cadastros (`/tarefas/cadastros`): Departamentos

A página **Cadastros** tem, logo abaixo do `PageHeader`, um `SegmentedControl` com as abas
**Departamentos** (`UsersRound`) · **Categorias** · **Equipe** (`ShieldCheck`) e, na fase 3,
**Sindicatos** (`Scale`), em `?aba=`. A descrição e a ação mudam com a aba. Sem `registry`, as abas
abrem em leitura, sem botões de criar, e a descrição termina em "Somente administradores alteram
estes cadastros." A 375px, as abas rolam na horizontal dentro do próprio contêiner.

- Descrição: "4 departamentos · cada tarefa pertence a um departamento." Ação: **Novo
  departamento**.
- Linha (`DepartmentRow`): `CategoryIcon` neutro com `UsersRound`; o nome; o subtítulo com os
  membros ("Ana Paula e Marina Costa", "Ana Paula, Bruno e mais 2" ou "Sem membros"); as colunas
  **Membros** (pilha de avatares, `@2xl`), **Em aberto** (`tabular`, com "2 atrasadas" em
  `text-mini text-danger` embaixo), **Recorrentes** (fase 2, contagem, `@3xl`) e **Com
  responsável** ("8/8", `@4xl`, em `text-warning` quando faltar algum); e o menu (Editar, Excluir).
- **`DepartmentSheet`** (`md`): título "Novo departamento" ou "Editar departamento", descrição
  "Departamentos agrupam a equipe; o Início mostra o trabalho de cada um." Campos: **Nome***
  ("Ex.: Fiscal") e **Membros**, uma lista com busca ("Buscar pessoa") em que cada membro aparece
  com `Checkbox`, avatar, nome e, se estiver em outro departamento, "hoje no Contábil" em
  `text-muted`. Dica: "Cada pessoa fica em um departamento: marcar aqui tira a pessoa do
  departamento atual." Rodapé: **Cancelar** e **Salvar departamento**.
- **Excluir com vínculos** (regra do Effy): um `Modal` informativo "Não é possível excluir Fiscal"
  com a mensagem da API ("2 membros e 12 tarefas ainda estão neste departamento. Mova-os antes de
  excluir.") e o botão **Entendi**. Sem vínculos: `ConfirmDialog` "Excluir o departamento Fiscal?"
  com "Os responsáveis de clientes neste departamento também saem. Esta ação não pode ser
  desfeita."
- **Vazio**: `UsersRound`, "Nenhum departamento", "Departamentos agrupam a equipe (Fiscal, Pessoal,
  Contábil). Cada tarefa pertence a um, e o Início mostra o trabalho de cada departamento." e
  **Novo departamento**.

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

- Descrição: "8 pessoas · 2 administradores e 6 colaboradores." Ação, só para o proprietário (fase
  3: para quem tem `members`): `outline` **Convidar pessoa** (`MailPlus`), que leva a
  `/configuracoes?aba=membros`. Para os outros administradores, no lugar do botão, o texto
  `text-body-sm text-muted` "Convites e papéis ficam com o proprietário em Configurações › Membros."
- Quando houver, uma nota acima da lista, no molde da nota de honorários do `ClientsSummary`
  (`CircleAlert` em `text-warning`): "2 pessoas sem departamento não aparecem no Início de nenhum
  departamento." com `outline sm` **Ver quem** (filtra a lista; vira **Ver todos**).
- Linha (`TeamRow`, no padrão de §5):
  - `MemberAvatar md`, o nome (com o `Badge tone="brand"` "Você") e o e-mail no subtítulo;
  - **Papel** (`w-32`, a partir de `@2xl`): "Proprietário", "Administrador" ou "Colaborador" em
    `text-body-sm text-muted`, com a dica do papel no tooltip; na fase 3, com ajustes, "2 ajustes"
    em `text-mini text-muted` embaixo (tooltip com a lista: "Cadastros da gestão: ligado ·
    Relatórios de tarefas: oculto");
  - **Departamento** (`w-48`, a partir de `@xl`): para administradores, um `Select size_="sm"`
    (`MemberDepartmentSelect`, `aria-label="Departamento de Bruno Carvalho"`) com "Sem departamento"
    e os departamentos, que salva na hora (toast "Bruno agora está no Fiscal."); para os outros,
    texto, ou "Sem departamento" em `text-subtle`;
  - **Carteira** (`w-28`, a partir de `@3xl`): "8 clientes", link para
    `/tarefas/clientes?responsavel=<id>`;
  - **Em aberto** (`w-28 text-right tabular`, a partir de `@3xl`), com "2 atrasadas" em `text-mini
    text-danger` embaixo;
  - menu: **Ver tarefas** (`/tarefas?escopo=todas&responsavel=<id>`), **Ver clientes**, **Alterar
    papel** (proprietário, leva a Configurações › Membros) e, na fase 3, **Permissões…** (para quem
    tem `members`, abre o `MemberAccessSheet`, §13.10).
- Remover alguém do espaço continua só em Configurações › Membros.
- **Vazio** (só você no espaço): `UsersRound`, "Só você neste espaço" e "Convide a equipe e distribua
  as pessoas pelos departamentos.", com **Convidar pessoa** para o proprietário.

### 13.7 Cadastros: Sindicatos e convenções coletivas (fase 3)

**Pergunta da aba:** "Quais convenções coletivas venceram ou vencem logo, e quais clientes elas
afetam?"
**Achado:** convenções vencidas e não marcadas como publicadas (o reajuste da folha está pendente).
**Ação mais frequente:** marcar a convenção do ano como publicada.

**Onde fica e por quê**: 4ª aba de Cadastros, **Sindicatos** (`Scale`, `?aba=sindicatos`), e não um
item próprio no trilho. São poucos cadastros (uma dúzia de sindicatos) mexidos poucas vezes por ano;
o alerta chega às pessoas pelo Início, pelo sino e pela ficha do cliente; o trilho fica em 8 itens;
e o Effy também o tinha em Cadastros. Todos os membros veem (são dados públicos da entidade); quem
tem `registry` cadastra, edita e marca convenções; `deleteRegistry` exclui.

1. Descrição do `PageHeader` na aba: "12 sindicatos ativos · 2 convenções vencidas, 1 vence em até
   30 dias" (ou "… · nenhuma convenção vence nos próximos 60 dias"). Ação: `primary` **Novo
   sindicato** (`registry`).
2. **`UnionSummary`** (molde do `ClientsSummary`, 4 células, cada uma alterna o filtro de situação
   com `aria-pressed`):

   | Célula | Número | Linha de baixo |
   | --- | --- | --- |
   | Convenção vencida (principal) | 32px, em `text-danger` se maior que 0 | "afeta 9 clientes" (os clientes ativos vinculados) ou "Nenhuma vencida." |
   | Vence em até 30 dias | `text-kpi`, em `text-warning` se maior que 0 | "data-base próxima" |
   | Vence em 31 a 60 dias | `text-kpi` | "para acompanhar" |
   | Sem data-base | `text-kpi` | "não entram nos alertas" |

3. Barra de ferramentas no topo do `Card` da lista: busca ("Buscar por nome, sigla, categoria ou
   CNPJ"), `SegmentedControl size="sm"` Ativos · Inativos · Todos, `Select` Situação ("Todas",
   "Convenção vencida", "Vence em até 30 dias", "Vence em 31 a 60 dias", "Em dia", "Sem data-base")
   e, à direita, "12 sindicatos".
4. **Lista** (`UnionRow`, padrão de §5), ordenada pela urgência (vencidas primeiro, sem data-base no
   fim) e depois pelo nome:

   ```
   (SC) SINDCOM                                   │ Comerciários        │ 6 clientes │ Novembro │    01/11/2026 │ ⋯
        Sindicato dos Comerciários de Mogi Guaçu  │ Mogi Guaçu e região │            │          │ Vence em 2 dias │
   ```

   - **Identificação** (`flex-1`): o círculo neutro com a sigla (§3.6); título com a sigla, ou a
     razão social sem sigla; subtítulo com a razão social (ou o CNPJ, sem sigla). Inativo: título
     em `text-muted` e `Badge neutral` "Inativo".
   - **Categoria** (`w-44`, `@3xl`): "Comerciários" e, embaixo, a base territorial em
     `text-caption text-muted`.
   - **Clientes** (`w-28`, `@2xl`): "6 clientes" ou "Nenhum" em `text-subtle`.
   - **Data-base** (`w-28`, `@4xl`): o mês ("Novembro"); "—" sem data-base.
   - **Convenção** (`w-40 text-right`, `@xl`; abaixo, uma linha sob o subtítulo): a data do ciclo
     acompanhado (`text-[13px] font-medium tabular`, "01/11/2026") e, embaixo, "Venceu há 12 dias"
     (`text-xs font-semibold text-danger`), "Vence hoje" (`font-semibold text-warning`), "Vence em 2
     dias" (`font-medium text-warning`, até 30 dias), "Vence em 45 dias" (`text-muted`) ou "Sem
     data-base" (`text-subtle`). O tooltip diz o ciclo: "Convenção Coletiva 2026/2027".
   - **Menu `⋯`**: **Convenções coletivas…** (abre o `ConventionCyclesDialog`), **Editar** (ou
     **Ver**) e, para `registry`, **Marcar 2026/2027 como publicada**; separador e, para
     `deleteRegistry`, **Excluir**.
   - O clique na linha abre o `UnionSheet`. Paginação de 50 só acima de 50 sindicatos.
5. **`UnionSheet`** (`lg`): título "Novo sindicato", "Editar sindicato" ou, em leitura, o nome.
   Descrição: "Dados da entidade, data-base e os clientes cujos empregados seguem esta convenção."
   Grupos, com títulos `text-body-sm font-semibold`:
   - **Identificação**: **CNPJ*** (máscara, com `soft` **Importar da Receita**, o mesmo do cadastro
     de cliente, que preenche nome, endereço, telefone e e-mail), **Nome do sindicato*** ("Ex.:
     Sindicato dos Comerciários de Mogi Guaçu"), **Sigla** ("Ex.: SINDCOM"), **Categoria
     representada** ("Ex.: Comerciários") e **Base territorial** ("Ex.: Mogi Guaçu e região").
   - **Convenção coletiva**: **Mês da data-base** (`Select`: "Não definido", Janeiro a Dezembro),
     com a dica "A data-base se repete todo ano: o vencimento é o dia 1º deste mês, no ano da
     convenção acompanhada. Sem o mês, o sindicato não entra nos alertas." Na edição, embaixo:
     "Acompanhando a Convenção Coletiva 2026/2027, que vence em 01/11/2026." com o `link`
     **Convenções coletivas…**.
   - **Clientes vinculados**: um `Select` "Mostrar" com "Todos os clientes ativos" e "Com
     responsável no {departamento}" (um por departamento), a busca e a lista de `Checkbox` com
     rolagem própria (`max-h-72`; cada cliente com o regime e, se houver, o responsável no
     departamento escolhido em `text-muted`), "6 selecionados", **Marcar os visíveis** e
     **Limpar**. Dica: "Clientes cujos empregados seguem esta convenção. O alerta mostra quantos
     clientes cada convenção afeta, e a ficha do cliente mostra os sindicatos dele."
   - **Endereço**: CEP, logradouro, número, bairro, cidade e UF, na mesma grade do cadastro de
     cliente.
   - **Contato e responsável**: Telefone, E-mail, Site, Responsável, Cargo ("Ex.: Presidente"),
     E-mail do responsável e Telefone do responsável.
   - **Observações** (`Textarea`) e `Switch` **Sindicato ativo**, com a dica "Inativo sai dos
     alertas e da lista padrão; o histórico fica."
   - Rodapé: **Cancelar** e **Salvar sindicato**. Validação: "Informe o CNPJ do sindicato.", "CNPJ
     inválido.", "Já existe um sindicato com este CNPJ." e "Informe o nome do sindicato." Em
     leitura: campos desabilitados, **Fechar** e o `ADMIN_ONLY_REASON`.
6. **`ConventionCyclesDialog`** (`Modal max-w-lg`): título "Convenções coletivas · SINDCOM";
   descrição "Data-base em novembro." Sem mês de data-base, no lugar da lista: "Este sindicato ainda
   não tem o mês da data-base. Defina o mês no cadastro para acompanhar o vencimento." e `outline sm`
   **Editar sindicato**.
   - Dica: "Marque a convenção que já foi publicada. Ao marcar, a do ano seguinte entra na lista e
     passa a ser acompanhada. Sem marcar, o sindicato continua no alerta, mesmo depois de vencido."
   - Lista dos ciclos gravados mais o acompanhado (linhas de 56px): `Checkbox`, "Convenção Coletiva
     2026/2027" (`text-sm font-semibold`) e, embaixo, "vence em 1º de novembro de 2026" ou
     "publicada · marcada por Ana P. em 03/11/2026" (`text-caption text-muted`); à direita, o selo
     `neutral` "Acompanhando" no ciclo acompanhado, ou `CircleCheck` de 14px em `text-success` e
     "Publicada" nos marcados.
   - Marcar o último ciclo acrescenta o seguinte; desmarcar tira os seguintes que não foram
     publicados (como no Effy). Nada é gravado até salvar.
   - Rodapé: a linha "Acompanhando: Convenção Coletiva 2026/2027, vence em 01/11/2026." e os botões
     **Cancelar** e **Salvar convenções**. Toast "Convenções coletivas atualizadas." e, quando um
     ciclo foi marcado como publicado, a ação **Criar tarefa de reajuste** (abre o `TaskSheet` com
     `?nova=1&titulo=Aplicar o reajuste da convenção SINDCOM 2026/2027`).
   - Sem `registry`: as caixas ficam desabilitadas, o rodapé mostra só **Fechar** e "Somente
     administradores marcam convenções."
7. **Excluir** (`deleteRegistry`): `ConfirmDialog` "Excluir o sindicato SINDCOM?" com "O vínculo com
   6 clientes e o histórico de convenções também serão excluídos. Para manter o histórico, inative
   o sindicato." e o botão **Excluir sindicato**.
8. **Estados**: vazio com `Scale`, "Nenhum sindicato cadastrado", "Cadastre os sindicatos dos
   clientes para acompanhar a data-base e a publicação das convenções coletivas." e `outline`
   **Novo sindicato** (sem `registry`: "Os administradores cadastram os sindicatos…" e sem botão);
   filtros sem resultado: "Nenhum sindicato com esses filtros" e **Limpar filtros**; carregando:
   resumo com esqueletos e `SkeletonRows`; erro: `ErrorState` no Card.
9. **Larguras**: em 1440, todas as colunas; em 1024, sem Data-base (vai para o subtítulo, "data-base
   em novembro"); em 768, também sem Categoria e Clientes; a 375px, o resumo em 2 × 2, a barra vira
   busca e "Filtros (N)" (Ativos e Situação no Sheet) e a linha mostra sigla, nome e a linha da
   convenção.

### 13.8 Dados fiscais, acessos e documentos do cliente (fase 3)

**Decisão do usuário**: o cadastro de empresas é do **financeiro** e só administradores (`finance`)
cadastram, alteram e inativam. Os campos que o Effy tinha e o Efficio não (inscrição estadual,
inscrição municipal, código de acesso do Simples Nacional, senha do contador e os documentos com
vencimento, o `CompanyReport`) entram **no formulário de cliente do financeiro** e aparecem **só
para leitura na ficha do cliente da Gestão**. O anexo do Simples Nacional já existe
(`simplesAnnex`). O alerta de vencimento fica no Início, no sino, no resumo de Clientes e no
`DeadlinesSheet` (§6.10).

#### 13.8.1 No formulário de cliente do financeiro (`ClientSheet`)

O formulário usa rótulos de seção com ícone ("Dados da empresa", "Responsável", "Endereço"). Entram
duas seções depois dos campos de regime, anexo, início do contrato e vencimento do honorário, e
antes de "Responsável":

- **Inscrições e acessos** (`KeyRound`), em grade de 2 colunas a partir de 640px:
  - **Inscrição estadual** (`Input`, placeholder "Ex.: 110.042.490.114") com o `Checkbox` "Isenta
    de inscrição estadual" embaixo (marcado, o campo esvazia e desabilita).
  - **Inscrição municipal** (`Input`, dica "Opcional").
  - Só com regime Simples Nacional ou MEI: **Código de acesso do Simples Nacional**
    (`SecretInput`), com a dica "Usado no portal do Simples Nacional. Fica cifrado; só quem tem
    permissão vê."
  - **Senha do contador** (`SecretInput`), com a dica "Senha do escritório nos portais deste
    cliente. Fica cifrada; só quem tem permissão vê."
  - **`SecretInput`**: no cadastro novo, `Input type="password" autoComplete="off"` com o botão
    `icon-sm ghost` `Eye`/`EyeOff` ("Mostrar o que foi digitado"). Na edição de um valor já gravado,
    o campo **nunca vem preenchido**: mostra "•••••••• cadastrado" (`text-muted`, só leitura) com os
    `link` **Alterar** (troca por um campo vazio) e **Remover** (o campo mostra "Será removido ao
    salvar." com **Desfazer**). Quem quiser conferir o valor usa **Mostrar** na ficha (§13.8.3),
    que registra a consulta. Assim o valor não passa pelo formulário nem fica na memória da página
    à toa.
- **Documentos com vencimento** (`FileClock`), `ClientDocumentsEditor`:
  - Cada documento é uma linha em grade `sm:grid-cols-[minmax(0,1.3fr)_10rem_minmax(0,1fr)_auto]`
    (bloco `rounded-lg border p-3` empilhado abaixo de 640px): **Tipo** (`Select` com grupos:
    "Certificados": Certificado digital (e-CNPJ); "Certidões": CND federal (Receita e PGFN), CND
    estadual, CND municipal, CRF do FGTS, CNDT trabalhista; "Licenças e alvarás": Alvará de
    funcionamento, Licença sanitária, AVCB/CLCB (bombeiros), Licença ambiental; "Saúde e segurança do
    trabalho": PCMSO, PGR, LTCAT; "Outros": Registro em órgão de classe, Outro…), **Vencimento**
    (`Input type="date"`, opcional) com a situação embaixo ("Venceu há 3 dias" em `text-danger`,
    "Vence em 12 dias" em `text-warning`, até 30 dias) e **Observação** ("Ex.: A1, emitido pela
    Certisign", até 200 caracteres); `icon-sm ghost` `X` "Remover documento". Com "Outro…", aparece
    **Nome do documento*** no lugar do tipo.
  - `ghost sm` **+ Adicionar documento**, com o foco no Tipo da linha nova. Até 50 por cliente.
  - Vazio: "Nenhum documento. Adicione certificados, certidões e alvarás para receber o aviso de
    vencimento."
  - Validação: "Escolha o tipo do documento." e "Informe o nome do documento."
- **CPF do responsável** entra na seção "Responsável" (máscara de CPF, dica "Usado no contrato de
  prestação de serviços."), porque o contrato pede o CPF do sócio (§13.9). É dado pessoal: gravado
  cifrado e mostrado só no financeiro.
- Tudo salva com o cliente (os botões de sempre, **Cancelar** e **Salvar**).

#### 13.8.2 No "Consultar" do financeiro (`ClientDetailsDialog`)

Duas seções novas no `ClientProfile`, depois de "Contrato e tributação": **Inscrições e acessos**
(com o `CredentialField` de §13.8.3) e **Documentos** (a lista de §13.8.3). No rodapé, `outline`
**Gerar contrato** (§13.9).

#### 13.8.3 Na ficha do cliente da Gestão (`TaskClientSheet`), só leitura

- **Documentos** (`ClientDocumentsList`): título "Documentos" com a contagem e o resumo "1 vencido ·
  1 vence em até 30 dias" (os trechos em `text-danger` e `text-warning`). Linhas de 44px, no padrão
  de `DeadlineRow` (§6.10): ícone neutro do tipo, o nome, a observação em `text-muted` e, à direita,
  a data e a situação. Ordem: vencidos, depois por data, sem data no fim. Menu `⋯`: **Criar tarefa
  de renovação** (todos). Vazio: "Nenhum documento cadastrado." e, para quem tem `finance`, o link
  **Cadastrar no financeiro**.
- **Inscrições e acessos**, como lista de definição em 2 colunas (o `ProfileItem` de
  `client-profile.tsx`): **Inscrição estadual** ("123.456.789.110", "Isenta" ou "—"), **Inscrição
  municipal**, **Código de acesso do Simples Nacional** (só Simples e MEI) e **Senha do contador**;
  estes dois últimos com o `CredentialField`:
  - Mascarado: `••••••••` (`tabular tracking-widest text-muted`) e, para quem tem
    `clientCredentials`, `outline sm` **Mostrar** (`Eye`, `aria-label="Mostrar o código de acesso do
    Simples de Padaria Pão Dourado"`).
  - Revelando: o botão com o spinner. Revelado: o valor em `font-mono text-sm text-fg`, `icon-sm
    ghost` **Copiar** (toast "Copiado.") e `ghost sm` **Ocultar** (`EyeOff`), com "Some em 30 s" em
    `text-caption text-subtle`. Volta a mascarar depois de 30 segundos, ao fechar a ficha ou ao
    trocar de cliente.
  - Sem a permissão: `••••••••` e "Restrito: peça a um administrador" em `text-caption text-muted`
    (dizer que existe evita que alguém conclua que está vazio e cadastre outro por cima, lição do
    Effy). Não cadastrado: "Não cadastrado" em `text-subtle`, para todos.
  - Erro: `toastError` e o campo continua mascarado; 403: "Você não tem permissão para ver este
    acesso."
  - Dica da seção, para quem pode revelar: "Os acessos ficam cifrados. Cada visualização fica
    registrada com o nome de quem viu."
  - **Nunca** em listas, colunas, busca, ⌘K, exportações, notificações, URLs ou mensagens de erro.
- **Sindicatos** (`ClientUnionsList`): uma linha por sindicato vinculado, "SINDCOM · Comerciários" e,
  embaixo, "Convenção 2026/2027 vence em 01/11/2026" com a cor da situação; o clique leva a
  `/tarefas/cadastros?aba=sindicatos&sindicato=<id>`. Vazio: "Nenhum sindicato vinculado." e, para
  `registry`, o link **Vincular em Sindicatos**.
- A 375px as seções empilham, a lista de definição fica em 1 coluna e o `CredentialField` quebra o
  valor revelado em linha própria, com Copiar e Ocultar ao lado.

### 13.9 Escritório e modelo de contrato (fase 3)

**Onde fica**: Configurações › **Escritório** (`Stamp`, `?aba=escritorio`), aba que só aparece para
quem tem `office` (por padrão, proprietário e administradores). **Coerência com o financeiro**: o
contrato sai do cliente do financeiro e do honorário vigente, e a chave Pix é de cobrança, então o
lugar natural seria o financeiro; mas os dados do escritório também vão para os PDFs da Gestão
(relatório de tarefas) e para a mensagem de cobrança, e Configurações já guarda abas só de
administradores que tocam o financeiro (Assinatura, Integrações). Por isso a aba fica em
Configurações, que é comum às duas áreas, com a mesma restrição do financeiro. Gerar o contrato de
um cliente continua no financeiro.

**A aba Escritório** (`TabGrid` de Configurações, cartões `Card p-6` com `CardHeader`):

1. **Dados do escritório** (subtítulo "Aparecem no contrato, nos relatórios em PDF e na mensagem de
   cobrança."), formulário com salvar explícito:
   - Identificação: **CNPJ*** (máscara, com `soft` **Importar da Receita**), **Razão social***,
     **Nome fantasia**, **Inscrição estadual** e **Inscrição municipal**.
   - Endereço: CEP, logradouro, número, complemento, bairro, cidade e UF (a grade do cadastro de
     cliente).
   - Contato: Telefone, E-mail e Site.
   - Responsável: **Nome*** e **CPF*** (dica "Assina o contrato pelo escritório."), E-mail e
     Telefone.
   - Cobrança: **Chave Pix**, com `Select` do tipo (CNPJ, CPF, E-mail, Telefone, Chave aleatória) e o
     `Input` da chave, validado pelo tipo; dica "Aparece no contrato e na mensagem de cobrança."
   - `primary` **Salvar dados do escritório**. Toast "Dados do escritório salvos." Erros inline:
     "Informe o CNPJ do escritório.", "CNPJ inválido.", "Informe a razão social.", "CPF inválido.",
     "Chave Pix inválida para o tipo escolhido."
2. **Logo** (subtítulo "PNG, JPG ou WebP de até 500 KB. Aparece no contrato e nos PDFs."): prévia
   de 160×64 (`rounded-lg border bg-surface-muted`, imagem com `object-contain`; vazio: "Sem logo"
   em `text-subtle`), `outline sm` **Enviar logo** (ou **Trocar logo**) e `ghost sm` **Remover**.
   Erros: "A logo passa de 500 KB." e "Use PNG, JPG ou WebP." (SVG não é aceito, por segurança). A
   logo não substitui a marca Efficio no trilho.
3. **Modelo de contrato** (`ContractTemplateCard`, subtítulo "Um modelo para todos os clientes. O
   sistema preenche os dados do cliente, do escritório e do honorário."): a situação ("Modelo de
   fábrica, nunca editado" ou "Modelo próprio · editado por Ana Paula Ribeiro em 12/10/2026") e a
   marca d'água ("Marca d'água: ligada, a de fábrica"); `outline` **Editar modelo** (leva a
   `/configuracoes/contrato`) e `ghost` **Pré-visualizar** (o contrato com um cliente de exemplo, no
   editor). Se faltar algo para gerar contratos, uma linha `text-body-sm` com `CircleAlert` em
   `text-warning`: "Faltam dados do escritório para gerar contratos: CPF do responsável e CEP."

**Editor do modelo** (`/configuracoes/contrato`, `ContractTemplateEditor`; o mesmo `RestrictedAccess`
de §2.7 para quem não tem `office`). É uma página, e não um Sheet, porque o texto é longo, a prévia
precisa de espaço e sair sem salvar precisa de aviso.

- `PageHeader`: título **Modelo de contrato**; descrição "Contrato de prestação de serviços
  contábeis · modelo próprio, editado por Ana P. em 12/10/2026"; antes do título, `ghost sm` "‹
  Escritório" (volta a `/configuracoes?aba=escritorio`). Ações: um `⋯` (**Importar texto…** e
  **Voltar ao modelo de fábrica…**), `outline` **Pré-visualizar** (só abaixo de 1280px) e `primary`
  **Salvar modelo**.
- **A partir de 1280px**, duas colunas (`grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] gap-5`): à
  esquerda o editor; à direita, fixa na rolagem (`sticky top-6`), a **prévia** (`ContractPreview`):
  páginas A4 em escala (`aspect-[210/297]`, `bg-surface shadow-xs ring-1 ring-border`), preenchidas
  com um cliente de exemplo e atualizadas 300ms depois de cada digitação, com a marca d'água ao
  fundo. **Abaixo de 1280px**, uma coluna com `SegmentedControl` **Editar** · **Pré-visualizar** no
  topo.
- **Campos** (`ContractFieldPicker`): `outline sm` **Inserir campo** abre um `SearchSelect` com os
  campos agrupados: Cliente (razão social, CNPJ, logradouro, número, bairro, cidade, UF, CEP,
  responsável, CPF do responsável), Escritório (razão social, CNPJ, endereço completo, responsável,
  CPF do responsável, chave Pix) e Honorário (valor mensal, valor por extenso, taxa por empregado,
  taxa por extenso, dia do vencimento, dia por extenso, início do contrato por extenso, desconto (%)
  e desconto por extenso, os dois últimos "só com desconto cadastrado"). Escolher insere a marca
  ("[RAZAO SOCIAL CLIENTE]", as mesmas do Effy) onde estava o cursor do último bloco focado; sem
  bloco focado: toast "Clique primeiro no bloco onde o campo deve entrar." Dica: "Os campos entre
  colchetes são trocados pelos dados de cada cliente ao gerar o contrato."
- **Avisos** (`ContractWarnings`), acima dos blocos, só quando houver: "2 campos que o sistema não
  reconhece" (`rounded-lg border border-danger/30 bg-danger-soft p-3 text-body-sm`), com a lista em
  `font-mono` e "Saem do jeito que estão escritos. Confira a grafia ou troque por um campo da
  lista."; e "3 campos do modelo de fábrica não aparecem mais" (`border-warning/30 bg-warning-soft`),
  com "Sem eles, o contrato sai sem esses dados. Pode ser intencional."
- **Blocos** (`ContractBlockList`), um por linha com régua de 1px entre eles: no topo de cada bloco,
  o número (`text-mini text-subtle w-6`), o `Select size_="sm"` do tipo (Título do contrato,
  Subtítulo, Título de cláusula, Título de seção, Rótulo em negrito, Parágrafo, Parágrafo
  centralizado, Espaço em branco), o selo `neutral` "Só com desconto" no bloco com essa regra e, à
  direita, `icon-sm ghost` **Subir** (`ArrowUp`), **Descer** (`ArrowDown`), **Inserir bloco abaixo**
  (`Plus`) e **Remover** (`Trash2`, que confirma na linha: "Remover este bloco? Nada é gravado até
  salvar." com **Remover** e **Cancelar**). Embaixo, o `Textarea` que cresce até 12 linhas
  (`text-body-sm leading-relaxed`); "Espaço em branco" mostra "Espaço entre blocos." em
  `text-caption text-subtle`. No fim, `ghost` **+ Adicionar bloco no fim**. **Alt+↑** e **Alt+↓**
  movem o bloco focado. Limites (os do Effy): 500 blocos, 20.000 caracteres por bloco e 400.000 no
  total; perto do limite, "19.850 de 20.000 caracteres" sob o bloco.
- **Marca d'água** (`WatermarkField`, `Card` abaixo dos blocos): `Switch` **Usar marca d'água**,
  miniatura de página de 96×136 com a imagem (opacidade de 35% quando desligada), `outline sm`
  **Trocar imagem** (PNG, JPG ou WebP até 500 KB) e `ghost sm` **Voltar à de fábrica**. Dica:
  "Aparece atrás do texto em todas as páginas."
- **Importar texto** (`Modal max-w-lg`): `Textarea` para colar o contrato, a dica "Cada parágrafo
  vira um bloco. Linhas em maiúsculas viram títulos de cláusula.", o rádio **Substituir o modelo**
  · **Adicionar no fim** e o botão **Importar**. O resultado vai para o rascunho (toast "Texto
  importado: 86 blocos. Revise e salve.").
- **Voltar ao modelo de fábrica**: `ConfirmDialog` "Voltar ao modelo de fábrica?" com "O texto
  editado e a marca d'água trocada são descartados agora. Contratos já gerados não mudam." e o
  botão **Voltar ao modelo de fábrica**. Grava na hora (lição do Effy: só mexer no rascunho deixaria
  quem fechou a página com o modelo antigo gravado). Toast "Modelo de fábrica restaurado."
- **Salvar**: toast "Modelo de contrato salvo."; erro de limite, inline no bloco. **Sair com
  mudanças**: `Modal` "Sair sem salvar?" com "As mudanças no modelo de contrato serão perdidas." e
  os botões **Continuar editando** e **Sair sem salvar**.
- **Estados**: carregando, esqueletos de blocos; **erro ao ler o modelo**: `ErrorState` "Não foi
  possível carregar o modelo gravado. Tente de novo; o editor só abre com o modelo carregado." (abrir
  com o de fábrica e salvar por cima apagaria o modelo real, lição do Effy).
- A 375px: uma coluna, os controles do bloco em duas linhas (o tipo em largura total, os botões
  embaixo) e a prévia com a página na largura da tela.

**Gerar o contrato de um cliente** (financeiro, `finance`; não precisa de `office`):

- Entradas: o menu `⋯` da linha em Clientes do financeiro (**Gerar contrato**, `FileSignature`) e o
  rodapé do "Consultar".
- Antes de abrir, a tela confere o que falta (`ContractRequirementsDialog`, `Modal max-w-md`, só
  quando falta algo): título "Faltam dados para gerar o contrato"; grupos **Cadastro do cliente**
  ("Endereço, CPF do responsável", com `outline sm` **Editar cliente**), **Honorário** ("Nenhuma
  vigência cobre hoje", com **Cadastrar honorário**, que abre as vigências) e **Escritório** ("CPF do
  responsável", com **Abrir Escritório** para quem tem `office`; os outros leem "Peça a quem cuida
  do escritório para completar."). Rodapé: **Fechar**.
- Com tudo certo, abre `/clientes/:id/contrato` (`ClientContractPage`): `PageHeader` "Contrato ·
  Padaria Pão Dourado", descrição "Modelo próprio de 12/10/2026 · honorário de R$ 1.200,00 vigente
  desde 01/03/2026"; ações `primary` **Imprimir ou salvar PDF** (`Printer`, com `usePrintInLight`) e
  `ghost` **Voltar**. O corpo são as páginas A4 (`@page { size: A4 portrait; margin: 20mm }`), com a
  logo no topo da primeira, a marca d'água ao fundo (`print-color-adjust: exact`) e o texto
  justificado; a cláusula de desconto só entra quando a vigência tem desconto. Trilho, barra e botões
  ficam `print:hidden`.
- O contrato não é gravado; é gerado na hora com os dados atuais. Registrar a emissão é opcional
  (§18).

### 13.10 Permissões por pessoa (fase 3)

**Decisão**: o papel define o padrão (Proprietário, Administrador, Colaborador) e o cadastro da
pessoa pode ligar ou desligar cada chave. Só o que foi mudado fica gravado; o resto segue o papel,
então trocar o papel de alguém leva junto tudo o que não foi ajustado (a regra do Effy). O
proprietário tem tudo, sempre, e não aparece para ajuste. **Os padrões são o comportamento de hoje**;
o usuário disse que ajusta as permissões exatamente depois, então a tela fica pronta e nada muda até
alguém mexer.

**Chaves e padrões**

| Chave | Rótulo na tela | Descrição na tela | Proprietário | Administrador | Colaborador |
| --- | --- | --- | --- | --- | --- |
| `finance` | Financeiro | Abre a área Financeiro: painel, contas, extrato, clientes com honorários, cadastro de clientes, contrato e relatórios financeiros. | sim | sim | não |
| `registry` | Cadastros da gestão | Cria e edita departamentos, categorias, tarefas recorrentes, modelos de processo e sindicatos; define os responsáveis dos clientes e o departamento de cada pessoa. | sim | sim | não |
| `deleteRegistry` | Excluir cadastros | Exclui departamentos, categorias, tarefas recorrentes sem histórico, modelos de processo e sindicatos. | sim | sim | não |
| `deleteTasks` | Excluir tarefas | Exclui tarefas, processos e anexos de outras pessoas. Sem esta permissão, a pessoa cancela a tarefa. | sim | sim | não |
| `reopenOthers` | Reabrir conclusões de outras pessoas | Reabre, com motivo, tarefas recorrentes concluídas por outra pessoa (na auditoria, nas listas e no detalhe). As próprias conclusões, todos reabrem. | sim | sim | não |
| `clientCredentials` | Ver acessos dos clientes | Revela o código de acesso do Simples Nacional e a senha do contador na ficha do cliente. Cada visualização fica registrada. | sim | sim | não |
| `office` | Escritório e contrato | Edita os dados do escritório, a logo e o modelo de contrato. | sim | sim | não |
| `members` | Membros e permissões | Convida, muda o papel, remove pessoas e ajusta permissões. Ninguém concede o que não tem. | sim | não | não |
| `page.audit` | Auditoria mensal | — | sim | sim | sim |
| `page.recurring` | Tarefas recorrentes | — | sim | sim | sim |
| `page.processes` | Processos | — | sim | sim | sim |
| `page.clients` | Clientes | — | sim | sim | sim |
| `page.reports` | Relatórios de tarefas | — | sim | sim | sim |
| `page.registry` | Cadastros | — | sim | sim | sim |

A coluna Proprietário não se ajusta: ele tem todas as chaves, sempre. As chaves de ação são
conferidas pela API em cada operação. As de página (`page.*`) só escondem: a página some do trilho,
do "Mais" e do ⌘K, e a URL mostra o `RestrictedAccess` (§2.7), mas os dados continuam chegando às
outras telas (o nome do cliente na tarefa, por exemplo), como no Effy. Início e Tarefas não têm
chave. A lista de chaves é a proposta; esta tabela é o lugar de ajustar quando o usuário revisar.

**Onde fica**: `MemberAccessSheet` (`md`), aberto por:
- Configurações › Membros: em cada linha (menos a do proprietário e a sua), `ghost sm`
  **Permissões**, para quem tem `members`; embaixo do nome, "Colaborador · 2 ajustes" em
  `text-caption text-muted`;
- Cadastros › Equipe: **Permissões…** no menu da linha (§13.6);
- `?pessoa=<id>` nas duas páginas.

**O Sheet**

- Título "Permissões de Bruno Carvalho". Descrição: "O papel define o padrão; aqui você ajusta só o
  que for diferente para esta pessoa."
- `headerExtra`: **Papel**, `SegmentedControl size="sm"` **Administrador** · **Colaborador** (a
  dica do papel embaixo, em `text-caption text-muted`). Trocar o papel atualiza os padrões na hora;
  os ajustes continuam.
- Grupo **Ações** (título `text-body-sm font-semibold`, com a dica `text-caption text-muted`
  "Conferidas pelo servidor em cada operação: desligar aqui bloqueia a ação, não só o botão."). Cada
  chave é uma `PermissionSwitchRow` (mínimo de 56px, `flex items-start gap-3 py-3`, régua de 1px):
  o rótulo (`text-sm font-medium`) e a descrição (`text-caption text-muted`) à esquerda, o `Switch`
  à direita. Quando o valor difere do padrão do papel, o rótulo ganha o selo `neutral` "Ajustado" e
  aparece o `link` `text-caption` **Voltar ao padrão** sob a descrição; o tooltip do `Switch` diz
  "Padrão de Colaborador: desligado". Uma chave que quem edita não tem fica desabilitada, com
  "Você não tem esta permissão para conceder."
- Grupo **Páginas da gestão** (dica "Escondem a página do menu desta pessoa. Início e Tarefas
  aparecem sempre."): as seis chaves `page.*`, só com o rótulo.
- Rodapé: à esquerda, `ghost` **Voltar ao padrão do papel** (desabilitado sem ajustes; mexe só no
  rascunho); à direita, **Cancelar** e `primary` **Salvar permissões**. Toast "Permissões de Bruno
  salvas. Valem a partir da próxima ação dele."
- **Estados**: carregando, esqueletos das linhas; erro, `ErrorState`; salvando, botões com
  `loading`; sem `members`, o botão não aparece e `?pessoa=` é ignorado; a própria pessoa não abre o
  Sheet de si mesma (ninguém se dá permissão).
- **Efeitos visíveis**: um Colaborador com `finance` passa a ver o botão de troca de área e o
  financeiro; um Administrador sem `finance` vê "Acesso restrito" no financeiro, e a linha dele
  mostra "Administrador · sem financeiro". O texto dos bloqueios continua "Somente administradores…"
  (§2.6).
- A 375px o Sheet ocupa a tela; as linhas mantêm o `Switch` à direita e a descrição quebra.

---

## 14. Relatórios de tarefas (`/tarefas/relatorios`, fase 2)

**Pergunta da tela:** "O escritório entregou no prazo no período, e onde o atraso se concentra?"
**Achado:** o percentual de concluídas no prazo e quem (departamento, responsável, cliente) concentra
as entregas com atraso.
**Ação mais frequente:** filtrar por departamento ou responsável e exportar.

Unidade de §0, item 7 (cada ocorrência recorrente é uma tarefa por cliente). O período conta as
tarefas com vencimento nele (sem vencimento: criadas nele) e as ocorrências com prazo legal nele,
como em `GET /tasks/reports`.

### 14.1 Estrutura

1. `PageHeader`
   - **Relatórios de tarefas**.
   - Descrição com o achado: "Outubro de 2026: 61 concluídas, 54 no prazo (89%). Fiscal concentra 5
     das 7 entregas com atraso." Sem concluídas: "Outubro de 2026: nenhuma tarefa concluída ainda."
   - Ações: `PeriodFilter` (o mesmo de Relatórios; o padrão é **Mês**), `outline` **Exportar CSV**
     (`Download`) e `outline` **Imprimir ou salvar PDF** (`Printer`, `window.print()` com
     `usePrintInLight`).
2. Filtros num `Card p-4`: Departamento, Responsável, Categoria, Cliente, **Situação** (`Select` com
   grupos, como no Effy: "Em aberto (todas)", "Concluídas (todas)" e "Atrasadas", seguidos de A
   fazer, Em andamento, Aguardando cliente, Concluída e Cancelada; "Concluídas com atraso" entra
   quando a API filtrar por isso, §18),
   Prioridade, Tipo (Avulsas, Recorrentes ou Etapas de processo) e **Limpar**.
3. **Resumo** (painel com divisórias, 5 células; as 4 últimas alternam o filtro de situação com
   `aria-pressed`):

   | Célula | Número | Linha de baixo |
   | --- | --- | --- |
   | No prazo (principal), com `Info` "Concluídas até o prazo legal (ou o vencimento, nas avulsas). A meta interna não entra." | "89%" em 32px, em tinta; sem concluídas, "—" em `text-subtle` | "54 de 61 concluídas" ou "Nenhuma concluída no período." |
   | Concluídas | `text-kpi` "61" | "de 83 (73% das não canceladas)" |
   | Com atraso | `text-kpi` "7", em `text-danger` se maior que 0 | "concluídas depois do prazo" (alterna o filtro "Concluídas com atraso" quando ele existir; até lá, a célula não é botão) |
   | Em aberto | `text-kpi` "22" | "**12 atrasadas**" (`text-danger`; alterna `situacao=atrasadas`) |
   | Canceladas | `text-kpi` "3" | "fora das contas" |

4. **Blocos** (grade de 12 colunas a partir de 1024px, `gap-5`; cada um num `Card p-5` com
   `CardHeader`):

   | Bloco | Largura (lg) | Forma | Cabeçalho |
   | --- | --- | --- | --- |
   | Pontualidade por mês | 8 | `MonthlyPunctualityChart`: colunas empilhadas por mês, no prazo (`--app-data`, embaixo) e com atraso (`--app-danger`, em cima), cantos superiores de 6px, eixo X "mai/26", eixo Y em contagem | "Pontualidade por mês" · "Concluídas no prazo e com atraso nos últimos 6 meses, até outubro" (com período Mês) ou "… de janeiro a outubro de 2026" (com intervalo de 2 meses ou mais); a legenda de duas amostras à direita |
   | Por situação | 4 | `StatusBar100`: Concluídas (`data`), Em aberto (`data-soft`), Atrasadas (`danger`), Canceladas (`chart-neutral`), com a legenda em tabela (amostra, nome, quantidade e %) | "Por situação" · "Atrasadas contam à parte de Em aberto" |
   | Por departamento | 6 | `PunctualityList` | "Por departamento" · "Onde o atraso se concentra" |
   | Por responsável | 6 | `PunctualityList`, com o avatar na linha; `SegmentedControl size="sm"` **Responsável** · **Quem concluiu** no cabeçalho | "Por responsável" · com "Quem concluiu", "Conclusões no período por quem clicou, com a média de dias da criação à conclusão" |
   | Por cliente | 6 | `PunctualityList` (até 8 linhas e "Outros (N)") | "Por cliente" |
   | Por categoria | 6 | `PunctualityList` | "Por categoria" |

   - **`MonthlyPunctualityChart`**: tooltip "Outubro de 2026: 61 concluídas · 54 no prazo (89%) · 7
     com atraso"; clicar numa coluna troca o período para aquele mês. Mês sem concluídas: coluna
     vazia, com "0" no tooltip. Uma tabela `sr-only` repete os números.
   - **`PunctualityList`**: linha de 48px com o rótulo (`10rem`, truncado; "Interna" e "Sem
     responsável" em `text-subtle`), uma barra empilhada de 8px sem trilho (no prazo em `bg-data` e
     com atraso em `bg-danger`, junção de 2px, a maior ocupando o espaço) e, à direita, "89%"
     (`tabular text-[13px] font-semibold`, em tinta; "—" sem concluídas) sobre "54 no prazo · 7 com
     atraso" (`text-mini text-muted`, o trecho do atraso em `text-danger` quando maior que 0) e, se
     houver, "· 2 atrasadas em aberto" (`text-danger`). No cabeçalho do bloco, `SegmentedControl
     size="sm"` **Mais atrasos** · **Mais entregas** (padrão: Mais atrasos, pela quantidade com
     atraso e depois pelas atrasadas em aberto). O clique numa linha filtra o relatório
     (`aria-pressed`).
   - **Quem concluiu**: a mesma linha, com "41 concluídas · 38 no prazo · 3 com atraso" e "média de
     3 dias" (`text-mini text-muted`) no lugar das atrasadas em aberto. Responde "quem entrega", que
     pode não ser o responsável (o Effy gravava quem concluiu por isso).
   - A prioridade continua como filtro; o bloco "Por prioridade" da revisão 2 sai, porque não
     responde à pergunta da tela.
5. **Detalhamento** (`Card`): o cabeçalho "Detalhamento" com "86 tarefas" à direita. É uma **tabela,
   não uma lista**, porque é o que vai para o PDF e o CSV, com as mesmas colunas: Tarefa, Cliente,
   Departamento, Categoria, Responsável, Prioridade, Vencimento (o prazo legal, nas recorrentes),
   Meta (só recorrentes; "—" nas avulsas), Situação, Concluída em, No prazo ("Sim" ou "Não"; vazio
   nas abertas) e Concluída por. Uma ocorrência recorrente é uma linha por cliente. Cabeçalho em
   `text-xs text-muted` sem faixa; datas `tabular` à direita; régua de 1px entre linhas; o cabeçalho
   fica fixo na rolagem; a tabela rola na horizontal dentro do `Card` quando não cabe. São 50 linhas
   por página. O clique numa linha abre o `TaskSheet` (avulsa) ou o `RecurringOccurrenceSheet`
   (recorrente).

### 14.2 Exportação

- **CSV** com as colunas do detalhamento, `;` como separador, BOM UTF-8 e proteção contra injeção
  de fórmula (prefixar `'` em valores que começam com `= + - @`, tab ou CR, como no Effy). O
  arquivo é gerado pela API com o período e os filtros da tela, com todas as linhas até o limite
  dela; durante o download, o botão fica com `loading`. O nome do arquivo é
  `relatorio-tarefas-AAAA-MM-DD.csv` e o toast diz "CSV exportado.". Sem dados, o botão fica desabilitado com o tooltip "Não há dados para
  exportar com os filtros atuais."
- **PDF** (impressão): `@page { size: A4 landscape }` só nesta página. O trilho, os filtros e os
  botões ficam `print:hidden`. Saem o nome e a logo do escritório (fase 3, `GET /office/brand`), o
  título, a descrição com o período, o resumo, os blocos (2 por linha; o gráfico por mês na largura
  toda) e a tabela, além da nota "Gerado em 29/10/2026 às 15:40 por Ana Paula Ribeiro."
- Nenhum acesso de cliente entra em exportação nenhuma.

### 14.3 Estados e larguras

- **Sem tarefas no período**: o resumo mostra zeros (que são dados reais; o "No prazo" mostra "—");
  os blocos ficam com o contorno e a frase "Nenhuma tarefa no período."; o detalhamento mostra o
  `EmptyState` "Nenhuma tarefa com vencimento em outubro" com **Ver últimos 3 meses**, que muda o
  período.
- **Carregando**: esqueletos do tamanho final em cada bloco. **Erro**: `ErrorState` por bloco.
- **Larguras**: em 1440 e 1024, a grade de 12 colunas (8 + 4 e depois 6 + 6); em 768, 1 coluna; a
  375px, os botões de exportar vão para um `⋯` ao lado do período, os filtros viram "Filtros (N)",
  o gráfico mostra os 6 meses com rótulos de 3 letras, as `PunctualityList` mostram o percentual e
  a barra em linhas separadas, e a tabela vira **linhas de duas linhas** (tarefa e situação na
  primeira; "Padaria Pão Dourado · Ana P. · vence 25/10 · no prazo" na segunda), sem perder campos.

---

## 15. Widgets, anotações e perfil

### 15.1 Widgets: o Início e o painel financeiro

A primeira versão punha widgets de tarefas no dashboard financeiro, porque ele era a página inicial
de todos. Agora a página inicial é o Início (§6), e o dashboard financeiro é só dos administradores.
Os widgets de tarefas **não entram no catálogo do dashboard**: o grupo `tarefas` não entra em
`layout/specs.ts` e nenhum id novo entra em `layout/types.ts`. A tabela diz para onde foi cada card
do Effy (`CARD_KEYS` de `permissions.js`) e de cada widget da versão anterior:

| Card ou widget | Para onde foi | Fase |
| --- | --- | --- |
| `minhas-tarefas`, "Minhas tarefas" do perfil do Effy | Início, bloco Minhas tarefas (§6.4) | 1 |
| `tarefas-atrasadas` | Início, célula Atrasadas (§6.3), que leva à lista filtrada | 1 |
| `clientes-pendencias`, "Clientes com mais pendências" | Início, bloco Por cliente (§6.7) | 1 |
| `w-taskhub`, `situacao-tarefas` | Relatórios de tarefas, bloco Por situação (§14.1) | 2 |
| `w-fluxo`, `tarefas-por-dia` | o Calendário de Tarefas (§7.6) e a célula "Próximos 7 dias" do Início | 2 |
| `w-agendamentos`, `agenda-tarefas` | Tarefas, visualização Calendário (agenda em lista abaixo de 1024px, §7.6) | 2 |
| `w-processos`, `processos-departamento`, `w-fiscal` | Início, bloco Obrigações da competência (§6.5), e o resumo por departamento da Auditoria (§11.1) | 2 |
| `anotacoes`, "Minhas anotações" | menu do avatar, "Mais" do celular e ⌘K (§15.2) | 2 |
| `w-certificados`, `w-laudos` | faixa de vencimentos do Início, grupo do sino e `DeadlinesSheet` (§6.10) | 3 |
| `w-convencoes` | os mesmos, na aba Convenções (§6.10) | 3 |
| `w-clientes`, `w-visao` | Clientes do financeiro (resumo por regime) e Clientes da Gestão (§13.1) | já existe |
| `w-honorarios` | painel financeiro (Honorários e cobrança) | já existe |
| `w-completude` (cadastro incompleto) | não entra: inscrições e acessos ficam na ficha; se fizer falta, um filtro "Cadastro fiscal incompleto" em Clientes do financeiro (§18) | — |

**Nenhum widget de tarefas no painel financeiro.** O painel responde "como está o caixa do
escritório"; o administrador começa o dia no Início, que já mostra as tarefas. Um widget de tarefas
no painel repetiria os números do Início em outro lugar e com outro recorte (um número, um lugar).

**Peças que o Início aproveita dos widgets**: `WidgetCard` (cabeçalho fixo com título, subtítulo e
ação; sem alça de mover nem olho de ocultar, porque o Início não é personalizável), `FitList`,
`ListSkeleton`, `BodyEmpty` e o `ErrorState` compacto.

### 15.2 Minhas anotações (fase 2)

Entradas: **Minhas anotações** (`NotebookPen`) no menu do avatar, nas duas áreas; o "Mais" do
celular; e o ⌘K ("Minhas anotações" e "Nova anotação"). As anotações são **por pessoa e por
espaço**: ninguém mais as vê, nem administradores, e as de outro espaço não aparecem.

- **`NotesSheet`** (`md`): título "Minhas anotações", descrição "Visíveis somente para você, neste
  espaço.", a ação `ghost sm` **+ Nova** e, com mais de 10 anotações, a busca ("Buscar anotação",
  no título e no texto, feita no navegador). A lista, da editada mais recentemente para a mais
  antiga, tem linhas de 56px com o título (`text-sm font-semibold`, truncado), a primeira linha do
  texto em `text-muted` e "editada há 2 dias" (`text-caption text-subtle`).
- Vazio: "Nenhuma anotação" e "Guarde lembretes e endereços de portais. Só você vê." Carregando:
  `SkeletonRows rows={4}`. Erro: `ErrorState`.
- O clique numa anotação abre o **`NoteSheet`** (`md`): título "Nova anotação" ou "Editar
  anotação", descrição "Visível somente para você.", campos **Título*** ("Ex.: Portal da
  prefeitura", até 200 caracteres) e **Anotação** (`Textarea` de 8 linhas, até 20.000). Rodapé:
  **Excluir** à esquerda (só na edição, com `ConfirmDialog` "Excluir a anotação “Portal da
  prefeitura”?"), depois **Cancelar** e **Salvar**. Toasts "Anotação salva." e "Anotação excluída."
- A tela não sugere guardar senhas: os acessos dos clientes têm lugar próprio, cifrado e com
  registro (§13.8).

### 15.3 Perfil: foto, sim; cor de destaque, não (fase 3)

**Foto: sim.** Numa equipe de 5 a 15 pessoas, a foto ajuda a reconhecer quem é quem nas pilhas de
avatares, em Por responsável e nos comentários, e o Effy tinha. Ela entra no `MemberAvatar` (§3.6) e
as iniciais continuam como reserva.

- Em Configurações › Perfil, no cartão "Perfil", ao lado do avatar de 56px: `outline sm` **Enviar
  foto** (ou **Trocar foto**, `Camera`) e, com foto, `ghost sm` **Remover foto**.
- Escolhida a imagem (PNG, JPG ou WebP até 5 MB), abre o `PhotoCropDialog` (`Modal max-w-md`):
  "Ajustar foto", área de recorte quadrada com a imagem arrastável, controle de zoom (`Input
  type="range"` com o rótulo "Zoom") e a prévia redonda de 96px; **Cancelar** e `primary` **Salvar
  foto**. O navegador redimensiona para 256×256 (WebP) antes de enviar. Toast "Foto atualizada."
- Erros: "Use PNG, JPG ou WebP." e "A imagem passa de 5 MB." Remover: sem confirmação, toast "Foto
  removida." com **Desfazer**.
- A foto é dado pessoal: aparece só para os membros dos espaços da pessoa, entra na exportação de
  dados (Privacidade) e sai com a conta.

**Cor de destaque: não.** No Effy, a cor de destaque trocava um azul decorativo usado em quase cem
lugares. No Efficio, a cor tem significado: o azul-marinho da marca é ação (botão primário, aba
ativa, foco), `--app-data` é a série dos gráficos, e verde, vermelho e âmbar são sinais (§0, item
10). Uma cor por pessoa mudaria o que o botão principal e os gráficos significam de uma tela para
outra, quebraria a garantia de contraste dos dois temas (o escuro é uma escala de cinzas, sem azul)
e faria cada captura de tela de suporte parecer outro produto. A preferência pessoal que faz
sentido já existe: o tema **Claro**, **Escuro** ou **Sistema**, no mesmo cartão "Aparência".

---

## 16. Acessibilidade

| Elemento | Semântica e teclado |
| --- | --- |
| Trilho de cada área | `nav` com `aria-label` da área ("Navegação da gestão de tarefas"), links com `aria-label` e `aria-current="page"`; Tab entre os itens; o "mais" é `button` com o número de itens no nome |
| Botão de troca de área | `Link` com `aria-label="Ir para o financeiro"` (ou "…para a gestão de tarefas"), fora da `nav` da área; nunca `aria-current` |
| Seção Área do "Mais" (celular) | lista de dois links; a área atual com `aria-current="true"` e o texto "(atual)" em `sr-only` |
| Acesso restrito | página com `h1` "Acesso restrito"; o foco vai para o `h1` ao abrir, como em qualquer navegação; os nomes dos administradores são texto, não links |
| Escopo, Situação, Visualização, Visão, Departamento do Início, Papel | `SegmentedControl` (`radiogroup`, setas ← →) ou `Select` |
| Células do resumo que filtram | `button` com `aria-pressed` e `aria-label` com o número: "Atrasadas: 7. Filtrar a lista." |
| Células do resumo do Início | `Link` com `aria-label` com o número e o destino: "Atrasadas no Fiscal: 7. Ver na lista de tarefas." |
| Responsável do cliente (célula editável) | `button` com `aria-label="Responsável pelo Fiscal de Padaria Pão Dourado: Ana Paula. Alterar."` que abre o `MemberPicker`; no colaborador, texto com o mesmo conteúdo |
| Seleção em lote (Clientes) | `Checkbox` com `aria-label="Selecionar Padaria Pão Dourado"`; a barra de seleção anuncia "3 clientes selecionados" em `aria-live="polite"` |
| Grupo da lista | `section aria-labelledby` com cabeçalho `h2` (visualmente 14px); recolher com `aria-expanded` e `aria-controls` |
| `TaskStatusButton` | `button` com `aria-pressed={concluída}` e `aria-label="{Estado}: {título}. Ativar para concluir."` (ou "…para reabrir."); desabilitado com o motivo no `aria-label` (como o `PaidToggle`) |
| Título da linha | `button` cujo nome é o título; abre o Sheet |
| Menu `⋯` | `aria-label="Ações de {título}"`; "Mudar situação ›" e "Mover para ›" são submenus com itens `menuitemradio` (`DropdownMenuSub*` e `DropdownMenuRadio*` no wrapper `components/ui/dropdown-menu.tsx`) |
| Quadro | cada coluna é `section aria-labelledby` ("A fazer, 12 tarefas, 3 atrasadas"); cartões em `ul`/`li`; a alça é `button` "Mover {título}" com o fluxo de teclado de §8.3; anúncios num `aria-live="polite"` compartilhado |
| Calendário (fase 2) | `table` com `th` dos dias da semana; cada dia é uma célula com o número como texto e o feriado escrito ("2, Finados"); os itens são `button` com o nome completo e o prazo no `aria-label` ("DCTFWeb, meta 15/10, 12 de 30 concluídos"); o "+" tem `aria-label="Novo compromisso em 30/10"`; a agenda abaixo de 1024px usa `section` por dia |
| Matriz (fase 2) | `role="grid"` com `aria-rowcount` e `aria-colcount`; cabeçalhos com `columnheader` e `rowheader`; foco itinerante (um `tabIndex=0`); **setas** movem uma célula, **Home** e **End** levam ao início ou fim da linha, **Ctrl+Home** à primeira célula; **Enter** ou **Espaço** avançam; **1**, **2** e **3** definem o estado direto; **Shift+Enter** abre a ocorrência; cada mudança anuncia "DCTFWeb, Padaria Pão Dourado: Em andamento." e, quando o mês do cliente fecha, "Outubro concluído para Padaria Pão Dourado." |
| Reabrir (fase 2) | o popover é `role="dialog"` com `aria-labelledby` no título; a coluna de mês concluído tem o texto "Concluído em 28/10" (o cadeado é `aria-hidden`); o foco vai para o primeiro botão e volta ao gatilho ao fechar; o motivo é um `Textarea` com rótulo visível "Motivo da reabertura", `aria-required` e erro em `role="alert"` |
| Acordeão | `button aria-expanded aria-controls`; a região aberta tem `role="region"` |
| Anexos (fase 2) | a área de soltar tem o botão **Anexar arquivo** como alternativa; o envio tem `role="progressbar"` com `aria-valuenow` e o nome do arquivo; erros em `role="alert"`; Baixar e Remover com o nome do arquivo no `aria-label` |
| Linha do tempo (fase 2) | `ol aria-label="Histórico da tarefa"`; cada `li` com a frase completa e `<time dateTime>`; "Ver todo o histórico (17)" é `button aria-expanded` |
| Acessos do cliente (fase 3) | **Mostrar** é `button` com o campo e o cliente no nome; o valor revelado fica num `output` com `aria-live="polite"` que anuncia "Código revelado. Some em 30 segundos."; Copiar e Ocultar com o nome do campo; o valor nunca vai para `title` nem para tooltip |
| Permissões (fase 3) | cada `Switch` com `aria-label` do rótulo e `aria-describedby` na descrição; "Ajustado" e o padrão do papel entram na descrição acessível ("Ajustado; padrão de Colaborador: desligado") |
| Editor do contrato (fase 3) | cada bloco é um `fieldset` com `legend` `sr-only` "Bloco 12, parágrafo"; Subir, Descer, Inserir e Remover com o número do bloco no nome; **Alt+↑** e **Alt+↓** anunciam "Bloco movido para a posição 11 de 86"; os avisos ficam em `role="status"` |
| Vencimentos (fase 3) | a faixa é uma `section aria-label="Vencimentos"`; cada trecho é `button` com o número e o destino ("2 documentos vencidos. Ver vencimentos.") |
| Sheets e Modais | Radix (foco preso, Esc fecha, o foco volta ao gatilho); o primeiro campo recebe o foco (`data-autofocus`); o `SavedStamp` fica em `aria-live="polite"` |
| Prazo e vencimento | o texto ("Venceu há 3 dias") carrega o sentido; a cor só reforça |
| Estados | glifos de forma diferente, não só cor; o cadeado do mês concluído tem texto ("Concluído"); tooltips repetem o nome |
| Gráficos | cada barra e linha tem `aria-label` com os números; o gráfico por mês tem uma tabela `sr-only`; `BreakdownList` e `PunctualityList` são listas de botões com o texto completo |
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
| Concluir etapa de processo (fase 2) | igual | "Tarefa concluída. Próxima etapa criada para Rafael: Contrato social (vence 04/11)." com **Ver etapa** (sem desfazer, ver §18) |
| Reabrir tarefa | o glifo volta ao estado anterior | "Tarefa reaberta." com **Desfazer** |
| Mover no quadro | o cartão cai na coluna e as contagens mudam | "Movida para Aguardando cliente." com **Desfazer** |
| Mudar situação pelo menu | o glifo muda | "Situação: Em andamento." com **Desfazer** |
| Campo do Sheet | `SavedStamp` com "Salvando…" e depois "Salvo"; na fase 2, o evento entra no topo da linha do tempo | nenhum |
| Subtarefa marcada | o `Checkbox` e a barra de progresso andam na hora | nenhum |
| Comentário | aparece na lista na hora | nenhum (erro: `toastError`) |
| Anexo (fase 2) | linha com barra de envio; ao terminar, a barra some em 150ms e a linha fica | erro na própria linha; remover: "Anexo removido." |
| Criar tarefa | o Sheet passa para edição | "Tarefa criada." |
| Excluir (`deleteTasks`) | confirmação antes | "Tarefa excluída." |
| Trocar o responsável de um cliente (célula ou ficha) | o avatar troca na hora; a célula fica com `aria-busy` e opacidade de 70% até salvar | "Fiscal de Padaria Pão Dourado: agora com Ana Paula." (fase 2: "… 5 tarefas em aberto passaram para ela.") com **Desfazer** |
| Responsável em lote | o diálogo fecha e as células mudam | "Responsável definido para 3 clientes." com **Desfazer** |
| Departamento de um membro | o `Select` muda na hora | "Bruno agora está no Fiscal." |
| Célula da matriz até Concluída (fase 2) | ✓ com as iniciais e "pop" | "DCTFWeb concluída para Padaria Pão Dourado." com **Desfazer** |
| Célula da matriz (outros passos) | o glifo muda | nenhum (seria barulho a cada clique) |
| Reabrir célula com motivo | o popover fecha, a célula volta ao estado escolhido e o cadeado do mês, se havia, some | "DCTFWeb reaberta para Padaria Pão Dourado." (sem desfazer) |
| Última célula do cliente concluída | o cadeado aparece na coluna de progresso com "pop" | "DCTFWeb concluída. Outubro concluído para Padaria Pão Dourado." com **Desfazer** |
| Atribuir uma ocorrência a alguém (só a competência) | o avatar da linha troca | "DCTFWeb de Padaria Pão Dourado em outubro: agora com Bruno." com **Desfazer** |
| Encerrar recorrente | a linha vai para Encerradas | "DCTFWeb encerrada a partir de novembro." com **Desfazer** |
| Aplicar modelo | o diálogo fecha | "Modelo aplicado. A primeira tarefa já foi criada." com **Ver tarefa** |
| Exportar CSV | download | "CSV exportado." |
| Salvar anotação | o Sheet fecha e a anotação sobe para o topo da lista | "Anotação salva." |
| Marcar convenção publicada pelo menu (fase 3) | a linha muda para o ciclo seguinte e sai do alerta | "Convenção 2026/2027 do SINDCOM marcada como publicada." com **Desfazer** |
| Salvar convenções no diálogo | o diálogo fecha | "Convenções coletivas atualizadas." com **Criar tarefa de reajuste** quando um ciclo foi publicado |
| Mostrar um acesso do cliente | o valor aparece no lugar dos pontos; depois de 30 s, volta aos pontos com um esmaecimento de 150ms | nenhum; Copiar mostra "Copiado." |
| Salvar dados do escritório, modelo de contrato ou permissões | o botão mostra `loading` | "Dados do escritório salvos.", "Modelo de contrato salvo." ou "Permissões de Bruno salvas. Valem a partir da próxima ação dele." |
| Voltar ao modelo de fábrica | os blocos trocam pelos de fábrica | "Modelo de fábrica restaurado." |
| Foto do perfil | o avatar troca em todos os lugares | "Foto atualizada." (remover: "Foto removida." com **Desfazer**) |
| Trocar de área | a página da outra área abre e o trilho troca os ícones, sem animação | nenhum |
| Sem permissão | — | o toast global de acesso (`app-shell.tsx`), com a mensagem do servidor (§2.6) |

**Outros detalhes:** o hover das linhas e cartões só troca o fundo ou a borda (sem elevação em
repouso); menus e popovers usam `shadow-lg`; nada tem animação de entrada ao carregar a página;
números que mudam usam `tabular` para não pular; skeletons sem gradiente (`animate-shimmer` de
opacidade, o que já existe).

---

## 18. Pendências para backend e produto

O backend da fase 2 está em andamento e o contrato em `packages/shared` (seção "Tasks") ainda pode
mudar de nome; por isso esta lista fala dos **dados que a tela precisa**, e os nomes de rota ou de
campo são sugestões. Conferido em 30/10/2026, o contrato em andamento já traz: ocorrência como
tarefa (com campos travados, origem do responsável e situação), 6 periodicidades, competência de
referência, prazo legal obrigatório, vigência (começa e encerra), exceções, distribuição dos
responsáveis, feriados nacionais com nome (inclusive Carnaval e Corpus Christi), "fora da meta" nos
resumos e na lista, obrigações no Início, calendário com aviso de corte, mês concluído por cliente,
reabertura com motivo no histórico, histórico da tarefa, anexos, exclusão de comentário, fila de
departamento na etapa de processo, relatórios por mês e de quem concluiu, CSV pela API, anotações,
busca de tarefas e recorrentes e a troca de responsável em lote com a contagem do que mudou.

**Acesso e papéis (fase 1, situação)**

1. **Financeiro só para administradores**: feito (guarda do financeiro, busca filtrada por papel,
   clientes sem honorários nem observações para o colaborador, regra do `from` no login).
2. **O colaborador escreve na Gestão**: feito na fase 1. Na fase 2, as mesmas regras para:
   recorrentes e modelos (administrador), células da auditoria (todos), reabrir ocorrência concluída
   (quem concluiu ou administrador), aplicar modelo e processo avulso (todos), anotações (só o
   dono), anexos e comentários (todos; remover os de outra pessoa, administrador).
3. **Rótulos dos papéis** no contrato (`MEMBER_ROLE_LABELS` e `MEMBER_ROLE_HINTS`): ainda "Editor" e
   "Leitor"; o web usa `features/auth/roles.ts`. Trocar no contrato e apagar a cópia do web.

**Fase 2: o que a tela ainda pede**

4. **Relatório: filtro "Concluídas com atraso"** (as concluídas depois do prazo legal ou do
   vencimento), para a célula "Com atraso" do resumo filtrar o detalhamento (§14.1).
5. **Histórico com os valores**: hoje um evento de alteração diz quais campos mudaram, sem o valor
   anterior e o novo; a linha do tempo mostra "alterou o vencimento e a prioridade". Desejável:
   guardar de e para nos campos de data, prioridade, cliente e categoria ("mudou o vencimento de
   25/10 para 30/10"). Não bloqueia.
6. **Exceções e encerramento x tarefas já geradas**: definir e devolver o que acontece com as
   ocorrências **abertas** já geradas de um cliente que entra nas exceções, ou de uma recorrente
   encerrada antes da competência atual (a tela diz "vale para as competências que ainda não foram
   geradas"; se a API cancelar as abertas, o texto muda para "as abertas desta competência são
   canceladas").
7. **Editar a recorrente x tarefas abertas**: confirmar que mudar meta, prazo, responsável padrão
   ou descrição atualiza as ocorrências ainda não concluídas da competência atual em diante (é o que
   a nota do rodapé do cadastro promete, §10.3).
8. **Reabrir etapa de processo** quando a seguinte já foi criada: definir a regra; até lá, o toast
   de etapa concluída não tem "Desfazer".
9. **Processos em andamento**: **confirmar com o usuário** a lista de processos (§12.1), porque o
   Effy a tirou em 01/08/2026 a pedido do escritório. A API já a oferece.
10. **Anexos no banco**: o contrato guarda os arquivos cifrados no banco (até 50 MB por tarefa).
    Funciona para o volume de um escritório; se crescer, avaliar armazenamento de objetos (o
    `docs/deploy-aws.md` já tem S3 cifrado). Decidir antivírus.

**Fase 3: o que a API precisa**

11. **Permissões por pessoa** (§13.10):
    - por membro, só as chaves ajustadas (booleanos de chaves conhecidas; o resto descartado);
    - as permissões efetivas calculadas a cada requisição (o papel já é relido) e entregues ao web
      junto com a sessão (`GET /auth/me`) e com as opções do módulo;
    - todas as guardas passam a usar as chaves: a do financeiro → `finance`; a de administrador do
      módulo → `registry`, `deleteRegistry` ou `deleteTasks`; convites e papéis → `members`; e as
      novas `reopenOthers`, `clientCredentials` e `office`;
    - o proprietário tem todas e não aceita ajuste; ninguém concede uma chave que não tem nem altera
      as próprias; cada mudança fica registrada (quem, quando, de, para);
    - leitura e gravação das permissões de um membro;
    - as chaves `page.*` só escondem; a API não as usa para dados.
12. **Sindicatos** (§13.7):
    - cadastro do sindicato (os campos de §13.7, CNPJ único no espaço, ativo), um ciclo de convenção
      por ano (publicada, quando e por quem, gravados pelo servidor) e o vínculo N:N com clientes;
    - o ciclo acompanhado e as faixas (vencida, até 30 dias, 31 a 60, sem data-base) calculados no
      servidor, no fuso do escritório, com o número de clientes ativos afetados (lição do Effy:
      duas implementações da regra divergem);
    - gravação dos ciclos num pedido próprio, substitutivo; no pedido do cadastro, ciclos ausentes
      significam "não mexer" (nunca "apagar");
    - leitura para todos os membros; escrita `registry`; exclusão `deleteRegistry`; inativo sai dos
      alertas; a consulta de CNPJ da Receita liberada para `registry` (hoje é do financeiro);
    - os alertas para o Início, o sino e o `DeadlinesSheet`; sindicatos na busca global.
13. **Dados fiscais e acessos do cliente** (§13.8):
    - inscrição estadual (com "isenta") e inscrição municipal; CPF do responsável, cifrado;
    - código de acesso do Simples e senha do contador cifrados por campo (com a chave do espaço, como
      a descrição das tarefas); **nunca** em listagens, busca, exportação, insights, notificações nem
      logs; o cliente diz só se cada um está cadastrado;
    - na gravação do cliente, cada acesso em três estados (manter, trocar, remover), para o formulário
      nunca precisar ler o valor;
    - revelar um acesso num pedido próprio (POST, sem cache), com `clientCredentials`, limite por
      minuto e registro de quem viu e quando;
    - inscrições legíveis por todos os membros na ficha da Gestão.
14. **Documentos do cliente** (§13.8): tipo (do catálogo ou "outro" com nome), vencimento opcional,
    observação até 200 caracteres e quem alterou; catálogo de tipos no contrato; lista substitutiva na
    gravação do cliente (ausente = não mexer); leitura para todos os membros (não é dado
    financeiro), escrita só `finance`; os alertas por faixa dos clientes ativos para o Início, o
    sino, o resumo de Clientes e o `DeadlinesSheet`; filtro de documentos vencidos e a vencer na
    lista de clientes da Gestão.
15. **Escritório** (§13.9): um registro por espaço com os dados de §13.9 (CPF do responsável
    cifrado; chave Pix com tipo validado; logo PNG, JPG ou WebP até 500 KB, nunca SVG); leitura e
    gravação com `office`; nome e logo legíveis por todos os membros (cabeçalho dos PDFs); o modelo de
    contrato (blocos, marca d'água, ligada ou não), com "voltar ao de fábrica" gravando na hora e o
    modelo de fábrica versionado no contrato; limites de 500 blocos, 20.000 caracteres por bloco e
    400.000 no total; quem editou e quando.
16. **Contrato do cliente**: com `finance`, os dados para gerar o contrato de um cliente (cliente,
    vigência que cobre hoje, escritório e modelo) e a lista do que falta; a cláusula de desconto só
    com desconto na vigência. Opcional: registrar a emissão (quem, quando, versão do modelo).
17. **Foto do perfil** (§15.3): imagem de 256×256 (WebP, até 100 KB), guardada como os anexos ou com
    o usuário; o endereço da foto nos membros (listas, comentários, responsáveis); remover; entra na
    exportação LGPD e sai com a conta.
18. **Sino**: as contagens de documentos e convenções vencidos (pelos alertas dos itens 12 e 14).
19. **Confirmar com o usuário**: (a) se colaboradores do Fiscal devem poder atualizar o vencimento
    de um certificado sem acesso ao financeiro (hoje não: só `finance` edita documentos); (b) se a
    permissão `clientCredentials` deve nascer ligada para algum colaborador (o padrão é só
    administradores, como "cadastro de cliente é dos administradores"); (c) se vale um filtro
    "Cadastro fiscal incompleto" em Clientes do financeiro (o `w-completude` do Effy); (d) se o
    escritório concorda com Carnaval e Corpus Christi como dias não úteis nos prazos (o backend já os
    inclui, porque não há expediente bancário).

---

## 19. Checklist de implementação

**Fase 1 (feita)**

- [x] Contrato em `packages/shared`: tipos e rótulos de tarefas, departamentos, categorias,
      responsáveis por cliente e início.
- [x] Permissões: `usePermissions` (`isAdmin`, `canAccessFinance`, `canWriteTasks`, `canManage`),
      `WriteGate scope`, os textos de §2.6 e o toast de 403.
- [x] Casca em duas áreas: `nav.ts`, `sidebar.tsx`, `mobile-nav.tsx`, `quick-bar.tsx`,
      `command-palette.tsx`, `notifications.tsx`, `FinanceGate` e Acesso restrito.
- [x] Páginas Início, Tarefas (lista e quadro), Clientes (com ficha e lote) e Cadastros
      (Departamentos, Categorias, Equipe); `TaskSheet` com subtarefas e comentários.
- [ ] Rótulos dos papéis no contrato (§18, item 3).

**Fase 2**

- [ ] Contrato: conferir com o backend os itens 4 a 10 de §18; rótulos curtos da regra de dia não
      útil para o `SegmentedControl` (Antecipar, Postergar, Manter); feriados com nome para a prévia
      e o calendário.
- [ ] `nav.ts`: os 4 itens novos na ordem de §2.2 e as `keywords`; `app/router.tsx` com as 4 rotas
      `/tarefas/*` em `lazy`.
- [ ] Início: "Fora da meta", Em aberto com "aguardando cliente", Obrigações de outubro e a grade
      7 + 5 / 6 + 6 (§6.2 a §6.5); passo "Tarefas recorrentes" nos primeiros passos.
- [ ] Tarefas: grupo "Fora da meta", linha agrupada de recorrente (§5.6), cartão de recorrente no
      quadro, Calendário e agenda com feriados (§7.6), filtro Tipo, "Aplicar modelo de processo".
- [ ] `TaskSheet`: `FlowStepper`, anexos (§9.1, item 5), exclusão de comentário (item 6), linha do
      tempo (item 7) e a ocorrência com campos travados e reabertura com motivo.
- [ ] Recorrentes (§10), Auditoria com mês concluído e reabertura com motivo (§11), Processos (§12),
      Relatórios de pontualidade (§14), Minhas anotações (§15.2); "Processo" na barra flutuante e
      "Aplicar modelo de processo" no "+" do celular.
- [ ] `components/ui/dropdown-menu.tsx`: submenus e grupo de rádio (se ainda faltarem).

**Fase 3**

- [ ] Contrato: os itens 11 a 18 de §18; as chaves de permissão e os padrões por papel em
      `packages/shared`; catálogo de tipos de documento; modelo de contrato de fábrica.
- [ ] Permissões por pessoa: `usePermissions().can`, `WriteGate permission`, `MemberAccessSheet` em
      Configurações › Membros e Cadastros › Equipe, páginas ocultas no trilho, no "Mais" e no ⌘K, e
      o `RestrictedAccess` das páginas ocultas (§13.10 e §2.7).
- [ ] Sindicatos: a aba em Cadastros, `UnionSummary`, `UnionSheet`, `ConventionCyclesDialog` (§13.7).
- [ ] Cliente: seções Inscrições e acessos e Documentos no `ClientSheet` e no "Consultar" do
      financeiro; Documentos, Inscrições e acessos (`CredentialField`) e Sindicatos na ficha da
      Gestão; célula Documentos no resumo de Clientes (§13.1 e §13.8).
- [ ] Vencimentos: `DeadlineAlertStrip`, `DeadlinesSheet`, grupo do sino e item do "Mais" (§6.10 e
      §2.8).
- [ ] Escritório: aba em Configurações, editor do modelo em `/configuracoes/contrato`, Gerar contrato
      e `/clientes/:id/contrato` (§13.9); passo "Dados do escritório" nos primeiros passos.
- [ ] Perfil: foto com recorte e `MemberAvatar` com foto (§15.3).

**Em toda fase**

- [ ] Estados de cada bloco: carregando, vazio, erro, leitura (assinatura) e sem permissão; hover,
      foco e desabilitado de cada controle; e as duas vistas de cada tela, colaborador e
      administrador.
- [ ] Verificação: `node ~/.claude/skills/design-taste-frontend/scripts/lint.mjs --app
      apps/web/src/features/tasks` (0 FAIL) e `inspect.mjs --app` nas páginas da fase, em 1440, 768
      e 375, como administrador e como colaborador, além de `/contas-a-pagar` como colaborador
      (Acesso restrito); nenhuma rolagem horizontal da página a 375px.
- [ ] `pnpm typecheck && pnpm test`.
- [ ] Depois de implementado, levar `TaskRow`, `TaskStatusButton`, `MatrixStatusCell`,
      `MemberAvatar`, `SearchSelect`, `AreaSwitchButton`, `CredentialField` e `PermissionSwitchRow`
      para a tabela de componentes de `docs/design-system.md`.
