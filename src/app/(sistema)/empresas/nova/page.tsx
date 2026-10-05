import type { Metadata } from "next";
import { Cabecalho } from "@/components/ui";
import { exigirUsuario } from "@/server/dal";
import { listarTabelas } from "@/server/consultas/basicas";
import { FormularioEmpresa } from "../formulario";

export const metadata: Metadata = { title: "Nova empresa" };

export default async function NovaEmpresa() {
  await exigirUsuario();
  return (
    <>
      <Cabecalho titulo="Nova empresa" />
      <FormularioEmpresa inicial={{ ativo: "on" }} tabelas={await listarTabelas()} />
    </>
  );
}
