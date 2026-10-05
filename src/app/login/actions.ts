"use server";

import { and, count, eq, gt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { tentativasLogin, usuarios } from "@/db/schema";
import { obterHashFicticio, verificarSenha } from "@/lib/auth/password";
import type { EstadoForm } from "@/lib/form";
import { registrarAuditoria } from "@/server/dal";
import { criarSessao, encerrarSessao, ipRequisicao, validarSessao } from "@/server/sessao";

const JANELA_MS = 15 * 60_000;
const MAX_FALHAS_IP = 20;
const MAX_FALHAS_CONTA = 5;

const esquema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254),
  senha: z.string().min(1, "Informe a senha.").max(128),
  de: z.string().optional(),
});

const MENSAGEM_INVALIDO = "E-mail ou senha incorretos.";
const MENSAGEM_BLOQUEIO = "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.";

export async function entrar(_: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const dados = esquema.safeParse(Object.fromEntries(fd));
  if (!dados.success) return { ok: false, mensagem: "Informe e-mail e senha." };
  const { email, senha, de } = dados.data;
  const ip = await ipRequisicao();
  const desde = new Date(Date.now() - JANELA_MS);

  const [{ falhas }] = await db
    .select({ falhas: count() })
    .from(tentativasLogin)
    .where(and(eq(tentativasLogin.ip, ip), eq(tentativasLogin.sucesso, false), gt(tentativasLogin.criadoEm, desde)));
  if (falhas >= MAX_FALHAS_IP) return { ok: false, mensagem: MENSAGEM_BLOQUEIO, valores: { email } };

  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(sql`lower(${usuarios.email}) = ${email}`)
    .limit(1);

  // Sempre verifica um hash para que o tempo de resposta não revele se o e-mail existe.
  const senhaOk = await verificarSenha(usuario?.senhaHash ?? (await obterHashFicticio()), senha);
  const bloqueado = usuario?.bloqueadoAte && usuario.bloqueadoAte > new Date();

  if (!usuario || !usuario.ativo || !senhaOk || bloqueado) {
    await db.insert(tentativasLogin).values({ ip, email, sucesso: false });
    if (usuario && !bloqueado && !senhaOk) {
      const tentativas = usuario.tentativasFalhas + 1;
      await db
        .update(usuarios)
        .set(
          tentativas >= MAX_FALHAS_CONTA
            ? { tentativasFalhas: 0, bloqueadoAte: new Date(Date.now() + JANELA_MS) }
            : { tentativasFalhas: tentativas },
        )
        .where(eq(usuarios.id, usuario.id));
      if (tentativas >= MAX_FALHAS_CONTA) {
        await registrarAuditoria(null, "bloqueio", "usuario", usuario.id, { ip });
        return { ok: false, mensagem: MENSAGEM_BLOQUEIO, valores: { email } };
      }
    }
    return { ok: false, mensagem: bloqueado ? MENSAGEM_BLOQUEIO : MENSAGEM_INVALIDO, valores: { email } };
  }

  await db
    .update(usuarios)
    .set({ tentativasFalhas: 0, bloqueadoAte: null, ultimoAcesso: new Date() })
    .where(eq(usuarios.id, usuario.id));
  await db.insert(tentativasLogin).values({ ip, email, sucesso: true });
  await criarSessao(usuario.id);
  await registrarAuditoria(
    { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
    "login",
    "usuario",
    usuario.id,
  );

  // Só redireciona para caminhos internos (evita open redirect).
  const destino = de && de.startsWith("/") && !de.startsWith("//") && !de.startsWith("/\\") ? de : "/";
  redirect(destino);
}

export async function sair() {
  const usuario = await validarSessao();
  if (usuario) await registrarAuditoria(usuario, "logout", "usuario", usuario.id);
  await encerrarSessao();
  redirect("/login");
}
