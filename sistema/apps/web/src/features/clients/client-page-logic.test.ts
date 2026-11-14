import { describe, expect, it } from 'vitest';
import { clientRegistrationInputSchema, rolePermissions, type MemberRole, type PermissionKey } from '@effinance/shared';
import { documentErrors } from './client-documents-sheet';
import {
  clientListPath,
  clientPageActions,
  clientPageArea,
  clientPagePath,
  clientSections,
  pickRegistration,
  registrationPatch,
  sectionFromParam,
} from './client-page-logic';

const canFor =
  (role: MemberRole, overrides: Partial<Record<PermissionKey, boolean>> = {}) =>
  (key: PermissionKey) =>
    ({ ...rolePermissions(role), ...overrides })[key] === true;

describe('client page: sections by permission', () => {
  it('the owner sees every section', () => {
    expect(clientSections(canFor('owner'))).toEqual(['dados', 'documentos', 'acessos', 'tarefas', 'financeiro']);
  });

  it('a collaborator (defaults) has no accesses and no finances', () => {
    expect(clientSections(canFor('viewer'))).toEqual(['dados', 'documentos', 'tarefas']);
  });

  it('accesses follow clientCredentials, the finances follow finance', () => {
    expect(clientSections(canFor('viewer', { clientCredentials: true }))).toContain('acessos');
    expect(clientSections(canFor('editor', { finance: false }))).not.toContain('financeiro');
    expect(clientSections(canFor('editor', { clientCredentials: false }))).not.toContain('acessos');
  });

  it('?aba= of a hidden or unknown section falls back to "Dados"', () => {
    const viewer = clientSections(canFor('viewer'));
    expect(sectionFromParam('tarefas', viewer)).toBe('tarefas');
    expect(sectionFromParam('financeiro', viewer)).toBe('dados');
    expect(sectionFromParam('acessos', viewer)).toBe('dados');
    expect(sectionFromParam('<script>', viewer)).toBe('dados');
    expect(sectionFromParam(null, viewer)).toBe('dados');
  });
});

describe('client page: actions by permission', () => {
  const active = { status: 'active' as const };
  const inactive = { status: 'inactive' as const };

  it('collaborator: edits the registration and the documents, nothing financial', () => {
    expect(clientPageActions(canFor('viewer'), active)).toEqual({
      editData: 'registration',
      editDocuments: true,
      finance: false,
      inactivate: false,
      reactivate: false,
    });
  });

  it('with clients turned off and no finance: read only', () => {
    expect(clientPageActions(canFor('viewer', { clients: false }), active)).toMatchObject({ editData: null, editDocuments: false });
  });

  it('finance edits the whole client and inactivates or reactivates by status', () => {
    expect(clientPageActions(canFor('editor'), active)).toEqual({ editData: 'full', editDocuments: true, finance: true, inactivate: true, reactivate: false });
    expect(clientPageActions(canFor('editor'), inactive)).toMatchObject({ inactivate: false, reactivate: true });
    // Finance without `clients`: the full form (PUT) still edits; the documents' own route does not.
    expect(clientPageActions(canFor('editor', { clients: false }), active)).toMatchObject({ editData: 'full', editDocuments: false });
  });
});

describe('client page: addresses', () => {
  it('one page in each shell', () => {
    expect(clientPagePath('gestao', 'k1')).toBe('/tarefas/clientes/k1');
    expect(clientPagePath('financeiro', 'k1')).toBe('/clientes/k1');
    expect(clientPagePath('gestao', 'k1', 'documentos')).toBe('/tarefas/clientes/k1?aba=documentos');
    expect(clientPagePath('financeiro', 'k1', 'dados')).toBe('/clientes/k1');
    expect(clientListPath('gestao')).toBe('/tarefas/clientes');
    expect(clientListPath('financeiro')).toBe('/clientes');
    expect(clientPageArea('/tarefas/clientes/k1')).toBe('gestao');
    expect(clientPageArea('/clientes/k1')).toBe('financeiro');
  });
});

describe('client page: registration PATCH', () => {
  const values = {
    name: 'Padaria Pão Dourado Ltda',
    tradeName: 'Pão Dourado',
    taxRegime: 'presumed_profit',
    simplesAnnex: null,
    stateRegistration: null,
    stateRegistrationExempt: true,
    email: 'contato@paodourado.com.br',
  };

  it('sends only what changed', () => {
    expect(registrationPatch(values, { tradeName: true, email: true })).toEqual({ tradeName: 'Pão Dourado', email: 'contato@paodourado.com.br' });
    expect(registrationPatch(values, {})).toEqual({});
  });

  it('takes the annex with the regime and the state registration with the exemption', () => {
    expect(registrationPatch(values, { taxRegime: true })).toEqual({ taxRegime: 'presumed_profit', simplesAnnex: null });
    expect(registrationPatch(values, { stateRegistrationExempt: true })).toEqual({ stateRegistrationExempt: true, stateRegistration: null });
  });

  it('never sends a financial field, even when the form marks it', () => {
    const patch = registrationPatch({ ...values, notes: 'x', feeDueDay: 5 } as Record<string, unknown>, { notes: true, feeDueDay: true, name: true });
    expect(patch).toEqual({ name: 'Padaria Pão Dourado Ltda' });
    expect(clientRegistrationInputSchema.safeParse(patch).success).toBe(true);
  });

  it('the form values validated by the PATCH schema carry only registration fields', () => {
    const picked = pickRegistration({ name: 'ACME', contractStartDate: '2026-01-01', notes: 'n', documents: [], responsibleDocument: '' });
    expect(picked).toEqual({ name: 'ACME' });
    expect(clientRegistrationInputSchema.safeParse({ name: 'ACME', notes: 'n' }).success).toBe(false);
  });
});

describe('documents sheet: errors by row', () => {
  it('maps documents.<i>.<field> to the row and the rest to the list', () => {
    const { rows, list } = documentErrors([
      { path: ['documents', 1, 'expiresAt'], message: 'Data inválida' },
      { path: ['documents', 1, 'expiresAt'], message: 'segunda mensagem' },
      { path: ['documents', 0, 'kind'], message: 'Escolha o tipo' },
      { path: ['documents'], message: 'Documento repetido na lista' },
    ]);
    expect(rows[0]).toEqual({ kind: 'Escolha o tipo' });
    expect(rows[1]).toEqual({ expiresAt: 'Data inválida' });
    expect(list).toBe('Documento repetido na lista');
  });
});
