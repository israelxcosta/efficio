export const MINUTOS_DIA = 1440;

/** "08:30" -> 510. Retorna null para vazio ou inválido. */
export function hhmmParaMinutos(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 510 -> "08:30"; aceita valores acima de 24h para totais. */
export function minutosParaHhmm(min: number | null | undefined, comSinal = false): string {
  if (min === null || min === undefined) return "";
  const neg = min < 0;
  const total = Math.round(Math.abs(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const txt = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  if (neg && total > 0) return `-${txt}`;
  return comSinal && total > 0 ? `+${txt}` : txt;
}

/** Datas como "AAAA-MM-DD", sempre em UTC para não sofrer com fuso/horário de verão. */
export function dataParaDias(data: string): number {
  return Math.floor(Date.parse(`${data}T00:00:00Z`) / 86_400_000);
}

export function diasParaData(dias: number): string {
  return new Date(dias * 86_400_000).toISOString().slice(0, 10);
}

/** 1 = segunda ... 7 = domingo */
export function diaSemanaIso(data: string): number {
  const d = new Date(`${data}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** "AAAA-MM-DDTHH:MM[:SS]" -> minutos absolutos desde 1970 (horário local, sem fuso). */
export function dataHoraParaMinutos(dataHora: string): number {
  const [data, hora = "00:00"] = dataHora.replace(" ", "T").split("T");
  const [h, m] = hora.split(":").map(Number);
  return dataParaDias(data) * MINUTOS_DIA + h * 60 + m;
}

export function minutosParaDataHora(min: number): string {
  const dias = Math.floor(min / MINUTOS_DIA);
  const resto = min - dias * MINUTOS_DIA;
  return `${diasParaData(dias)}T${minutosParaHhmm(resto)}:00`;
}

export function diasDoMes(ano: number, mes: number): string[] {
  const inicio = dataParaDias(`${ano}-${String(mes).padStart(2, "0")}-01`);
  const fim = dataParaDias(
    mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`,
  );
  const out: string[] = [];
  for (let d = inicio; d < fim; d++) out.push(diasParaData(d));
  return out;
}
