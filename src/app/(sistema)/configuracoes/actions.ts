"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { configuracoes } from "@/db/schema";
import { lerFormData, type EstadoForm } from "@/lib/form";
import { exigirAdmin, registrarAuditoria } from "@/server/dal";

const marcado = z.string().optional().transform((v) => v === "on");

const esquema = z.object({
  toleranciaDiaria: marcado,
  intervaloReduzido: marcado,
  prorrogacaoNoturna: marcado,
  separacaoJornadasHoras: z.coerce.number().min(2, "Mínimo de 2 horas.").max(11, "Máximo de 11 horas."),
  tabelaHorasExtrasPadraoId: z
    .string()
    .refine((v) => v === "" || z.uuid().safeParse(v).success)
    .transform((v) => v || null),
});

export async function salvarConfiguracoes(_: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const usuario = await exigirAdmin();
  const valores = lerFormData(fd);
  const r = esquema.safeParse(valores);
  if (!r.success) return { ok: false, mensagem: r.error.issues[0]?.message ?? "Dados inválidos.", valores };
  const { separacaoJornadasHoras, ...resto } = r.data;
  const dados = { ...resto, separacaoJornadasMinutos: Math.round(separacaoJornadasHoras * 60) };
  await db.insert(configuracoes).values({ id: 1, ...dados }).onConflictDoUpdate({ target: configuracoes.id, set: dados });
  await registrarAuditoria(usuario, "alterar", "configuracoes", "1", dados);
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Configurações salvas. Os espelhos de ponto já usam as novas regras." };
}
