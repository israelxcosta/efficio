import { describe, expect, it } from "vitest";
import { distribuirPorFaixas, type TabelaFaixas } from "./faixas";

const h = (n: number) => n * 60;

describe("faixas de horas extras", () => {
  const tabela: TabelaFaixas = {
    base: "mensal",
    faixas: [
      { tipoDia: "util", ateMinutos: h(6), percentual: 50 },
      { tipoDia: "util", ateMinutos: h(15), percentual: 75 },
      { tipoDia: "util", ateMinutos: null, percentual: 100 },
    ],
  };

  it("acumula no mês: 6h a 50%, até 15h a 75%, resto a 100%", () => {
    const dias = [4, 4, 4, 4, 4].map((x) => ({ tipoDia: "util" as const, minutos: h(x) }));
    expect(distribuirPorFaixas(dias, tabela)).toEqual([
      { tipoDia: "util", percentual: 50, minutos: h(6) },
      { tipoDia: "util", percentual: 75, minutos: h(9) },
      { tipoDia: "util", percentual: 100, minutos: h(5) },
    ]);
  });

  it("na base diária recomeça a cada dia", () => {
    const diaria: TabelaFaixas = {
      base: "diaria",
      faixas: [
        { tipoDia: "util", ateMinutos: h(2), percentual: 50 },
        { tipoDia: "util", ateMinutos: null, percentual: 100 },
      ],
    };
    const dias = [3, 1].map((x) => ({ tipoDia: "util" as const, minutos: h(x) }));
    expect(distribuirPorFaixas(dias, diaria)).toEqual([
      { tipoDia: "util", percentual: 50, minutos: h(3) },
      { tipoDia: "util", percentual: 100, minutos: h(1) },
    ]);
  });

  it("usa 50% e 100% quando não há tabela", () => {
    expect(
      distribuirPorFaixas(
        [
          { tipoDia: "util", minutos: 90 },
          { tipoDia: "descanso", minutos: 240 },
        ],
        null,
      ),
    ).toEqual([
      { tipoDia: "util", percentual: 50, minutos: 90 },
      { tipoDia: "descanso", percentual: 100, minutos: 240 },
    ]);
  });

  it("após a última faixa limitada mantém o último percentual", () => {
    const t: TabelaFaixas = { base: "mensal", faixas: [{ tipoDia: "util", ateMinutos: h(2), percentual: 60 }] };
    expect(distribuirPorFaixas([{ tipoDia: "util", minutos: h(5) }], t)).toEqual([
      { tipoDia: "util", percentual: 60, minutos: h(5) },
    ]);
  });
});
