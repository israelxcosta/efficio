import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { sessoes, usuarios } from "@/db/schema";
import { env } from "@/lib/env";
import { COOKIE_SESSAO } from "@/lib/constantes";

const DIA_MS = 86_400_000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function ipRequisicao(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "desconhecido").trim().slice(0, 64);
}

export async function criarSessao(usuarioId: string) {
  // 256 bits de entropia; no banco fica apenas o hash.
  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + env.SESSION_DAYS * DIA_MS);
  const h = await headers();
  await db.insert(sessoes).values({
    id: hashToken(token),
    usuarioId,
    expiraEm,
    ip: await ipRequisicao(),
    userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
  });
  await gravarCookie(token, expiraEm);
}

async function gravarCookie(token: string, expiraEm: Date) {
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiraEm,
  });
}

export type UsuarioSessao = { id: string; nome: string; email: string; perfil: "admin" | "operador" };

export async function validarSessao(): Promise<UsuarioSessao | null> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  const id = hashToken(token);
  const [linha] = await db
    .select({
      expiraEm: sessoes.expiraEm,
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      perfil: usuarios.perfil,
    })
    .from(sessoes)
    .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
    .where(and(eq(sessoes.id, id), gt(sessoes.expiraEm, new Date()), eq(usuarios.ativo, true)))
    .limit(1);
  if (!linha) return null;

  // Renova a sessão quando passou da metade da validade (expiração deslizante).
  const restante = linha.expiraEm.getTime() - Date.now();
  if (restante < (env.SESSION_DAYS * DIA_MS) / 2) {
    const expiraEm = new Date(Date.now() + env.SESSION_DAYS * DIA_MS);
    await db.update(sessoes).set({ expiraEm }).where(eq(sessoes.id, id));
    try {
      await gravarCookie(token, expiraEm);
    } catch {
      // Em Server Components o cookie não pode ser alterado; renova na próxima ação.
    }
  }
  const { expiraEm: _, ...usuario } = linha;
  void _;
  return usuario;
}

export async function encerrarSessao() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) await db.delete(sessoes).where(eq(sessoes.id, hashToken(token)));
  jar.delete(COOKIE_SESSAO);
}

export async function encerrarSessoesDoUsuario(usuarioId: string) {
  await db.delete(sessoes).where(eq(sessoes.usuarioId, usuarioId));
}

export async function limparSessoesExpiradas() {
  await db.delete(sessoes).where(lt(sessoes.expiraEm, new Date()));
}
