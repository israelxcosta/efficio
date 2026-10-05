import type { Metadata } from "next";
import { Cabecalho } from "@/components/ui";
import { exigirUsuario } from "@/server/dal";
import { listarEmpresasAtivas } from "@/server/consultas/basicas";
import { FormularioHorario } from "../formulario";

export const metadata: Metadata = { title: "Novo horário" };

// Jornada comercial de 44h (8h48 de segunda a sexta) como ponto de partida.
const PADRAO: Record<string, string> = {
  d6_folga: "on",
  d7_folga: "on",
};
for (let d = 1; d <= 5; d++) Object.assign(PADRAO, { [`d${d}_e1`]: "08:00", [`d${d}_s1`]: "12:00", [`d${d}_e2`]: "13:00", [`d${d}_s2`]: "17:48" });

export default async function NovoHorario(props: PageProps<"/horarios/novo">) {
  await exigirUsuario();
  const { empresa } = await props.searchParams;
  return (
    <>
      <Cabecalho titulo="Novo horário" />
      <FormularioHorario inicial={{ ...PADRAO, empresaId: typeof empresa === "string" ? empresa : "" }} empresas={await listarEmpresasAtivas()} />
    </>
  );
}
