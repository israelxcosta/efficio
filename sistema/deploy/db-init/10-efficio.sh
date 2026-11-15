#!/usr/bin/env bash
# Executado pela imagem oficial do PostgreSQL SOMENTE na primeira inicialização (volume de dados
# vazio). Cria os papéis e o banco do Efficio (mesmo modelo da AWS, docs/deploy-aws.md):
#   - efficio_owner  : dono do banco e de todas as tabelas. Usado SÓ pelo serviço `migrate` (DDL) e
#                      pelos grants de sql/grants-api.sql. Não é superusuário (não lê arquivos do
#                      servidor, não cria papéis, não desliga o RLS forçado de outro jeito que não seja
#                      uma migração). Senha = EFFICIO_OWNER_DB_PASSWORD do .env.
#   - efficio        : login da API. Não é dono de nada: só os grants mínimos de sql/grants-api.sql
#                      (reaplicados depois de cada migração). NOINHERIT: não herda nada de
#                      effinance_app; os dados financeiros só são alcançados com o SET LOCAL ROLE de
#                      cada requisição (RLS). Senha = EFFICIO_DB_PASSWORD do .env.
#   - effinance_app  : papel sem login das requisições de tenant (SET LOCAL ROLE), sujeito ao Row
#                      Level Security. Criado aqui porque efficio_owner não tem CREATEROLE; a
#                      migração 0003 apenas confere que ele existe.
# O superusuário "postgres" fica só para manutenção (backup/restauração pelo socket local).
set -euo pipefail

: "${EFFICIO_OWNER_DB_PASSWORD:?defina EFFICIO_OWNER_DB_PASSWORD no .env}"
: "${EFFICIO_DB_PASSWORD:?defina EFFICIO_DB_PASSWORD no .env}"
if [[ "$EFFICIO_OWNER_DB_PASSWORD" == "$EFFICIO_DB_PASSWORD" ]]; then
  echo "ERRO: EFFICIO_OWNER_DB_PASSWORD e EFFICIO_DB_PASSWORD precisam ser diferentes" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 -v owner_pw="$EFFICIO_OWNER_DB_PASSWORD" -v api_pw="$EFFICIO_DB_PASSWORD" \
  --username "$POSTGRES_USER" --dbname postgres <<'SQL'
CREATE ROLE efficio_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'owner_pw';
CREATE ROLE efficio LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'api_pw';
CREATE ROLE effinance_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- O dono concede effinance_app nas migrações (0003: GRANT effinance_app TO CURRENT_USER).
GRANT effinance_app TO efficio_owner WITH ADMIN OPTION;
-- A API só usa o papel por SET LOCAL ROLE: sem herança, sem poder concedê-lo a ninguém.
GRANT effinance_app TO efficio WITH INHERIT FALSE, SET TRUE;
-- Limites contra consultas presas e esgotamento de conexões (max_connections=40 no compose).
ALTER ROLE efficio CONNECTION LIMIT 30;
ALTER ROLE efficio SET statement_timeout = '30s';
ALTER ROLE efficio SET idle_in_transaction_session_timeout = '60s';
CREATE DATABASE efficio OWNER efficio_owner ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE efficio FROM PUBLIC;
GRANT CONNECT ON DATABASE efficio TO efficio_owner, efficio;
SQL
