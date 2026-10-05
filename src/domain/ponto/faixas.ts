export type TipoDiaFaixa = "util" | "descanso";
export type BaseFaixa = "diaria" | "mensal";

export type Faixa = {
  tipoDia: TipoDiaFaixa;
  /** Limite superior acumulado em minutos; null = sem limite. */
  ateMinutos: number | null;
  percentual: number;
};

export type TabelaFaixas = { base: BaseFaixa; faixas: Faixa[] };

/** Usado quando a tabela não define faixas para o tipo de dia (art. 7º, XVI CF e Súmula 146 TST). */
export const PERCENTUAL_PADRAO: Record<TipoDiaFaixa, number> = { util: 50, descanso: 100 };

export type HorasPorPercentual = { tipoDia: TipoDiaFaixa; percentual: number; minutos: number };

/** Ordena as faixas e garante que a última não tenha limite. */
export function normalizarFaixas(faixas: Faixa[], tipoDia: TipoDiaFaixa): Faixa[] {
  const doTipo = faixas
    .filter((f) => f.tipoDia === tipoDia)
    .sort((a, b) => (a.ateMinutos ?? Infinity) - (b.ateMinutos ?? Infinity));
  if (!doTipo.length) return [{ tipoDia, ateMinutos: null, percentual: PERCENTUAL_PADRAO[tipoDia] }];
  const ultima = doTipo[doTipo.length - 1];
  if (ultima.ateMinutos !== null) doTipo.push({ ...ultima, ateMinutos: null });
  return doTipo;
}

/**
 * Distribui as horas extras pelas faixas. Na base mensal o acumulado corre o
 * mês todo, em ordem cronológica; na base diária ele recomeça a cada dia.
 * `extrasPorDia` deve vir em ordem cronológica.
 */
export function distribuirPorFaixas(
  extrasPorDia: { tipoDia: TipoDiaFaixa; minutos: number }[],
  tabela: TabelaFaixas | null,
): HorasPorPercentual[] {
  const base = tabela?.base ?? "mensal";
  const faixas = tabela?.faixas ?? [];
  const acumulado: Record<TipoDiaFaixa, number> = { util: 0, descanso: 0 };
  const total = new Map<string, HorasPorPercentual>();

  for (const dia of extrasPorDia) {
    if (dia.minutos <= 0) continue;
    if (base === "diaria") acumulado[dia.tipoDia] = 0;
    let restante = dia.minutos;
    for (const faixa of normalizarFaixas(faixas, dia.tipoDia)) {
      if (restante <= 0) break;
      const limite = faixa.ateMinutos ?? Infinity;
      const disponivel = limite - acumulado[dia.tipoDia];
      if (disponivel <= 0) continue;
      const usado = Math.min(disponivel, restante);
      restante -= usado;
      acumulado[dia.tipoDia] += usado;
      const chave = `${dia.tipoDia}:${faixa.percentual}`;
      const atual = total.get(chave) ?? { tipoDia: dia.tipoDia, percentual: faixa.percentual, minutos: 0 };
      atual.minutos += usado;
      total.set(chave, atual);
    }
  }
  return [...total.values()].sort((a, b) =>
    a.tipoDia === b.tipoDia ? a.percentual - b.percentual : a.tipoDia === "util" ? -1 : 1,
  );
}
