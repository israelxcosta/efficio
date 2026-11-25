# Auditoria de segurança — 25/11/2026 (o que mudou desde 19–20/11)

Escopo: os 40 commits depois da auditoria completa (`d58cfe4`). No backend, foram 2 migrações e cerca de
20 arquivos da API; o restante foi no web: quadros dos painéis, polimento visual e Minha área. A base
continua coberta pelos relatórios de 19–20/11 (`README.md`).

## Resultado

**0 crítico, 0 alto, 0 médio.** Nenhuma correção de código foi necessária. Há 2 itens informativos,
descritos abaixo.

| Verificação | Como | Resultado |
|---|---|---|
| Dependências de produção | `pnpm audit --prod` | 0 vulneráveis |
| Segredos no repositório | busca por padrões de chave (AWS, GitHub, Slack, Google, chaves privadas) e arquivos `.env`/`.pem`/`.key` rastreados | 0. Só existem `.env.example` e senhas de demonstração/teste |
| SAST | semgrep 1.187 com `sast-rules/semgrep-efficio.yml` em `apps/api/src`, `apps/web/src` e `packages/shared/src` | 14 achados: 13 são os falsos positivos já triados em `sast-sca-2026-11-19.md` (só mudaram de linha); 1 é novo e informativo (I1) |
| Credenciais do demo no build de produção | `vite build` de produção + busca no `dist` | Ausentes: o e-mail e a senha do login pré-preenchido só existem no build `--mode demo` |
| Seed de demonstração | `db/seed.ts` e `apps/api/Dockerfile` | Recusa rodar com `NODE_ENV=production` e é apagado da imagem |
| Testes de regressão de segurança | suítes completas | API 664/664 (inclui `security-*.test.ts`), web 877/877 (inclui `web-security-audit`) |

## Código novo revisado

- **`PATCH /api/transactions/reconcile`** ("conferido com o extrato"):
  - fica dentro de `transactionRoutes`, que exige a permissão `finance` (`financeOnly`) e, por ser
    escrita, assinatura ativa (`assertCanWrite` em `tenant-routes`);
  - o update filtra por `workspace_id`, pelos ids e por `paid = true`, com o RLS como segunda barreira;
  - a migração 0028 cria a função do gatilho como *invoker*, com `search_path` fixo e sem `EXECUTE`
    para `PUBLIC`, no mesmo padrão da 0012.
- **`GET /api/reports/receipts`** (Recebimentos, agora líquido do desconto):
  - está em `reportRoutes`, com `financeOnly`;
  - a subconsulta do desconto também filtra pelo `workspace_id` da linha de fora.
- **Sincronização das tarefas ao editar, inativar ou reativar um cliente** (`tasks/client-sync.ts`):
  - roda em `req.db`, a mesma transação com RLS do pedido;
  - a conexão de sistema só lê os membros do próprio escritório (`loadMembers(workspaceId)`);
  - só é chamada depois que a edição do cliente já passou pelas permissões dela.
- **Migração 0029** (`tasks.request_channel`): uma coluna com `CHECK` de valores fixos. Não muda o RLS
  nem os privilégios, porque `grants-api.sql` concede por tabela.
- **Web**:
  - nenhum `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou link dinâmico novo;
  - o `localStorage` novo guarda só preferências de tela (densidade, posição e tamanho dos cards), sem
    dados pessoais nem financeiros.

## Itens informativos

- **I1. `db/migrate.ts:39` monta um `ALTER TABLE … VALIDATE CONSTRAINT` com `sql.raw`.**
  - Os nomes vêm do catálogo (`pg_constraint`), mas só executam se estiverem na lista fixa
    `DEFERRED_CHECKS` do próprio código.
  - Nenhum dado de usuário chega ali, então o risco é aceito. Melhoria opcional: citar os
    identificadores com `"…"`.
- **I2. O e-mail do proprietário aparece no código como login pré-preenchido do demo**
  (`apps/web/src/lib/demo.ts`).
  - Não vai para o build de produção (verificado).
  - O repositório é privado. Se um dia ficar público, troque por um e-mail fictício.

## Antes de publicar

Siga o checklist da seção 12 de `docs/deploy-hostinger.md`. Ele já cobre a verificação em duas etapas
para todos, o banco fechado, as notas A em securityheaders.com e ssllabs.com, o backup testado e os
segredos guardados fora do servidor. Continuam valendo as pendências do dono listadas no `README.md`:
- checks obrigatórios na `main`;
- revisão da política de privacidade por advogado.
