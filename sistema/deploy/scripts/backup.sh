#!/usr/bin/env bash
# Backup diário do banco do Efficio (inclui os anexos, que ficam dentro do banco).
#   - pg_dump em formato custom (já compactado), cifrado com AES-256 (gpg, senha em
#     BACKUP_PASSPHRASE_FILE). O arquivo sem cifra nunca toca o disco.
#   - confere se o arquivo cifrado abre e é um dump válido antes de aceitá-lo;
#   - guarda 14 diários + 8 semanais (o de domingo) em BACKUP_DIR;
#   - opcional: copia para fora do servidor com rclone (RCLONE_REMOTE, ex.: onedrive:Efficio-backups)
#     e avisa um monitor (BACKUP_PING_URL, ex.: healthchecks.io).
# Agendado pelo timer do systemd (deploy/systemd/efficio-backup.timer) às 02:30. Rodar à mão:
#   /opt/efficio/app/sistema/deploy/scripts/backup.sh
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
dc() { docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" --project-directory "$DEPLOY_DIR" "$@"; }

# Lê uma variável do .env sem executá-lo (o .env não é um script).
ler_env() {
  local valor
  valor="$(grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
  valor="${valor%\'}"; valor="${valor#\'}"; valor="${valor%\"}"; valor="${valor#\"}"
  printf '%s' "${valor:-${2:-}}"
}

[[ -r "$ENV_FILE" ]] || { echo "ERRO: não consigo ler $ENV_FILE" >&2; exit 1; }
BACKUP_DIR="$(ler_env BACKUP_DIR /opt/efficio/backups)"
PASS_FILE="$(ler_env BACKUP_PASSPHRASE_FILE /opt/efficio/segredos/backup.senha)"
RCLONE_REMOTE="$(ler_env RCLONE_REMOTE)"
RCLONE_KEEP_DAYS="$(ler_env RCLONE_KEEP_DAYS 60)"
BACKUP_PING_URL="$(ler_env BACKUP_PING_URL)"
MANTER_DIARIOS=14
MANTER_SEMANAIS=8

[[ -s "$PASS_FILE" ]] || { echo "ERRO: senha de backup ausente em $PASS_FILE" >&2; exit 1; }
[[ "$RCLONE_KEEP_DAYS" =~ ^[0-9]+$ ]] || { echo "ERRO: RCLONE_KEEP_DAYS deve ser um número" >&2; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR/diarios" "$BACKUP_DIR/semanais"
chmod 700 "$BACKUP_DIR" "$BACKUP_DIR/diarios" "$BACKUP_DIR/semanais"

livre_mb="$(df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
if (( livre_mb < 2048 )); then
  echo "AVISO: só ${livre_mb} MB livres no disco." >&2
fi

# gpg com diretório próprio e temporário (não depende do ~/.gnupg do usuário).
GNUPGHOME="$(mktemp -d)"
export GNUPGHOME
parcial=""
# shellcheck disable=SC2329  # chamada pelo trap EXIT
limpar() { rm -rf "$GNUPGHOME"; [[ -n "$parcial" ]] && rm -f "$parcial"; return 0; }
trap limpar EXIT

gpg_opts=(--batch --yes --quiet --pinentry-mode loopback --passphrase-file "$PASS_FILE")
carimbo="$(date +%F_%H%M)"
final="$BACKUP_DIR/diarios/efficio-$carimbo.dump.gpg"
parcial="$final.parcial"

echo "==> Gerando o backup ($carimbo)"
# Superusuário pelo socket local do contêiner: enxerga todas as linhas (o RLS não se aplica a ele).
dc exec -T db pg_dump -U postgres -d efficio --format=custom --compress=6 \
  | gpg "${gpg_opts[@]}" --symmetric --cipher-algo AES256 --compress-algo none --output "$parcial"

echo "==> Conferindo se o backup abre"
lista="$(gpg "${gpg_opts[@]}" --decrypt "$parcial" | dc exec -T db pg_restore --list)"
if ! grep -q 'TABLE DATA public users ' <<<"$lista"; then
  echo "ERRO: o backup não contém a tabela users; descartado." >&2
  exit 1
fi
mv "$parcial" "$final"
parcial=""
echo "    $(du -h "$final" | cut -f1)  $final"

# Domingo: também vira o semanal.
if [[ "$(date +%u)" == "7" ]]; then
  cp -p "$final" "$BACKUP_DIR/semanais/"
fi

# Rotação: mantém os N mais novos de cada pasta (os nomes têm data e hora, ordem alfabética = cronológica).
rotacionar() {
  local pasta="$1" manter="$2"
  find "$pasta" -maxdepth 1 -name 'efficio-*.dump.gpg' -printf '%f\n' | sort -r \
    | tail -n +"$((manter + 1))" | while read -r antigo; do rm -f -- "$pasta/$antigo"; done
}
rotacionar "$BACKUP_DIR/diarios" "$MANTER_DIARIOS"
rotacionar "$BACKUP_DIR/semanais" "$MANTER_SEMANAIS"

status=0
if [[ -n "$RCLONE_REMOTE" ]]; then
  echo "==> Copiando para $RCLONE_REMOTE"
  if rclone copy "$final" "$RCLONE_REMOTE/diarios/" \
     && { [[ "$(date +%u)" != "7" ]] || rclone copy "$final" "$RCLONE_REMOTE/semanais/"; }; then
    # No remoto: apaga diários com mais de RCLONE_KEEP_DAYS dias e semanais com mais de 1 ano.
    rclone delete --min-age "${RCLONE_KEEP_DAYS}d" "$RCLONE_REMOTE/diarios/" || status=1
    rclone delete --min-age 365d "$RCLONE_REMOTE/semanais/" || status=1
  else
    echo "ERRO: a cópia para $RCLONE_REMOTE falhou (o backup local está guardado)." >&2
    status=1
  fi
fi

if (( status == 0 )) && [[ -n "$BACKUP_PING_URL" ]]; then
  curl -fsS --max-time 15 --retry 3 "$BACKUP_PING_URL" >/dev/null || echo "AVISO: monitor não avisado." >&2
fi
echo "==> Backup concluído."
exit "$status"
