/**
 * Motor de cálculo do espelho de ponto mensal, conforme a CLT.
 * Funções puras: recebem os dados já carregados e não acessam o banco.
 */
import { distribuirPorFaixas, type HorasPorPercentual, type TabelaFaixas } from "./faixas";
import {
  MINUTOS_DIA,
  dataHoraParaMinutos,
  dataParaDias,
  diaSemanaIso,
  diasDoMes,
} from "./tempo";

export type Periodo = { inicio: number; fim: number };

/** Horário de um dia da semana, em minutos desde 00:00 (fim pode passar de 1440). */
export type DiaHorario = { folga: boolean; periodos: Periodo[] };
/** Índice 1 = segunda ... 7 = domingo. */
export type HorarioSemanal = Partial<Record<number, DiaHorario>>;

export type ConfiguracaoCalculo = {
  /** Art. 58, §1º CLT: variações de até 10 minutos no dia não contam. */
  toleranciaDiaria: boolean;
  /** Art. 611-A, III CLT: intervalo mínimo de 30 minutos por norma coletiva. */
  intervaloReduzido: boolean;
  /** Súmula 60, II TST: horas após as 5h seguem noturnas na jornada noturna prorrogada. */
  prorrogacaoNoturna: boolean;
  /** Intervalo sem marcações que separa uma jornada da seguinte. */
  separacaoJornadasMinutos: number;
};

export type EntradaCalculo = {
  ano: number;
  mes: number;
  horario: HorarioSemanal | null;
  dataAdmissao: string;
  dataDemissao: string | null;
  /** data "AAAA-MM-DD" -> descrição */
  feriados: Map<string, string>;
  /** Marcações válidas, "AAAA-MM-DDTHH:MM[:SS]". Inclua 1 dia antes e depois do mês. */
  marcacoes: string[];
  config: ConfiguracaoCalculo;
  tabela: TabelaFaixas | null;
};

export type TipoDia = "util" | "folga" | "feriado" | "inativo";

export type ResultadoDia = {
  data: string;
  diaSemana: number;
  tipo: TipoDia;
  feriado: string | null;
  /** Marcações do dia, em minutos relativos às 00:00 da data (podem passar de 1440). */
  marcacoes: number[];
  previsto: number;
  trabalhado: number;
  noturno: number;
  extras: number;
  extrasNoturnas: number;
  debito: number;
  falta: boolean;
  intervaloGozado: number;
  intervaloMinimo: number;
  intervaloSuprimido: number;
  interjornada: number | null;
  interjornadaSuprimida: number;
  toleranciaAplicada: boolean;
  prorrogacaoNoturna: boolean;
  inconsistencias: string[];
};

export type ResultadoMes = {
  dias: ResultadoDia[];
  totais: {
    previsto: number;
    trabalhado: number;
    noturno: number;
    extras: number;
    extrasNoturnas: number;
    debito: number;
    faltas: number;
    intervaloSuprimido: number;
    interjornadaSuprimida: number;
  };
  extrasPorPercentual: HorasPorPercentual[];
};

// Hora noturna urbana: 22h às 5h, com hora de 52min30s (art. 73 CLT).
const NOTURNO_INICIO = 22 * 60;
const NOTURNO_FIM = 5 * 60;
const NOTURNO_DURACAO = MINUTOS_DIA - NOTURNO_INICIO + NOTURNO_FIM;
const FATOR_REDUZIDA = 60 / 52.5;
const INTERJORNADA_MINIMA = 11 * 60; // art. 66 CLT
const TOLERANCIA = 10;
const EPS = 1e-9;

const ehNoturno = (min: number) => {
  const r = ((min % MINUTOS_DIA) + MINUTOS_DIA) % MINUTOS_DIA;
  return r >= NOTURNO_INICIO || r < NOTURNO_FIM;
};

type Medicao = {
  relogio: number;
  computado: number;
  noturno: number;
  prorrogacao: boolean;
  /** Para cada minuto trabalhado: peso e se é noturno, em ordem. */
  minutos: { peso: number; noturno: boolean }[];
};

/** Mede períodos considerando a hora noturna reduzida e a prorrogação. */
export function medirPeriodos(periodos: Periodo[], config: Pick<ConfiguracaoCalculo, "prorrogacaoNoturna">): Medicao {
  let noturnoPuro = 0;
  for (const p of periodos) for (let m = p.inicio; m < p.fim; m++) if (ehNoturno(m)) noturnoPuro++;

  // Prorrogação: a jornada cumprida predominantemente no período noturno e
  // que continua após as 5h tem as horas seguintes também como noturnas.
  let inicioProrrogacao: number | null = null;
  if (config.prorrogacaoNoturna && noturnoPuro >= NOTURNO_DURACAO / 2) {
    for (const p of periodos) {
      const r = ((p.inicio % MINUTOS_DIA) + MINUTOS_DIA) % MINUTOS_DIA;
      const fimNoturno = p.inicio - r + (r < NOTURNO_FIM ? NOTURNO_FIM : MINUTOS_DIA + NOTURNO_FIM);
      if (fimNoturno > p.inicio && fimNoturno < p.fim) {
        inicioProrrogacao = fimNoturno;
        break;
      }
    }
  }

  const med: Medicao = { relogio: 0, computado: 0, noturno: 0, prorrogacao: false, minutos: [] };
  for (const p of periodos) {
    for (let m = p.inicio; m < p.fim; m++) {
      const puro = ehNoturno(m);
      const noturno = puro || (inicioProrrogacao !== null && m >= inicioProrrogacao);
      const peso = noturno ? FATOR_REDUZIDA : 1;
      if (noturno && !puro) med.prorrogacao = true;
      med.relogio += 1;
      med.computado += peso;
      if (noturno) med.noturno += peso;
      med.minutos.push({ peso, noturno });
    }
  }
  return med;
}

/** Agrupa marcações (minutos absolutos, ordenados) em jornadas. */
export function agruparJornadas(marcas: number[], separacao: number): number[][] {
  const jornadas: number[][] = [];
  for (const m of marcas) {
    const atual = jornadas[jornadas.length - 1];
    if (atual && m - atual[atual.length - 1] <= separacao) atual.push(m);
    else jornadas.push([m]);
  }
  return jornadas;
}

function intervaloMinimo(relogio: number, reduzido: boolean): number {
  if (relogio > 6 * 60) return reduzido ? 30 : 60; // art. 71, caput
  if (relogio > 4 * 60) return 15; // art. 71, §1º
  return 0;
}

export function calcularMes(entrada: EntradaCalculo): ResultadoMes {
  const { config } = entrada;
  const marcas = [...new Set(entrada.marcacoes.map(dataHoraParaMinutos))].sort((a, b) => a - b);
  const jornadas = agruparJornadas(marcas, config.separacaoJornadasMinutos);

  // Jornada pertence ao dia da primeira marcação.
  const porDia = new Map<number, number[]>();
  for (const j of jornadas) {
    const dia = Math.floor(j[0] / MINUTOS_DIA);
    porDia.set(dia, [...(porDia.get(dia) ?? []), ...j]);
  }

  // Interjornada: descanso entre o fim de uma jornada e o início da próxima.
  const interjornadaPorDia = new Map<number, number>();
  for (let i = 1; i < jornadas.length; i++) {
    const anterior = jornadas[i - 1];
    const dia = Math.floor(jornadas[i][0] / MINUTOS_DIA);
    const descanso = jornadas[i][0] - anterior[anterior.length - 1];
    const atual = interjornadaPorDia.get(dia);
    if (atual === undefined || descanso < atual) interjornadaPorDia.set(dia, descanso);
  }

  const admissao = dataParaDias(entrada.dataAdmissao);
  const demissao = entrada.dataDemissao ? dataParaDias(entrada.dataDemissao) : Infinity;

  const dias: ResultadoDia[] = diasDoMes(entrada.ano, entrada.mes).map((data) => {
    const numDia = dataParaDias(data);
    const base = numDia * MINUTOS_DIA;
    const diaSemana = diaSemanaIso(data);
    const horarioDia = entrada.horario?.[diaSemana];
    const feriado = entrada.feriados.get(data) ?? null;
    const inconsistencias: string[] = [];

    let tipo: TipoDia = "util";
    if (numDia < admissao || numDia > demissao) tipo = "inativo";
    else if (feriado) tipo = "feriado";
    else if (horarioDia?.folga) tipo = "folga";

    const r: ResultadoDia = {
      data,
      diaSemana,
      tipo,
      feriado,
      marcacoes: (porDia.get(numDia) ?? []).map((m) => m - base),
      previsto: 0,
      trabalhado: 0,
      noturno: 0,
      extras: 0,
      extrasNoturnas: 0,
      debito: 0,
      falta: false,
      intervaloGozado: 0,
      intervaloMinimo: 0,
      intervaloSuprimido: 0,
      interjornada: interjornadaPorDia.get(numDia) ?? null,
      interjornadaSuprimida: 0,
      toleranciaAplicada: false,
      prorrogacaoNoturna: false,
      inconsistencias,
    };

    if (tipo === "util") {
      if (!entrada.horario) inconsistencias.push("Empregado sem horário cadastrado.");
      else if (horarioDia) r.previsto = medirPeriodos(horarioDia.periodos, config).computado;
    }

    if (r.marcacoes.length % 2 === 1) {
      inconsistencias.push("Número ímpar de marcações: a última foi desconsiderada.");
    }
    const periodos: Periodo[] = [];
    for (let i = 0; i + 1 < r.marcacoes.length; i += 2) {
      periodos.push({ inicio: r.marcacoes[i], fim: r.marcacoes[i + 1] });
    }
    if (tipo === "inativo" && periodos.length) {
      inconsistencias.push("Marcações fora do período de contrato.");
    }

    const med = medirPeriodos(periodos, config);
    r.trabalhado = med.computado;
    r.noturno = med.noturno;
    r.prorrogacaoNoturna = med.prorrogacao;

    if (tipo === "util") {
      if (!periodos.length && r.previsto > 0) {
        r.falta = true;
        r.debito = r.previsto;
      } else {
        const diferenca = r.trabalhado - r.previsto;
        if (config.toleranciaDiaria && Math.abs(diferenca) <= TOLERANCIA + EPS) {
          r.toleranciaAplicada = Math.abs(diferenca) > EPS;
        } else if (diferenca > 0) {
          r.extras = diferenca;
        } else {
          r.debito = -diferenca;
        }
      }
    } else if (tipo === "folga" || tipo === "feriado") {
      r.extras = r.trabalhado;
    }

    // Parte das horas extras feita no período noturno (as extras são as últimas horas do dia).
    if (r.extras > EPS) {
      const limite = r.trabalhado - r.extras;
      let acumulado = 0;
      for (const m of med.minutos) {
        const inicio = acumulado;
        acumulado += m.peso;
        if (m.noturno && acumulado > limite) r.extrasNoturnas += acumulado - Math.max(inicio, limite);
      }
    }

    if (periodos.length) {
      r.intervaloMinimo = intervaloMinimo(med.relogio, config.intervaloReduzido);
      for (let i = 1; i < periodos.length; i++) r.intervaloGozado += periodos[i].inicio - periodos[i - 1].fim;
      r.intervaloSuprimido = Math.max(0, r.intervaloMinimo - r.intervaloGozado);
      if (med.relogio > 6 * 60 && r.intervaloGozado > 120) {
        inconsistencias.push("Intervalo acima de 2 horas exige acordo escrito (art. 71 CLT).");
      }
      if (r.interjornada !== null) {
        r.interjornadaSuprimida = Math.max(0, INTERJORNADA_MINIMA - r.interjornada);
      }
    }
    if (r.extras > 120 + EPS && tipo === "util") {
      inconsistencias.push("Mais de 2 horas extras no dia (art. 59 CLT).");
    }
    return r;
  });

  const soma = (f: (d: ResultadoDia) => number) => dias.reduce((s, d) => s + f(d), 0);
  const extrasPorPercentual = distribuirPorFaixas(
    dias.map((d) => ({ tipoDia: d.tipo === "util" ? ("util" as const) : ("descanso" as const), minutos: d.extras })),
    entrada.tabela,
  );

  return {
    dias,
    totais: {
      previsto: soma((d) => d.previsto),
      trabalhado: soma((d) => d.trabalhado),
      noturno: soma((d) => d.noturno),
      extras: soma((d) => d.extras),
      extrasNoturnas: soma((d) => d.extrasNoturnas),
      debito: soma((d) => d.debito),
      faltas: dias.filter((d) => d.falta).length,
      intervaloSuprimido: soma((d) => d.intervaloSuprimido),
      interjornadaSuprimida: soma((d) => d.interjornadaSuprimida),
    },
    extrasPorPercentual,
  };
}

/** Converte os horários cadastrados (minutos, saída < entrada = dia seguinte) em períodos. */
export function montarPeriodosHorario(dia: {
  entrada1: number | null;
  saida1: number | null;
  entrada2: number | null;
  saida2: number | null;
}): Periodo[] {
  const marcas = [dia.entrada1, dia.saida1, dia.entrada2, dia.saida2];
  const periodos: Periodo[] = [];
  let anterior: number | null = null;
  for (let i = 0; i < 4; i += 2) {
    let e = marcas[i];
    let s = marcas[i + 1];
    if (e === null || s === null) continue;
    if (anterior !== null) while (e < anterior) e += MINUTOS_DIA;
    while (s <= e) s += MINUTOS_DIA;
    periodos.push({ inicio: e, fim: s });
    anterior = s;
  }
  return periodos;
}

