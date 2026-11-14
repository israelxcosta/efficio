#!/usr/bin/env bash
# Executado pela imagem oficial do PostgreSQL SOMENTE na primeira inicialização (volume de dados
# vazio). Cria os papéis e o banco do Efficio:
#   - efficio        : usuário da API e das migrações. Dono do banco "efficio", mas NÃO é
#                      superusuário (não pode ler arquivos do servidor, criar papéis nem
#                      desligar o RLS). Senha = EFFICIO_DB_PASSWORD do .env.
#   - effinance_app  : papel sem login usado pela API dentro de cada requisição (SET LOCAL ROLE)
#                      para que o Row Level Security valha. Criado aqui porque o "efficio" não
#                      tem CREATEROLE; a migração 0003 apenas confere que ele existe.
# O superusuário "postgres" fica só para manutenção (backup/restauração pelo socket local).
set -euo pipefail

: "${EFFICIO_DB_PASSWORD:?defina EFFICIO_DB_PASSWORD no .env}"

psql -v ON_ERROR_STOP=1 -v pw="$EFFICIO_DB_PASSWORD" --username "$POSTGRES_USER" --dbname postgres <<'SQL'
CREATE ROLE efficio LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'pw';
CREATE ROLE effinance_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT effinance_app TO efficio WITH ADMIN OPTION;
CREATE DATABASE efficio OWNER efficio ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE efficio FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE efficio TO efficio;
SQL
