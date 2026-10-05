import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { horarioDias, horarios } from "@/db/schema";
import { BotaoConfirmar } from "@/components/form-client";
import { Aviso, Cabecalho } from "@/components/ui";
import { minutosParaHhmm } from "@/domain/ponto/tempo";
import { exigirUsuario } from "@/server/dal";
import { listarEmpresasAtivas } from "@/server/consultas/basicas";
import { excluirHorario } from "../actions";
import { FormularioHorario } from "../formulario";

export const metadata: Metadata = { title: "Editar horário" };

export default async function EditarHorario(props: PageProps<"/horarios/[id]">) {
  await exigirUsuario();
  const { id } = await props.params;
  const { erro } = await props.searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const [horario] = await db.select().from(horarios).where(eq(horarios.id, id));
  if (!horario) notFound();
  const dias = await db.select().from(horarioDias).where(eq(horarioDias.horarioId, id));

  const valores: Record<string, string> = {
    id: horario.id,
    empresaId: horario.empresaId,
    nome: horario.nome,
    descricao: horario.descricao ?? "",
  };
  for (const d of dias) {
    valores[`d${d.diaSemana}_folga`] = d.folga ? "on" : "";
    valores[`d${d.diaSemana}_e1`] = d.entrada1 === null ? "" : minutosParaHhmm(d.entrada1);
    valores[`d${d.diaSemana}_s1`] = d.saida1 === null ? "" : minutosParaHhmm(d.saida1);
    valores[`d${d.diaSemana}_e2`] = d.entrada2 === null ? "" : minutosParaHhmm(d.entrada2);
    valores[`d${d.diaSemana}_s2`] = d.saida2 === null ? "" : minutosParaHhmm(d.saida2);
  }

  return (
    <>
      <Cabecalho
        titulo={horario.nome}
        acoes={
          <form action={excluirHorario}>
            <input type="hidden" name="id" value={horario.id} />
            <BotaoConfirmar mensagem="Excluir este horário?">Excluir</BotaoConfirmar>
          </form>
        }
      />
      {erro === "vinculo" && (
        <div className="mb-4">
          <Aviso tom="erro">Este horário está vinculado a empregados. Troque o horário deles antes de excluir.</Aviso>
        </div>
      )}
      <FormularioHorario inicial={valores} empresas={await listarEmpresasAtivas()} />
    </>
  );
}
