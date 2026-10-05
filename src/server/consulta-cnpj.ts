import "server-only";
import { z } from "zod";
import { normalizarCnpj } from "@/lib/validacao/documentos";

export type DadosCnpj = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
  dataAbertura: string;
  naturezaJuridica: string;
  cnaePrincipal: string;
  cnaeDescricao: string;
  porte: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  telefone: string;
  email: string;
};

const texto = z.union([z.string(), z.number()]).nullish().transform((v) => (v === null || v === undefined ? "" : String(v).trim()));

const brasilApi = z.object({
  razao_social: texto,
  nome_fantasia: texto,
  descricao_situacao_cadastral: texto,
  data_inicio_atividade: texto,
  natureza_juridica: texto,
  cnae_fiscal: texto,
  cnae_fiscal_descricao: texto,
  porte: texto,
  cep: texto,
  descricao_tipo_de_logradouro: texto,
  logradouro: texto,
  numero: texto,
  complemento: texto,
  bairro: texto,
  municipio: texto,
  uf: texto,
  ddd_telefone_1: texto,
  email: texto,
});

const cnpjWs = z.object({
  razao_social: texto,
  natureza_juridica: z.object({ descricao: texto }).nullish(),
  porte: z.object({ descricao: texto }).nullish(),
  estabelecimento: z.object({
    nome_fantasia: texto,
    situacao_cadastral: texto,
    data_inicio_atividade: texto,
    atividade_principal: z.object({ subclasse: texto, descricao: texto }).nullish(),
    cep: texto,
    tipo_logradouro: texto,
    logradouro: texto,
    numero: texto,
    complemento: texto,
    bairro: texto,
    cidade: z.object({ nome: texto }).nullish(),
    estado: z.object({ sigla: texto }).nullish(),
    ddd1: texto,
    telefone1: texto,
    email: texto,
  }),
});

const titulo = (s: string) =>
  s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

async function buscarJson(url: string): Promise<unknown | null> {
  const resposta = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "EfficioPonto/1.0" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.json();
}

async function viaBrasilApi(cnpj: string): Promise<DadosCnpj | null> {
  const json = await buscarJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!json) return null;
  const d = brasilApi.parse(json);
  return {
    cnpj,
    razaoSocial: d.razao_social,
    nomeFantasia: d.nome_fantasia,
    situacaoCadastral: d.descricao_situacao_cadastral,
    dataAbertura: d.data_inicio_atividade.slice(0, 10),
    naturezaJuridica: d.natureza_juridica,
    cnaePrincipal: d.cnae_fiscal,
    cnaeDescricao: d.cnae_fiscal_descricao,
    porte: d.porte,
    cep: d.cep.replace(/\D/g, ""),
    logradouro: titulo([d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(" ")),
    numero: d.numero,
    complemento: d.complemento,
    bairro: titulo(d.bairro),
    municipio: titulo(d.municipio),
    uf: d.uf.toUpperCase(),
    telefone: d.ddd_telefone_1,
    email: d.email.toLowerCase(),
  };
}

async function viaCnpjWs(cnpj: string): Promise<DadosCnpj | null> {
  const json = await buscarJson(`https://publica.cnpj.ws/cnpj/${cnpj}`);
  if (!json) return null;
  const d = cnpjWs.parse(json);
  const e = d.estabelecimento;
  return {
    cnpj,
    razaoSocial: d.razao_social,
    nomeFantasia: e.nome_fantasia,
    situacaoCadastral: e.situacao_cadastral,
    dataAbertura: e.data_inicio_atividade.slice(0, 10),
    naturezaJuridica: d.natureza_juridica?.descricao ?? "",
    cnaePrincipal: e.atividade_principal?.subclasse.replace(/\D/g, "") ?? "",
    cnaeDescricao: e.atividade_principal?.descricao ?? "",
    porte: d.porte?.descricao ?? "",
    cep: e.cep.replace(/\D/g, ""),
    logradouro: titulo([e.tipo_logradouro, e.logradouro].filter(Boolean).join(" ")),
    numero: e.numero,
    complemento: e.complemento,
    bairro: titulo(e.bairro),
    municipio: titulo(e.cidade?.nome ?? ""),
    uf: (e.estado?.sigla ?? "").toUpperCase(),
    telefone: [e.ddd1, e.telefone1].filter(Boolean).join(""),
    email: e.email.toLowerCase(),
  };
}

export type ResultadoConsulta =
  | { ok: true; dados: DadosCnpj; fonte: string }
  | { ok: false; mensagem: string };

/** Consulta os dados públicos do CNPJ (Receita Federal) com fonte alternativa. */
export async function consultarCnpjReceita(valor: string): Promise<ResultadoConsulta> {
  const cnpj = normalizarCnpj(valor);
  const fontes = [
    { nome: "BrasilAPI", buscar: viaBrasilApi },
    { nome: "CNPJ.ws", buscar: viaCnpjWs },
  ];
  let naoEncontrado = false;
  for (const fonte of fontes) {
    try {
      const dados = await fonte.buscar(cnpj);
      if (dados) return { ok: true, dados, fonte: fonte.nome };
      naoEncontrado = true;
    } catch (e) {
      console.warn(`[cnpj] ${fonte.nome} indisponível:`, e instanceof Error ? e.message : e);
    }
  }
  return {
    ok: false,
    mensagem: naoEncontrado
      ? "CNPJ não encontrado na base da Receita Federal."
      : "Não foi possível consultar a Receita Federal agora. Preencha os dados manualmente ou tente mais tarde.",
  };
}
