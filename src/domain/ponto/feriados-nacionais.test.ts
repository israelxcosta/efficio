import { describe, expect, it } from "vitest";
import { domingoDePascoa, feriadosNacionais } from "./feriados-nacionais";

describe("feriados nacionais", () => {
  it("calcula a Páscoa", () => {
    expect(domingoDePascoa(2024)).toBe("2024-03-31");
    expect(domingoDePascoa(2025)).toBe("2025-04-20");
    expect(domingoDePascoa(2026)).toBe("2026-04-05");
  });

  it("gera os feriados de 2026", () => {
    const f = feriadosNacionais(2026);
    expect(f).toHaveLength(10);
    expect(f.find((x) => x.descricao === "Paixão de Cristo")?.data).toBe("2026-04-03");
    expect(f.some((x) => x.data === "2026-11-20")).toBe(true);
  });

  it("inclui facultativos quando pedido", () => {
    const f = feriadosNacionais(2026, true);
    expect(f.find((x) => x.descricao === "Corpus Christi")?.data).toBe("2026-06-04");
    expect(f.find((x) => x.descricao === "Carnaval (terça-feira)")?.data).toBe("2026-02-17");
  });
});
