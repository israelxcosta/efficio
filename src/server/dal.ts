import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { auditoria } from "@/db/schema";
import { ipRequisicao, validarSessao, type UsuarioSessao } from "./sessao";

/** Sessão do usuário atual, memorizada durante a requisição. */
export const usuarioAtual = cache(validarSessao);

export async function exigirUsuario(): Promise<UsuarioSessao> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/login");
  return usuario;
}

export async function exigirAdmin(): Promise<UsuarioSessao> {
  const usuario = await exigirUsuario();
  if (usuario.perfil !== "admin") redirect("/?erro=permissao");
  return usuario;
}

export async function registrarAuditoria(
  usuario: UsuarioSessao | null,
  acao: string,
  entidade: string,
  entidadeId: string | null,
  dados?: unknown,
) {
  await db.insert(auditoria).values({
    usuarioId: usuario?.id ?? null,
    acao,
    entidade,
    entidadeId,
    dados: dados ?? null,
    ip: await ipRequisicao(),
  });
}
