import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { faixasHorasExtras, tabelasHorasExtras } from "@/db/schema";
import { BotaoConfirmar } from "@/components/form-client";
import { Cabecalho } from "@/components/ui";
import { exigirUsuario } from "@/server/dal";
import { excluirTabela } from "../actions";
import { FormularioTabela, type LinhaFaixa } from "../formulario";

export const metadata: Metadata = { title: "Editar tabela de horas extras" };

const horas = (min: number | null) => (min === null ? "" : String(Math.round((min / 60) * 100) / 100).replace(".", ","));

export default async function EditarTabela(props: PageProps<"/faixas/[id]">) {
  await exigirUsuario();
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [tabela] = await db.select().from(tabelasHorasExtras).where(eq(tabelasHorasExtras.id, id));
  if (!tabela) notFound();
  const faixas = await db.select().from(faixasHorasExtras).where(eq(faixasHorasExtras.tabelaId, id)).orderBy(asc(faixasHorasExtras.ordem));
  const linhas = (tipo: "util" | "descanso", padrao: string): LinhaFaixa[] => {
    const l = faixas.filter((f) => f.tipoDia === tipo).map((f) => ({ ate: horas(f.ateMinutos), pct: String(Number(f.percentual)) }));
    return l.length ? l : [{ ate: "", pct: padrao }];
  };

  return (
    <>
      <Cabecalho
        titulo={tabela.nome}
        acoes={
          <form action={excluirTabela}>
            <input type="hidden" name="id" value={tabela.id} />
            <BotaoConfirmar mensagem="Excluir esta tabela? As empresas que a usam passarão para a tabela padrão.">Excluir</BotaoConfirmar>
          </form>
        }
      />
      <FormularioTabela
        inicial={{
          id: tabela.id,
          nome: tabela.nome,
          descricao: tabela.descricao ?? "",
          base: tabela.base,
          util: linhas("util", "50"),
          descanso: linhas("descanso", "100"),
        }}
      />
    </>
  );
}
