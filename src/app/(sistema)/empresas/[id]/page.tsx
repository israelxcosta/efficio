import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { empresas } from "@/db/schema";
import { BotaoConfirmar } from "@/components/form-client";
import { Cabecalho } from "@/components/ui";
import { formatarCnpj } from "@/lib/validacao/documentos";
import { exigirUsuario } from "@/server/dal";
import { listarTabelas, paraValores } from "@/server/consultas/basicas";
import { excluirEmpresa } from "../actions";
import { FormularioEmpresa } from "../formulario";

export const metadata: Metadata = { title: "Editar empresa" };

export default async function EditarEmpresa(props: PageProps<"/empresas/[id]">) {
  await exigirUsuario();
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [empresa] = await db.select().from(empresas).where(eq(empresas.id, id));
  if (!empresa) notFound();
  const valores = paraValores(empresa);
  valores.cnpj = formatarCnpj(empresa.cnpj);

  return (
    <>
      <Cabecalho
        titulo={empresa.razaoSocial}
        descricao={formatarCnpj(empresa.cnpj)}
        acoes={
          <form action={excluirEmpresa}>
            <input type="hidden" name="id" value={empresa.id} />
            <BotaoConfirmar mensagem="Excluir esta empresa? Se houver empregados vinculados, ela será apenas inativada.">
              Excluir
            </BotaoConfirmar>
          </form>
        }
      />
      <FormularioEmpresa inicial={valores} tabelas={await listarTabelas()} />
    </>
  );
}
