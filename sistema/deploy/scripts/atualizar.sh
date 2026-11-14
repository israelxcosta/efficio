#!/usr/bin/env bash
# Sobe ou atualiza o Efficio no VPS: baixa a versão nova do GitHub (ou usa o pacote ZIP já extraído),
# constrói as imagens, aplica as migrações, reinicia e confere a saúde. Use também na primeira subida.
#   cd /opt/efficio/app/sistema/deploy && ./scripts/atualizar.sh
#   ./scripts/atualizar.sh --sem-git     (reconstrói sem baixar nada, ex.: depois de editar o .env)
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dc() { docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" --project-directory "$DEPLOY_DIR" "$@"; }

# Tudo dentro de main: o bash lê o script inteiro antes de rodar, então o `git pull` pode trocar
# este arquivo sem afetar a execução em andamento.
main() {
  [[ -f "$DEPLOY_DIR/.env" ]] || { echo "ERRO: falta $DEPLOY_DIR/.env (rode ./scripts/gerar-segredos.sh)." >&2; exit 1; }

  # Um update por vez (e nunca junto com outro em andamento).
  exec 9>/run/lock/efficio-atualizar.lock
  flock -n 9 || { echo "ERRO: já há uma atualização em andamento." >&2; exit 1; }

  # Instalação pelo GitHub (git clone) ou por pacote ZIP enviado ao servidor (sem .git: o código novo
  # já foi extraído por cima, então não há nada para baixar).
  if git -C "$DEPLOY_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if [[ "${1:-}" != "--sem-git" ]]; then
      echo "==> Baixando a versão nova (git pull)"
      # --ff-only: nunca mistura alterações locais com as do GitHub; se falhar, nada muda.
      git -C "$DEPLOY_DIR" pull --ff-only
    fi
    echo "==> Versão: $(git -C "$DEPLOY_DIR" log -1 --format='%h %cd %s' --date=format:'%d/%m/%Y %H:%M')"
  else
    versao="$DEPLOY_DIR/../VERSAO.txt"
    echo "==> Instalação por pacote ZIP (sem git). Versão: $( [[ -f "$versao" ]] && head -n 1 "$versao" || echo 'desconhecida')"
  fi

  echo "==> Validando a configuração"
  dc config --quiet

  # Uma imagem por vez: cabe na memória do KVM 1 sem parar o sistema que está no ar.
  echo "==> Construindo a API (alguns minutos)"
  dc build api
  echo "==> Construindo o site + Caddy (alguns minutos)"
  dc build caddy

  echo "==> Aplicando migrações e reiniciando"
  if ! dc up -d --remove-orphans; then
    echo "ERRO ao subir. Últimas linhas dos registros:" >&2
    dc logs --no-color --tail 40 migrate api >&2 || true
    exit 1
  fi

  echo "==> Aguardando a API ficar saudável (até 3 min)"
  api_id="$(dc ps -q api)"
  estado="desconhecido"
  for _ in $(seq 1 36); do
    estado="$(docker inspect -f '{{.State.Health.Status}}' "$api_id" 2>/dev/null || echo desconhecido)"
    [[ "$estado" == "healthy" ]] && break
    sleep 5
  done
  if [[ "$estado" != "healthy" ]]; then
    echo "ERRO: a API não ficou saudável (estado: $estado). Registros:" >&2
    dc logs --no-color --tail 60 api >&2 || true
    exit 1
  fi

  # Teste de fora para dentro (DNS + certificado + Caddy + API). Na primeira subida o certificado pode
  # levar 1-2 minutos; se o DNS ainda não propagou, só avisa.
  dominio="$(grep -E '^DOMAIN=' "$DEPLOY_DIR/.env" | head -n1 | cut -d= -f2- | tr -d "'\"")"
  if curl -fsS --max-time 20 --retry 6 --retry-delay 10 --retry-all-errors \
      "https://$dominio/api/health/ready" >/dev/null 2>&1; then
    echo "==> OK: https://$dominio responde (HTTPS válido)."
  else
    echo "AVISO: https://$dominio ainda não respondeu. Confira o DNS e: docker compose -f docker-compose.prod.yml logs caddy"
  fi

  # Libera espaço: imagens antigas sem uso e cache de build com mais de 7 dias.
  docker image prune -f >/dev/null
  docker builder prune -f --filter until=168h >/dev/null || true

  dc ps
}

main "$@"
exit $?
