-- Privilégios do login "efficio" (a API) no banco do Efficio. Idempotente e numa transação só (a API
-- que está no ar nunca vê um estado intermediário). Rodado como o dono, efficio_owner:
--   - pelo serviço `grants` do docker-compose.prod.yml, depois de CADA migração (tabela nova nasce sem
--     grant para a API: acrescente aqui, em apps/api/test/db-roles.ts e em docs/deploy-aws.md);
--   - por scripts/restaurar.sh, depois de restaurar um backup.
-- Mesmos grants de IDENTITY_GRANTS (apps/api/test/db-roles.ts) + DELETE em sessions e
-- open_finance_events para a limpeza diária (src/db/retention.ts, agendador da API). Conferido por
-- apps/api/test/vps-db-owner.test.ts. Tabelas financeiras: NENHUM grant (só effinance_app, com RLS).
\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_user <> (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) THEN
    RAISE EXCEPTION 'rode como o dono do banco (efficio_owner), não como %', current_user;
  END IF;
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO efficio', current_database());
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO efficio;

-- Parte do zero a cada execução: privilégio removido daqui some também do banco.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM efficio;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM efficio;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, workspaces, workspace_members, workspace_invites, password_resets
TO efficio;
-- Foto do perfil (0015): dado da pessoa, fora do RLS, cifrada; trocada e removida pela pessoa.
GRANT SELECT, INSERT, UPDATE, DELETE ON user_photos TO efficio;
-- A API não apaga assinaturas nem eventos de cobrança (cascatas rodam como dono da tabela).
GRANT SELECT, INSERT, UPDATE ON subscriptions, billing_events TO efficio;
-- Sessões: DELETE só para a limpeza diária das expiradas (retention.ts).
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO efficio;
-- Trilha de auditoria (inclui a revelação de senhas): só acrescenta e a tela de auditoria lê.
-- Sem UPDATE, DELETE nem TRUNCATE.
GRANT SELECT, INSERT ON audit_logs TO efficio;
-- Open Finance (0005): chave de plataforma e índice dos webhooks só inseridos; eventos recebem
-- processed_at e os de mais de 30 dias saem na limpeza diária.
GRANT SELECT, INSERT ON platform_keys, open_finance_items TO efficio;
GRANT SELECT, INSERT, UPDATE, DELETE ON open_finance_events TO efficio;

COMMIT;
