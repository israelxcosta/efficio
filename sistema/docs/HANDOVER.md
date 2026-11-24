# Handover — Efficio (24/11/2026)

Estado do projeto para quem continuar o trabalho (pessoa ou agente). Leia junto com
[CLAUDE.md](../CLAUDE.md), [CODEBASE_MAP.md](CODEBASE_MAP.md) e [roadmap.md](roadmap.md).

## 1. Onde está

| Item | Valor |
| --- | --- |
| Repositório | `israelxcosta/efficio`, monorepo em `sistema/` |
| Branch de trabalho | `claude/zealous-maxwell-81aseb` (sem PR aberto; só abrir se o dono pedir) |
| Último commit | ver `git log` (redesign "Seu dia" aplicado em 24/11/2026) |
| Demo publicada | v49, PGlite no navegador (artifact "Efficio Financeiro"), login de demonstração na tela "Entrar" |
| Produção | ainda não subiu. Destino: VPS Hostinger KVM 1, guia em [deploy-hostinger.md](deploy-hostinger.md) |
| Idioma | UI e conversa em pt-BR, respostas curtas; código em inglês |

## 2. O que foi feito nesta rodada (19–21/11/2026)

- **Onboarding do cliente:** 19 slides. Inclui a obrigação de contratar uma clínica ocupacional ou um engenheiro
  de segurança do trabalho (PGR, PCMSO, LTCAT, ASO). O amarelo claro foi trocado por âmbar `#f2b931` e laranja `#ee7d26`.
- **Design e animação** (relatório em [analise-design-2026-11-19](analise-design-2026-11-19)):
  - correção do modal;
  - `prefers-reduced-motion`;
  - `chartMotion`;
  - cor como informação;
  - ajustes no celular;
  - painéis;
  - padrão de movimento da casa.
- **Paleta dos gráficos:** mono azul-marinho suave (`--app-chart-blue-1..7`) com vermelho pastel
  (`--app-chart-red-soft/red/red-strong`) para urgência, vencidos e despesas. Tokens em
  `apps/web/src/styles/index.css` e seção "Cores dos gráficos" em [design-system.md](design-system.md).
  Não reintroduzir amarelo nem laranja nos gráficos.
- **Segurança:**
  - 9 agentes em `.claude/agents/security-*.md`;
  - auditoria, pentest, SAST/SCA, LGPD, autorização e correções com teste de regressão (`d58cfe4`);
  - relatórios em [security/](security/README.md);
  - migrações 0026/0027 com CHECKs `NOT VALID`, validados automaticamente por `validateDeferredChecks`
    (`apps/api/src/db/migrate.ts`);
  - CI com gitleaks, osv-scanner + SBOM e `pnpm audit`.
- **Política de privacidade genérica** (LGPD, Hostinger, transferência para Google Drive/OneDrive):
  `apps/web/src/features/legal/pages/legal.tsx`.
- **Relatórios → Recebimentos** (roadmap §6, itens 1 e 2):
  - entradas pela data em que o dinheiro entrou (`coalesce(paidAt, date)`), por forma, conta e dia, com lista e CSV;
  - na baixa de qualquer receita, o diálogo pergunta a "Forma de recebimento" (juros e multa herdam a mesma);
  - arquivos:
    - API: `apps/api/src/modules/reports/receipts.ts`, rota `GET /reports/receipts`;
    - testes: `apps/api/test/reports-receipts.test.ts`;
    - web: `apps/web/src/features/reports/receipts/` e `features/transactions/transaction-actions.tsx` (`ConfirmPaymentDialog`);
    - contrato: `receiptsReportQuerySchema`, `ReceiptsReportResponse`, `RECEIPTS_ITEMS_LIMIT` e `setPaidSchema.paymentMethod`.

## 2b. Rodada de 23–24/11/2026

- Conferido com o extrato (migração 0028), M1–M8 de design (pago/pendente, densidade, CSV, lote…).
- **Redesign "Seu dia"** (aprovado pelo dono; ver `design-system.md` §7): `PageWithAside`, `SpotlightCard`,
  `StackedBar`, `MiniStat solid` e o token `--app-on-solid-danger`.
  - Gestão: Início com filtros fixos (departamento + **competência**), coluna "Escritório hoje"
    (atrasadas por departamento, agenda, responsáveis, pedidos dos clientes) e vencimentos numa tabela;
    Minha área com a atrasada mais antiga no sólido; Clientes com coluna Tarefas e o cliente que pede
    atenção; Relatório de tarefas com "Por responsável" numa linha e ordenação no título das colunas.
  - Financeiro: Painel com coluna (inadimplência + saldo) fora da grade personalizável; célula sólida de
    Vencido (Receber/Pagar) e de Conferido (Recebimentos).
  - Tarefas: campo **"Pedido por"** (`requestChannel`, migração 0029), pronto para o portal.
- Relatórios dessas decisões: artifacts "Redesign Seu dia — relatório consolidado" e "Análise de design".

## 3. Pendências

**Com o dono (ação dele):**
1. Ativar a proteção da branch principal no GitHub: Settings → Branches (ou Rules → Rulesets) → regra para `main`.
   Marcar "Require a pull request before merging", "Require status checks to pass" (job "Typecheck, tests and
   builds" e os de segurança) e "Block force pushes".
2. Pedir a um advogado que revise a política de privacidade antes de publicar.
3. Subir o VPS seguindo [deploy-hostinger.md](deploy-hostinger.md). A validação pós-deploy das constraints é automática (§11).

**Desenvolvimento (opcional ou a combinar):**
1. ~~Conferido com o extrato~~ feito em 23/11/2026 (migração 0028). Próximo passo possível: sugerir a conferência pelo OFX/Open Finance.
2. Opcional no relatório de Recebimentos: saldo do extrato da conta ao lado de cada total, com a diferença destacada, e exportação em PDF.
3. Sobras de design: "Fixas x variáveis" e setas de período com área de toque de 44px feitos em 23/11/2026
   (`HIT_44` em `components/ui/button.tsx`). Seções no Painel financeiro **não** foram feitas: o painel é
   personalizável (arrastar e redimensionar) e títulos fixos brigariam com isso.
4. Roadmap §1–§3 (OneDrive e envio por link, portal do cliente, cobrança por boleto/Pix): esperam decisões do dono, listadas em cada item.

## 4. Como rodar e validar

```bash
cd sistema
pnpm install --frozen-lockfile
pnpm typecheck
pnpm --filter @effinance/shared test
pnpm --filter @effinance/web test

# API (precisa de Postgres 16)
pg_ctlcluster 16 main start                       # no container da nuvem
su postgres -c "psql -c \"alter user postgres password 'postgres'\""   # container novo
su postgres -c "createdb efficio_final"            # container novo
PGPASSWORD=postgres TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/efficio_final \
  pnpm --filter @effinance/api test

# Demo (PGlite)
pnpm --filter @effinance/web build:demo           # saída em apps/web/dist-demo
```

Publicar a demo: enviar todos os arquivos de `apps/web/dist-demo` (sem os `*.data`) para o artifact em modo
`replace`. Para conferir telas: `python3 -m http.server` dentro de `dist-demo`, Playwright, `#/login` → "Entrar".

## 5. Armadilhas conhecidas

- `POST /transactions` devolve **um array** (parcelas/recorrência): nos testes, use `body[0]`.
- Rotas de relatório financeiro ficam atrás de `financeOnly`. `page.reports` e `page.audit` também são checadas na API.
- Módulos da API não podem importar coisas exclusivas do Node, porque o demo os roda no navegador.
- Migração nova: reinicie o `vite --mode demo`.
- Dinheiro em centavos inteiros; datas `YYYY-MM-DD`; toda query filtra por `workspace_id` (o RLS é a segunda barreira).
- CSV exportado: `;` como separador, BOM UTF-8 e células que começam com `= + - @` neutralizadas (injeção de fórmula).
- `.env` e segredos nunca vão para o repositório nem para o chat. Não baixar `.env` do Drive.
- Commits de trabalho em andamento usam `[skip ci]`; o commit final roda o CI completo.
