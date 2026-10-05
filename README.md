# Efficio Ponto

Sistema de gestão de jornada e cálculo de ponto: cadastros de empresas, horários, empregados, feriados e faixas de horas extras, importação dos arquivos do relógio de ponto e espelho mensal calculado conforme a CLT.

## Tecnologias

| Camada | Escolha |
|---|---|
| Linguagem | TypeScript (modo estrito) |
| Aplicação | Next.js 16 (App Router, Server Components e Server Actions) e React 19 |
| Banco de dados | PostgreSQL 16 com Drizzle ORM e migrations versionadas em `drizzle/` |
| Validação | Zod, sempre no servidor |
| Interface | Tailwind CSS 4 |
| Testes | Vitest |

## Como rodar

Requisitos: Node.js 20.9 ou mais novo e PostgreSQL 16 (ou Docker).

```bash
npm install
cp .env.example .env              # ajuste DATABASE_URL se precisar
docker compose up -d db           # sobe o PostgreSQL local (ou use um seu)
npm run db:migrate                # cria as tabelas
npm run admin -- --email voce@efficio.com.br --nome "Seu Nome"   # pede a senha
npm run dev                       # http://localhost:3000
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm test` | Testes do motor de cálculo, leitores de arquivo, validações e consulta de CNPJ |
| `npm run lint` / `npm run typecheck` | Verificações de código |
| `npm run build` e `npm start` | Build e servidor de produção |
| `npm run db:generate` | Gera uma nova migration depois de alterar `src/db/schema.ts` |

Para produção há um `Dockerfile` (imagem `standalone`, usuário sem privilégios). Rode `npm run db:migrate` com a `DATABASE_URL` de produção antes de cada nova versão. O GitHub Actions (`.github/workflows/ci.yml`) roda lint, typecheck, testes, migrations e build a cada pull request.

## Funcionalidades

**Cadastros**
- **Empresas:** dados básicos e endereço importados da Receita Federal pelo CNPJ (BrasilAPI, com CNPJ.ws como alternativa). Aceita o CNPJ alfanumérico, em vigor desde julho de 2026.
- **Horários semanais:** entrada, intervalo, retorno e saída por dia, com checkbox de folga e jornadas que viram a meia-noite.
- **Empregados:** dados pessoais, CPF e PIS validados, admissão, demissão, cargo e o horário escolhido entre os cadastrados na empresa.
- **Feriados:** nacionais, estaduais, municipais ou de uma empresa. Os nacionais do ano são gerados com um clique, com a Páscoa calculada.
- **Faixas de horas extras:** tabelas como "primeiras 6h a 50%, até 15h a 75%, acima a 100%", com contagem diária ou acumulada no mês e faixas separadas para dias úteis e para folgas e feriados.

**Ponto**
- **Importação** de AFD (Portarias 1.510/2009 e MTP 671/2021) e de planilhas CSV. As marcações são associadas ao empregado por CPF, PIS ou matrícula, sem duplicar quando o arquivo é reenviado.
- **Lançamentos:** espelho mensal com o cálculo de cada dia. É possível incluir e corrigir marcações com justificativa obrigatória; as marcações originais do relógio nunca são apagadas, só desconsideradas.

**Configurações**
- Tolerância de 10 minutos diários (checkbox).
- Intervalo reduzido por norma coletiva.
- Prorrogação da hora noturna.
- Tabela de faixas padrão.

## Regras de cálculo

| Regra | Base legal |
|---|---|
| Horas extras: o que passa da jornada prevista no dia; trabalho em folga ou feriado conta inteiro como extra de descanso | Art. 59 CLT, Súmula 146 TST |
| Tolerância: diferença de até 10 min no dia não conta; acima disso conta tudo | Art. 58, §1º CLT, Súmula 366 TST |
| Hora noturna urbana das 22h às 5h, com hora de 52min30s, e horas após as 5h na jornada noturna prorrogada | Art. 73 CLT, Súmula 60, II TST |
| Intervalo intrajornada mínimo de 1h acima de 6h (30 min por norma coletiva) e 15 min de 4h a 6h; o tempo suprimido é apurado | Art. 71 e 611-A, III CLT |
| Interjornada mínima de 11h entre jornadas | Art. 66 CLT |
| Faltas e atrasos em dias úteis sem marcação ou com jornada menor | — |

Uma jornada pertence ao dia da primeira marcação. Depois de uma saída, um intervalo sem marcações maior que o configurado (6h por padrão) inicia uma nova jornada.

## Segurança

- **Senhas:** Argon2id com os parâmetros da OWASP e mínimo de 12 caracteres (NIST 800-63B).
- **Sessões:** ficam no banco, que guarda só o hash SHA-256 do token. O cookie é `httpOnly`, `Secure` e `SameSite=Lax`, com expiração deslizante. Sessões são encerradas ao redefinir a senha ou desativar o usuário.
- **Força bruta:** limite por IP (20 falhas em 15 min) e bloqueio da conta (5 falhas). O tempo de resposta não revela se o e-mail existe.
- **Autorização:** verificada no servidor em cada página e em cada Server Action. Há dois perfis: administrador e operador.
- **Cabeçalhos HTTP:** CSP com nonce por requisição, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`.
- **Banco:** consultas parametrizadas pelo ORM e restrições de unicidade e integridade.
- **Auditoria:** login, cadastros, importações e ajustes de ponto ficam registrados com usuário, IP e dados.
- **Uploads:** limitados a 8 MB e às extensões `.txt`, `.afd` e `.csv`. O CNPJ do AFD é conferido com a empresa escolhida.
