"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { empregados, marcacoes } from "@/db/schema";
import { MINUTOS_DIA, dataParaDias, hhmmParaMinutos, minutosParaDataHora } from "@/domain/ponto/tempo";
import { exigirUsuario, registrarAuditoria } from "@/server/dal";

const entrada = z.object({
  empregadoId: z.uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  horarios: z.array(z.string()).max(12, "Use no máximo 12 marcações por dia."),
  idsAtuais: z.array(z.number().int().positive()).max(50),
  justificativa: z.string().trim().max(300),
});

export type ResultadoSalvarDia = { ok: boolean; mensagem: string };

const normalizar = (dh: string) => dh.replace(" ", "T").slice(0, 16);

export async function salvarMarcacoesDia(dados: z.input<typeof entrada>): Promise<ResultadoSalvarDia> {
  const usuario = await exigirUsuario();
  const r = entrada.safeParse(dados);
  if (!r.success) return { ok: false, mensagem: r.error.issues[0]?.message ?? "Dados inválidos." };
  const { empregadoId, data, idsAtuais, justificativa } = r.data;

  const [empregado] = await db.select({ id: empregados.id }).from(empregados).where(eq(empregados.id, empregadoId));
  if (!empregado) return { ok: false, mensagem: "Empregado não encontrado." };

  // Horários em ordem; um horário menor que o anterior é do dia seguinte.
  const novos: string[] = [];
  let anterior = -1;
  let base = dataParaDias(data) * MINUTOS_DIA;
  for (const h of r.data.horarios.map((x) => x.trim()).filter(Boolean)) {
    const m = hhmmParaMinutos(h);
    if (m === null) return { ok: false, mensagem: `Horário inválido: ${h}.` };
    if (m < anterior) base += MINUTOS_DIA;
    if (m === anterior) return { ok: false, mensagem: "Há horários repetidos." };
    anterior = m;
    novos.push(minutosParaDataHora(base + m).slice(0, 16));
  }
  if (base - dataParaDias(data) * MINUTOS_DIA > MINUTOS_DIA) return { ok: false, mensagem: "As marcações não podem passar de dois dias." };

  const atuais = idsAtuais.length
    ? await db
        .select()
        .from(marcacoes)
        .where(and(eq(marcacoes.empregadoId, empregadoId), inArray(marcacoes.id, idsAtuais)))
    : [];
  if (atuais.length !== idsAtuais.length) return { ok: false, mensagem: "As marcações mudaram. Recarregue a página." };

  const conjuntoNovo = new Set(novos);
  const remover = atuais.filter((m) => !m.desconsiderada && !conjuntoNovo.has(normalizar(m.dataHora)));
  const reativar = atuais.filter((m) => m.desconsiderada && conjuntoNovo.has(normalizar(m.dataHora)));
  const existentes = new Set(atuais.map((m) => normalizar(m.dataHora)));
  const inserir = novos.filter((n) => !existentes.has(n));

  if (!remover.length && !reativar.length && !inserir.length) return { ok: true, mensagem: "Nada mudou." };
  if (justificativa.length < 3) return { ok: false, mensagem: "Informe a justificativa do ajuste." };

  await db.transaction(async (tx) => {
    const manuais = remover.filter((m) => m.origem === "manual").map((m) => m.id);
    const originais = remover.filter((m) => m.origem !== "manual").map((m) => m.id);
    // Lançamentos manuais podem ser apagados; marcações do relógio só são desconsideradas.
    if (manuais.length) await tx.delete(marcacoes).where(inArray(marcacoes.id, manuais));
    if (originais.length) {
      await tx.update(marcacoes).set({ desconsiderada: true, justificativa, usuarioId: usuario.id }).where(inArray(marcacoes.id, originais));
    }
    if (reativar.length) {
      await tx
        .update(marcacoes)
        .set({ desconsiderada: false, justificativa, usuarioId: usuario.id })
        .where(inArray(marcacoes.id, reativar.map((m) => m.id)));
    }
    if (inserir.length) {
      await tx
        .insert(marcacoes)
        .values(inserir.map((dh) => ({ empregadoId, dataHora: `${dh}:00`, origem: "manual" as const, justificativa, usuarioId: usuario.id })))
        .onConflictDoNothing();
    }
  });
  await registrarAuditoria(usuario, "ajustar_ponto", "empregado", empregadoId, {
    data,
    removidas: remover.map((m) => m.dataHora),
    reativadas: reativar.map((m) => m.dataHora),
    incluidas: inserir,
    justificativa,
  });
  revalidatePath("/lancamentos");
  return { ok: true, mensagem: "Marcações salvas." };
}
