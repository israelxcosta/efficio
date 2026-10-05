import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { empresas, horarios, tabelasHorasExtras } from "@/db/schema";

export const listarTabelas = () =>
  db.select({ id: tabelasHorasExtras.id, nome: tabelasHorasExtras.nome }).from(tabelasHorasExtras).orderBy(asc(tabelasHorasExtras.nome));

export const listarEmpresasAtivas = () =>
  db
    .select({ id: empresas.id, nome: empresas.razaoSocial, fantasia: empresas.nomeFantasia, cnpj: empresas.cnpj })
    .from(empresas)
    .where(eq(empresas.ativo, true))
    .orderBy(asc(empresas.razaoSocial));

export const listarHorarios = () =>
  db
    .select({ id: horarios.id, nome: horarios.nome, empresaId: horarios.empresaId })
    .from(horarios)
    .where(eq(horarios.ativo, true))
    .orderBy(asc(horarios.nome));

/** Converte um registro do banco em valores de formulário (strings). */
export function paraValores(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) out[k] = "";
    else if (typeof v === "boolean") out[k] = v ? "on" : "off";
    else if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = String(v);
  }
  return out;
}
