import { dataParaDias, diasParaData } from "./tempo";

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function domingoDePascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export type FeriadoGerado = { data: string; descricao: string; facultativo: boolean };

/**
 * Feriados nacionais (Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023) e,
 * opcionalmente, os pontos facultativos mais comuns ligados à Páscoa.
 */
export function feriadosNacionais(ano: number, incluirFacultativos = false): FeriadoGerado[] {
  const p = dataParaDias(domingoDePascoa(ano));
  const fixo = (mmdd: string, descricao: string): FeriadoGerado => ({
    data: `${ano}-${mmdd}`,
    descricao,
    facultativo: false,
  });
  const lista: FeriadoGerado[] = [
    fixo("01-01", "Confraternização Universal"),
    { data: diasParaData(p - 2), descricao: "Paixão de Cristo", facultativo: false },
    fixo("04-21", "Tiradentes"),
    fixo("05-01", "Dia do Trabalho"),
    fixo("09-07", "Independência do Brasil"),
    fixo("10-12", "Nossa Senhora Aparecida"),
    fixo("11-02", "Finados"),
    fixo("11-15", "Proclamação da República"),
    fixo("12-25", "Natal"),
  ];
  if (ano >= 2024) lista.push(fixo("11-20", "Dia Nacional de Zumbi e da Consciência Negra"));
  if (incluirFacultativos) {
    lista.push(
      { data: diasParaData(p - 48), descricao: "Carnaval (segunda-feira)", facultativo: true },
      { data: diasParaData(p - 47), descricao: "Carnaval (terça-feira)", facultativo: true },
      { data: diasParaData(p + 60), descricao: "Corpus Christi", facultativo: true },
    );
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}
