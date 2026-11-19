# Privacidade e LGPD — Efficio (19/11/2026)

Agente: `security-privacy-lgpd`. Escopo: código em `HEAD` (f8a161c) mais a árvore de trabalho de 19/11,
produção conforme `deploy/docker-compose.prod.yml` (VPS Hostinger, um escritório, `SIGNUP_ENABLED=false`).
Outros agentes estão corrigindo API e banco em paralelo: os números de linha valem para esta data.
Este relatório só alterou documentação e o texto da política de privacidade (ver "Alterações feitas").

## Resumo

A base é boa: cifra por campo AES-256-GCM com chave por espaço e AAD `workspace:tabela:coluna`,
índice cego HMAC derivado por HKDF da chave do espaço (morre com ela), RLS em todas as tabelas de tenant,
token do onboarding guardado só como SHA-256, IP truncado em sessões, auditoria e acessos, user-agent
resumido nos acessos, logs com URL e erros higienizados, retenção da auditoria (24 meses com aviso e
CSV) e exportação/exclusão com crypto-shredding. As lacunas estão nas bordas: logs do proxy e da
API com IP inteiro e URL do link público, exportação sem os dados do onboarding, falta de prazo de
guarda para acessos do onboarding e uma política que descrevia outra infraestrutura (AWS).

## ROPA (registro das operações de tratamento)

Papéis: em produção o Efficio é o sistema do próprio escritório, então o escritório é **controlador**
de tudo. Se virar SaaS (`SIGNUP_ENABLED=true`), o escritório assinante passa a controlador dos dados
dos seus clientes e o Efficio a **operador** (precisa de contrato de operador / DPA).

| Dado | Titular | Finalidade | Base legal (LGPD art. 7) | Onde (tabela.coluna) | Cifrado? | Retenção |
|---|---|---|---|---|---|---|
| Nome, e-mail, hash da senha, TOTP | Usuário | Conta e acesso | V (contrato) | `users` | senha: hash; TOTP: cifrado | Até excluir a conta |
| Foto do perfil | Usuário | Identificação na equipe | V | `user_photos.content` | Sim (chave de plataforma) | Até trocar/excluir conta |
| IP truncado, user-agent (200 car.), datas | Usuário | Sessões ativas, segurança | IX (legítimo interesse), MCI art. 15 | `sessions.ip`, `sessions.user_agent` | Não (IP já truncado) | Vida da sessão |
| Trilha de auditoria (ação, ids, IP truncado, UA 200 car.) | Usuário / visitante do onboarding | Segurança, prova | IX, II (MCI) | `audit_logs` | Não | 24 meses (`AUDIT_LOG_RETENTION_MONTHS`) |
| Nome/razão social, nome fantasia | Cliente/fornecedor | Cadastro, cobrança, busca | V / II | `contacts.name`, `trade_name` | **Não** (pesquisável) | Enquanto houver lançamentos; cliente com lançamento só inativa |
| CPF/CNPJ, e-mail, telefone, endereço, responsável (nome, CPF, e-mail, telefone) | Cliente e seu responsável | Cadastro, contrato, obrigações | V, II | `contacts.*` (lista em `CONTACT_ALL_ENCRYPTED_FIELDS`) | Sim + índice cego p/ busca exata | Idem |
| Acessos do cliente (senhas de portais) | Cliente | Execução do serviço contábil | V | `contacts` (fase 3) | Sim; nunca em listas; revelação auditada | Idem |
| Honorários, lançamentos, nº de empregados | Cliente | Cobrança, financeiro | V, II (fiscal: 5 anos) | `transactions`, `fee_*` | Notas cifradas; valores e descrições em claro | Idem |
| Tarefas, comentários, anotações, anexos (nome e conteúdo) | Cliente, equipe | Rotina do escritório | V | `tasks*`, `task_attachments` | Descrições/comentários/anexos cifrados; títulos em claro | Idem |
| Escritório: CPF, e-mail, telefone, Pix, logo | Sócio do escritório | Contrato, documentos | V | `offices` | Sim (CPF, e-mail, telefone, Pix) | Vida do espaço |
| Destinatário do onboarding (nome, telefone/e-mail) | Cliente/responsável | Enviar o link | V / IX | `onboarding_links.recipient_name`, `recipient_to` | Sim | Com o cliente (cascade) |
| Acesso ao onboarding (data, aparelho, navegador, SO, IP truncado) | Quem abre o link | Saber se o cliente leu | IX | `onboarding_accesses` | Não (só resumos; `city` sempre nulo) | **Sem prazo** (teto de 1000 por link) |
| Confirmação "Li e entendi" (nome, CPF, data, IP truncado) | Quem confirma | Prova de ciência | IX / V | `onboarding_links.confirmed_*` | Nome e CPF sim; IP não | Com o cliente |
| CNPJ consultado | Cliente | Preencher cadastro | IX | enviado à BrasilAPI | n/a | Não guardado lá por nós |
| Logs do proxy (Caddy) e da API (pino) | Todos | Operação | IX | `docker logs` (driver local, 5×10 MB) | Não | Até rotação (~dias) |
| Backups (pg_dump) | Todos | Recuperação | IX | VPS (14 diários + 8 semanais) e rclone (diários 60 d, semanais 365 d) | gpg AES-256 + campos já cifrados | Até 1 ano |

Operadores reais em produção: Hostinger (VPS e SMTP), BrasilAPI (CNPJ), Google Drive/OneDrive (backup,
se `RCLONE_REMOTE`; transferência internacional, art. 33). Desligados hoje: Mercado Pago
(`BILLING_ENABLED=false`), Pluggy (`OPEN_FINANCE_PROVIDER=disabled`). Stripe e AWS não são usados em
produção (AWS só no guia alternativo `docs/deploy-aws.md`).

## Lacunas priorizadas

### Alta

1. **Log do proxy grava o token do link público, IP inteiro e user-agent** —
   `deploy/Caddyfile:40-43` (`log { output stdout; format json }`). O log de acesso do Caddy traz a URI
   completa (`/o/<token>` e `/api/public/onboarding/<token>`), `remote_ip` e os cabeçalhos. Quem lê
   `docker logs` abre o documento do cliente e pode assinar o "Li e entendi" em nome dele.
   Correção: filtro de log no Caddy (`format filter` com `request>uri regexp` mascarando `/o/[^/?]+` e
   `/public/onboarding/[^/?]+`, `request>remote_ip ip_mask 24 48`, `request>client_ip ip_mask`,
   `request>headers>User-Agent delete`) ou `log_skip` para essas rotas. (Infra.)
2. **Log da API grava o IP inteiro** — `apps/api/src/lib/log.ts:118` (`remoteAddress: req.ip`). A
   própria política diz IP truncado. Correção: `remoteAddress: maskIp(req.ip)`. O mascaramento do token
   na URL já foi feito (`log.ts:43`).
3. **Exportação (portabilidade) sem os dados do onboarding** — `apps/api/src/modules/workspaces/export.ts`
   não lê `onboarding_templates`, `onboarding_client_overrides`, `onboarding_links` (destinatário,
   confirmação decifrados) nem `onboarding_accesses` (incluir junto do bloco da fase 3, `export.ts:122`).
   Toda tabela nova com dado pessoal deveria entrar num teste que compare a exportação com o catálogo
   de tabelas de tenant (`test/db-roles.ts`).
4. **Política descrevia outra infraestrutura** — `apps/web/src/features/legal/pages/legal.tsx` citava
   AWS "no Brasil", backups de 30 dias e omitia BrasilAPI e backup externo. **Corrigido neste
   relatório** (ver abaixo); faltam os campos entre colchetes: controlador e encarregado
   (`legal.tsx:68-69`), provedor/país do servidor e serviço de backup (`legal.tsx:89`). Sem o
   encarregado nomeado, o art. 41 não está atendido.

### Média

5. **Acessos do onboarding sem prazo de guarda** — `apps/api/src/modules/onboarding/service.ts:525-542`
   só limita a 1000 por link; links expirados/revogados e seus acessos ficam para sempre, e cliente com
   lançamentos nunca é excluído (só inativado). Proposta: a limpeza diária (mesma de `audit_logs`, em
   `db/retention.ts`) apaga `onboarding_accesses` 12 meses após o vencimento do link; a confirmação
   (prova de ciência) fica até 5 anos após o fim do contrato ou a inativação.
6. **Auditoria da confirmação guarda o user-agent inteiro do visitante** —
   `apps/api/src/modules/onboarding/routes.ts:128-131` passa `requestContext(req)` ao `audit`, que grava
   `shortUserAgent` (200 caracteres, `lib/audit.ts:77`), enquanto o acesso guarda só o resumo
   (`public.ts:36`, "never the full string"). Proposta: na rota pública, gravar `summarizeUserAgent` em
   `metadata` e `userAgent: null`. A política agora declara o UA nessa auditoria; ajustar o texto se a
   correção entrar.
7. **Truncamento de IPv6 com `::` vaza bits do host** — `apps/api/src/lib/ip.ts:6` corta os 3 primeiros
   grupos textuais sem expandir `::`: `2804::5` vira `2804::5:x`, `::1` vira `::1:x`. Proposta: usar
   `ipv6Groups` (já no mesmo arquivo, linha 16) e guardar o /48 (`2804:0:0::/48`). Afeta sessões,
   auditoria, acessos e `confirmed_ip`.
8. **Crypto-shredding não alcança os backups** — a chave mestra é local e fixa
   (`KEY_PROVIDER: local`, `apps/api/src/env.ts:93-97`, sem rotação) e as chaves dos espaços embrulhadas
   estão no próprio dump: um espaço excluído volta inteiro numa restauração de até 365 dias
   (`deploy/scripts/backup.sh:93-95`). Aceitável se declarado (feito na política) e se o procedimento de
   restauração (`deploy/scripts/restaurar.sh`) reaplicar as exclusões feitas depois do backup; hoje não
   há registro disso. Proposta: guardar em `audit_logs` (`workspace.deleted`, `account.deleted`) os ids
   e documentar em `docs/deploy-hostinger.md` "após restaurar, excluir de novo os espaços/contas da lista".
9. **Backup externo fora do país** — `docs/deploy-hostinger.md:198-204` recomenda Google Drive/OneDrive.
   Transferência internacional (art. 33, II/IX): cifrado com gpg, mas precisa constar na política
   (feito, com o nome a preencher) e a senha do gpg nunca no mesmo serviço.

### Baixa

10. **Nomes em claro** — `contacts.name`/`trade_name`, títulos de tarefas e descrições de lançamentos
    ficam em claro por decisão (busca). Pessoa física cliente (CPF) tem o nome exposto a quem tiver o
    banco ou o backup decifrado; registrado como risco aceito no ROPA.
11. **Coluna `onboarding_accesses.city` sem uso** — `service.ts:542` grava `null`. A política dizia
    "poderá ser registrada no futuro"; trocado por "não registramos a localização". Se a cidade entrar,
    atualizar a política antes e usar base de geolocalização local (não um serviço externo com o IP).
12. **CNPJ do seed do demo** — `apps/api/src/db/demo-seed.ts:115` (`45723174000110`, "Tecnova") tem DV
    válido; confirmar que não é de empresa real ou trocar por um gerado (os outros, `11222333000181` e
    o CPF `52998224725`, são números de teste conhecidos).
13. **Rotação da chave mestra** — não existe para o provedor local (`env.ts:95`). Documentar o
    procedimento de troca (desembrulhar e reembrulhar `workspace_keys`) antes de precisar dele.

## Direitos do titular

- Usuário: acesso, correção, exportação (dono do espaço; foto só a própria) e exclusão (conta e
  espaço, com revogação no agregador e cancelamento da cobrança antes) estão nas Configurações.
- Clientes do escritório e destinatários do onboarding não são usuários: atendidos pelo escritório
  (controlador). A política agora diz isso (seção 7). Faltam: item 3 (exportação completa) e um
  procedimento interno de resposta em 15 dias (art. 19), com registro do pedido.
- Aceite: a confirmação do onboarding é prova de ciência, não consentimento; base legal é legítimo
  interesse/execução do contrato. Termos e política não têm registro de aceite versionado no cadastro
  (cadastro fechado em produção; necessário se `SIGNUP_ENABLED` voltar).

## Links públicos (`/o/:token`)

Mostram o documento do onboarding: nome, nome fantasia e CNPJ do cliente, regime, cliente desde,
nº de empregados, sindicatos e obrigações; dados do escritório. Não mostram CPF, e-mail, telefone,
honorários nem acessos. Token de 32 bytes, só o hash no banco, 404 único para inválido/expirado/
revogado, `no-store`, `noindex`, `no-referrer`, limite por IP. Coerente com `docs/onboarding-cliente.md:28`.
Risco residual: o link encaminhado no WhatsApp expõe esses dados a quem o receber até expirar (padrão 30
dias, máximo 90); a revogação existe no cartão do cliente.

## Alterações feitas

- `apps/web/src/features/legal/pages/legal.tsx` (política, data 19/11/2026): IP truncado e
  identificador do navegador nas sessões e na auditoria; onboarding com destinatário cifrado, resumo do
  aparelho, IP truncado na confirmação e UA na auditoria dela, sem localização, prazo do link
  configurável (30 padrão, máx. 90); operadores reais (servidor, e-mail, backup, BrasilAPI; Mercado Pago
  e Open Finance só quando ativados; WhatsApp sai do aparelho de quem envia); retenção real dos backups
  (60 dias / 1 ano) e da auditoria (24 meses); pedido de titulares cadastrados por um escritório.
- Termos sem alteração.
