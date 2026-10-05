import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { faixasHorasExtras, tabelasHorasExtras } from "@/db/schema";
import { Aviso, Cabecalho, LinkBotao, Selo, Vazio } from "@/components/ui";
import { exigirUsuario } from "@/server/dal";

export const metadata: Metadata = { title: "Faixas de horas extras" };

const horas = (min: number) => {
  const h = min / 60;
  return Number.isInteger(h) ? `${h}h` : `${Math.floor(h)}h${String(min % 60).padStart(2, "0")}`;
};

function Resumo({ faixas }: { faixas: { ateMinutos: number | null; percentual: string }[] }) {
  if (!faixas.length) return <span className="text-slate-500">Padrão legal</span>;
  return (
    <ul className="space-y-0.5">
      {faixas.map((f, i) => {
        const anterior = faixas[i - 1]?.ateMinutos ?? 0;
        const txt =
          f.ateMinutos === null
            ? i === 0
              ? "Todas as horas"
              : `Acima de ${horas(anterior)}`
            : i === 0
              ? `Primeiras ${horas(f.ateMinutos)}`
              : `De ${horas(anterior)} a ${horas(f.ateMinutos)}`;
        return (
          <li key={i}>
            {txt}: <strong className="tabular-nums">{Number(f.percentual)}%</strong>
          </li>
        );
      })}
    </ul>
  );
}

export default async function PaginaFaixas(props: PageProps<"/faixas">) {
  await exigirUsuario();
  const { salvo } = await props.searchParams;
  const [tabelas, faixas] = await Promise.all([
    db.select().from(tabelasHorasExtras).orderBy(asc(tabelasHorasExtras.nome)),
    db.select().from(faixasHorasExtras).orderBy(asc(faixasHorasExtras.ordem)),
  ]);

  return (
    <>
      <Cabecalho
        titulo="Faixas de horas extras"
        descricao="Percentuais por faixa de horas, conforme a convenção coletiva de cada categoria."
        acoes={<LinkBotao href="/faixas/nova">Nova tabela</LinkBotao>}
      />
      {salvo && (
        <div className="mb-4">
          <Aviso tom="sucesso">Tabela salva.</Aviso>
        </div>
      )}
      {tabelas.length === 0 ? (
        <Vazio titulo="Nenhuma tabela cadastrada.">Sem tabela, o sistema usa 50% nos dias úteis e 100% em folgas e feriados.</Vazio>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tabelas.map((t) => (
            <Link key={t.id} href={`/faixas/${t.id}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-marca-200">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="font-semibold text-slate-900">{t.nome}</h2>
                <Selo tom="marca">{t.base === "mensal" ? "Acumula no mês" : "Por dia"}</Selo>
              </div>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Dias úteis</p>
                  <Resumo faixas={faixas.filter((f) => f.tabelaId === t.id && f.tipoDia === "util")} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Descanso e feriados</p>
                  <Resumo faixas={faixas.filter((f) => f.tabelaId === t.id && f.tipoDia === "descanso")} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
