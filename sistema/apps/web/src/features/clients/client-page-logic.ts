import { CLIENT_REGISTRATION_FIELDS, type Client, type ClientRegistrationField, type PermissionKey } from '@effinance/shared';

// The client page (UX 2.3): one record of the client in both areas, the sections and actions each
// member gets (pure, tested).

export type ClientPageArea = 'gestao' | 'financeiro';

export const CLIENT_SECTIONS = ['dados', 'documentos', 'acessos', 'tarefas', 'financeiro'] as const;
export type ClientSection = (typeof CLIENT_SECTIONS)[number];

export const CLIENT_SECTION_LABELS: Record<ClientSection, string> = {
  dados: 'Dados',
  documentos: 'Documentos e certidões',
  acessos: 'Acessos',
  tarefas: 'Tarefas',
  financeiro: 'Financeiro',
};

type Can = (key: PermissionKey) => boolean;

/** Accesses only with `clientCredentials`, the finances only with `finance`; the rest for every member. */
export function clientSections(can: Can): ClientSection[] {
  return CLIENT_SECTIONS.filter((s) => (s === 'acessos' ? can('clientCredentials') : s === 'financeiro' ? can('finance') : true));
}

/** `?aba=`: a section the member does not have (or an unknown one) falls back to "Dados". */
export function sectionFromParam(value: string | null, sections: readonly ClientSection[]): ClientSection {
  return sections.find((s) => s === value) ?? 'dados';
}

export interface ClientPageActions {
  /** "Editar dados": the whole form with `finance` (PUT), only the registration with `clients` (PATCH). */
  editData: 'full' | 'registration' | null;
  /** "Editar documentos" (`PUT /clients/:id/documents`). */
  editDocuments: boolean;
  /** Relatório financeiro, Contrato, Honorários. */
  finance: boolean;
  inactivate: boolean;
  reactivate: boolean;
}

export function clientPageActions(can: Can, client: Pick<Client, 'status'>): ClientPageActions {
  const finance = can('finance');
  return {
    editData: finance ? 'full' : can('clients') ? 'registration' : null,
    editDocuments: can('clients'),
    finance,
    inactivate: finance && client.status === 'active',
    reactivate: finance && client.status === 'inactive',
  };
}

/** The page of a client in the area's shell (the section is optional; "Dados" is the default). */
export function clientPagePath(area: ClientPageArea, id: string, section?: ClientSection): string {
  const base = area === 'financeiro' ? `/clientes/${id}` : `/tarefas/clientes/${id}`;
  return section && section !== 'dados' ? `${base}?aba=${section}` : base;
}

export function clientListPath(area: ClientPageArea): string {
  return area === 'financeiro' ? '/clientes' : '/tarefas/clientes';
}

export function clientPageArea(pathname: string): ClientPageArea {
  return pathname.startsWith('/tarefas/') ? 'gestao' : 'financeiro';
}

/**
 * Body of `PATCH /clients/:id/registration`: only what changed (the audit names the fields), with the
 * annex when the regime changed and the state registration when the exemption changed (the form
 * clears them without marking them).
 */
export function registrationPatch(
  values: Partial<Record<ClientRegistrationField, unknown>>,
  dirty: Partial<Record<string, unknown>>,
): Partial<Record<ClientRegistrationField, unknown>> {
  const changed = new Set<ClientRegistrationField>(CLIENT_REGISTRATION_FIELDS.filter((k) => Boolean(dirty[k])));
  if (changed.has('taxRegime')) changed.add('simplesAnnex');
  if (changed.has('stateRegistrationExempt')) changed.add('stateRegistration');
  const out: Partial<Record<ClientRegistrationField, unknown>> = {};
  for (const k of CLIENT_REGISTRATION_FIELDS) if (changed.has(k) && k in values) out[k] = values[k] ?? null;
  return out;
}

/** Only the registration fields of the form values (the PATCH refuses any other). */
export function pickRegistration<T extends Record<string, unknown>>(values: T): Partial<Record<ClientRegistrationField, unknown>> {
  const out: Partial<Record<ClientRegistrationField, unknown>> = {};
  for (const k of CLIENT_REGISTRATION_FIELDS) if (k in values) out[k] = values[k];
  return out;
}
