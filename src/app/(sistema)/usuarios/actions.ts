"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { gerarHashSenha, verificarSenha } from "@/lib/auth/password";
import { errosDeValidacao, lerFormData, obrigatorio, type EstadoForm } from "@/lib/form";
import { validarSenhaForte } from "@/lib/validacao/senha";
import { exigirAdmin, exigirUsuario, registrarAuditoria } from "@/server/dal";
import { encerrarSessoesDoUsuario } from "@/server/sessao";

const senha = z.string().superRefine((v, ctx) => {
  const p = validarSenhaForte(v);
  if (p) ctx.addIssue({ code: "custom", message: p });
});

const novoUsuario = z.object({
  nome: obrigatorio(120, "Informe o nome."),
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.")).pipe(z.string().max(254)),
  perfil: z.enum(["admin", "operador"]),
  senha,
});

export async function criarUsuario(_: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const admin = await exigirAdmin();
  const valores = lerFormData(fd);
  const r = novoUsuario.safeParse(valores);
  if (!r.success) return errosDeValidacao(r.error, { ...valores, senha: "" });
  const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(sql`lower(${usuarios.email}) = ${r.data.email}`);
  if (existe) return { ok: false, mensagem: "Já existe um usuário com este e-mail.", erros: { email: ["E-mail já cadastrado."] }, valores: { ...valores, senha: "" } };
  const [novo] = await db
    .insert(usuarios)
    .values({ nome: r.data.nome, email: r.data.email, perfil: r.data.perfil, senhaHash: await gerarHashSenha(r.data.senha) })
    .returning({ id: usuarios.id });
  await registrarAuditoria(admin, "criar", "usuario", novo.id, { email: r.data.email, perfil: r.data.perfil });
  revalidatePath("/usuarios");
  return { ok: true, mensagem: `Usuário ${r.data.email} criado. Envie a senha inicial por um canal seguro.` };
}

export async function alternarUsuario(fd: FormData) {
  const admin = await exigirAdmin();
  const id = z.uuid().parse(fd.get("id"));
  if (id === admin.id) return; // ninguém desativa a si mesmo
  const [u] = await db.select({ ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.id, id));
  if (!u) return;
  await db.update(usuarios).set({ ativo: !u.ativo }).where(eq(usuarios.id, id));
  if (u.ativo) await encerrarSessoesDoUsuario(id);
  await registrarAuditoria(admin, u.ativo ? "desativar" : "ativar", "usuario", id);
  revalidatePath("/usuarios");
}

export async function alterarPerfil(fd: FormData) {
  const admin = await exigirAdmin();
  const id = z.uuid().parse(fd.get("id"));
  const perfil = z.enum(["admin", "operador"]).parse(fd.get("perfil"));
  if (id === admin.id) return;
  await db.update(usuarios).set({ perfil }).where(and(eq(usuarios.id, id), ne(usuarios.perfil, perfil)));
  await registrarAuditoria(admin, "alterar_perfil", "usuario", id, { perfil });
  revalidatePath("/usuarios");
}

export async function redefinirSenha(_: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const admin = await exigirAdmin();
  const id = z.uuid().safeParse(fd.get("id"));
  const s = senha.safeParse(fd.get("senha"));
  if (!id.success) return { ok: false, mensagem: "Usuário inválido." };
  if (!s.success) return { ok: false, mensagem: s.error.issues[0].message };
  await db
    .update(usuarios)
    .set({ senhaHash: await gerarHashSenha(s.data), tentativasFalhas: 0, bloqueadoAte: null })
    .where(eq(usuarios.id, id.data));
  await encerrarSessoesDoUsuario(id.data);
  await registrarAuditoria(admin, "redefinir_senha", "usuario", id.data);
  return { ok: true, mensagem: "Senha redefinida. As sessões abertas desse usuário foram encerradas." };
}

const trocaSenha = z
  .object({ atual: z.string().min(1, "Informe a senha atual."), nova: senha, confirmacao: z.string() })
  .refine((d) => d.nova === d.confirmacao, { path: ["confirmacao"], message: "As senhas não conferem." });

export async function trocarMinhaSenha(_: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const eu = await exigirUsuario();
  const r = trocaSenha.safeParse(lerFormData(fd));
  if (!r.success) return errosDeValidacao(r.error, {});
  const [u] = await db.select({ senhaHash: usuarios.senhaHash }).from(usuarios).where(eq(usuarios.id, eu.id));
  if (!u || !(await verificarSenha(u.senhaHash, r.data.atual))) return { ok: false, mensagem: "Senha atual incorreta.", erros: { atual: ["Senha incorreta."] } };
  await db.update(usuarios).set({ senhaHash: await gerarHashSenha(r.data.nova) }).where(eq(usuarios.id, eu.id));
  await registrarAuditoria(eu, "trocar_senha", "usuario", eu.id);
  return { ok: true, mensagem: "Senha alterada." };
}
