import { describe, expect, it } from 'vitest';
import type { SearchResponse } from '@effinance/shared';
import { contactPathFor, filterPaletteGroups, matchesPaletteQuery, paletteAreaFor, paletteNavFor, SEARCH_PLACEHOLDERS, visibleSearchHits } from './command-palette';
import { FINANCE_NAV_ITEMS, GESTAO_NAV_ITEMS } from './nav';

// A search answer with hits of both areas, as an administrator gets it (or as it stays in the cache
// after the member is demoted to collaborator).
const answer = {
  transactions: [{ id: 't1', description: 'Aluguel', amount: 250000 }],
  accounts: [{ id: 'a1', name: 'Conta PJ', balance: 1234500 }],
  categories: [{ id: 'c1', name: 'Honorários' }],
  contacts: [
    { id: 'k1', name: 'Padaria Pão Quente', kind: 'client' },
    { id: 'k2', name: 'Papelaria Central', kind: 'supplier' },
  ],
  tasks: [{ id: 'x1', title: 'Balancete', kind: 'standalone', status: 'todo', dueDate: null, overdue: false, client: null }],
  recurringTasks: [{ id: 'r1', name: 'DCTFWeb', period: 'monthly' }],
  unions: [{ id: 'u1', name: 'Sindicato dos Comerciários', acronym: 'SINDCOM', category: 'Comerciários', active: true }],
} as unknown as SearchResponse;

const none = { transactions: [], accounts: [], categories: [], contacts: [], tasks: [], recurringTasks: [], unions: [] };

describe('paletteAreaFor (⌘K)', () => {
  it('searches the finances only in the Financeiro and only with access to them', () => {
    expect(paletteAreaFor('financeiro', true)).toBe('financeiro');
    expect(paletteAreaFor('gestao', true)).toBe('gestao');
    expect(paletteAreaFor('financeiro', false)).toBe('gestao');
  });
});

describe('visibleSearchHits (⌘K)', () => {
  it('in the Gestão shows only its results: tasks, recurring tasks, unions and clients', () => {
    const hits = visibleSearchHits(answer, 'gestao', true);
    expect(hits.tasks.map((t) => t.id)).toEqual(['x1']);
    expect(hits.recurringTasks.map((t) => t.id)).toEqual(['r1']);
    expect(hits.unions.map((u) => u.id)).toEqual(['u1']);
    expect(hits.contacts.map((c) => c.id)).toEqual(['k1']);
    expect(hits.transactions).toEqual([]);
    expect(hits.accounts).toEqual([]);
    expect(hits.categories).toEqual([]);
  });

  it('in the Financeiro shows only its results: transactions, accounts, categories, clients and suppliers', () => {
    const hits = visibleSearchHits(answer, 'financeiro', true);
    expect(hits.transactions.map((t) => t.id)).toEqual(['t1']);
    expect(hits.accounts.map((a) => a.id)).toEqual(['a1']);
    expect(hits.categories.map((c) => c.id)).toEqual(['c1']);
    expect(hits.contacts.map((c) => c.id)).toEqual(['k1', 'k2']);
    expect(hits.tasks).toEqual([]);
    expect(hits.recurringTasks).toEqual([]);
    expect(hits.unions).toEqual([]);
  });

  it('never shows transactions, accounts (balances), categories or suppliers to a collaborator (security regression)', () => {
    // The palette used to render whatever `/search` returned: only the API kept amounts away.
    expect(visibleSearchHits(answer, 'gestao', false)).toEqual({
      ...none,
      contacts: [answer.contacts[0]],
      tasks: answer.tasks,
      recurringTasks: answer.recurringTasks,
      unions: answer.unions,
    });
    // Even with a stale "financeiro" area (a cached rail), nothing financial.
    expect(visibleSearchHits(answer, 'financeiro', false)).toEqual(none);
  });

  it('shows the Gestão results to every member', () => {
    for (const admin of [true, false]) {
      const hits = visibleSearchHits(answer, 'gestao', admin);
      expect(hits.tasks.map((t) => t.id)).toEqual(['x1']);
      expect(hits.recurringTasks.map((t) => t.id)).toEqual(['r1']);
      expect(hits.unions.map((u) => u.id)).toEqual(['u1']);
    }
  });

  it('handles no answer yet', () => {
    expect(visibleSearchHits(undefined, 'gestao', false)).toEqual(none);
    expect(visibleSearchHits(undefined, 'financeiro', true)).toEqual(none);
  });

  it('leaves out hits of Gestão pages hidden for the person (phase 3)', () => {
    const hidden = (key: string) => !['page.registry', 'page.recurring', 'page.clients'].includes(key);
    for (const admin of [true, false]) {
      const hits = visibleSearchHits(answer, 'gestao', admin, hidden);
      expect(hits.unions).toEqual([]);
      expect(hits.recurringTasks).toEqual([]);
      expect(hits.contacts).toEqual([]);
      expect(hits.tasks.map((t) => t.id)).toEqual(['x1']);
    }
    // The finance registry of clients does not depend on the Gestão page.
    expect(visibleSearchHits(answer, 'financeiro', true, hidden).contacts.map((c) => c.id)).toEqual(['k1', 'k2']);
  });

  it('never carries a client access: the search answer has no such field to show', () => {
    for (const area of ['gestao', 'financeiro'] as const) {
      expect(JSON.stringify(visibleSearchHits(answer, area, true))).not.toMatch(/simplesAccessCode|accountantPassword|senha/i);
    }
  });
});

describe('contactPathFor (⌘K)', () => {
  const client = { id: 'k1', kind: 'client' as const };
  const supplier = { id: 'k2', kind: 'supplier' as const };

  it('opens a client in the module where the search is', () => {
    expect(contactPathFor('gestao', client)).toBe('/tarefas/clientes?cliente=k1');
    expect(contactPathFor('financeiro', client)).toBe('/clientes?consultar=k1');
  });

  it('opens a supplier in the finance registry', () => {
    expect(contactPathFor('financeiro', supplier)).toBe('/fornecedores?editar=k2');
  });
});

describe('paletteNavFor (⌘K)', () => {
  const paths = (area: 'gestao' | 'financeiro', can?: (key: string) => boolean) => paletteNavFor(area, can).items.map((i) => i.to);

  it('in the Gestão lists only its pages (the hub ones and Grupos por regime included)', () => {
    const nav = paletteNavFor('gestao');
    expect(nav.heading).toBe('Gestão de tarefas');
    expect(paths('gestao')).toEqual([...GESTAO_NAV_ITEMS.map((i) => i.to), '/tarefas/recorrentes?visao=regimes']);
    expect(paths('gestao').some((p) => FINANCE_NAV_ITEMS.some((f) => f.to === p))).toBe(false);
  });

  it('in the Financeiro lists only its pages', () => {
    const nav = paletteNavFor('financeiro');
    expect(nav.heading).toBe('Financeiro');
    expect(paths('financeiro')).toEqual(FINANCE_NAV_ITEMS.map((i) => i.to));
  });

  it('leaves out Gestão pages hidden for the person', () => {
    const noRecurring = (key: string) => key !== 'page.recurring';
    expect(paths('gestao', noRecurring)).not.toContain('/tarefas/recorrentes');
    expect(paths('gestao', noRecurring)).not.toContain('/tarefas/recorrentes?visao=regimes');
  });
});

describe('SEARCH_PLACEHOLDERS (⌘K)', () => {
  it('says what each area searches', () => {
    expect(SEARCH_PLACEHOLDERS.gestao).toBe('Buscar tarefas, clientes, páginas ou ações…');
    expect(SEARCH_PLACEHOLDERS.financeiro).toBe('Buscar lançamentos, contas, clientes, páginas ou ações…');
  });
});

describe('filterPaletteGroups (⌘K actions and pages while searching)', () => {
  const groups = [
    {
      heading: 'Ações do financeiro',
      entries: [
        { id: 'expense', label: 'Nova despesa' },
        { id: 'income', label: 'Nova receita' },
        { id: 'invest', label: 'Investir', keywords: 'aplicar' },
      ],
    },
    {
      heading: 'Ir para · Financeiro',
      entries: [
        { id: 'payables', label: 'Contas a pagar', keywords: 'despesas boletos vencimentos' },
        { id: 'transfers', label: 'Transferências e investimentos', keywords: 'investir aplicar resgatar mover' },
      ],
    },
    { heading: 'Outros', entries: [{ id: 'settings', label: 'Configurações', keywords: 'perfil senha' }] },
  ];
  const ids = (q: string) => filterPaletteGroups(groups, q).map((g) => [g.heading, g.entries.map((e) => e.id)]);

  it('lists everything before the search starts (cmdk filters the first letter)', () => {
    expect(filterPaletteGroups(groups, '')).toBe(groups);
    expect(filterPaletteGroups(groups, 'd')).toBe(groups);
  });

  it('keeps only the actions and pages whose label or keywords have the text, and drops empty groups', () => {
    expect(ids('despesa')).toEqual([
      ['Ações do financeiro', ['expense']],
      ['Ir para · Financeiro', ['payables']],
    ]);
    expect(ids('aplicar')).toEqual([
      ['Ações do financeiro', ['invest']],
      ['Ir para · Financeiro', ['transfers']],
    ]);
  });

  it('ignores accents and case, and needs every word typed', () => {
    expect(ids('CONFIGURACOES')).toEqual([['Outros', ['settings']]]);
    expect(ids('transferencias')).toEqual([['Ir para · Financeiro', ['transfers']]]);
    expect(ids('nova  receita')).toEqual([['Ações do financeiro', ['income']]]);
    expect(ids('nova pagar')).toEqual([]);
  });

  it('leaves nothing when nothing matches (the palette shows its empty state)', () => {
    expect(ids('assinatura')).toEqual([]);
  });

  it('matches the heading only through the entries (not "financeiro" for every page)', () => {
    expect(ids('financeiro')).toEqual([]);
    expect(matchesPaletteQuery({ label: 'Grupos por regime', keywords: 'simples presumido' }, 'Simples')).toBe(true);
    expect(matchesPaletteQuery({ label: 'Grupos por regime' }, 'gr reg')).toBe(true);
    expect(matchesPaletteQuery({ label: 'Grupos por regime' }, 'mei')).toBe(false);
  });
});
