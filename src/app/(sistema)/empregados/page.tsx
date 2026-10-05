import { and, asc, eq, ilike, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { empregados, empresas, horarios } from "@/db/schema";
import { Aviso, Cabecalho, Entrada, LinkBotao, Selecao, Selo, Tabela, Th, Vazio } from "@/components/ui";
import { formatarCpf } from "@/lib/validacao/documentos";
import { exigirUsuario } from "@/server/dal";
import { listarEmpresasAtivas } from "@/server/consultas/basicas";

export const metadata: Metadata = { title: "Empregados" };

export default async function PaginaEmpregados(props: PageProps<"/empregados">) {
  await exigirUsuario();
  const sp = await props.searchParams;
  const busca = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const empresa = typeof sp.empresa === "string" && /^[0-9a-f-]{36}$/.test(sp.empresa) ? sp.empresa : "";
  const termo = `%${busca.replace(/[%_\\]/g, "\\$&")}%`;
  const digitos = busca.replace(/\D/g, "");

  const [lista, listaEmpresas] = await Promise.all([
    db
      .select({
        id: empregados.id,
        nome: empregados.nome,
        cpf: empregados.cpf,
        cargo: empregados.cargo,
        matricula: empregados.matricula,
        ativo: empregados.ativo,
        empresa: empresas.razaoSocial,
        horario: horarios.nome,
      })
      .from(empregados)
      .innerJoin(empresas, eq(empresas.id, empregados.empresaId))
      .leftJoin(horarios, eq(horarios.id, empregados.horarioId))
      .where(
        and(
          empresa ? eq(empregados.empresaId, empresa) : undefined,
          busca
            ? or(ilike(empregados.nome, termo), ilike(empregados.matricula, termo), digitos ? ilike(empregados.cpf, `%${digitos}%`) : undefined)
            : undefined,
        ),
      )
      .orderBy(asc(empregados.nome))
      .limit(300),
    listarEmpresasAtivas(),
  ]);

  return (
    <>
      <Cabecalho titulo="Empregados" acoes={<LinkBotao href="/empregados/novo">Novo empregado</LinkBotao>} />
      {sp.salvo && (
        <div className="mb-4">
          <Aviso tom="sucesso">Empregado salvo.</Aviso>
        </div>
      )}
      <form className="mb-4 grid max-w-2xl gap-2 sm:grid-cols-[1fr_1fr_auto]" role="search">
        <Entrada name="q" defaultValue={busca} placeholder="Nome, CPF ou matrícula" aria-label="Buscar empregados" />
        <Selecao name="empresa" defaultValue={empresa} aria-label="Filtrar por empresa">
          <option value="">Todas as empresas</option>
          {listaEmpresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Selecao>
        <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">Filtrar</button>
      </form>
      {lista.length === 0 ? (
        <Vazio titulo="Nenhum empregado encontrado." />
      ) : (
        <Tabela>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>CPF</Th>
              <Th>Empresa</Th>
              <Th>Cargo</Th>
              <Th>Horário</Th>
              <Th>Situação</Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link href={`/empregados/${e.id}`} className="font-medium text-marca-700 hover:underline">
                    {e.nome}
                  </Link>
                  {e.matricula && <p className="text-xs text-slate-500">Matrícula {e.matricula}</p>}
                </td>
                <td className="whitespace-nowrap tabular-nums">{formatarCpf(e.cpf)}</td>
                <td>{e.empresa}</td>
                <td>{e.cargo}</td>
                <td>{e.horario ?? <Selo tom="alerta">Sem horário</Selo>}</td>
                <td>{e.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo>Inativo</Selo>}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </>
  );
}
