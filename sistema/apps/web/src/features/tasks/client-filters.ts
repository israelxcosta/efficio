import type { Client, ClientResponsible, TaskRef, TaxRegime } from '@effinance/shared';

// Filters of the Gestão's clients screen. `/clients` is paginated and knows nothing about responsibles
// and departments, so the screen loads every client and filters here (pure, tested).

export type ClientSituation = 'active' | 'inactive' | 'all';

export interface ClientFilters {
  search: string;
  situation: ClientSituation;
  regime: TaxRegime | '';
  department: string;
  responsible: string;
  unassigned: boolean;
}

const digits = (s: string) => s.replace(/\D/g, '');
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Departments without a responsible for a client (all of them count in phase 1: no recurring rules yet). */
export function missingDepartments(clientId: string, departments: TaskRef[], items: ClientResponsible[]): TaskRef[] {
  return departments.filter((d) => !items.some((i) => i.clientId === clientId && i.departmentId === d.id));
}

/** Clients that pass the filters of the screen (pure, tested). */
export function filterClients(clients: Client[], f: ClientFilters, departments: TaskRef[], items: ClientResponsible[]): Client[] {
  const q = normalize(f.search.trim());
  const qDigits = digits(f.search);
  const depts = f.department ? departments.filter((d) => d.id === f.department) : departments;
  return clients
    .filter((c) => f.situation === 'all' || c.status === f.situation)
    .filter((c) => !f.regime || c.taxRegime === f.regime)
    .filter(
      (c) =>
        !q ||
        normalize(`${c.name} ${c.tradeName ?? ''}`).includes(q) ||
        (qDigits.length >= 3 && c.document.includes(qDigits)),
    )
    .filter((c) => !f.responsible || items.some((i) => i.clientId === c.id && i.user.id === f.responsible && (!f.department || i.departmentId === f.department)))
    .filter((c) => !f.unassigned || missingDepartments(c.id, depts, items).length > 0)
    .sort((a, b) => (a.tradeName || a.name).localeCompare(b.tradeName || b.name, 'pt-BR'));
}
