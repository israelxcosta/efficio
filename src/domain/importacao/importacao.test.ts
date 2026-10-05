import { describe, expect, it } from "vitest";
import { lerAfd } from "./afd";
import { lerCsv } from "./csv";

describe("AFD", () => {
  it("lê o leiaute da Portaria 1.510 (PIS)", () => {
    const afd = [
      "0000000001" + "1" + "60020568000104" + "000000000000" + "EFFICIO".padEnd(150),
      "000000002" + "3" + "05102026" + "0802" + "012054444814",
      "000000003" + "3" + "05102026" + "1201" + "012054444814",
      "999999999" + "9" + "000000000",
    ].join("\r\n");
    const r = lerAfd(afd);
    expect(r.erros).toEqual([]);
    expect(r.cnpjEmpregador).toBe("60020568000104");
    expect(r.marcacoes.map((m) => [m.dataHora, m.pis, m.nsr])).toEqual([
      ["2026-10-05T08:02:00", "12054444814", 2],
      ["2026-10-05T12:01:00", "12054444814", 3],
    ]);
  });

  it("lê o leiaute da Portaria 671 (CPF)", () => {
    const linha = "000000010" + "3" + "2026-10-05T22:15:00-0300" + "052998224725" + "ABCD";
    const r = lerAfd(linha);
    expect(r.marcacoes).toEqual([
      { linha: 1, nsr: 10, dataHora: "2026-10-05T22:15:00", cpf: "52998224725" },
    ]);
  });

  it("aponta datas inválidas", () => {
    const r = lerAfd("000000002" + "3" + "31022026" + "0802" + "012054444814");
    expect(r.marcacoes).toEqual([]);
    expect(r.erros[0]).toContain("Linha 1");
  });
});

describe("CSV", () => {
  it("lê uma marcação por linha", () => {
    const r = lerCsv("CPF;Data;Hora\n529.982.247-25;05/10/2026;08:00\n529.982.247-25;05/10/2026;12:00");
    expect(r.erros).toEqual([]);
    expect(r.marcacoes.map((m) => [m.cpf, m.dataHora])).toEqual([
      ["52998224725", "2026-10-05T08:00:00"],
      ["52998224725", "2026-10-05T12:00:00"],
    ]);
  });

  it("lê várias marcações por linha e vira a meia-noite", () => {
    const r = lerCsv("matricula,data,entrada,saida,entrada,saida\n15,2026-10-05,22:00,02:00,03:00,06:00");
    expect(r.marcacoes.map((m) => m.dataHora)).toEqual([
      "2026-10-05T22:00:00",
      "2026-10-06T02:00:00",
      "2026-10-06T03:00:00",
      "2026-10-06T06:00:00",
    ]);
    expect(r.marcacoes[0].matricula).toBe("15");
  });

  it("exige identificação e data no cabeçalho", () => {
    expect(lerCsv("nome;hora\nAna;08:00").erros[0]).toContain("data");
  });
});
