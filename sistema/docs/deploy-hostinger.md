# Instalação no VPS Hostinger KVM 1 (produção do escritório)

Guia passo a passo para colocar o Efficio no ar em **https://efficio.com.br**, num único VPS da
Hostinger, para os 5 usuários do escritório. Cada passo tem o comando para copiar e uma forma de
conferir se deu certo. Reserve cerca de 2 horas na primeira vez.

```
Internet ──► Caddy (HTTPS automático, site e /api) ──► API (Node) ──► PostgreSQL
             portas 80/443                              rede interna   rede interna, sem porta aberta
```

Tudo roda em Docker (`sistema/deploy/docker-compose.prod.yml`): o banco não é acessível de fora, a
API e o Caddy rodam sem privilégios de administrador e com o disco somente leitura, os anexos ficam
dentro do banco e o backup diário sai cifrado. Os arquivos do kit estão em `sistema/deploy/`.

> Convenções: linhas que começam com `PS>` são digitadas no **PowerShell do seu computador**; as
> demais, **no servidor** (dentro da conexão SSH). Troque `IP-DO-VPS` pelo IP mostrado no painel da
> Hostinger.

## 1. O que você precisa antes

- VPS **KVM 1** com **Ubuntu 24.04 LTS** (sistema limpo; reinstale pelo painel se tiver outro).
- Acesso ao **registro.br** (domínio `efficio.com.br`), à conta da **Hostinger** e ao **GitHub**
  (repositório privado `israelxcosta/efficio`).
- A caixa de e-mail do escritório na Hostinger (ex.: `contato@efficio.com.br`) e a senha dela.
- Um **gerenciador de senhas** (Bitwarden, 1Password…) ou um caderno guardado em local seguro.
- Ative a **verificação em duas etapas** na Hostinger, no registro.br e no GitHub: quem entra
  nessas contas controla o servidor e o domínio.

## 2. Chave SSH (entrar no servidor sem senha)

1. No seu computador (Windows 10/11), abra o PowerShell e crie a chave (Enter em tudo; se pedir
   uma frase-senha, crie uma e guarde):
   ```
   PS> ssh-keygen -t ed25519 -C "efficio-meu-computador"
   PS> Get-Content $HOME\.ssh\id_ed25519.pub
   ```
2. Copie a linha mostrada (começa com `ssh-ed25519`). No painel da Hostinger, abra o VPS, procure
   **Chaves SSH** e adicione essa chave (ou informe-a ao reinstalar o Ubuntu 24.04).
3. Teste: `PS> ssh root@IP-DO-VPS` deve entrar **sem pedir a senha do servidor**.

A chave privada (`id_ed25519`, sem `.pub`) nunca sai do seu computador.

## 3. DNS no registro.br

No registro.br, abra `efficio.com.br` → **DNS** → editar zona (modo avançado):

| Tipo | Nome | Valor |
|------|------|-------|
| A | (vazio / `efficio.com.br`) | IP-DO-VPS |
| A | `www` | IP-DO-VPS |

- **Apague** qualquer outro registro A, AAAA ou CNAME de `efficio.com.br` e `www` que aponte para
  outro lugar (hospedagem antiga, "parking").
- **Não crie AAAA (IPv6)** por enquanto: com o Docker padrão, acessos por IPv6 chegariam à API sem o
  IP real da pessoa, e a proteção contra tentativas de senha (limite por IP) ficaria cega.
- **Não mexa** nos registros de e-mail: MX, TXT (SPF, DKIM, DMARC) e CNAMEs como `autodiscover`
  da Hostinger continuam como estão.
- Opcional, se o painel oferecer: `CAA` em `efficio.com.br` com `0 issue "letsencrypt.org"`.

Conferir (pode levar de minutos a algumas horas): `PS> nslookup efficio.com.br` e
`PS> nslookup www.efficio.com.br` mostram o IP do VPS.

## 4. Preparar o servidor

Entre como root (`PS> ssh root@IP-DO-VPS`) e rode, um bloco por vez:

```bash
# 4.1 Git, usuário "efficio" e a pasta do sistema
apt-get update && apt-get install -y git
id efficio >/dev/null 2>&1 || adduser --disabled-password --gecos "Efficio" efficio
install -d -o efficio -g efficio -m 750 /opt/efficio
install -d -o efficio -g efficio -m 700 /home/efficio/.ssh

# 4.2 Chave de deploy (só leitura) para o servidor baixar o código do GitHub
sudo -u efficio ssh-keygen -t ed25519 -N "" -C "efficio-vps-deploy" -f /home/efficio/.ssh/id_ed25519
cat /home/efficio/.ssh/id_ed25519.pub
```

No GitHub: repositório → **Settings → Deploy keys → Add deploy key**. Título `VPS Hostinger`, cole a
linha mostrada e **deixe desmarcado "Allow write access"**.

```bash
# 4.3 Baixar o código. Na pergunta "Are you sure you want to continue connecting", confira se a
# impressão digital é SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU (a oficial do GitHub) e digite yes.
sudo -u efficio git clone git@github.com:israelxcosta/efficio.git /opt/efficio/app

# 4.4 Preparação completa (atualizações automáticas, firewall, fail2ban, Docker, swap, SSH seguro)
bash /opt/efficio/app/sistema/deploy/scripts/install.sh
```

O `install.sh` pede uma senha para o usuário `efficio` (é a senha do `sudo`; guarde-a). No fim ele
**desliga o login como root e por senha** no SSH.

**Antes de fechar a janela do root**, abra outro PowerShell e teste: `PS> ssh efficio@IP-DO-VPS`.
Entrou? Então feche a janela antiga. A partir daqui use sempre `ssh efficio@IP-DO-VPS`.

Conferir: `sudo ufw status` mostra só 22, 80 e 443; `docker --version` responde;
`ssh root@IP-DO-VPS` agora é recusado.

## 5. Criar os segredos

```bash
cd /opt/efficio/app/sistema/deploy
./scripts/gerar-segredos.sh
```

O script pergunta o domínio (Enter = `efficio.com.br`), o e-mail do escritório e a senha dessa caixa
de e-mail, e cria o arquivo `.env` (só o usuário `efficio` consegue ler).

**Copie para o gerenciador de senhas as duas linhas do quadro "ATENÇÃO"** (chave mestra e senha dos
backups) e, de preferência, o `.env` inteiro (`cat .env`). Sem a chave mestra **e** a senha dos
backups, nenhum backup pode ser restaurado se o servidor for perdido. Depois limpe a tela: `clear`.

## 6. E-mail (SMTP da Hostinger)

O sistema envia convites, redefinição de senha e avisos pela caixa do escritório:
`smtp.hostinger.com`, porta `465`, SSL. Confira/edite com `nano .env`:

```
SMTP_USER=contato@efficio.com.br
SMTP_PASSWORD='a-senha-da-caixa'      # entre aspas simples; não use ' dentro da senha
MAIL_FROM=contato@efficio.com.br
```

(`Ctrl+O`, Enter, `Ctrl+X` para salvar e sair.) Use uma caixa que exista na Hostinger; o remetente
precisa ser a mesma caixa (ou um alias dela), senão os e-mails caem no spam ou são recusados.

## 7. Subir o sistema

```bash
cd /opt/efficio/app/sistema/deploy
./scripts/atualizar.sh
```

Na primeira vez leva de 5 a 15 minutos (constrói as imagens no próprio VPS). O script cria o banco,
aplica as migrações, sobe tudo e confere a saúde. Termina com `OK: https://efficio.com.br responde`
e a lista dos serviços `db`, `api` e `caddy` como `healthy` (o `migrate` aparece como `Exited (0)`,
que é o normal: ele roda e termina).

Conferir no navegador: `https://efficio.com.br` abre a tela de login com cadeado;
`http://efficio.com.br` e `https://www.efficio.com.br` redirecionam para `https://efficio.com.br`.

## 8. Proprietário, autenticação em duas etapas e convites

```bash
cd /opt/efficio/app/sistema/deploy
docker compose -f docker-compose.prod.yml exec api node dist/bootstrap-owner.js \
  --email voce@efficio.com.br --name "Seu Nome" --workspace "Nome do Escritório"
```

Abra **em até 30 minutos** o link mostrado e defina a senha (link expirou? rode de novo com
`--reset-link` no lugar de `--name` e `--workspace`). No primeiro acesso o sistema exige a
**verificação em duas etapas**: leia o QR code com o Google Authenticator ou Microsoft Authenticator
no celular (e guarde os códigos de recuperação, se forem mostrados).

Depois, em **Configurações → Convidar pessoa**, convide os outros 4 usuários pelo e-mail de cada um.
Eles recebem o convite pelo e-mail do escritório e também configuram as duas etapas. O cadastro
público fica desligado: só entra quem for convidado.

## 9. Backup diário (e teste de restauração)

O backup roda todo dia às **02:30**: copia o banco inteiro (inclusive anexos), cifra com a senha dos
backups e guarda **14 diários + 8 semanais** em `/opt/efficio/backups`.

```bash
# 9.1 Ligar o agendamento e fazer o primeiro backup agora
sudo systemctl enable --now efficio-backup.timer
sudo systemctl start efficio-backup.service
journalctl -u efficio-backup --since today --no-pager | tail -5     # deve terminar em "Backup concluído."
systemctl list-timers efficio-backup.timer                          # próxima execução

# 9.2 TESTE DE RESTAURAÇÃO (obrigatório agora e depois uma vez por mês)
cd /opt/efficio/app/sistema/deploy
./scripts/restaurar.sh --teste
```

O teste restaura o backup mais recente num banco separado, mostra quantos usuários, clientes e
lançamentos ele tem e apaga o banco de teste. O sistema em uso não é tocado.

### 9.3 Cópia fora do servidor (recomendado)

Um backup que só existe no próprio VPS some junto com ele. Use o **Google Drive** (preferível: o
acesso pode ficar restrito à pasta de backups) ou o OneDrive:

1. No seu computador: `PS> winget install Rclone.Rclone` (feche e abra o PowerShell depois).
2. No servidor: `rclone config` → `n` (novo) → nome `gdrive` (ou `onedrive`) → tipo `drive`
   (ou `onedrive`) → `client_id`/`client_secret` em branco → no Google Drive escolha o escopo
   **`drive.file`** (o rclone só enxerga os arquivos que ele mesmo criou) → "Use web browser…?"
   responda **`n`**.
3. O servidor mostra um comando `rclone authorize "drive" "..."`: rode-o **no PowerShell do seu
   computador**, faça login no navegador, copie o código que aparecer e cole no servidor. No
   OneDrive, escolha "OneDrive Personal". Finalize com `y` e `q`.
4. Teste: `rclone mkdir gdrive:Efficio-backups && rclone lsd gdrive:`.
5. No `.env`: `RCLONE_REMOTE=gdrive:Efficio-backups`. Rode `sudo systemctl start efficio-backup.service`
   e confira se o arquivo apareceu no Drive. Cópias com mais de 60 dias são apagadas do Drive
   (`RCLONE_KEEP_DAYS`); semanais ficam 1 ano.

Atenção: a autorização do OneDrive dá acesso a **todo** o OneDrive da conta. Se usar o OneDrive,
prefira uma conta Microsoft só para os backups. Os arquivos saem cifrados; sem a senha dos backups
ninguém os lê.

### 9.4 Camadas extras

- **Backups semanais do painel Hostinger** (do disco inteiro do VPS): mantenha ativos. São uma
  camada a mais, não substituem os diários (são semanais e ficam na própria Hostinger).
- **Aviso se o backup falhar** (grátis): crie um "check" diário em healthchecks.io e coloque a URL de
  ping em `BACKUP_PING_URL` no `.env`. Se um dia o backup não rodar, você recebe um e-mail.

## 10. Monitoramento (grátis)

No **UptimeRobot** (uptimerobot.com), crie um monitor HTTP(s) para
`https://efficio.com.br/api/health/ready` a cada 5 minutos, com alerta por e-mail (e app no
celular). Esse endereço testa o site, o certificado, a API e o banco de uma vez. Ative também o
aviso de vencimento de certificado (o Caddy renova sozinho; o aviso só dispara se algo travar).

## 11. Atualizar o sistema

Quando houver versão nova no GitHub (`main`):

```bash
cd /opt/efficio/app/sistema/deploy
./scripts/atualizar.sh
```

Prefira fora do expediente. As migrações do banco são aplicadas automaticamente. O sistema fica fora
do ar só alguns segundos no reinício da API. Se algo falhar, o script mostra os registros e o
sistema anterior continua rodando quando o erro é no build.

As atualizações de segurança do Ubuntu são automáticas (reinício automático às 04:30 quando o
kernel exigir). O Docker e as imagens base (PostgreSQL, Node, Caddy) são atualizados pelo
repositório (Dependabot) e chegam no próximo `atualizar.sh`.

## 12. Checklist final de segurança

- [ ] `ssh root@IP-DO-VPS` é recusado; `ssh efficio@IP-DO-VPS` entra só com a chave.
- [ ] `sudo ufw status` mostra apenas 22, 80 e 443.
- [ ] `PS> Test-NetConnection IP-DO-VPS -Port 5432` → `TcpTestSucceeded : False` (banco fechado).
- [ ] `docker compose -f docker-compose.prod.yml ps`: db, api e caddy `healthy`; só o caddy com portas.
- [ ] https://efficio.com.br com cadeado; http e www redirecionam. Notas **A** em
      securityheaders.com e ssllabs.com/ssltest.
- [ ] Os 5 usuários entram com senha **e** verificação em duas etapas; ninguém consegue se
      cadastrar sem convite.
- [ ] Chave mestra, senha dos backups e o `.env` guardados **fora** do servidor.
- [ ] Backup de hoje existe, `restaurar.sh --teste` passou e a cópia aparece no Drive/OneDrive.
- [ ] UptimeRobot alertando; `sudo fail2ban-client status sshd` responde;
      `systemctl is-active unattended-upgrades` = `active`.
- [ ] Verificação em duas etapas ativa na Hostinger, no registro.br e no GitHub.

## 13. Se o sistema cair

1. **Ver o estado** (como `efficio`, em `/opt/efficio/app/sistema/deploy`):
   ```bash
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs --tail 100 api      # ou caddy, db
   free -h; df -h /
   ```
2. **Reiniciar tudo**: `docker compose -f docker-compose.prod.yml up -d` (ou `sudo reboot`; tudo volta
   sozinho depois do reinício).
3. **Sem cadeado / certificado**: confira o DNS (passo 3) e se as portas 80/443 estão liberadas;
   veja `logs caddy`.
4. **Disco cheio**: `docker system df` e `docker image prune -a` (apaga imagens sem uso; o sistema
   continua). Backups antigos já são apagados sozinhos.
5. **Atualização com problema**: volte para a versão anterior:
   `git -C /opt/efficio/app log --oneline -5`, depois `git -C /opt/efficio/app checkout <código>` e
   `./scripts/atualizar.sh --sem-git`. Se a versão nova já tinha mudado o banco, restaure o backup
   da noite anterior (item 7). Para voltar ao normal depois: `git -C /opt/efficio/app checkout main`.
6. **E-mails não chegam**: confira `SMTP_*` no `.env`, rode `./scripts/atualizar.sh --sem-git` e veja
   `logs api`. Teste a caixa no webmail da Hostinger.
7. **Restaurar um backup** (dados apagados por engano, banco corrompido):
   `./scripts/restaurar.sh` (mais recente) ou `./scripts/restaurar.sh /opt/efficio/backups/diarios/<arquivo>`.
   Ele restaura num banco novo, mostra as contagens e só troca o banco em uso se você digitar
   `RESTAURAR`; o banco anterior fica guardado.
8. **Servidor perdido** (VPS apagado/corrompido): crie/reinstale o VPS com Ubuntu 24.04 e refaça os
   passos 2 a 4. Em vez do passo 5, recrie o `.env` com o conteúdo guardado
   (`nano /opt/efficio/app/sistema/deploy/.env`, depois `chmod 600 .env`) e grave a senha dos
   backups em `/opt/efficio/segredos/backup.senha` (`chmod 600`). Rode `./scripts/atualizar.sh`,
   traga o backup (`rclone copy gdrive:Efficio-backups/diarios/<arquivo> /opt/efficio/backups/diarios/`)
   e rode `./scripts/restaurar.sh`. A **chave mestra precisa ser a mesma** da época do backup.

## Referência rápida

| Arquivo | Para quê |
|---------|----------|
| `deploy/docker-compose.prod.yml` | serviços db, migrate, api e caddy, redes e limites de memória |
| `deploy/web.Dockerfile` + `deploy/Caddyfile` | imagem do Caddy com o site; HTTPS, cabeçalhos de segurança (CSP gerada do build), cache, proxy `/api` |
| `deploy/db-init/10-efficio.sh` | cria o usuário `efficio` (sem superusuário) e o papel do RLS na 1ª subida |
| `deploy/scripts/*.sh` | `install`, `gerar-segredos`, `atualizar`, `backup`, `restaurar` |
| `deploy/systemd/efficio-backup.*` | agendamento do backup às 02:30 |
| `deploy/.env.example` | todas as variáveis do `.env`, comentadas |

Decisões de segurança deste formato (vs. `docs/deploy-aws.md`): a chave mestra fica no `.env` do
servidor (`KEY_PROVIDER=local`) em vez do KMS, por isso a cópia offline é obrigatória; o banco fala
sem TLS apenas dentro da rede interna do Docker (`DATABASE_SSL=disable`, aceito só com host `db`);
a API usa um login sem superusuário e as tabelas financeiras continuam sob RLS; o build acontece no
próprio VPS (o CI valida o compose, os scripts e a imagem do site a cada push).
