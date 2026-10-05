import "server-only";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { empregados, empresas, faixasHorasExtras, feriados, horarioDias, marcacoes, tabelasHorasExtras } from "@/db/schema";
import { calcularMes, montarPeriodosHorario, type HorarioSemanal, type ResultadoMes } from "@/domain/ponto/calculo";
import type { TabelaFaixas } from "@/domain/ponto/faixas";
import { dataParaDias, diasParaData } from "@/domain/ponto/tempo";
import { obterConfiguracoes } from "./consultas/configuracoes";

export type MarcacaoRegistro = {
  id: number;
  dataHora: string;
  origem: "manual" | "afd" | "csv";
  desconsiderada: boolean;
  justificativa: string | null;
};

export type Espelho = {
  empregado: typeof empregados.$inferSelect;
  empresa: typeof empresas.$inferSelect;
  tabelaNome: string | null;
  resultado: ResultadoMes;
  /** Marcações registradas por dia de jornada (inclui as desconsideradas). */
  registrosPorDia: Record<string, MarcacaoRegistro[]>;
};

const mesStr = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}`;

export async function carregarEspelho(empregadoId: string, ano: number, mes: number): Promise<Espelho | null> {
  const [linha] = await db
    .select({ empregado: empregados, empresa: empresas })
    .from(empregados)
    .innerJoin(empresas, eq(empresas.id, empregados.empresaId))
    .where(eq(empregados.id, empregadoId));
  if (!linha) return null;
  const { empregado, empresa } = linha;
  const config = await obterConfiguracoes();

  const inicioMes = dataParaDias(`${mesStr(ano, mes)}-01`);
  const fimMes = mes === 12 ? dataParaDias(`${ano + 1}-01-01`) : dataParaDias(`${mesStr(ano, mes + 1)}-01`);
  // Um dia antes (interjornada do dia 1º) e um depois (jornada que vira o mês).
  const desde = `${diasParaData(inicioMes - 1)}T00:00:00`;
  const ate = `${diasParaData(fimMes + 1)}T00:00:00`;

  const [dias, listaFeriados, registros] = await Promise.all([
    empregado.horarioId ? db.select().from(horarioDias).where(eq(horarioDias.horarioId, empregado.horarioId)) : Promise.resolve([]),
    db
      .select()
      .from(feriados)
      .where(and(gte(feriados.data, diasParaData(inicioMes)), lt(feriados.data, diasParaData(fimMes)))),
    db
      .select({
        id: marcacoes.id,
        dataHora: marcacoes.dataHora,
        origem: marcacoes.origem,
        desconsiderada: marcacoes.desconsiderada,
        justificativa: marcacoes.justificativa,
      })
      .from(marcacoes)
      .where(and(eq(marcacoes.empregadoId, empregadoId), gte(marcacoes.dataHora, desde), lt(marcacoes.dataHora, ate)))
      .orderBy(asc(marcacoes.dataHora)),
  ]);

  let horario: HorarioSemanal | null = null;
  if (empregado.horarioId) {
    horario = {};
    for (const d of dias) horario[d.diaSemana] = { folga: d.folga, periodos: d.folga ? [] : montarPeriodosHorario(d) };
  }

  // Feriados que valem para o local da empresa.
  const mapaFeriados = new Map<string, string>();
  for (const f of listaFeriados) {
    const vale =
      f.abrangencia === "nacional" ||
      (f.abrangencia === "estadual" && f.uf === empresa.uf) ||
      (f.abrangencia === "municipal" && f.uf === empresa.uf && f.municipio?.toLowerCase() === empresa.municipio?.toLowerCase()) ||
      (f.abrangencia === "empresa" && f.empresaId === empresa.id);
    if (vale) mapaFeriados.set(f.data, mapaFeriados.has(f.data) ? `${mapaFeriados.get(f.data)} / ${f.descricao}` : f.descricao);
  }

  const tabelaId = empresa.tabelaHorasExtrasId ?? config.tabelaHorasExtrasPadraoId;
  let tabela: TabelaFaixas | null = null;
  let tabelaNome: string | null = null;
  if (tabelaId) {
    const [t] = await db.select().from(tabelasHorasExtras).where(eq(tabelasHorasExtras.id, tabelaId));
    if (t) {
      const faixas = await db.select().from(faixasHorasExtras).where(eq(faixasHorasExtras.tabelaId, t.id));
      tabelaNome = t.nome;
      tabela = {
        base: t.base,
        faixas: faixas.map((f) => ({ tipoDia: f.tipoDia, ateMinutos: f.ateMinutos, percentual: Number(f.percentual) })),
      };
    }
  }

  const resultado = calcularMes({
    ano,
    mes,
    horario,
    dataAdmissao: empregado.dataAdmissao,
    dataDemissao: empregado.dataDemissao,
    feriados: mapaFeriados,
    marcacoes: registros.filter((r) => !r.desconsiderada).map((r) => r.dataHora),
    config: {
      toleranciaDiaria: config.toleranciaDiaria,
      intervaloReduzido: config.intervaloReduzido,
      prorrogacaoNoturna: config.prorrogacaoNoturna,
      separacaoJornadasMinutos: config.separacaoJornadasMinutos,
    },
    tabela,
  });

  // Associa cada registro ao dia da jornada calculada; desconsideradas ficam no dia da data.
  const registrosPorDia: Record<string, MarcacaoRegistro[]> = {};
  const base = (data: string) => dataParaDias(data) * 1440;
  const minutosAbs = (dh: string) => {
    const [d, h] = dh.replace(" ", "T").split("T");
    return base(d) + Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  };
  const usadas = new Set<number>();
  for (const dia of resultado.dias) {
    for (const rel of dia.marcacoes) {
      const abs = base(dia.data) + rel;
      const r = registros.find((x) => !x.desconsiderada && !usadas.has(x.id) && minutosAbs(x.dataHora) === abs);
      if (r) {
        usadas.add(r.id);
        (registrosPorDia[dia.data] ??= []).push(r);
      }
    }
  }
  for (const r of registros) {
    if (!r.desconsiderada) continue;
    const data = r.dataHora.slice(0, 10);
    (registrosPorDia[data] ??= []).push(r);
  }
  return { empregado, empresa, tabelaNome, resultado, registrosPorDia };
}
