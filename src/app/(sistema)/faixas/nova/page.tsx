import type { Metadata } from "next";
import { Cabecalho } from "@/components/ui";
import { exigirUsuario } from "@/server/dal";
import { FormularioTabela } from "../formulario";

export const metadata: Metadata = { title: "Nova tabela de horas extras" };

export default async function NovaTabela() {
  await exigirUsuario();
  return (
    <>
      <Cabecalho titulo="Nova tabela de horas extras" />
      <FormularioTabela
        inicial={{
          nome: "",
          descricao: "",
          base: "mensal",
          util: [
            { ate: "6", pct: "50" },
            { ate: "15", pct: "75" },
            { ate: "", pct: "100" },
          ],
          descanso: [{ ate: "", pct: "100" }],
        }}
      />
    </>
  );
}
