import { asc, ilike, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { empresas } from "@/db/schema";
import { Aviso, Cabecalho, Entrada, LinkBotao, Selo, Tabela, Th, Vazio } from "@/components/ui";
import { formatarCnpj, normalizarCnpj } from "@/lib/validacao/documentos";
import { exigirUsuario } from "@/server/dal";

export const metadata: Metadata = { title: "Empresas" };

export default async function PaginaEmpresas(props: PageProps<"/empresas">) {
  await exigirUsuario();
  const { q, salvo } = await props.searchParams;
  const busca = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const termo = `%${busca.replace(/[%_\\]/g, "\\$&")}%`;
  const lista = await db
    .select()
    .from(empresas)
    .where(
      busca
        ? or(ilike(empresas.razaoSocial, termo), ilike(empresas.nomeFantasia, termo), ilike(empresas.cnpj, `%${normalizarCnpj(busca) || busca}%`))
        : undefined,
    )
    .orderBy(asc(empresas.razaoSocial))
    .limit(200);

  return (
    <>
      <Cabecalho titulo="Empresas" descricao="Empresas atendidas e seus dados cadastrais." acoes={<LinkBotao href="/empresas/nova">Nova empresa</LinkBotao>} />
      {salvo && (
        <div className="mb-4">
          <Aviso tom="sucesso">Empresa salva.</Aviso>
        </div>
      )}
      <form className="mb-4 max-w-md" role="search">
        <Entrada name="q" defaultValue={busca} placeholder="Buscar por nome ou CNPJ" aria-label="Buscar empresas" />
      </form>
      {lista.length === 0 ? (
        <Vazio titulo={busca ? "Nenhuma empresa encontrada." : "Nenhuma empresa cadastrada ainda."}>
          {!busca && "Comece pelo botão Nova empresa: basta o CNPJ para trazer os dados da Receita."}
        </Vazio>
      ) : (
        <Tabela>
          <thead>
            <tr>
              <Th>Empresa</Th>
              <Th>CNPJ</Th>
              <Th>Município</Th>
              <Th>Situação</Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link href={`/empresas/${e.id}`} className="font-medium text-marca-700 hover:underline">
                    {e.razaoSocial}
                  </Link>
                  {e.nomeFantasia && <p className="text-xs text-slate-500">{e.nomeFantasia}</p>}
                </td>
                <td className="whitespace-nowrap tabular-nums">{formatarCnpj(e.cnpj)}</td>
                <td>{e.municipio ? `${e.municipio}/${e.uf}` : "—"}</td>
                <td>{e.ativo ? <Selo tom="sucesso">Ativa</Selo> : <Selo>Inativa</Selo>}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </>
  );
}
