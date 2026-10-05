import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { empregados } from "@/db/schema";
import { Aviso, Cabecalho, Cartao, LinkBotao, Tabela, Th, Vazio } from "@/components/ui";
import { minutosParaHhmm } from "@/domain/ponto/tempo";
import { formatarCpf } from "@/lib/validacao/documentos";
import { exigirUsuario } from "@/server/dal";
import { listarEmpresasAtivas } from "@/server/consultas/basicas";
import { carregarEspelho } from "@/server/espelho";
import { LinhaDia } from "./dia";
import { Seletor } from "./seletor";

export const metadata: Metadata = { title: "Lançamentos" };

const UUID = /^[0-9a-f-]{36}$/;

function Indicador({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: string; tom?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <p className="text-xs font-medium text-slate-500">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tom ?? "text-slate-900"}`}>{valor}</p>
      {detalhe && <p className="text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

export default async function PaginaLancamentos(props: PageProps<"/lancamentos">) {
  await exigirUsuario();
  const sp = await props.searchParams;
  const hoje = new Date();
  const mes = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [ano, numMes] = mes.split("-").map(Number);
  let empresaId = typeof sp.empresa === "string" && UUID.test(sp.empresa) ? sp.empresa : "";
  const empregadoId = typeof sp.empregado === "string" && UUID.test(sp.empregado) ? sp.empregado : "";

  const espelho = empregadoId ? await carregarEspelho(empregadoId, ano, numMes) : null;
  if (espelho) empresaId = espelho.empresa.id;

  const [empresas, listaEmpregados] = await Promise.all([
    listarEmpresasAtivas(),
    empresaId
      ? db
          .select({ id: empregados.id, nome: empregados.nome, empresaId: empregados.empresaId })
          .from(empregados)
          .where(and(eq(empregados.empresaId, empresaId), eq(empregados.ativo, true)))
          .orderBy(asc(empregados.nome))
      : Promise.resolve([] as { id: string; nome: string; empresaId: string }[]),
  ]);
  if (espelho && !listaEmpregados.some((e) => e.id === espelho.empregado.id)) {
    listaEmpregados.push({ id: espelho.empregado.id, nome: `${espelho.empregado.nome} (inativo)`, empresaId });
  }

  const t = espelho?.resultado.totais;
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const nomeMes = `${MESES[numMes - 1]} de ${ano}`;

  return (
    <>
      <Cabecalho
        titulo="Lançamentos"
        descricao="Espelho de ponto mensal: confira, ajuste marcações e veja o cálculo."
        acoes={<LinkBotao href="/importacao" variante="secundario">Importar arquivo</LinkBotao>}
      />
      <Cartao className="mb-6">
        <Seletor empresas={empresas} empregados={listaEmpregados} empresaId={empresaId} empregadoId={espelho?.empregado.id ?? ""} mes={mes} />
      </Cartao>

      {!espelho ? (
        <Vazio titulo={empregadoId ? "Empregado não encontrado." : "Escolha a empresa, o empregado e o mês."} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{espelho.empregado.nome}</h2>
              <p className="text-sm text-slate-500">
                {espelho.empregado.cargo} · CPF {formatarCpf(espelho.empregado.cpf)} · {nomeMes}
              </p>
            </div>
            <p className="text-xs text-slate-500">Faixas de horas extras: {espelho.tabelaNome ?? "padrão legal (50% e 100%)"}</p>
          </div>
          {!espelho.empregado.horarioId && (
            <div className="mb-4">
              <Aviso tom="alerta">Este empregado não tem horário cadastrado: não há jornada prevista para calcular extras e atrasos.</Aviso>
            </div>
          )}

          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Indicador rotulo="Previsto" valor={minutosParaHhmm(t!.previsto)} />
            <Indicador rotulo="Trabalhado" valor={minutosParaHhmm(t!.trabalhado)} />
            <Indicador rotulo="Horas extras" valor={minutosParaHhmm(t!.extras)} tom="text-marca-700" />
            <Indicador rotulo="Atrasos e saídas" valor={minutosParaHhmm(t!.debito)} detalhe={`${t!.faltas} falta(s)`} tom="text-red-600" />
            <Indicador rotulo="Adicional noturno" valor={minutosParaHhmm(t!.noturno)} detalhe={`${minutosParaHhmm(t!.extrasNoturnas)} extras noturnas`} tom="text-indigo-700" />
            <Indicador rotulo="Intervalo suprimido" valor={minutosParaHhmm(t!.intervaloSuprimido)} detalhe="art. 71, §4º CLT" />
            <Indicador rotulo="Interjornada suprimida" valor={minutosParaHhmm(t!.interjornadaSuprimida)} detalhe="art. 66 CLT" />
          </div>

          {espelho.resultado.extrasPorPercentual.length > 0 && (
            <Cartao titulo="Horas extras por percentual" className="mb-6">
              <div className="flex flex-wrap gap-3">
                {espelho.resultado.extrasPorPercentual.map((x) => (
                  <div key={`${x.tipoDia}${x.percentual}`} className="rounded-lg bg-marca-50 px-4 py-2">
                    <p className="text-xs text-marca-700">
                      {x.percentual}% · {x.tipoDia === "util" ? "dias úteis" : "descanso/feriado"}
                    </p>
                    <p className="text-lg font-semibold text-marca-900 tabular-nums">{minutosParaHhmm(x.minutos)}</p>
                  </div>
                ))}
              </div>
            </Cartao>
          )}

          <Tabela>
            <thead>
              <tr>
                <Th>Dia</Th>
                <Th>Marcações</Th>
                <Th className="text-right">Previsto</Th>
                <Th className="text-right">Trabalhado</Th>
                <Th className="text-right">Extras</Th>
                <Th className="text-right">Débito</Th>
                <Th className="text-right">Noturno</Th>
                <Th>Ocorrências</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {espelho.resultado.dias.map((d) => (
                <LinhaDia key={d.data} dia={d} registros={espelho.registrosPorDia[d.data] ?? []} empregadoId={espelho.empregado.id} />
              ))}
            </tbody>
          </Tabela>
          <p className="mt-3 text-xs text-slate-500">
            Horas noturnas já consideram a hora reduzida de 52min30s (art. 73 CLT). ⁺¹ indica marcação no dia seguinte.
          </p>
        </>
      )}
    </>
  );
}
