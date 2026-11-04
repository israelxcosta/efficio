import { TAX_REGIMES, type Client, type TaxRegime } from '@effinance/shared';

// Filters of the Gestão's clients screen. The screen loads every client (`useAllClients`) and filters
// here (pure, tested in tasks-logic.test.ts).

export type ClientSituation = 'active' | 'inactive' | 'all';

export interface ClientFilters {
  search: string;
  situation: ClientSituation;
  regime: TaxRegime | '';
}

const digits = (s: string) => s.replace(/\D/g, '');
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Clients that pass the filters of the screen, by name. */
export function filterClients(clients: Client[], f: ClientFilters): Client[] {
  const q = normalize(f.search.trim());
  const qDigits = digits(f.search);
  return clients
    .filter((c) => f.situation === 'all' || c.status === f.situation)
    .filter((c) => !f.regime || c.taxRegime === f.regime)
    .filter(
      (c) =>
        !q ||
        normalize(`${c.name} ${c.tradeName ?? ''}`).includes(q) ||
        (qDigits.length >= 3 && c.document.includes(qDigits)),
    )
    .sort((a, b) => (a.tradeName || a.name).localeCompare(b.tradeName || b.name, 'pt-BR'));
}

/** Active clients per regime, in the catalog's order, without the empty ones (the summary's bars). */
export function activeByRegime(clients: Pick<Client, 'status' | 'taxRegime'>[]): { regime: TaxRegime; count: number }[] {
  const active = clients.filter((c) => c.status === 'active');
  return TAX_REGIMES.map((regime) => ({ regime, count: active.filter((c) => c.taxRegime === regime).length })).filter((r) => r.count > 0);
}
