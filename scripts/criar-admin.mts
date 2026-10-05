// Cria (ou redefine a senha de) um usuário administrador.
// Uso: npm run admin -- --email voce@empresa.com.br --nome "Seu Nome"
// A senha é lida da variável ADMIN_SENHA ou digitada no terminal.
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { gerarHashSenha } from "../src/lib/auth/password";
import { validarSenhaForte } from "../src/lib/validacao/senha";

const { values } = parseArgs({
  options: { email: { type: "string" }, nome: { type: "string" } },
});
const email = values.email?.trim().toLowerCase();
const nome = values.nome?.trim() || "Administrador";
if (!email) throw new Error("Informe --email.");

let senha = process.env.ADMIN_SENHA;
if (!senha) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  senha = await rl.question("Senha (mín. 12 caracteres): ");
  rl.close();
}
const problema = validarSenhaForte(senha);
if (problema) throw new Error(problema);

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const senhaHash = await gerarHashSenha(senha);
await sql`
  insert into usuarios (nome, email, senha_hash, perfil)
  values (${nome}, ${email}, ${senhaHash}, 'admin')
  on conflict (lower(email)) do update
    set senha_hash = excluded.senha_hash, perfil = 'admin', ativo = true,
        tentativas_falhas = 0, bloqueado_ate = null
`;
await sql.end();
console.log(`Administrador ${email} pronto.`);
