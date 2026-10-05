/**
 * Leitura de planilhas CSV de marcações. Aceita dois formatos:
 *
 * 1. Uma marcação por linha:   cpf;data;hora
 * 2. Várias marcações na linha: matricula;data;entrada;saida;entrada;saida
 *
 * A identificação pode ser por "cpf", "pis" ou "matricula". Datas em
 * dd/mm/aaaa ou aaaa-mm-dd. Qualquer coluna com horário (hh:mm) que não seja
 * identificação ou data vira uma marcação. Separador ";" ou ",".
 */
import type { MarcacaoLida, ResultadoLeitura } from "./afd";

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const COLUNAS_ID = { cpf: ["cpf"], pis: ["pis", "pispasep", "nis"], matricula: ["matricula", "registro", "codigo", "cod"] };
const COLUNAS_DATA = ["data", "dia", "datamarcacao"];

function dividir(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (c === sep && !aspas) {
      campos.push(atual.trim());
      atual = "";
    } else atual += c;
  }
  campos.push(atual.trim());
  return campos;
}

function lerData(v: string): string | null {
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  let a: number, mes: number, d: number;
  if (m) [d, mes, a] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v))) [a, mes, d] = [+m[1], +m[2], +m[3]];
  else return null;
  if (mes < 1 || mes > 12 || d < 1 || d > new Date(Date.UTC(a, mes, 0)).getUTCDate()) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function lerHora(v: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function lerCsv(conteudo: string): ResultadoLeitura {
  const linhas = conteudo.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const resultado: ResultadoLeitura = { cnpjEmpregador: null, marcacoes: [], erros: [], totalLinhas: 0 };
  if (!linhas.length) {
    resultado.erros.push("O arquivo está vazio.");
    return resultado;
  }
  const sep = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const cabecalho = dividir(linhas[0], sep).map(normalizar);

  const achar = (nomes: string[]) => cabecalho.findIndex((c) => nomes.includes(c));
  const idx = {
    cpf: achar(COLUNAS_ID.cpf),
    pis: achar(COLUNAS_ID.pis),
    matricula: achar(COLUNAS_ID.matricula),
    data: achar(COLUNAS_DATA),
  };
  if (idx.data < 0) {
    resultado.erros.push('Cabeçalho sem a coluna "data".');
    return resultado;
  }
  if (idx.cpf < 0 && idx.pis < 0 && idx.matricula < 0) {
    resultado.erros.push('Cabeçalho precisa de uma coluna "cpf", "pis" ou "matricula".');
    return resultado;
  }
  const reservadas = new Set([idx.cpf, idx.pis, idx.matricula, idx.data]);

  for (let i = 1; i < linhas.length; i++) {
    const n = i + 1;
    resultado.totalLinhas++;
    const campos = dividir(linhas[i], sep);
    const data = lerData(campos[idx.data] ?? "");
    if (!data) {
      resultado.erros.push(`Linha ${n}: data inválida.`);
      continue;
    }
    const id: Pick<MarcacaoLida, "cpf" | "pis" | "matricula"> = {};
    if (idx.cpf >= 0 && campos[idx.cpf]) id.cpf = campos[idx.cpf].replace(/\D/g, "").padStart(11, "0");
    if (idx.pis >= 0 && campos[idx.pis]) id.pis = campos[idx.pis].replace(/\D/g, "").padStart(11, "0");
    if (idx.matricula >= 0 && campos[idx.matricula]) id.matricula = campos[idx.matricula];
    if (!id.cpf && !id.pis && !id.matricula) {
      resultado.erros.push(`Linha ${n}: empregado não identificado.`);
      continue;
    }

    // Horários da linha em ordem; um horário menor que o anterior é do dia seguinte.
    let dia = data;
    let anterior = -1;
    let achouHora = false;
    campos.forEach((valor, col) => {
      if (reservadas.has(col) || !valor) return;
      const hora = lerHora(valor);
      if (!hora) return;
      achouHora = true;
      const minutos = +hora.slice(0, 2) * 60 + +hora.slice(3);
      if (minutos < anterior) {
        const d = new Date(`${dia}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        dia = d.toISOString().slice(0, 10);
      }
      anterior = minutos;
      resultado.marcacoes.push({ linha: n, nsr: null, dataHora: `${dia}T${hora}:00`, ...id });
    });
    if (!achouHora) resultado.erros.push(`Linha ${n}: nenhum horário encontrado.`);
  }
  return resultado;
}
