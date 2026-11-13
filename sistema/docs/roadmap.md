# Roteiro — funções para implantar no futuro

Pedidos já combinados que ainda não entraram no sistema. Cada item lista o que foi pedido, a solução
proposta e as decisões que faltam antes de começar.

---

## 1. Anexos no OneDrive + envio por e-mail e WhatsApp

**Pedido (13/11/2026):** ao anexar um documento numa tarefa, salvar no OneDrive na pasta do cliente,
no padrão `NOME EMPRESA/DEPARTAMENTO/ANO/MÊS`, e ter a opção de enviar o documento por e-mail e por WhatsApp.

**Hoje:** os anexos ficam no banco, criptografados com a chave do espaço (AES-256-GCM), com limite de
10 MB por arquivo, 50 MB e 50 arquivos por tarefa e 2 GB por espaço (`apps/api/src/modules/tasks/attachments.ts`).

**Proposta**
- **OneDrive (Microsoft Graph):** aplicativo registrado no Microsoft Entra ID do escritório. O upload vai
  para `Clientes/{EMPRESA}/{DEPARTAMENTO}/{ANO}/{MM - Mês}/{arquivo}` (envio por sessão para arquivos
  grandes; pastas que faltam são criadas pelo próprio caminho; nomes saneados dos caracteres proibidos;
  conflito de nome = renomear). A tarefa guarda o id e o link do item, não o conteúdo.
- **Segurança:** segredo/certificado do aplicativo só no servidor (variável de ambiente), nunca no
  navegador; permissão mínima (`Sites.Selected` ou a biblioteca/pasta de clientes); cada envio entra no
  histórico da tarefa; links de compartilhamento para pessoas específicas ou com validade.
- **E-mail:** botão "Enviar por e-mail" pela caixa do escritório (Graph `sendMail`, permissão `Mail.Send`),
  com o arquivo anexado ou o link, para os contatos do cliente no cadastro. Alternativa: o `MAILER` atual.
- **WhatsApp, em dois níveis:**
  1. Simples: abre o WhatsApp com a mensagem e o link já escritos (`wa.me`); a pessoa confirma o envio.
     Sem custo e sem aprovação. Não anexa o arquivo, só o link.
  2. Oficial (WhatsApp Business Platform da Meta): envia o arquivo automaticamente. Exige verificação
     da empresa, número dedicado, modelos de mensagem aprovados e tem custo por conversa. Não usar APIs
     não oficiais (risco de bloqueio do número).
- **Demo no navegador:** a gravação no OneDrive é simulada (PGlite não fala com a Microsoft).

**Decisões pendentes**
1. OneDrive empresarial (Microsoft 365 / SharePoint) ou pessoal? (recomendado: empresarial)
2. Quem registra o aplicativo no Microsoft 365 (precisa de administrador)?
3. ANO/MÊS da pasta pela competência da tarefa ou pelo vencimento?
4. DEPARTAMENTO = departamentos já cadastrados no sistema?
5. WhatsApp: nível 1 primeiro ou já o nível 2?
6. Arquivo só no OneDrive ou também uma cópia no sistema?

**Antes de implementar:** protótipo das telas (anexar, escolher envio, histórico) para aprovação.

---

## 2. Painel do cliente (portal)

**Pedido (13/11/2026):** um painel para o cliente com os documentos enviados pelo escritório (os mesmos
do item 1), as solicitações abertas e botões para: registro de empregado (admissão), solicitação de
férias, rescisão, envio de extratos bancários, envio de documentos diversos e abertura de solicitação de
tarefa (escolher o departamento, descrever a tarefa etc.).

**Protótipo:** imagens em `docs/prototipos/portal-cliente/` (início, documentos, nova solicitação,
admissão, solicitações e celular).

**Proposta**
- **Quem acessa:** um papel novo "Cliente", ligado a uma empresa cliente do espaço; vê só os dados da
  própria empresa (RLS por `workspace_id` + `client_id`), com convite por e-mail, senha e duas etapas.
- **Início:** o que depende do cliente (pendências), guias e prazos do mês, documentos recentes,
  solicitações abertas e ações rápidas.
- **Documentos:** tudo o que o escritório anexou nas tarefas da empresa e marcou como "visível para o
  cliente", por mês e departamento (vindo do OneDrive quando o item 1 existir); download registrado.
- **Solicitações:** cada pedido do cliente vira uma tarefa no módulo Tarefas, no departamento escolhido,
  com a descrição, o prazo desejado e os anexos; o cliente acompanha a situação e conversa pela própria
  solicitação (comentários da tarefa marcados como visíveis).
- **Formulários prontos:** admissão (dados do empregado, cargo, salário, data de início e checklist de
  documentos), férias (empregado, período, abono, adiantamento do 13º), rescisão (empregado, tipo,
  data, aviso prévio), extratos bancários (conta e mês) e documentos diversos (assunto e arquivos).
  Cada um gera a tarefa no departamento certo (Pessoal, Fiscal, Contábil) com o checklist do processo.
- **Segurança e LGPD:** dados pessoais de empregados criptografados como os demais campos sensíveis;
  limites de tamanho e tipo de arquivo; registro de quem enviou e quando; nada do escritório (outros
  clientes, financeiro, honorários de terceiros) aparece no painel.

**Decisões pendentes**
1. O cliente pode ver todos os documentos da empresa ou só os marcados como visíveis? (recomendado: só os marcados)
2. Quantos usuários por empresa cliente e se cada um vê tudo ou só alguns tipos (ex.: só o sócio vê folha).
3. Prazos mínimos por tipo de pedido (ex.: rescisão com X dias úteis) e avisos automáticos.
4. Notificações ao cliente: e-mail, WhatsApp (item 1) ou ambos.
