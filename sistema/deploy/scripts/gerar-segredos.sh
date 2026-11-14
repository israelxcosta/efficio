#!/usr/bin/env bash
# Cria o deploy/.env do Efficio com segredos aleatórios (uma única vez, antes da primeira subida).
#   cd /opt/efficio/app/sistema/deploy && ./scripts/gerar-segredos.sh
# Nunca sobrescreve um .env existente: trocar a chave mestra deixaria os dados cifrados ilegíveis.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
PASS_FILE="${BACKUP_PASSPHRASE_FILE:-/opt/efficio/segredos/backup.senha}"

if [[ -e "$ENV_FILE" ]]; then
  echo "ERRO: $ENV_FILE já existe. Nada foi alterado." >&2
  echo "      (Para recomeçar do zero numa instalação NOVA e vazia, apague-o antes.)" >&2
  exit 1
fi
command -v openssl >/dev/null || { echo "ERRO: instale o openssl (sudo apt install openssl)." >&2; exit 1; }

# Tudo o que for criado daqui em diante só pode ser lido pelo próprio usuário.
umask 077

# Pergunta com valor padrão (sem terminal, usa o padrão: útil para testes automatizados).
perguntar() {
  local texto="$1" padrao="$2" resposta=""
  if [[ -t 0 ]]; then read -r -p "$texto [$padrao]: " resposta || true; fi
  printf '%s' "${resposta:-$padrao}"
}

DOMAIN="$(perguntar 'Domínio do sistema' "${DOMAIN:-efficio.com.br}")"
EMAIL="$(perguntar 'E-mail do escritório (envia os e-mails do sistema)' "${EMAIL:-contato@$DOMAIN}")"
SMTP_PASSWORD=""
if [[ -t 0 ]]; then
  read -r -s -p "Senha dessa caixa de e-mail na Hostinger (Enter para preencher depois): " SMTP_PASSWORD || true
  echo
fi
if [[ "$SMTP_PASSWORD" == *"'"* ]]; then
  echo "AVISO: a senha tem aspas simples ('); preencha SMTP_PASSWORD depois com: nano $ENV_FILE" >&2
  SMTP_PASSWORD=""
fi
for valor in "$DOMAIN" "$EMAIL"; do
  [[ "$valor" =~ ^[A-Za-z0-9.@_+-]+$ ]] || { echo "ERRO: valor inválido: $valor" >&2; exit 1; }
done

# Segredos: senhas do banco em hexadecimal (seguras dentro da URL), JWT em base64url, chave mestra
# em base64 de exatamente 32 bytes.
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
EFFICIO_DB_PASSWORD="$(openssl rand -hex 32)"
JWT_SECRET="$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n')"
ENCRYPTION_MASTER_KEY="$(openssl rand -base64 32 | tr -d '\n')"

cat >"$ENV_FILE" <<EOF
# Efficio — segredos e configuração do servidor (gerado em $(date '+%d/%m/%Y %H:%M')).
# chmod 600. Nunca envie este arquivo por e-mail/WhatsApp nem o coloque no git.
# Variáveis documentadas em deploy/.env.example.

DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL

POSTGRES_PASSWORD=$POSTGRES_PASSWORD
EFFICIO_DB_PASSWORD=$EFFICIO_DB_PASSWORD

JWT_SECRET=$JWT_SECRET
ENCRYPTION_MASTER_KEY=$ENCRYPTION_MASTER_KEY

SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=$EMAIL
SMTP_PASSWORD='$SMTP_PASSWORD'
MAIL_FROM=$EMAIL
LOG_LEVEL=info

BACKUP_DIR=/opt/efficio/backups
BACKUP_PASSPHRASE_FILE=$PASS_FILE
RCLONE_REMOTE=
RCLONE_KEEP_DAYS=60
BACKUP_PING_URL=
EOF
chmod 600 "$ENV_FILE"

# Senha dos backups: arquivo separado (o backup.sh a lê; a API nunca a vê).
if [[ -e "$PASS_FILE" ]]; then
  echo "Senha de backup já existe em $PASS_FILE (mantida)."
else
  mkdir -p "$(dirname "$PASS_FILE")"
  chmod 700 "$(dirname "$PASS_FILE")"
  openssl rand -base64 32 | tr -d '\n' >"$PASS_FILE"
  chmod 600 "$PASS_FILE"
fi

cat <<EOF

==========================================================================================
  ATENÇÃO — COPIE AGORA AS DUAS LINHAS ABAIXO PARA FORA DO SERVIDOR
  (gerenciador de senhas como Bitwarden/1Password, ou papel guardado em local seguro).
  Sem elas, NENHUM backup pode ser restaurado se o servidor for perdido.

  Chave mestra (ENCRYPTION_MASTER_KEY): $ENCRYPTION_MASTER_KEY
  Senha dos backups:                     $(cat "$PASS_FILE")

  Não as envie por e-mail nem WhatsApp. Depois limpe a tela com: clear
==========================================================================================

Criado: $ENV_FILE (chmod 600)
EOF
if [[ -z "$SMTP_PASSWORD" ]]; then
  echo "Falta a senha do e-mail: nano $ENV_FILE  (linha SMTP_PASSWORD='...')"
fi
