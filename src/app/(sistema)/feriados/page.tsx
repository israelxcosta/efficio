import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { empresas, feriados } from "@/db/schema";
import { Cabecalho, Cartao, Selo, Tabela, Th, Vazio } from "@/components/ui";
import { DIAS_SEMANA } from "@/lib/constantes";
import { diaSemanaIso } from "@/domain/ponto/tempo";
import { exigirUsuario } from "@/server/dal";
import { listarEmpresasAtivas } from "@/server/consultas/basicas";
import { excluirFeriado } from "./actions";
import { FormularioFeriado, FormularioNacionais } from "./formularios";

export const metadata: Metadata = { title: "Feriados" };

const ROTULO = { nacional: "Nacional", estadual: "Estadual", municipal: "Municipal", empresa: "Empresa" } as const;

export default async function PaginaFeriados(props: PageProps<"/feriados">) {
  await exigirUsuario();
  const sp = await props.searchParams;
  const atual = new Date().getFullYear();
  const ano = Number(sp.ano) >= 2000 && Number(sp.ano) <= 2100 ? Number(sp.ano) : atual;

  const [lista, listaEmpresas] = await Promise.all([
    db
      .select({
        id: feriados.id,
        data: feriados.data,
        descricao: feriados.descricao,
        abrangencia: feriados.abrangencia,
        uf: feriados.uf,
        municipio: feriados.municipio,
        empresa: empresas.razaoSocial,
      })
      .from(feriados)
      .leftJoin(empresas, eq(empresas.id, feriados.empresaId))
      .where(and(gte(feriados.data, `${ano}-01-01`), lte(feriados.data, `${ano}-12-31`)))
      .orderBy(asc(feriados.data)),
    listarEmpresasAtivas(),
  ]);

  return (
    <>
      <Cabecalho titulo="Feriados" descricao="Dias trabalhados em feriado são pagos como descanso (horas extras de domingos e feriados)." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <nav className="mb-4 flex items-center gap-2 text-sm" aria-label="Ano">
            <Link className="rounded-lg border border-slate-300 bg-white px-3 py-1.5" href={`/feriados?ano=${ano - 1}`}>
              ← {ano - 1}
            </Link>
            <span className="px-2 text-base font-semibold">{ano}</span>
            <Link className="rounded-lg border border-slate-300 bg-white px-3 py-1.5" href={`/feriados?ano=${ano + 1}`}>
              {ano + 1} →
            </Link>
          </nav>
          {lista.length === 0 ? (
            <Vazio titulo={`Nenhum feriado cadastrado em ${ano}.`}>Use “Gerar feriados nacionais” para começar.</Vazio>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Feriado</Th>
                  <Th>Abrangência</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id}>
                    <td className="whitespace-nowrap tabular-nums">
                      {f.data.split("-").reverse().join("/")}
                      <span className="ml-2 text-xs text-slate-500">{DIAS_SEMANA[diaSemanaIso(f.data) - 1].curto}</span>
                    </td>
                    <td>{f.descricao}</td>
                    <td>
                      <Selo tom={f.abrangencia === "nacional" ? "marca" : "neutro"}>{ROTULO[f.abrangencia]}</Selo>
                      <span className="ml-2 text-xs text-slate-500">
                        {f.abrangencia === "estadual" && f.uf}
                        {f.abrangencia === "municipal" && `${f.municipio}/${f.uf}`}
                        {f.abrangencia === "empresa" && f.empresa}
                      </span>
                    </td>
                    <td className="text-right">
                      <form action={excluirFeriado}>
                        <input type="hidden" name="id" value={f.id} />
                        <button className="text-sm text-slate-500 hover:text-red-600">Excluir</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </div>
        <div className="space-y-6">
          <Cartao titulo="Feriados nacionais" descricao="Cadastra de uma vez os feriados nacionais do ano, com a Páscoa calculada.">
            <FormularioNacionais ano={ano} />
          </Cartao>
          <Cartao titulo="Novo feriado" descricao="Feriados estaduais e municipais valem para as empresas do local cadastrado.">
            <FormularioFeriado empresas={listaEmpresas} />
          </Cartao>
        </div>
      </div>
    </>
  );
}
