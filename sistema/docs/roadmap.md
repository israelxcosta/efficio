# Roteiro — funções para implantar no futuro

Pedidos já combinados que ainda não entraram no sistema. Cada item lista o que foi pedido, a solução
proposta e as decisões que faltam antes de começar.

Ordem recomendada e análise completa (13/11/2026): [analise-sistema-2026-11.md](analise-sistema-2026-11.md).

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
     da empresa, número dedicado, modelos de mensagem aprovados e tem custo por mensagem (cobrança
     por mensagem desde 07/2025). Não usar APIs
     não oficiais (risco de bloqueio do número).
- **Demo no navegador:** a gravação no OneDrive é simulada (PGlite não fala com a Microsoft).

**Respostas do dono (13/11/2026)**
- Microsoft 365 na **versão pessoal**, administrada por israel@efficio.com.br. Isso muda o desenho:
  conta pessoal não tem SharePoint nem permissão de aplicativo (`Sites.Selected`). A integração terá de
  ser por **login delegado** da conta Microsoft (OAuth com `Files.ReadWrite` + `offline_access`, token de
  renovação cifrado no banco), gravando no OneDrive pessoal do escritório.
- Documentos (inclusive holerite e rescisão) vão **por e-mail e WhatsApp com link que expira em 30 dias**.
- Ordem combinada (ver `analise-sistema-2026-11.md`): primeiro o envio com link próprio do Efficio e
  registro de download; o OneDrive vem depois.

**Decisões pendentes**
1. ANO/MÊS da pasta: pela competência da tarefa ou pelo vencimento? (tarefas avulsas não têm competência)
2. DEPARTAMENTO = departamentos já cadastrados no sistema?
3. Arquivo só no OneDrive ou também uma cópia no sistema?

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

**Respostas do dono (13/11/2026):** o escritório não usa nenhum portal hoje; o único sistema externo é o
contábil **IOB**. O portal fica para depois do envio de documentos (item 1).

**Decisões pendentes**
1. O cliente pode ver todos os documentos da empresa ou só os marcados como visíveis? (recomendado: só os marcados)
2. Quantos usuários por empresa cliente e se cada um vê tudo ou só alguns tipos (ex.: só o sócio vê folha).
3. Prazos mínimos por tipo de pedido (ex.: rescisão com X dias úteis) e avisos automáticos.
4. Notificações ao cliente: e-mail, WhatsApp (item 1) ou ambos.

---

## 3. Cobrança dos honorários por boleto/Pix

**Pedido (13/11/2026):** gerar a cobrança (boleto ou Pix) pelo sistema com o valor dos honorários, usando a
chave aleatória da conta Bradesco. **Decisão do dono: fica para o futuro** (o Bradesco não cobra pelo Pix
recebido).

**Já decidido para quando entrar**
- Juros (1% a.m. pro rata) e multa (2%) contam **desde o primeiro dia após o vencimento**, sem carência.
- Juros e multa ficam em **categoria própria** ("Receitas financeiras › Juros e multas recebidos"; nas contas a
  pagar, "Despesas financeiras › Juros e multas"), fora da receita de honorários — implantado em 14/11/2026 (migração 0021 reclassificou os lançamentos antigos).
- Proposta guardada: QR Code estático (BR Code) gerado pelo sistema; na baixa com atraso, opção de cobrar os
  juros e a multa na próxima mensalidade ("Juros e multa por atraso – competência MM/AAAA"), receber junto ou
  isentar (com registro de quem isentou). Depois: Pix com vencimento (cobv) ou Pix Automático com baixa automática.

---

## 4. Outras funções adiadas pelo dono (13/11/2026)

- **NFS-e dos honorários** pelo sistema: não por enquanto.
- **Caixas postais e-CAC/DTE-SN (Integra Contador/Serpro)** e procurações: não por enquanto.

---

## 5. Hospedagem (quando for subir)

- O dono tem plano na **Hostinger** e o domínio **efficio.com.br** no registro.br; a subida para produção ainda
  não foi marcada.
- **Decisão (14/11/2026):** o sistema é **só do escritório** (não será vendido), com **5 usuários** (sócios e
  empregados), e deve rodar **somente no VPS KVM 1 da Hostinger** (1 vCPU, 4 GB de RAM, 50 GB NVMe, 4 TB de
  tráfego). Cabe com folga: PostgreSQL + API + proxy com TLS num Docker Compose, uma instância só, sem Redis
  (limite de requisições em memória). O build do web e da imagem da API sai do CI (o VPS só baixa e roda).
  Com um único servidor e sem AWS, a chave de criptografia passa a ser local (arquivo com permissão restrita +
  cópia offline guardada pelo dono) — exige liberar `KEY_PROVIDER=local` em produção no `env.ts`.
- O sistema precisa de Node.js e PostgreSQL 16. Na Hostinger isso só roda num **VPS (KVM)**; a hospedagem de sites
  compartilhada não oferece PostgreSQL. No VPS: Docker Compose com PostgreSQL, API e o web atrás de um proxy com
  TLS (Caddy ou Nginx), DNS do registro.br apontando para o VPS.
- Ajustes necessários antes: hoje a produção exige chaves no AWS KMS (`KEY_PROVIDER=aws`, `apps/api/src/env.ts`).
  Opções: manter só o KMS na AWS (custo baixo, chave fora do servidor) ou permitir chave local com guarda
  cuidadosa — decidir na hora da subida. O e-mail transacional hoje só sai por webhook; para usar o e-mail da
  Hostinger é preciso suporte a SMTP. Backups diários do PostgreSQL para fora do VPS, com teste de restauração.
- Já pronto no código (14/11): cadastro só por convite em produção (`SIGNUP_ENABLED`, desligado por padrão),
  produção sem exigir Mercado Pago com a cobrança desligada e `GET /api/health/ready` (testa o banco) para o
  monitor do servidor.
