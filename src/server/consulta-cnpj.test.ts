import { afterEach, describe, expect, it, vi } from "vitest";
import { consultarCnpjReceita } from "./consulta-cnpj";

const resposta = (status: number, corpo?: unknown) =>
  new Response(corpo === undefined ? null : JSON.stringify(corpo), { status });

afterEach(() => vi.unstubAllGlobals());

describe("consulta de CNPJ", () => {
  it("mapeia a resposta da BrasilAPI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        resposta(200, {
          razao_social: "EFFICIO CONTABILIDADE LTDA",
          nome_fantasia: "EFFICIO",
          descricao_situacao_cadastral: "ATIVA",
          data_inicio_atividade: "2025-03-10",
          natureza_juridica: "Sociedade Empresária Limitada",
          cnae_fiscal: 6920601,
          cnae_fiscal_descricao: "Atividades de contabilidade",
          porte: "MICRO EMPRESA",
          cep: "13840000",
          descricao_tipo_de_logradouro: "AVENIDA",
          logradouro: "PADRE JAIME",
          numero: "1865",
          complemento: "SALA 12",
          bairro: "VILA RICCI",
          municipio: "MOGI GUACU",
          uf: "SP",
          ddd_telefone_1: "1999685963",
          email: "CONTATO@EFFICIO.COM.BR",
        }),
      ),
    );
    const r = await consultarCnpjReceita("60.020.568/0001-04");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fonte).toBe("BrasilAPI");
    expect(r.dados).toMatchObject({
      cnpj: "60020568000104",
      razaoSocial: "EFFICIO CONTABILIDADE LTDA",
      cnaePrincipal: "6920601",
      logradouro: "Avenida Padre Jaime",
      bairro: "Vila Ricci",
      municipio: "Mogi Guacu",
      email: "contato@efficio.com.br",
    });
  });

  it("usa a fonte alternativa quando a primeira falha", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(resposta(503))
      .mockResolvedValueOnce(
        resposta(200, {
          razao_social: "EMPRESA TESTE LTDA",
          natureza_juridica: { descricao: "Sociedade Empresária Limitada" },
          porte: { descricao: "Micro Empresa" },
          estabelecimento: {
            nome_fantasia: null,
            situacao_cadastral: "Ativa",
            data_inicio_atividade: "2020-01-02",
            atividade_principal: { subclasse: "6920-6/01", descricao: "Contabilidade" },
            cep: "13840-000",
            tipo_logradouro: "Rua",
            logradouro: "DAS FLORES",
            numero: "10",
            complemento: null,
            bairro: "CENTRO",
            cidade: { nome: "Mogi Guaçu" },
            estado: { sigla: "sp" },
            ddd1: "19",
            telefone1: "35550000",
            email: null,
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const r = await consultarCnpjReceita("11222333000181");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(r.ok && r.fonte).toBe("CNPJ.ws");
    expect(r.ok && r.dados.cnaePrincipal).toBe("6920601");
    expect(r.ok && r.dados.uf).toBe("SP");
  });

  it("informa CNPJ não encontrado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(404)));
    const r = await consultarCnpjReceita("11222333000181");
    expect(r).toEqual({ ok: false, mensagem: "CNPJ não encontrado na base da Receita Federal." });
  });
});
