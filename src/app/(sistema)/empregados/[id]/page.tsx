import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { empregados } from "@/db/schema";
import { BotaoConfirmar } from "@/components/form-client";
import { Cabecalho, LinkBotao } from "@/components/ui";
import { formatarCpf, formatarPis } from "@/lib/validacao/documentos";
import { exigirUsuario } from "@/server/dal";
import { listarEmpresasAtivas, listarHorarios, paraValores } from "@/server/consultas/basicas";
import { excluirEmpregado } from "../actions";
import { FormularioEmpregado } from "../formulario";

export const metadata: Metadata = { title: "Editar empregado" };

export default async function EditarEmpregado(props: PageProps<"/empregados/[id]">) {
  await exigirUsuario();
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [empregado] = await db.select().from(empregados).where(eq(empregados.id, id));
  if (!empregado) notFound();
  const [empresas, horarios] = await Promise.all([listarEmpresasAtivas(), listarHorarios()]);
  const valores = paraValores(empregado);
  valores.cpf = formatarCpf(empregado.cpf);
  valores.pis = empregado.pis ? formatarPis(empregado.pis) : "";
  valores.salario = empregado.salario ? Number(empregado.salario).toFixed(2).replace(".", ",") : "";

  return (
    <>
      <Cabecalho
        titulo={empregado.nome}
        descricao={empregado.cargo}
        acoes={
          <>
            <LinkBotao href={`/lancamentos?empregado=${empregado.id}`} variante="secundario">
              Ver espelho de ponto
            </LinkBotao>
            {empregado.ativo && (
              <form action={excluirEmpregado}>
                <input type="hidden" name="id" value={empregado.id} />
                <BotaoConfirmar mensagem="Inativar este empregado? O histórico de ponto será mantido.">Inativar</BotaoConfirmar>
              </form>
            )}
          </>
        }
      />
      <FormularioEmpregado inicial={valores} empresas={empresas} horarios={horarios} />
    </>
  );
}
