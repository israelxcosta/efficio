import { describe, expect, it } from "vitest";
import { formatarCnpj, validarCnpj, validarCpf, validarPis } from "./documentos";

describe("documentos", () => {
  it("valida CPF", () => {
    expect(validarCpf("529.982.247-25")).toBe(true);
    expect(validarCpf("529.982.247-24")).toBe(false);
    expect(validarCpf("111.111.111-11")).toBe(false);
  });

  it("valida CNPJ numérico", () => {
    expect(validarCnpj("60.020.568/0001-04")).toBe(true);
    expect(validarCnpj("11.222.333/0001-81")).toBe(true);
    expect(validarCnpj("11.222.333/0001-82")).toBe(false);
    expect(validarCnpj("00.000.000/0000-00")).toBe(false);
  });

  it("valida CNPJ alfanumérico (exemplo oficial da Receita Federal)", () => {
    expect(validarCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(validarCnpj("12abc34501de35")).toBe(true);
    expect(validarCnpj("12.ABC.345/01DE-36")).toBe(false);
    expect(formatarCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
  });

  it("valida PIS", () => {
    expect(validarPis("120.54444.81-4")).toBe(true);
    expect(validarPis("120.54444.81-9")).toBe(false);
  });
});
