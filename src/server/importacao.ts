import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { empregados, empresas, importacoes, marcacoes } from "@/db/schema";
import { lerAfd, type MarcacaoLida, type ResultadoLeitura } from "@/domain/importacao/afd";
import { lerCsv } from "@/domain/importacao/csv";
import { formatarCnpj } from "@/lib/validacao/documentos";

export type ResumoImportacao = {
  ok: boolean;
  mensagem: string;
  tipo?: "afd" | "csv";
  totalRegistros?: number;
  importadas?: number;
  duplicadas?: number;
  naoEncontrados?: string[];
  naoEncontradas?: number;
  erros?: string[];
  arquivoRepetido?: boolean;
};

/** Decodifica UTF-8 e, se houver caracteres inválidos, tenta Latin-1 (comum em relógios de ponto). */
export function decodificar(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("latin1").decode(bytes) : utf8;
}

export function detectarTipo(nome: string, conteudo: string): "afd" | "csv" {
  if (/\.csv$/i.test(nome)) return "csv";
  const primeira = conteudo.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return /^\d{10}/.test(primeira) ? "afd" : "csv";
}

export async function importarMarcacoes(params: {
  nomeArquivo: string;
  bytes: Uint8Array;
  tipo: "auto" | "afd" | "csv";
  empresaId: string;
  usuarioId: string;
}): Promise<ResumoImportacao> {
  const [empresa] = await db.select().from(empresas).where(eq(empresas.id, params.empresaId));
  if (!empresa) return { ok: false, mensagem: "Empresa não encontrada." };

  const conteudo = decodificar(params.bytes);
  const tipo = params.tipo === "auto" ? detectarTipo(params.nomeArquivo, conteudo) : params.tipo;
  const leitura: ResultadoLeitura = tipo === "afd" ? lerAfd(conteudo) : lerCsv(conteudo);

  if (leitura.cnpjEmpregador && /^[0-9A-Z]{12}\d{2}$/.test(leitura.cnpjEmpregador) && leitura.cnpjEmpregador !== empresa.cnpj) {
    return {
      ok: false,
      mensagem: `O arquivo é do CNPJ ${formatarCnpj(leitura.cnpjEmpregador)}, diferente da empresa selecionada (${formatarCnpj(empresa.cnpj)}).`,
    };
  }
  if (!leitura.marcacoes.length) {
    return { ok: false, mensagem: "Nenhuma marcação encontrada no arquivo.", tipo, erros: leitura.erros.slice(0, 50) };
  }

  const hash = createHash("sha256").update(params.bytes).digest("hex");
  const [anterior] = await db
    .select({ id: importacoes.id })
    .from(importacoes)
    .where(and(eq(importacoes.hashArquivo, hash), eq(importacoes.empresaId, empresa.id)))
    .limit(1);

  const lista = await db
    .select({ id: empregados.id, cpf: empregados.cpf, pis: empregados.pis, matricula: empregados.matricula })
    .from(empregados)
    .where(eq(empregados.empresaId, empresa.id));
  const porCpf = new Map(lista.map((e) => [e.cpf, e.id]));
  const porPis = new Map(lista.filter((e) => e.pis).map((e) => [e.pis!, e.id]));
  const porMatricula = new Map(lista.filter((e) => e.matricula).map((e) => [e.matricula!.toLowerCase(), e.id]));

  const encontrar = (m: MarcacaoLida) =>
    (m.cpf && porCpf.get(m.cpf)) || (m.pis && porPis.get(m.pis)) || (m.matricula && porMatricula.get(m.matricula.toLowerCase())) || null;

  const naoEncontrados = new Set<string>();
  let naoEncontradas = 0;
  const linhas: (typeof marcacoes.$inferInsert)[] = [];
  for (const m of leitura.marcacoes) {
    const empregadoId = encontrar(m);
    if (!empregadoId) {
      naoEncontradas++;
      naoEncontrados.add(m.cpf ? `CPF ${m.cpf}` : m.pis ? `PIS ${m.pis}` : `Matrícula ${m.matricula}`);
      continue;
    }
    linhas.push({ empregadoId, dataHora: m.dataHora, origem: tipo, nsr: m.nsr });
  }

  const resultado = await db.transaction(async (tx) => {
    const [registro] = await tx
      .insert(importacoes)
      .values({ empresaId: empresa.id, usuarioId: params.usuarioId, nomeArquivo: params.nomeArquivo.slice(0, 255), tipo, hashArquivo: hash })
      .returning({ id: importacoes.id });
    let importadas = 0;
    for (let i = 0; i < linhas.length; i += 1000) {
      const lote = linhas.slice(i, i + 1000).map((l) => ({ ...l, importacaoId: registro.id }));
      const inseridas = await tx.insert(marcacoes).values(lote).onConflictDoNothing().returning({ id: marcacoes.id });
      importadas += inseridas.length;
    }
    const duplicadas = linhas.length - importadas;
    await tx
      .update(importacoes)
      .set({
        totalRegistros: leitura.marcacoes.length,
        importadas,
        duplicadas,
        naoEncontradas,
        erros: leitura.erros.slice(0, 200),
      })
      .where(eq(importacoes.id, registro.id));
    return { importadas, duplicadas };
  });

  return {
    ok: true,
    mensagem: `${resultado.importadas} marcação(ões) importada(s).`,
    tipo,
    totalRegistros: leitura.marcacoes.length,
    ...resultado,
    naoEncontradas,
    naoEncontrados: [...naoEncontrados].slice(0, 30),
    erros: leitura.erros.slice(0, 50),
    arquivoRepetido: Boolean(anterior),
  };
}
