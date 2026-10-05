/**
 * Leitura do AFD (Arquivo Fonte de Dados) gerado pelo relógio de ponto.
 * Suporta o leiaute da Portaria 1.510/2009 (marcação tipo 3 com PIS) e o da
 * Portaria MTP 671/2021 (marcações tipo 3 e 7 com CPF e data no formato ISO).
 */
export type MarcacaoLida = {
  linha: number;
  nsr: number | null;
  /** "AAAA-MM-DDTHH:MM:00", horário local do relógio */
  dataHora: string;
  cpf?: string;
  pis?: string;
  matricula?: string;
};

export type ResultadoLeitura = {
  cnpjEmpregador: string | null;
  marcacoes: MarcacaoLida[];
  erros: string[];
  totalLinhas: number;
};

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

function dataValida(a: number, m: number, d: number, h: number, min: number): boolean {
  if (m < 1 || m > 12 || d < 1 || h > 23 || min > 59) return false;
  return d <= new Date(Date.UTC(a, m, 0)).getUTCDate();
}

const doze = (s: string) => s.replace(/\D/g, "").padStart(12, "0").slice(-11);

export function lerAfd(conteudo: string): ResultadoLeitura {
  const linhas = conteudo.split(/\r?\n/);
  const resultado: ResultadoLeitura = { cnpjEmpregador: null, marcacoes: [], erros: [], totalLinhas: 0 };

  linhas.forEach((bruta, i) => {
    const linha = bruta.replace(/\s+$/, "");
    if (!linha) return;
    resultado.totalLinhas++;
    const n = i + 1;
    if (linha.length < 10) {
      resultado.erros.push(`Linha ${n}: registro curto demais.`);
      return;
    }
    const tipo = linha[9];
    const nsr = Number(linha.slice(0, 9));

    if (tipo === "1") {
      // Cabeçalho: tipo de identificador (1 = CNPJ) e o documento do empregador.
      if (linha[10] === "1") resultado.cnpjEmpregador = linha.slice(11, 25).toUpperCase();
      return;
    }
    if (tipo !== "3" && tipo !== "7") return; // demais registros não são marcações

    const iso = ISO.exec(linha.slice(10, 34));
    if (iso) {
      // Portaria 671: data e hora ISO 8601 com fuso, seguido do CPF (12).
      const [, a, m, d, h, min] = iso;
      if (!dataValida(+a, +m, +d, +h, +min)) {
        resultado.erros.push(`Linha ${n}: data/hora inválida.`);
        return;
      }
      resultado.marcacoes.push({
        linha: n,
        nsr: Number.isFinite(nsr) ? nsr : null,
        dataHora: `${a}-${m}-${d}T${h}:${min}:00`,
        cpf: doze(linha.slice(34, 46)),
      });
      return;
    }

    // Portaria 1.510: ddmmaaaa hhmm PIS(12).
    const antigo = /^(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})(\d{12})/.exec(linha.slice(10, 34));
    if (tipo === "3" && antigo) {
      const [, d, m, a, h, min, pis] = antigo;
      if (!dataValida(+a, +m, +d, +h, +min)) {
        resultado.erros.push(`Linha ${n}: data/hora inválida.`);
        return;
      }
      resultado.marcacoes.push({
        linha: n,
        nsr: Number.isFinite(nsr) ? nsr : null,
        dataHora: `${a}-${m}-${d}T${h}:${min}:00`,
        pis: doze(pis),
      });
      return;
    }
    resultado.erros.push(`Linha ${n}: marcação em formato não reconhecido.`);
  });
  return resultado;
}
