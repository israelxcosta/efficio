import { describe, expect, it } from "vitest";
import { calcularMes, montarPeriodosHorario, type EntradaCalculo, type HorarioSemanal } from "./calculo";

const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

function horarioComercial(): HorarioSemanal {
  const util = {
    folga: false,
    periodos: montarPeriodosHorario({
      entrada1: hm("08:00"),
      saida1: hm("12:00"),
      entrada2: hm("13:00"),
      saida2: hm("17:48"),
    }),
  };
  return { 1: util, 2: util, 3: util, 4: util, 5: util, 6: { folga: true, periodos: [] }, 7: { folga: true, periodos: [] } };
}

function entrada(marcacoes: string[], extra: Partial<EntradaCalculo> = {}): EntradaCalculo {
  return {
    ano: 2026,
    mes: 10,
    horario: horarioComercial(),
    dataAdmissao: "2026-01-01",
    dataDemissao: null,
    feriados: new Map([["2026-10-12", "Nossa Senhora Aparecida"]]),
    marcacoes,
    config: { toleranciaDiaria: true, intervaloReduzido: false, prorrogacaoNoturna: true, separacaoJornadasMinutos: 360 },
    tabela: null,
    ...extra,
  };
}

const dia = (data: string, ...horas: string[]) => {
  let atual = data;
  let anterior = -1;
  return horas.map((h) => {
    if (hm(h) < anterior) {
      const d = new Date(`${atual}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      atual = d.toISOString().slice(0, 10);
    }
    anterior = hm(h);
    return `${atual}T${h}:00`;
  });
};

describe("cálculo mensal", () => {
  it("dia normal sem extras nem débito", () => {
    const r = calcularMes(entrada(dia("2026-10-05", "08:00", "12:00", "13:00", "17:48")));
    const d = r.dias.find((x) => x.data === "2026-10-05")!;
    expect(d.tipo).toBe("util");
    expect(d.previsto).toBe(528);
    expect(d.trabalhado).toBe(528);
    expect(d.extras).toBe(0);
    expect(d.debito).toBe(0);
  });

  it("aplica a tolerância de 10 minutos e conta tudo quando passa dela", () => {
    const dentro = calcularMes(entrada(dia("2026-10-05", "07:55", "12:00", "13:00", "17:52")));
    const d1 = dentro.dias.find((x) => x.data === "2026-10-05")!;
    expect(d1.extras).toBe(0);
    expect(d1.toleranciaAplicada).toBe(true);

    const fora = calcularMes(entrada(dia("2026-10-05", "07:50", "12:00", "13:00", "17:49")));
    expect(fora.dias.find((x) => x.data === "2026-10-05")!.extras).toBe(11);

    const semTolerancia = calcularMes(
      entrada(dia("2026-10-05", "07:55", "12:00", "13:00", "17:52"), {
        config: { toleranciaDiaria: false, intervaloReduzido: false, prorrogacaoNoturna: true, separacaoJornadasMinutos: 360 },
      }),
    );
    expect(semTolerancia.dias.find((x) => x.data === "2026-10-05")!.extras).toBe(9);
  });

  it("registra falta, atraso e trabalho em feriado e folga", () => {
    const r = calcularMes(
      entrada([
        ...dia("2026-10-06", "08:30", "12:00", "13:00", "17:48"),
        ...dia("2026-10-10", "08:00", "12:00"),
        ...dia("2026-10-12", "08:00", "12:00"),
      ]),
    );
    const por = (d: string) => r.dias.find((x) => x.data === d)!;
    expect(por("2026-10-05").falta).toBe(true);
    expect(por("2026-10-05").debito).toBe(528);
    expect(por("2026-10-06").debito).toBe(30);
    expect(por("2026-10-10").tipo).toBe("folga");
    expect(por("2026-10-10").extras).toBe(240);
    expect(por("2026-10-12").tipo).toBe("feriado");
    expect(por("2026-10-12").extras).toBe(240);
    expect(r.extrasPorPercentual).toEqual([{ tipoDia: "descanso", percentual: 100, minutos: 480 }]);
  });

  it("calcula intervalo suprimido e interjornada", () => {
    const r = calcularMes(
      entrada([
        ...dia("2026-10-05", "08:00", "12:00", "12:30", "22:00"),
        ...dia("2026-10-06", "06:00", "15:00"),
      ]),
    );
    const seg = r.dias.find((x) => x.data === "2026-10-05")!;
    expect(seg.intervaloGozado).toBe(30);
    expect(seg.intervaloSuprimido).toBe(30);
    const ter = r.dias.find((x) => x.data === "2026-10-06")!;
    expect(ter.interjornada).toBe(8 * 60);
    expect(ter.interjornadaSuprimida).toBe(3 * 60);
    expect(ter.intervaloSuprimido).toBe(60);
  });

  it("conta hora noturna reduzida e prorrogação, com jornada na virada do dia", () => {
    const noturno: HorarioSemanal = {};
    for (let d = 1; d <= 7; d++) {
      noturno[d] = {
        folga: d >= 6,
        periodos: d >= 6 ? [] : montarPeriodosHorario({ entrada1: hm("22:00"), saida1: hm("02:00"), entrada2: hm("03:00"), saida2: hm("06:00") }),
      };
    }
    const r = calcularMes(entrada(dia("2026-10-05", "22:00", "02:00", "03:00", "06:00"), { horario: noturno }));
    const d = r.dias.find((x) => x.data === "2026-10-05")!;
    expect(d.marcacoes).toEqual([1320, 1560, 1620, 1800]);
    // 7h de relógio, todas noturnas (6h no período + 1h prorrogada) = 8h computadas
    expect(d.trabalhado).toBeCloseTo(480, 6);
    expect(d.noturno).toBeCloseTo(480, 6);
    expect(d.prorrogacaoNoturna).toBe(true);
    expect(d.extras).toBe(0);
    expect(r.dias.find((x) => x.data === "2026-10-06")!.marcacoes).toEqual([]);
  });

  it("separa as horas extras noturnas", () => {
    const r = calcularMes(entrada(dia("2026-10-05", "08:00", "12:00", "13:00", "23:00")));
    const d = r.dias.find((x) => x.data === "2026-10-05")!;
    // 22h às 23h = 60 min de relógio = 68,57 min computados
    expect(d.extrasNoturnas).toBeCloseTo(60 * (60 / 52.5), 6);
    expect(d.inconsistencias.some((i) => i.includes("2 horas extras"))).toBe(true);
  });

  it("ignora dias fora do contrato e aponta marcações ímpares", () => {
    const r = calcularMes(
      entrada(dia("2026-10-20", "08:00", "12:00", "13:00"), { dataAdmissao: "2026-10-15" }),
    );
    expect(r.dias.find((x) => x.data === "2026-10-05")!.tipo).toBe("inativo");
    expect(r.dias.find((x) => x.data === "2026-10-05")!.falta).toBe(false);
    expect(r.dias.find((x) => x.data === "2026-10-20")!.inconsistencias[0]).toContain("ímpar");
  });

  it("um período de trabalho longo não divide a jornada", () => {
    const r = calcularMes(
      entrada([
        ...dia("2026-10-02", "08:00", "12:00", "13:00", "17:48"),
        ...dia("2026-10-05", "07:58", "12:00", "12:30", "19:30"),
      ]),
    );
    const d = r.dias.find((x) => x.data === "2026-10-05")!;
    expect(d.interjornada).toBe(3 * 1440 - 17 * 60 - 48 + 7 * 60 + 58);
    expect(d.interjornadaSuprimida).toBe(0);
    expect(d.extras).toBe(134);
  });
});
