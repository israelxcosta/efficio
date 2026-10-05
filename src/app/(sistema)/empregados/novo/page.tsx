import type { Metadata } from "next";
import { Cabecalho } from "@/components/ui";
import { exigirUsuario } from "@/server/dal";
import { listarEmpresasAtivas, listarHorarios } from "@/server/consultas/basicas";
import { FormularioEmpregado } from "../formulario";

export const metadata: Metadata = { title: "Novo empregado" };

export default async function NovoEmpregado() {
  await exigirUsuario();
  const [empresas, horarios] = await Promise.all([listarEmpresasAtivas(), listarHorarios()]);
  return (
    <>
      <Cabecalho titulo="Novo empregado" />
      <FormularioEmpregado inicial={{ ativo: "on" }} empresas={empresas} horarios={horarios} />
    </>
  );
}
