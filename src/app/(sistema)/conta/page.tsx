import type { Metadata } from "next";
import { Cabecalho, Cartao } from "@/components/ui";
import { exigirUsuario } from "@/server/dal";
import { FormularioMinhaSenha } from "../usuarios/formularios";

export const metadata: Metadata = { title: "Minha conta" };

export default async function PaginaConta() {
  const eu = await exigirUsuario();
  return (
    <>
      <Cabecalho titulo="Minha conta" descricao={`${eu.nome} · ${eu.email}`} />
      <Cartao titulo="Alterar senha" className="max-w-lg">
        <FormularioMinhaSenha />
      </Cartao>
    </>
  );
}
