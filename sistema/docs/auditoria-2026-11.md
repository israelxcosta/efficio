# Auditoria de segurança e das funções antes de subir (14–15/11/2026)

Cenário: sistema só do escritório, 5 usuários, um VPS Hostinger KVM 1 (Docker Compose: PostgreSQL + API +
Caddy), domínio efficio.com.br. Instalação: [deploy-hostinger.md](deploy-hostinger.md).

Estado verificado no fim: typecheck limpo; testes shared 118, web 825, API 509; builds da API, do web e do
demo; `pnpm audit` sem vulnerabilidades conhecidas; teste no navegador das rotas principais sem erros.

## 1. Segurança — o que foi revisado e corrigido

| Camada | Achado | Gravidade | Situação |
| --- | --- | --- | --- |
| API | Cadastro público aberto | Alta | Corrigido: só por convite em produção (`SIGNUP_ENABLED=false`) |
| API | Verificação em duas etapas opcional | Alta | Corrigido: obrigatória em produção (`REQUIRE_MFA`), com tela de cadastro obrigatório |
| API | Convite inventado revelava se um e-mail tinha conta | Baixa/Média | Corrigido (mesma resposta para qualquer e-mail) |
| API | HSTS da API diferente do Caddy | Baixa | Corrigido; um teste impede divergir |
| API | CNPJ consultado aparecia no log de acessos | Baixa | Corrigido (mascarado) |
| Banco | API e migrações com o mesmo usuário, dono das tabelas | Média | Corrigido: `efficio_owner` (migrações) e `efficio` (API, sem DDL, sem apagar a auditoria) |
| Banco | Migrações nunca testadas como dono comum (cenário do VPS) | Média | Corrigido (teste `vps-db-owner.test.ts`) |
| Banco | Registro de auditoria sem prazo de guarda | Baixa | Corrigido: 24 meses, aviso 30 dias antes e download em CSV |
| Infra | CI nunca rodava (pasta errada) | Alta | Corrigido; roda a cada envio |
| Infra | Produção exigia AWS (KMS, SES) | Bloqueio | Corrigido: chave local validada, SMTP, banco local sem TLS só na rede do Docker |
| Infra | Nada rodava sozinho (limpeza, obrigações do mês) | Média | Corrigido: agendador diário às 03:00 e limpeza do dono depois do backup |
| Web | Site e login prometiam um portal inexistente | Média | Corrigido ("Acesso da equipe", portal "Em breve") |

Revisado sem achado: sessões e tokens (JWT de 15 min, refresh rotativo com detecção de reuso), redefinição de
senha, permissões por rota (incluindo `clients`, `finance`, reajuste em lote), isolamento entre espaços (RLS com
FORCE em 37 tabelas, FKs compostas), SQL dinâmico, anexos (tipos permitidos, download isolado), CSRF/CORS,
mailer SMTP (TLS verificado), logs sem dados pessoais, cabeçalhos e CSP do Caddy, contêineres sem privilégios.

### Riscos aceitos (5 usuários internos)
- Quem souber a senha de alguém que ainda não ativou as duas etapas pode cadastrar o próprio celular: cada
  pessoa ativa no primeiro acesso.
- Limite de tentativas de senha por IP (10/min), não por conta; as duas etapas compensam.
- Excluir a conta do proprietário apaga o escritório: a proteção é o backup diário.
- A chave mestra local não tem rotação: perdê-la perde os dados cifrados. **Guardar cópia fora do servidor.**
- O backup (cifrado) contém nomes, e-mails, valores e descrições em texto claro dentro do arquivo cifrado; as
  senhas dos clientes e documentos vão cifrados e não abrem sem a chave mestra.
- Usuário `efficio` do servidor está no grupo docker (equivale a root).

## 2. Funções — teste de ponta a ponta (10 fluxos)

Nenhum fluxo travou; os números conferem (baixa com juros e multa, honorários, desconto, reajuste, relatórios,
inadimplência, importação de extrato). Problemas encontrados e corrigidos:

| Problema | Gravidade | Situação |
| --- | --- | --- |
| Campo de valor gravava 1000× ao clicar no meio (12345 → R$ 123.000,45) | Alta | Corrigido |
| Honorário vencendo em sábado, domingo ou feriado (perda de desconto e juros indevidos) | Alta | Corrigido: próximo dia útil |
| Um clique desfazia um recebimento, sem confirmação | Média | Corrigido |
| Grupo por regime no meio do mês criava tarefas já vencidas sem aviso | Média | Corrigido: aviso e "Começar no mês que vem" |
| Busca não achava cliente pelo responsável | Média | Corrigido (nome completo; CNPJ completo já funcionava) |
| Auditoria por departamento contava canceladas | Baixa | Corrigido |
| Lista de clientes estourava no celular | Baixa | Corrigido |
| Mensagens em inglês (convite inválido, registro de auditoria) | Baixa | Corrigido |
| Rótulos iguais com critérios diferentes ("Concluídas em novembro") | Baixa | Rótulos diferenciados |

Limitações conhecidas: a busca por CNPJ e por responsável exige o valor completo (os campos são cifrados); um
recorrente que já existe para outro regime não é adiado por "Começar no mês que vem".

## 3. Não verificado aqui (só no servidor)
- `install.sh` completo (firewall, fail2ban, SSH, swap), certificado real do Let's Encrypt e DNS.
- Envio real de e-mail pelo SMTP da Hostinger.
- Cópia do backup para fora (rclone) e o agendamento pelo systemd.
- A imagem final da API (o CI monta; aqui o teste local usou uma equivalente).
- Login real de um colaborador sem a permissão financeira (o bloqueio tem testes de servidor; no navegador foi simulado).
- O aviso de limpeza da auditoria aparecendo no sino (não há registros com quase 24 meses).

## 4. Pendências do dono antes de abrir para a equipe
1. Tornar o repositório privado no GitHub.
2. Preencher os dados reais do escritório no site (`apps/web/src/features/site/site-content.ts`: CRC, WhatsApp,
   e-mail, endereço, horário) e na política de privacidade e termos (razão social, CNPJ, encarregado).
3. Guardar fora do servidor a chave mestra, a senha dos backups e o `.env`.
4. Fazer um teste de restauração depois da primeira subida e configurar a cópia externa do backup.
5. Ativar as duas etapas na Hostinger, no registro.br e no GitHub.
6. Revisar os textos novos do site (coluna "sem portal" da tabela comparativa).

## 5. Fica para depois (não bloqueia subir)
Importação de clientes por planilha; registro de quem deu baixa/excluiu lançamentos (trilha financeira);
envio de documentos com comprovante; OneDrive; cobrança por Pix; painel do cliente (ver [roadmap.md](roadmap.md)).
