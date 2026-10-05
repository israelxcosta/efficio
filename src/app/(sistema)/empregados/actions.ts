"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { empregados, horarios } from "@/db/schema";
import { dataObrigatoria, dataOpcional, ehViolacaoUnica, errosDeValidacao, lerFormData, obrigatorio, opcional, type EstadoForm } from "@/lib/form";
import { somenteDigitos, validarCpf, validarPis } from "@/lib/validacao/documentos";
import { exigirUsuario, registrarAuditoria } from "@/server/dal";

const esquema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    empresaId: z.string().uuid("Selecione a empresa."),
    horarioId: z
      .string()
      .refine((v) => v === "" || z.uuid().safeParse(v).success)
      .transform((v) => v || null),
    nome: obrigatorio(200, "Informe o nome."),
    cpf: z.string().transform(somenteDigitos).refine(validarCpf, "CPF inválido."),
    pis: z
      .string()
      .transform(somenteDigitos)
      .refine((v) => v === "" || validarPis(v), "PIS inválido.")
      .transform((v) => v || null),
    matricula: opcional(30),
    dataNascimento: dataOpcional,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido.")
      .transform((v) => v || null),
    telefone: opcional(40),
    cargo: obrigatorio(120, "Informe o cargo."),
    departamento: opcional(120),
    dataAdmissao: dataObrigatoria,
    dataDemissao: dataOpcional,
    salario: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v))
      .refine((v) => v === null || (/^\d{1,10}(\.\d{1,2})?$/.test(v) && Number(v) >= 0), "Salário inválido."),
    ativo: z.string().optional().transform((v) => v === "on"),
  })
  .refine((d) => !d.dataDemissao || d.dataDemissao >= d.dataAdmissao, {
    path: ["dataDemissao"],
    message: "A demissão não pode ser antes da admissão.",
  });

export async function salvarEmpregado(_: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const usuario = await exigirUsuario();
  const valores = lerFormData(fd);
  const r = esquema.safeParse(valores);
  if (!r.success) return errosDeValidacao(r.error, valores);
  const { id, ...dados } = r.data;

  if (dados.horarioId) {
    const [h] = await db
      .select({ id: horarios.id })
      .from(horarios)
      .where(and(eq(horarios.id, dados.horarioId), eq(horarios.empresaId, dados.empresaId)));
    if (!h) return { ok: false, mensagem: "O horário escolhido não pertence a esta empresa.", erros: { horarioId: ["Escolha um horário da empresa."] }, valores };
  }

  let empregadoId = id || "";
  try {
    if (empregadoId) {
      await db.update(empregados).set(dados).where(eq(empregados.id, empregadoId));
    } else {
      [{ id: empregadoId }] = await db.insert(empregados).values(dados).returning({ id: empregados.id });
    }
  } catch (e) {
    if (ehViolacaoUnica(e)) {
      return { ok: false, mensagem: "Já existe um empregado com este CPF ou matrícula nesta empresa.", valores };
    }
    throw e;
  }
  await registrarAuditoria(usuario, id ? "alterar" : "criar", "empregado", empregadoId, { ...dados, salario: dados.salario ? "***" : null });
  revalidatePath("/empregados");
  redirect(`/empregados?salvo=${empregadoId}`);
}

export async function excluirEmpregado(fd: FormData) {
  const usuario = await exigirUsuario();
  const id = z.uuid().parse(fd.get("id"));
  // Mantém o histórico de ponto: o empregado é inativado, não apagado.
  await db.update(empregados).set({ ativo: false }).where(eq(empregados.id, id));
  await registrarAuditoria(usuario, "inativar", "empregado", id);
  revalidatePath("/empregados");
  redirect("/empregados");
}
