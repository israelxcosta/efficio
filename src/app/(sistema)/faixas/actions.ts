"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { faixasHorasExtras, tabelasHorasExtras } from "@/db/schema";
import { lerFormData, obrigatorio, opcional, type EstadoForm } from "@/lib/form";
import { exigirUsuario, registrarAuditoria } from "@/server/dal";

const cabecalho = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  nome: obrigatorio(120, "Dê um nome à tabela."),
  descricao: opcional(500),
  base: z.enum(["diaria", "mensal"]),
});

/** "6", "6,5", "6:30" -> minutos. */
function horasParaMinutos(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const hm = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 60) : NaN;
}

export async function salvarTabela(_: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const usuario = await exigirUsuario();
  const valores = lerFormData(fd);
  const c = cabecalho.safeParse(valores);
  const erros: Record<string, string[]> = c.success ? {} : (z.flattenError(c.error).fieldErrors as Record<string, string[]>);

  const faixas: { tipoDia: "util" | "descanso"; ordem: number; ateMinutos: number | null; percentual: string }[] = [];
  for (const tipoDia of ["util", "descanso"] as const) {
    const linhas = Object.keys(valores)
      .map((k) => new RegExp(`^${tipoDia}_(\\d+)_pct$`).exec(k)?.[1])
      .filter((x): x is string => x !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
    let anterior = 0;
    linhas.forEach((i, pos) => {
      const ultima = pos === linhas.length - 1;
      const ate = ultima ? null : horasParaMinutos(valores[`${tipoDia}_${i}_ate`] ?? "");
      const pct = Number((valores[`${tipoDia}_${i}_pct`] ?? "").replace(",", "."));
      if (!ultima && (ate === null || Number.isNaN(ate) || ate <= anterior)) {
        erros[tipoDia] = ["Os limites das faixas devem ser crescentes (ex.: 6, 15)."];
      }
      if (!Number.isFinite(pct) || pct < 0 || pct > 1000) erros[tipoDia] = ["Percentual inválido."];
      if (ate) anterior = ate;
      faixas.push({ tipoDia, ordem: pos + 1, ateMinutos: ate, percentual: String(pct) });
    });
  }
  if (!c.success || Object.keys(erros).length) return { ok: false, mensagem: "Corrija os campos destacados.", erros, valores };

  const { id, ...dados } = c.data;
  const [mesmoNome] = await db
    .select({ id: tabelasHorasExtras.id })
    .from(tabelasHorasExtras)
    .where(and(eq(tabelasHorasExtras.nome, dados.nome), id ? ne(tabelasHorasExtras.id, id) : undefined));
  if (mesmoNome) return { ok: false, mensagem: "Já existe uma tabela com este nome.", erros: { nome: ["Nome já usado."] }, valores };

  const tabelaId = await db.transaction(async (tx) => {
    let tid = id || "";
    if (tid) await tx.update(tabelasHorasExtras).set(dados).where(eq(tabelasHorasExtras.id, tid));
    else [{ id: tid }] = await tx.insert(tabelasHorasExtras).values(dados).returning({ id: tabelasHorasExtras.id });
    await tx.delete(faixasHorasExtras).where(eq(faixasHorasExtras.tabelaId, tid));
    if (faixas.length) await tx.insert(faixasHorasExtras).values(faixas.map((f) => ({ ...f, tabelaId: tid })));
    return tid;
  });
  await registrarAuditoria(usuario, id ? "alterar" : "criar", "tabela_horas_extras", tabelaId, { ...dados, faixas });
  revalidatePath("/faixas");
  redirect("/faixas?salvo=1");
}

export async function excluirTabela(fd: FormData) {
  const usuario = await exigirUsuario();
  const id = z.uuid().parse(fd.get("id"));
  // Empresas que usavam a tabela passam a usar a padrão (FK com ON DELETE SET NULL).
  await db.delete(tabelasHorasExtras).where(eq(tabelasHorasExtras.id, id));
  await registrarAuditoria(usuario, "excluir", "tabela_horas_extras", id);
  revalidatePath("/faixas");
  redirect("/faixas");
}
