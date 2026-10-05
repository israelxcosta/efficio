"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { empregados, horarioDias, horarios } from "@/db/schema";
import { montarPeriodosHorario } from "@/domain/ponto/calculo";
import { hhmmParaMinutos } from "@/domain/ponto/tempo";
import { lerFormData, obrigatorio, opcional, type EstadoForm } from "@/lib/form";
import { exigirUsuario, registrarAuditoria } from "@/server/dal";

const cabecalho = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  empresaId: z.string().uuid("Selecione a empresa."),
  nome: obrigatorio(120, "Dê um nome ao horário."),
  descricao: opcional(500),
});

export async function salvarHorario(_: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const usuario = await exigirUsuario();
  const valores = lerFormData(fd);
  const c = cabecalho.safeParse(valores);
  const erros: Record<string, string[]> = {};
  if (!c.success) Object.assign(erros, z.flattenError(c.error).fieldErrors);

  const dias: Omit<typeof horarioDias.$inferInsert, "horarioId">[] = [];
  for (let d = 1; d <= 7; d++) {
    const folga = valores[`d${d}_folga`] === "on";
    const m = (k: string) => hhmmParaMinutos(valores[`d${d}_${k}`]);
    const dia = { diaSemana: d, folga, entrada1: m("e1"), saida1: m("s1"), entrada2: m("e2"), saida2: m("s2") };
    if (folga) {
      dias.push({ ...dia, entrada1: null, saida1: null, entrada2: null, saida2: null });
      continue;
    }
    const par = (a: number | null, b: number | null) => (a === null) === (b === null);
    if (dia.entrada1 === null || dia.saida1 === null) erros[`d${d}`] = ["Informe entrada e saída ou marque folga."];
    else if (!par(dia.entrada2, dia.saida2)) erros[`d${d}`] = ["Preencha retorno e saída do 2º período."];
    else {
      const periodos = montarPeriodosHorario(dia);
      const total = periodos[periodos.length - 1].fim - periodos[0].inicio;
      if (total > 24 * 60) erros[`d${d}`] = ["A jornada não pode passar de 24 horas."];
    }
    dias.push(dia);
  }
  if (!c.success || Object.keys(erros).length) {
    return { ok: false, mensagem: "Corrija os campos destacados.", erros, valores };
  }

  const { id, ...dados } = c.data;
  const [mesmoNome] = await db
    .select({ id: horarios.id })
    .from(horarios)
    .where(and(eq(horarios.empresaId, dados.empresaId), eq(horarios.nome, dados.nome), id ? ne(horarios.id, id) : undefined));
  if (mesmoNome) return { ok: false, mensagem: "Já existe um horário com este nome na empresa.", erros: { nome: ["Nome já usado."] }, valores };

  const horarioId = await db.transaction(async (tx) => {
    let hid = id || "";
    if (hid) await tx.update(horarios).set(dados).where(eq(horarios.id, hid));
    else [{ id: hid }] = await tx.insert(horarios).values(dados).returning({ id: horarios.id });
    await tx.delete(horarioDias).where(eq(horarioDias.horarioId, hid));
    await tx.insert(horarioDias).values(dias.map((d) => ({ ...d, horarioId: hid })));
    return hid;
  });
  await registrarAuditoria(usuario, id ? "alterar" : "criar", "horario", horarioId, { ...dados, dias });
  revalidatePath("/horarios");
  redirect(`/horarios?salvo=${horarioId}`);
}

export async function excluirHorario(fd: FormData) {
  const usuario = await exigirUsuario();
  const id = z.uuid().parse(fd.get("id"));
  const [vinculo] = await db.select({ id: empregados.id }).from(empregados).where(eq(empregados.horarioId, id)).limit(1);
  if (vinculo) redirect(`/horarios/${id}?erro=vinculo`);
  await db.delete(horarios).where(eq(horarios.id, id));
  await registrarAuditoria(usuario, "excluir", "horario", id);
  revalidatePath("/horarios");
  redirect("/horarios");
}
