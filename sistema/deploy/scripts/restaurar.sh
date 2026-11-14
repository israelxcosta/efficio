#!/usr/bin/env bash
# Restauração guiada de um backup do Efficio. Sempre restaura primeiro num banco NOVO; o banco em uso
# só é trocado se você confirmar, e o antigo é guardado com outro nome (nada é apagado).
#   ./scripts/restaurar.sh --teste [arquivo]   restaura num banco de teste, mostra contagens e o apaga
#   ./scripts/restaurar.sh [arquivo]           restaura e, com confirmação, coloca no lugar do atual
# Sem [arquivo], usa o backup mais recente de BACKUP_DIR/diarios.
# Servidor novo: o .env precisa ter a MESMA ENCRYPTION_MASTER_KEY da época do backup, e o arquivo de
# senha (BACKUP_PASSPHRASE_FILE) a mesma senha de backup.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
dc() { docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" --project-directory "$DEPLOY_DIR" "$@"; }
# </dev/null: o docker exec não pode consumir o que a pessoa digita nas confirmações.
psql_su() { dc exec -T db psql -U postgres -v ON_ERROR_STOP=1 -X -q "$@" </dev/null; }

ler_env() {
  local valor
  valor="$(grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
  valor="${valor%\'}"; valor="${valor#\'}"; valor="${valor%\"}"; valor="${valor#\"}"
  printf '%s' "${valor:-${2:-}}"
}

teste=0
if [[ "${1:-}" == "--teste" ]]; then teste=1; shift; fi
arquivo="${1:-}"

[[ -r "$ENV_FILE" ]] || { echo "ERRO: não consigo ler $ENV_FILE" >&2; exit 1; }
BACKUP_DIR="$(ler_env BACKUP_DIR /opt/efficio/backups)"
PASS_FILE="$(ler_env BACKUP_PASSPHRASE_FILE /opt/efficio/segredos/backup.senha)"
[[ -s "$PASS_FILE" ]] || { echo "ERRO: senha de backup ausente em $PASS_FILE" >&2; exit 1; }

if [[ -z "$arquivo" ]]; then
  arquivo="$(find "$BACKUP_DIR/diarios" -maxdepth 1 -name 'efficio-*.dump.gpg' 2>/dev/null | sort | tail -n1)"
  [[ -n "$arquivo" ]] || { echo "ERRO: nenhum backup em $BACKUP_DIR/diarios" >&2; exit 1; }
fi
[[ -r "$arquivo" ]] || { echo "ERRO: não consigo ler $arquivo" >&2; exit 1; }

confirmar() {
  local palavra="$1" resposta=""
  read -r -p "Digite $palavra para continuar (qualquer outra coisa cancela): " resposta || true
  [[ "$resposta" == "$palavra" ]]
}

GNUPGHOME="$(mktemp -d)"
export GNUPGHOME
trap 'rm -rf "$GNUPGHOME"' EXIT

novo="efficio_restaurado_$(date +%Y%m%d_%H%M%S)"
echo "Backup:      $arquivo ($(du -h "$arquivo" | cut -f1))"
echo "Banco novo:  $novo  (o banco em uso NÃO é alterado nesta etapa)"
confirmar SIM || { echo "Cancelado."; exit 1; }

echo "==> Criando o banco $novo"
psql_su -d postgres -c "CREATE DATABASE \"$novo\" OWNER efficio TEMPLATE template0 ENCODING 'UTF8'" \
  -c "REVOKE ALL ON DATABASE \"$novo\" FROM PUBLIC" \
  -c "GRANT CONNECT, TEMPORARY ON DATABASE \"$novo\" TO efficio"

echo "==> Restaurando (pode levar alguns minutos)"
if ! gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$PASS_FILE" --decrypt "$arquivo" \
    | dc exec -T db pg_restore -U postgres -d "$novo" --exit-on-error; then
  echo "ERRO: a restauração falhou. Apagando o banco incompleto $novo." >&2
  psql_su -d postgres -c "DROP DATABASE IF EXISTS \"$novo\"" || true
  exit 1
fi

echo "==> Conferência (quantidade de registros no backup)"
psql_su -d "$novo" -c "
  SELECT 'usuários' AS tabela, count(*) AS registros FROM users
  UNION ALL SELECT 'empresas/espaços', count(*) FROM workspaces
  UNION ALL SELECT 'clientes e fornecedores', count(*) FROM contacts
  UNION ALL SELECT 'lançamentos', count(*) FROM transactions
  UNION ALL SELECT 'migrações aplicadas', count(*) FROM drizzle.__drizzle_migrations"

if (( teste )); then
  echo "==> Teste concluído: o backup abre e tem os dados acima. Apagando o banco de teste."
  psql_su -d postgres -c "DROP DATABASE \"$novo\""
  echo "Para conferir os dados na tela, faça a restauração completa num servidor de teste."
  exit 0
fi

antigo="efficio_antigo_$(date +%Y%m%d_%H%M%S)"
cat <<EOF

ATENÇÃO: o próximo passo coloca o backup no lugar do banco em uso.
  - o sistema fica fora do ar por cerca de 1 minuto;
  - tudo o que foi lançado DEPOIS do backup deixa de aparecer (o banco atual é guardado como
    "$antigo" e pode ser recuperado).
EOF
if ! confirmar RESTAURAR; then
  echo "Cancelado. O banco restaurado ficou como \"$novo\" (apague com: docker compose -f docker-compose.prod.yml exec db dropdb -U postgres $novo)."
  exit 1
fi

echo "==> Parando a API"
dc stop api
psql_su -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'efficio' AND pid <> pg_backend_pid()" \
  -c "ALTER DATABASE efficio RENAME TO \"$antigo\"" \
  -c "ALTER DATABASE \"$novo\" RENAME TO efficio"

echo "==> Subindo de novo (aplica migrações mais novas que o backup, se houver)"
dc up -d api
for _ in $(seq 1 36); do
  estado="$(docker inspect -f '{{.State.Health.Status}}' "$(dc ps -q api)" 2>/dev/null || echo desconhecido)"
  [[ "$estado" == "healthy" ]] && break
  sleep 5
done
if [[ "${estado:-}" != "healthy" ]]; then
  echo "ERRO: a API não ficou saudável. Para voltar ao banco anterior:" >&2
  echo "  docker compose -f docker-compose.prod.yml stop api" >&2
  echo "  docker compose -f docker-compose.prod.yml exec db psql -U postgres -c 'ALTER DATABASE efficio RENAME TO $novo' -c 'ALTER DATABASE \"$antigo\" RENAME TO efficio'" >&2
  echo "  docker compose -f docker-compose.prod.yml up -d api" >&2
  exit 1
fi
cat <<EOF
==> Restaurado. O banco anterior ficou guardado como "$antigo".
    Depois de conferir o sistema, apague-o para liberar espaço:
    docker compose -f docker-compose.prod.yml exec db dropdb -U postgres $antigo
EOF
