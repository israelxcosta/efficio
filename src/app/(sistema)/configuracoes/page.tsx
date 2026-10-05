import type { Metadata } from "next";
import { Cabecalho } from "@/components/ui";
import { exigirAdmin } from "@/server/dal";
import { listarTabelas } from "@/server/consultas/basicas";
import { obterConfiguracoes } from "@/server/consultas/configuracoes";
import { FormularioConfiguracoes } from "./formulario";

export const metadata: Metadata = { title: "Configurações" };

export default async function PaginaConfiguracoes() {
  await exigirAdmin();
  const [config, tabelas] = await Promise.all([obterConfiguracoes(), listarTabelas()]);
  return (
    <>
      <Cabecalho titulo="Configurações" descricao="Regras aplicadas no cálculo de todos os espelhos de ponto." />
      <div className="max-w-3xl">
        <FormularioConfiguracoes config={config} tabelas={tabelas} />
      </div>
    </>
  );
}
