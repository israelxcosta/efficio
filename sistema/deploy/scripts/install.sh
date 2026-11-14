#!/usr/bin/env bash
# Preparação do VPS (uma vez, num Ubuntu 24.04 LTS limpo), como root:
#   bash /opt/efficio/app/sistema/deploy/scripts/install.sh
# Pode ser executado de novo sem estragar nada (cada passo confere se já foi feito).
#
# O que faz: fuso de Brasília; atualizações automáticas de segurança; swap de 2 GB; Docker Engine +
# compose pelo repositório oficial; firewall (só 22, 80 e 443); fail2ban no SSH; usuário "efficio"
# (dono de /opt/efficio, roda o sistema e os backups); SSH só com chave, sem root e sem senha;
# instala o agendamento do backup (ativado depois, no passo do guia).
set -euo pipefail

USUARIO=efficio
BASE=/opt/efficio
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Impressão digital oficial da chave de assinatura do repositório Docker (docs.docker.com).
DOCKER_GPG_FPR=9DC858229FC7DD38854AE2D88D81803C0EBFCD88
export DEBIAN_FRONTEND=noninteractive

passo() { printf '\n==> %s\n' "$*"; }

[[ "$(id -u)" == 0 ]] || { echo "ERRO: rode como root (sudo bash $0)." >&2; exit 1; }
# shellcheck disable=SC1091
. /etc/os-release
if [[ "${ID:-}" != ubuntu || "${VERSION_ID:-}" != 24.04 ]]; then
  echo "AVISO: feito para Ubuntu 24.04; este é ${PRETTY_NAME:-desconhecido}." >&2
  read -r -p "Continuar mesmo assim? [s/N] " r || true
  [[ "${r:-}" =~ ^[sS]$ ]] || exit 1
fi

passo "Fuso horário de Brasília"
timedatectl set-timezone America/Sao_Paulo

passo "Atualizando o sistema (alguns minutos)"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold full-upgrade
apt-get -y -q install ca-certificates curl gnupg git openssl ufw fail2ban python3-systemd \
  unattended-upgrades rclone

passo "Atualizações automáticas de segurança (reinicia sozinho às 04:30 se precisar)"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat >/etc/apt/apt.conf.d/52efficio-unattended <<'EOF'
// Efficio: aplica só atualizações de segurança (padrão do Ubuntu) e reinicia de madrugada quando
// o kernel exigir (depois do backup das 02:30). Os contêineres voltam sozinhos (restart: unless-stopped).
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF
systemctl enable --now unattended-upgrades >/dev/null

passo "Swap de 2 GB (folga de memória para o build)"
if [[ -z "$(swapon --show --noheadings)" ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
else
  echo "    já existe swap: $(swapon --show --noheadings | awk '{print $1, $3}' | tr '\n' ' ')"
fi
echo 'vm.swappiness=10' >/etc/sysctl.d/90-efficio.conf
sysctl -q --system

passo "Docker Engine + compose (repositório oficial da Docker)"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  # Pacotes não oficiais que conflitam com o Docker oficial.
  for p in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
    apt-get -y -q remove "$p" >/dev/null 2>&1 || true
  done
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  fpr="$(gpg --show-keys --with-colons /etc/apt/keyrings/docker.asc | awk -F: '/^fpr/ {print $10; exit}')"
  if [[ "$fpr" != "$DOCKER_GPG_FPR" ]]; then
    rm -f /etc/apt/keyrings/docker.asc
    echo "ERRO: a chave baixada da Docker não confere ($fpr). Nada foi instalado." >&2
    exit 1
  fi
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get -y -q install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Registros com tamanho limitado (não enchem o disco), contêineres seguem rodando durante a
# atualização do próprio Docker e nenhum processo de contêiner ganha privilégios novos.
mkdir -p /etc/docker
cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true,
  "no-new-privileges": true
}
EOF
systemctl enable docker >/dev/null
systemctl restart docker

passo "Firewall (ufw): só SSH (22), HTTP (80) e HTTPS (443)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw limit 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP (redireciona para HTTPS)' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
ufw status verbose | sed 's/^/    /'

passo "fail2ban no SSH (bloqueia 1 h quem errar 5 vezes em 10 min)"
cat >/etc/fail2ban/jail.d/efficio-sshd.local <<'EOF'
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
systemctl enable fail2ban >/dev/null
systemctl restart fail2ban

passo "Usuário $USUARIO e pasta $BASE"
if ! id "$USUARIO" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "Efficio" "$USUARIO" >/dev/null
fi
# O grupo docker equivale a acesso de administrador: só este usuário entra nele.
usermod -aG docker,sudo "$USUARIO"
install -d -o "$USUARIO" -g "$USUARIO" -m 750 "$BASE"
install -d -o "$USUARIO" -g "$USUARIO" -m 700 "$BASE/backups" "$BASE/segredos"
# Chaves SSH de quem já entra como root passam a valer para o usuário efficio.
install -d -o "$USUARIO" -g "$USUARIO" -m 700 "/home/$USUARIO/.ssh"
if [[ -s /root/.ssh/authorized_keys ]]; then
  touch "/home/$USUARIO/.ssh/authorized_keys"
  while read -r linha; do
    [[ -z "$linha" || "$linha" == \#* ]] && continue
    grep -qxF "$linha" "/home/$USUARIO/.ssh/authorized_keys" || echo "$linha" >>"/home/$USUARIO/.ssh/authorized_keys"
  done </root/.ssh/authorized_keys
fi
[[ -f "/home/$USUARIO/.ssh/authorized_keys" ]] && chmod 600 "/home/$USUARIO/.ssh/authorized_keys"
chown -R "$USUARIO:$USUARIO" "/home/$USUARIO/.ssh"
# Senha local do efficio: só para o sudo (o SSH não aceita senha).
if [[ "$(passwd -S "$USUARIO" | awk '{print $2}')" != "P" ]]; then
  if [[ -t 0 ]]; then
    echo "    Crie uma senha para o usuário $USUARIO (usada só no sudo; guarde no gerenciador de senhas):"
    passwd "$USUARIO"
  else
    echo "AVISO: sem terminal; defina depois a senha do sudo com: passwd $USUARIO" >&2
  fi
fi

passo "SSH: só chave, sem login de root e sem senha"
if [[ -s "/home/$USUARIO/.ssh/authorized_keys" ]]; then
  # 00-: lido antes de outros arquivos (ex.: 50-cloud-init.conf); no sshd vale o primeiro valor.
  cat >/etc/ssh/sshd_config.d/00-efficio.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
AllowUsers $USUARIO
EOF
  sshd -t
  systemctl reload ssh || systemctl restart ssh
  echo "    IMPORTANTE: NÃO feche esta janela. Abra OUTRA e teste: ssh $USUARIO@<IP do VPS>"
else
  echo "AVISO: $USUARIO ainda não tem chave SSH; o SSH NÃO foi travado (evita perder o acesso)." >&2
  echo "       Coloque a chave em /root/.ssh/authorized_keys e rode este script de novo." >&2
fi

passo "Agendamento do backup (ativado no passo de backup do guia)"
install -m 0644 "$DEPLOY_DIR/systemd/efficio-backup.service" "$DEPLOY_DIR/systemd/efficio-backup.timer" \
  /etc/systemd/system/
systemctl daemon-reload

passo "Pronto"
echo "    Docker: $(docker --version)"
echo "    Próximo passo do guia: entrar como $USUARIO e rodar ./scripts/gerar-segredos.sh"
