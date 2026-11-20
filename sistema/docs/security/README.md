# Segurança — auditoria de 19–20/11/2026

Feita por 9 agentes especializados (`.claude/agents/security-*.md`), em paralelo, cada um no seu domínio.

| Relatório | Agente | Resultado |
|---|---|---|
| `threat-model.md` | security-threat-model | 19 ameaças (STRIDE/LINDDUN), plano de testes |
| `pentest-2026-11-20.md` + `pentest-scripts/` | security-pentest-dast | 0 crítico/alto/médio; 2 baixos e 3 informativos (corrigidos, exceto o 409 do cadastro, aceito) |
| `sast-sca-2026-11-19.md`, `sbom.cdx.json`, `sast-rules/` | security-sast-sca | 0 achados; 0 dependências vulneráveis; 0 segredos no histórico |
| `privacidade-lgpd-2026-11-19.md` | security-privacy-lgpd | ROPA + 13 lacunas (altas e médias corrigidas; política atualizada) |

Correções (com testes `apps/api/test/security-*.test.ts` e `apps/web/src/features/web-security-audit.test.tsx`):
- **Autorização** (security-authz-tenancy): observações de cliente ocultas sem `finance`; remover membro exige ter as chaves dele; `/contacts` exige `finance`; `page.reports`/`page.audit` checadas na API; filtro de workspace em todo update/delete; exportação LGPD com onboarding.
- **API** (security-node-api): limite por conta no login; resposta de tempo constante no reset; rate limit por /64 IPv6 e global 300/min; reautenticação (senha/TOTP) para exportar, excluir espaço/conta, trocar senha, desligar 2FA e novos códigos; desafio MFA de uso único; tokens e IPs mascarados nos logs; CSV injection com espaço; magic bytes em logo e anexos (macros e executáveis recusados); webhook com anti-replay; erros 4xx genéricos; `X-Frame-Options: DENY`; onboarding exige Parâmetros salvos.
- **Banco** (security-postgres-sql): migrações 0026/0027 — CHECK de texto cifrado em 13 campos de contatos e nas notas; política pública do onboarding recusa link revogado/vencido; timeout de transação ociosa.
- **Web** (security-react-web): imagens só PNG/JPEG/WebP; link do WhatsApp só com número válido; cabeçalhos anti-framing no dev/preview.
- **Infra** (security-infra-supply-chain): SDK AWS atualizado; log do Caddy sem tokens/IP/UA; job `osv` + SBOM no CI; `.gitignore` na raiz; OIDC do deploy corrigido; backups documentados.

Pendências que dependem do dono:
- Política de privacidade: versão genérica publicada em 20/11/2026 (controlador = o Escritório identificado no contrato; canal pelo e-mail de atendimento; Hostinger + Google Drive/OneDrive). Recomendada revisão por advogado.
- GitHub: marcar os checks `verify`/`audit`/`osv`/`secrets`/`image`/`deploy-kit` como obrigatórios na `main`.
- Produção: a validação das migrações 0026/0027 é automática no `migrate`; `VACUUM FULL` só se o log mostrar linhas cifradas pelo backfill (docs de deploy, seção 11).
- Riscos aceitos/documentados: scrypt abaixo do mínimo OWASP (plano de rehash em `lib/password.ts`); 409 no cadastro aberto (desligado em produção); backups retêm dados por até 365 dias.
