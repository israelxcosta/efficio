"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { feriados } from "@/db/schema";
import { feriadosNacionais } from "@/domain/ponto/feriados-nacionais";
import { UFS } from "@/lib/constantes";
import { dataObrigatoria, ehViolacaoUnica, errosDeValidacao, lerFormData, obrigatorio, opcional, type EstadoForm } from "@/lib/form";
import { exigirUsuario, registrarAuditoria } from "@/server/dal";

const esquema = z
  .object({
    data: dataObrigatoria,
    descricao: obrigatorio(120, "Informe a descrição."),
    abrangencia: z.enum(["nacional", "estadual", "municipal", "empresa"]),
    uf: z
      .string()
      .refine((v) => v === "" || (UFS as readonly string[]).includes(v), "UF inválida.")
      .transform((v) => v || null),
    municipio: opcional(120),
    empresaId: z
      .string()
      .refine((v) => v === "" || z.uuid().safeParse(v).success)
      .transform((v) => v || null),
  })
  .superRefine((d, ctx) => {
    if ((d.abrangencia === "estadual" || d.abrangencia === "municipal") && !d.uf) ctx.addIssue({ code: "custom", path: ["uf"], message: "Informe a UF." });
    if (d.abrangencia === "municipal" && !d.municipio) ctx.addIssue({ code: "custom", path: ["municipio"], message: "Informe o município." });
    if (d.abrangencia === "empresa" && !d.empresaId) ctx.addIssue({ code: "custom", path: ["empresaId"], message: "Selecione a empresa." });
  })
  .transform((d) => ({
    ...d,
    uf: d.abrangencia === "estadual" || d.abrangencia === "municipal" ? d.uf : null,
    municipio: d.abrangencia === "municipal" ? d.municipio : null,
    empresaId: d.abrangencia === "empresa" ? d.empresaId : null,
  }));

export async function salvarFeriado(_: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const usuario = await exigirUsuario();
  const valores = lerFormData(fd);
  const r = esquema.safeParse(valores);
  if (!r.success) return errosDeValidacao(r.error, valores);
  try {
    const [novo] = await db.insert(feriados).values(r.data).returning({ id: feriados.id });
    await registrarAuditoria(usuario, "criar", "feriado", novo.id, r.data);
  } catch (e) {
    if (ehViolacaoUnica(e)) return { ok: false, mensagem: "Este feriado já está cadastrado.", valores };
    throw e;
  }
  revalidatePath("/feriados");
  return { ok: true, mensagem: "Feriado cadastrado." };
}

export async function gerarNacionais(_: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const usuario = await exigirUsuario();
  const ano = z.coerce.number().int().min(2000).max(2100).safeParse(fd.get("ano"));
  if (!ano.success) return { ok: false, mensagem: "Ano inválido." };
  const facultativos = fd.get("facultativos") === "on";
  const lista = feriadosNacionais(ano.data, facultativos).map((f) => ({
    data: f.data,
    descricao: f.facultativo ? `${f.descricao} (ponto facultativo)` : f.descricao,
    abrangencia: "nacional" as const,
  }));
  const inseridos = await db.insert(feriados).values(lista).onConflictDoNothing().returning({ id: feriados.id });
  await registrarAuditoria(usuario, "gerar", "feriado", null, { ano: ano.data, facultativos, inseridos: inseridos.length });
  revalidatePath("/feriados");
  return {
    ok: true,
    mensagem: inseridos.length
      ? `${inseridos.length} feriado(s) nacional(is) de ${ano.data} cadastrado(s).`
      : `Os feriados nacionais de ${ano.data} já estavam cadastrados.`,
  };
}

export async function excluirFeriado(fd: FormData) {
  const usuario = await exigirUsuario();
  const id = z.uuid().parse(fd.get("id"));
  await db.delete(feriados).where(eq(feriados.id, id));
  await registrarAuditoria(usuario, "excluir", "feriado", id);
  revalidatePath("/feriados");
}
