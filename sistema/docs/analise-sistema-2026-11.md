# Análise do Efficio e o que implantar primeiro (13/11/2026)

Feita com cinco agentes em paralelo, todos só lendo o repositório: domínio contábil (agente novo
`especialista-escritorio-contabil`), backend, frontend, design/UX e infraestrutura/segurança.
Os achados mais sérios foram conferidos no código e na API do GitHub antes de entrar aqui.

Esforço: **P** ≤ ½ dia · **M** 1–2 dias · **G** 3–5 dias · **GG** > 1 semana.
Impacto: **A** alto · **M** médio · **B** baixo.

---

## 1. Resposta curta

1. **Antes de qualquer ideia nova, colocar o sistema em produção com segurança (Onda 0).**
   - O Efficio já cobre muita coisa, mas só roda no demo do navegador.
   - Pix, envio de documentos e portal precisam de dados reais (contatos, chave Pix, guias anexadas) para
     render.
   - O código ainda tem bloqueios de produção (§2.1) que impedem subir com dados de clientes.
2. **Das três ideias, a ordem é a mesma nos cinco relatórios: 3 → 1 → 2.**
   - **Pix dos honorários** primeiro: menor esforço, dinheiro direto, sem integração externa.
   - **Envio de documentos** em seguida, começando por e-mail e WhatsApp com comprovante de entrega.
     OneDrive fica para depois.
   - **Painel do cliente** por último: é o maior e o mais arriscado, porque é a primeira vez que gente de
     fora entra no sistema. Reaproveita o que as outras duas constroem.
3. **Duas lacunas valem tanto quanto as ideias:**
   - reajuste anual dos honorários em lote, como o próprio contrato manda;
   - controle das caixas postais e-CAC e DTE-SN dos clientes.

---

## 2. Achados principais

### 2.1 Bloqueios de produção (conferidos)

| Achado | Onde | Por que importa |
| --- | --- | --- |
| **O repositório no GitHub é público** | API do GitHub: `visibility: public` | Código, modelos de contrato e o e-mail do proprietário ficam à vista de qualquer pessoa. |
| **O CI nunca rodou** | O workflow está em `sistema/.github/`, mas o GitHub só lê `.github` na raiz do repositório | Testes, `pnpm audit` e a varredura de segredos nunca rodaram no GitHub. O branch padrão é um `claude/…` e não existe `main`. |
| **Cadastro aberto na API** | `apps/api/src/modules/auth/routes.ts:72` | Qualquer pessoa cria um espaço com acesso total e até 2 GB de anexos no banco do escritório. |
| **Produção exige Mercado Pago** mesmo com a cobrança desligada | `apps/api/src/env.ts:88` | Impede subir sem credenciais de um serviço que não é usado. |
| **2FA opcional**, inclusive para quem revela as senhas dos clientes | `apps/api/src/modules/auth/routes.ts:88` | Roubo de uma senha da equipe expõe os acessos dos clientes. |
| **Nada roda sozinho** | `apps/api/tsup.config.ts:4` | As obrigações recorrentes só são geradas quando alguém abre a tela. A limpeza de dados vencidos só roda no deploy. Lembretes e reenvios exigem fila e agendamento. |
| **Sem trilha financeira** | `apps/api/src/lib/audit.ts` | Não fica registrado quem deu baixa, excluiu ou isentou juros. |
| **Anexos dentro do banco**, com teto de 2 GB por espaço | `packages/shared/src/constants.ts:722` | Com o volume normal de guias, o teto chega em meses ou em poucos anos (depende do volume). A exportação LGPD não leva o conteúdo dos anexos. |
| **Backup nunca restaurado em teste** | `docs/deploy-aws.md` §12 | Os campos cifrados dependem da chave KMS. Sem um teste de restauração, ninguém sabe se o backup abre. |
| **`deploy-aws.md` ainda é do SaaS Effinance** | §8, §12 e OIDC do documento | O WAF bloquearia anexos, logo e foto. O App Runner não existe em São Paulo. O OIDC e os domínios apontam para o projeto antigo. |

### 2.2 Dinheiro e contrato

- **Juros e multa caem na mesma categoria do honorário** (`apps/api/src/modules/transactions/service.ts:563`).
  - No Simples, juros e multa não compõem a receita bruta (Res. CGSN 140/2018, art. 2º, §5º, II).
  - Precisam de categoria própria e não devem entrar na NFS-e.
- **O reajuste anual é digitado cliente a cliente** (`apps/web/src/features/clients/fees-dialog.tsx:67`).
  - O contrato manda aplicar o maior índice entre IGP-M, IPCA, INPC e CCT, com aviso de 30 dias e memória de
    cálculo (`packages/shared/src/contract-template.ts:51-54`).
  - O sistema avisa com 60 dias de antecedência, mas não calcula o novo valor nem gera a carta.
- **Os honorários gerados saem fixos como boleto** (`apps/api/src/modules/fee-charges/service.ts:163`).
- **A chave Pix já está no cadastro do escritório, cifrada** (`packages/shared/src/schemas.ts:1589`).
  - Trocar a chave grava só um registro genérico de alteração, e o editor também consegue trocá-la.
  - Precisa ficar restrita ao proprietário, com auditoria do campo e aviso por e-mail.

### 2.3 Uso (UX)

- **O cliente está dividido entre a Gestão e o Financeiro.**
  - Na Gestão a ficha é só leitura, e o botão diz "Editar no financeiro".
  - Documentos e certidões exigem a permissão financeira.
  - Não existe uma página do cliente.
- **A navegação depende de ícones sem nome.**
  - O hub de Tarefas tem 11 ícones identificados só pelo tooltip, que não abre no celular.
  - Auditoria, Recorrentes e Processos não estão no menu "Mais" do celular.
- **As cores de status ainda variam entre os módulos.**
  - "Concluída" é verde num lugar e azul em outro.
  - As faixas de atraso do painel são bege e marrom.
  - Há dois vermelhos diferentes.
- **Algumas telas se contradizem.**
  - "Para você · Tudo em dia" aparece mesmo com tarefa atrasada.
  - Aparece "+ 1 tarefas".
  - Todo vencimento em até 5 dias fica em âmbar, o que tira a força do alerta.
- **A landing e o login prometem um portal que ainda não existe.**
  - São 8 links de "Portal do cliente", e todos levam ao login da equipe.
  - O FAQ promete um convite que hoje não existe.

### 2.4 Código e desempenho

- **Saúde geral boa.** São 126 arquivos de teste, nenhum TODO, `pnpm audit` com 0 vulnerabilidades em 506
  pacotes, typecheck limpo e os estados de carregando, vazio e erro bem cobertos.
- **A biblioteca de gráficos carrega em toda página**, inclusive no login e no site
  (`apps/web/vite.config.ts:95`).
  - Separar o React desse pacote reduz a carga inicial em cerca de 25% (465 → 349 kB gzip). O ganho foi
    medido num build de teste e ainda não foi conferido no navegador.
- **Não há nenhum teste de interação no frontend.** A baixa com juros, a auditoria e as recorrentes não têm
  teste de clique.
- **Arquivos grandes:** 19 passam de 500 linhas (`task-sheet.tsx` tem 1.308).
- **Paginação copiada em 9 telas.** Faltam componentes genéricos de upload e de etapas, que o portal vai precisar.

### 2.5 LGPD operacional

- **O próprio contrato do escritório vai além do que o sistema e a operação cumprem hoje**
  (`contract-template.ts:62,94-101`).
  - Ele proíbe suboperadores sem autorização escrita. AWS, Microsoft e Meta seriam suboperadores.
  - Promete aviso de incidente em 24 h.
- **A política de privacidade ainda é o modelo do SaaS:** `[RAZÃO SOCIAL]`, encarregado em branco e prazo
  de backup diferente do configurado.
- **Inativar um cliente mantém as senhas e o código do Simples para sempre.**
- **Quando alguém revela uma senha de cliente, o acesso é auditado, mas ninguém é avisado.**

---

## 3. As três ideias

| Ideia | Valor | Esforço | Risco | Precisa antes |
| --- | --- | --- | --- | --- |
| **3a. Pix estático** (QR e "copia e cola" no recebível e na mensagem de cobrança) | A: dinheiro direto, o cliente paga em segundos | M | baixo: a conferência com o extrato continua manual | chave Pix restrita ao proprietário |
| **3b. Juros e multa na próxima mensalidade** (cobrar na próxima / já recebido / isentar) | A: cumpre o contrato sem cobrança manual | G | médio: mexe na baixa e nos relatórios de inadimplência e evolução | trilha financeira; categoria própria |
| **1a. Enviar documento** (e-mail e WhatsApp com link do Efficio que expira e registro de download) | A: padrão de mercado, prova de que a guia foi entregue | G | baixo; holerite exige cuidado de LGPD | e-mail com HTML e anexo, contatos do cliente por assunto, fila |
| **1b. OneDrive/SharePoint** nas pastas `EMPRESA/DEPARTAMENTO/ANO/MÊS` | M: organização interna; tira os arquivos do banco | G | alto: permissões do M365, Microsoft como suboperador | fila; Microsoft 365 empresarial |
| **2. Painel do cliente** | A para o cliente | GG (4–6 semanas) | alto: um cliente ver dados de outro | 1a, ficha única do cliente, papel "Cliente" separado, anexos fora do banco, pentest |
| **3c. Pix com vencimento (cobv) ou Pix Automático**, com baixa automática | M | GG | médio | contrato e API do Bradesco |

**Como cada ideia deve ser feita:**
- **Pix:**
  - O BR Code é uma função pura no `shared` (também roda no demo).
  - O valor do QR soma honorário, empregados e juros adiados e desconta o desconto até o vencimento.
  - Adiar os juros é justamente o que deixa o QR estático coerente: o valor não muda depois do vencimento.
  - Juros e multa vão para a categoria "Juros e multas recebidos", com registro de quem isentou.
- **Envio:**
  - Começar pelo link próprio do Efficio, com validade e registro de download, enviado por e-mail e `wa.me`.
  - Nunca usar link "qualquer pessoa com o link".
  - O OneDrive entra depois, como armazenamento.
- **Portal:**
  - Acesso separado da equipe: tabela própria, token próprio e isolamento por cliente no banco.
  - A primeira versão tem só Início, Documentos (os marcados como visíveis) e Solicitações (genérica,
    admissão, férias e rescisão), com conversa.
  - Ficam de fora do protótipo:
    - assinatura eletrônica, que exige um provedor;
    - a seção Empregados com CBO, que duplica o sistema de folha;
    - os números do topo;
    - a árvore de pastas;
    - o status "paga" das guias.
  - Falta desenhar o lado do escritório:
    - marcar um anexo como visível ao cliente;
    - "Pedir ao cliente";
    - resposta ao cliente separada de nota interna;
    - triagem das solicitações.

---

## 4. Lacunas que valem entrar no roteiro

| Item | Ganha | Impacto | Esforço | Observação |
| --- | --- | --- | --- | --- |
| **Reajuste anual em lote** (índices do Banco Central + CCT, carta com memória de cálculo, nova vigência) | escritório | A | G | O contrato já obriga. |
| **Importar clientes por planilha** | escritório | A | M | Necessário para entrar em produção. |
| **Ficha única do cliente** (`/clientes/:id`) | escritório | A | G | Pré-requisito do envio e do portal. |
| **Caixas postais e-CAC (Integra Contador/Serpro) e DTE-SN** | escritório e cliente | A | GG | Em 2026 a Receita mandou Termo de Exclusão do Simples a cerca de 698 mil ME/EPP. A ciência é automática no 45º dia. O custo do Integra Contador não foi verificado. |
| **NFS-e dos honorários** pela API do Emissor Nacional | escritório | A | GG | Para ME/EPP do Simples, o Emissor Nacional é obrigatório desde 01/11/2026 (Res. CGSN 191/2026, segundo as fontes consultadas). Depende do regime e do município do escritório. |
| **Procuração eletrônica do e-CAC** com vencimento e aviso ao cliente | escritório | M | P | Vale até 5 anos. |
| **Proposta comercial e checklist de entrada do cliente** | escritório | M | M | A landing já tem o botão "Pedir proposta". |
| **Feriados estaduais e municipais nos prazos** | escritório | M | M | Hoje o sistema só considera os nacionais. |

---

## 5. Roteiro recomendado

### Onda 0 — Entrar em produção (2 a 3 semanas; parte depende de conta AWS e domínio)

| Item | Esforço |
| --- | --- |
| Repositório privado, `.github` na raiz, `main` protegida, Dependabot, atualização das dependências | P |
| Cadastro só por convite; 2FA obrigatório para proprietário e editores | M |
| `env.ts` sem Mercado Pago quando a cobrança está desligada; verificação de saúde que testa o banco | P |
| Fila e agendador: geração mensal das obrigações, limpeza diária e, depois, lembretes e reenvios | M |
| Trilha financeira: quem deu baixa, excluiu ou isentou | G |
| Importação de clientes por planilha | M |
| Landing e login sem prometer o portal ("Acesso da equipe") | P |
| AWS enxuta, de R$ 0,8 a 1,3 mil por mês, com o `deploy-aws.md` corrigido, SES (DKIM/SPF/DMARC), backup com teste de restauração e guarda da chave, monitoramento e Budgets | G |
| Em paralelo, com advogado: política de privacidade e termos do escritório, encarregado, autorização dos suboperadores, plano de incidente, apagar as senhas ao inativar um cliente | M |
| **Piloto com 5 a 10 clientes reais por um mês** | — |

### Onda 1 — Dinheiro e rotina (cerca de 2 semanas)

- Pix estático no recebível, com PDF e "copia e cola" na mensagem de cobrança (M).
- Juros e multa na próxima mensalidade, em categoria própria (G).
- Pix como forma de pagamento padrão dos honorários (P).
- Reajuste anual em lote (G).
- Q5: vencimentos agrupados por cliente no painel (M).
- Paleta de status única, nomes no hub, contradições das telas e desempenho (P–M cada).

### Onda 2 — Documentos com comprovante (2 a 3 semanas)

- E-mail com HTML e anexo, e contatos do cliente por assunto (M).
- Botão "Enviar" no anexo e na obrigação, por e-mail e WhatsApp, com histórico de entregas (G).
- Ficha única do cliente (G).
- Anexos fora do banco, em armazenamento cifrado (G).
- Testes de interação no frontend (M).

### Onda 3 — Integrações (escolher conforme as respostas da §7)

- OneDrive/SharePoint (G).
- NFS-e dos honorários (GG).
- Caixas postais e-CAC e DTE-SN (GG).
- WhatsApp oficial ou Pix com vencimento/Pix Automático (G/GG).

### Onda 4 — Painel do cliente, primeira versão (4 a 6 semanas)

- Acesso separado para o cliente.
- Início, Documentos e Solicitações.
- O lado do escritório (visível ao cliente, pedir ao cliente, resposta × nota interna, triagem).
- RIPD e pentest antes de abrir para os clientes.

---

## 6. Ganhos rápidos (até ½ dia cada)

1. Tornar o repositório privado (feito pelo dono no GitHub) e mover o `.github` para a raiz, para o CI rodar.
2. Desligar `/auth/register` em produção por variável de ambiente.
3. Dispensar o Mercado Pago com a cobrança desligada; `/api/health/ready` com `select 1`.
4. Trocar "Portal do cliente" por "Acesso da equipe" no site e no login até o portal existir.
5. Colocar o Pix "copia e cola" na mensagem de cobrança por WhatsApp que já existe.
6. Corrigir a DCTFWeb no catálogo: a entrega vai até o último dia útil do mês seguinte (IN RFB 2.248/2025).
   O dia 15 pode ficar como meta interna.
7. Criar o tipo de documento "Procuração eletrônica e-CAC", com vencimento.
8. Separar o React do pacote de gráficos (cerca de −25% de carga inicial) e fazer o CI falhar se ele voltar ao início.
9. Recarregar só o necessário depois de mudar uma tarefa (`invalidateTasks` seletivo).
10. Mostrar os nomes no hub de Tarefas e colocar Auditoria, Recorrentes e Processos no "Mais" do celular.
11. Corrigir o "Tudo em dia" com atrasadas e o plural "+ N"; âmbar só para o que vence hoje ou amanhã.
12. Aplicar a paleta nova às faixas de atraso do painel e ao "Com atraso" das tarefas, deixar um só vermelho e
    documentar a tabela de status no `design-system.md`.
13. Acessibilidade: foco do seletor segmentado, `role` errado na troca de espaço, contraste do selo "Cancelada".
14. Documentação:
    - no roteiro, a API do WhatsApp cobra por mensagem desde 07/2025;
    - no protótipo, o limite real é de 10 MB por arquivo;
    - corrigir o `deploy-aws.md`.

---

## 7. Decisões que só o dono pode tomar

1. **Produção:** subimos agora? Quem cria a conta AWS e o domínio? O orçamento de R$ 0,8 a 1,3 mil por mês serve?
2. **Repositório:** pode ficar privado?
3. **Juros e multa:** cobrar sempre ou só acima de X dias? Incluir a correção pelo IPCA-E que o contrato prevê?
   Qual o valor mínimo?
4. **Reajuste:** maior índice para todos ou caso a caso? Quem aprova?
5. **NFS-e:** qual o regime do escritório e o município? Já emite pelo Emissor Nacional?
6. **Microsoft 365:** o escritório tem a versão empresarial? Quem administra?
7. **Portal e sistemas:** o escritório já paga algum portal (Onvio ou outro)? Quais sistemas de folha e contábil usa?
8. **WhatsApp:** holerite e rescisão podem ir por WhatsApp, com link que expira?
9. **e-CAC:** aceita contratar o Integra Contador (Serpro) e pedir procuração aos clientes?
10. **Bradesco:** quanto custa o Pix recebido em comparação com o boleto? O Pix Automático interessa?

---

## 8. Observações

- Fatos de legislação e preços vieram de busca na internet, com fontes citadas pelo agente de domínio:
  - CGSN 191/2026 e o Ato Conjunto RFB/CGIBS 4/2026, cujas datas divergem entre as fontes;
  - IN RFB 2.248/2025;
  - preços da Meta;
  - Pix Automático.

  Vale confirmar com o responsável técnico antes de implementar.
- Custos da AWS: preços públicos de sa-east-1, com câmbio suposto de R$ 5,50.
- Nenhum agente alterou o repositório. As saídas brutas da varredura de dependências ficaram no scratchpad
  da sessão.
