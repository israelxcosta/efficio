import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { empresas, horarioDias, horarios } from "@/db/schema";
import { Aviso, Cabecalho, LinkBotao, Selecao, Tabela, Th, Vazio } from "@/components/ui";
import { DIAS_SEMANA } from "@/lib/constantes";
import { montarPeriodosHorario } from "@/domain/ponto/calculo";
import { minutosParaHhmm } from "@/domain/ponto/tempo";
import { exigirUsuario } from "@/server/dal";
import { listarEmpresasAtivas } from "@/server/consultas/basicas";

export const metadata: Metadata = { title: "Horários" };

export default async function PaginaHorarios(props: PageProps<"/horarios">) {
  await exigirUsuario();
  const { empresa, salvo } = await props.searchParams;
  const filtro = typeof empresa === "string" && /^[0-9a-f-]{36}$/.test(empresa) ? empresa : "";
  const [lista, dias, listaEmpresas] = await Promise.all([
    db
      .select({ id: horarios.id, nome: horarios.nome, empresa: empresas.razaoSocial })
      .from(horarios)
      .innerJoin(empresas, eq(empresas.id, horarios.empresaId))
      .where(filtro ? eq(horarios.empresaId, filtro) : undefined)
      .orderBy(asc(empresas.razaoSocial), asc(horarios.nome)),
    db.select().from(horarioDias),
    listarEmpresasAtivas(),
  ]);

  const resumo = (id: string) => {
    const doHorario = dias.filter((d) => d.horarioId === id).sort((a, b) => a.diaSemana - b.diaSemana);
    const total = doHorario.reduce((s, d) => s + (d.folga ? 0 : montarPeriodosHorario(d).reduce((x, p) => x + p.fim - p.inicio, 0)), 0);
    const folgas = doHorario.filter((d) => d.folga).map((d) => DIAS_SEMANA[d.diaSemana - 1].curto);
    return { total, folgas };
  };

  return (
    <>
      <Cabecalho
        titulo="Horários"
        descricao="Jornadas semanais com intervalos e dias de folga."
        acoes={<LinkBotao href="/horarios/novo">Novo horário</LinkBotao>}
      />
      {salvo && (
        <div className="mb-4">
          <Aviso tom="sucesso">Horário salvo.</Aviso>
        </div>
      )}
      <form className="mb-4 flex max-w-md gap-2">
        <Selecao name="empresa" defaultValue={filtro} aria-label="Filtrar por empresa">
          <option value="">Todas as empresas</option>
          {listaEmpresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Selecao>
        <button className="rounded-lg border border-slate-300 bg-white px-3 text-sm">Filtrar</button>
      </form>
      {lista.length === 0 ? (
        <Vazio titulo="Nenhum horário cadastrado.">Cadastre a jornada semanal antes de cadastrar os empregados.</Vazio>
      ) : (
        <Tabela>
          <thead>
            <tr>
              <Th>Horário</Th>
              <Th>Empresa</Th>
              <Th className="text-right">Carga semanal</Th>
              <Th>Folgas</Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((h) => {
              const r = resumo(h.id);
              return (
                <tr key={h.id}>
                  <td>
                    <Link href={`/horarios/${h.id}`} className="font-medium text-marca-700 hover:underline">
                      {h.nome}
                    </Link>
                  </td>
                  <td>{h.empresa}</td>
                  <td className="text-right tabular-nums">{minutosParaHhmm(r.total)}</td>
                  <td>{r.folgas.join(", ") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
      )}
    </>
  );
}
