import { describe, expect, it } from 'vitest';
import type { SearchResponse } from '@effinance/shared';
import { visibleSearchHits } from './command-palette';

// A search answer with financial hits, as an administrator gets it (or as it stays in the cache
// after the member is demoted to collaborator).
const answer = {
  transactions: [{ id: 't1', description: 'Aluguel', amount: 250000 }],
  accounts: [{ id: 'a1', name: 'Conta PJ', balance: 1234500 }],
  categories: [{ id: 'c1', name: 'Honorários' }],
  contacts: [
    { id: 'k1', name: 'Padaria Pão Quente', kind: 'client' },
    { id: 'k2', name: 'Papelaria Central', kind: 'supplier' },
  ],
} as unknown as SearchResponse;

describe('visibleSearchHits (⌘K)', () => {
  it('shows everything to administrators', () => {
    const hits = visibleSearchHits(answer, true);
    expect(hits.transactions).toHaveLength(1);
    expect(hits.accounts).toHaveLength(1);
    expect(hits.categories).toHaveLength(1);
    expect(hits.contacts.map((c) => c.id)).toEqual(['k1', 'k2']);
  });

  it('never shows transactions, accounts (balances), categories or suppliers to a collaborator (security regression)', () => {
    // The palette used to render whatever `/search` returned: only the API kept amounts away.
    const hits = visibleSearchHits(answer, false);
    expect(hits).toEqual({ transactions: [], accounts: [], categories: [], contacts: [answer.contacts[0]], tasks: [], recurringTasks: [], unions: [] });
  });

  it('shows tasks and recurring tasks to every member', () => {
    const withTasks = {
      ...answer,
      tasks: [{ id: 'x1', title: 'Balancete', kind: 'standalone', status: 'todo', dueDate: null, overdue: false, client: null }],
      recurringTasks: [{ id: 'r1', name: 'DCTFWeb', period: 'monthly' }],
    } as unknown as SearchResponse;
    for (const admin of [true, false]) {
      const hits = visibleSearchHits(withTasks, admin);
      expect(hits.tasks.map((t) => t.id)).toEqual(['x1']);
      expect(hits.recurringTasks.map((t) => t.id)).toEqual(['r1']);
    }
  });

  it('handles no answer yet', () => {
    expect(visibleSearchHits(undefined, false)).toEqual({ transactions: [], accounts: [], categories: [], contacts: [], tasks: [], recurringTasks: [], unions: [] });
  });

  it('shows unions to every member and leaves out hits of pages hidden for the person (phase 3)', () => {
    const withUnions = {
      ...answer,
      recurringTasks: [{ id: 'r1', name: 'DCTFWeb', period: 'monthly' }],
      unions: [{ id: 'u1', name: 'Sindicato dos Comerciários', acronym: 'SINDCOM', category: 'Comerciários', active: true }],
    } as unknown as SearchResponse;
    expect(visibleSearchHits(withUnions, false).unions.map((u) => u.id)).toEqual(['u1']);
    const hidden = (key: string) => !['page.registry', 'page.recurring', 'page.clients'].includes(key);
    const hits = visibleSearchHits(withUnions, false, hidden);
    expect(hits.unions).toEqual([]);
    expect(hits.recurringTasks).toEqual([]);
    expect(hits.contacts).toEqual([]);
    // An administrator still finds the client: it opens the finance registry.
    expect(visibleSearchHits(withUnions, true, hidden).contacts.map((c) => c.id)).toEqual(['k1', 'k2']);
  });

  it('never carries a client access: the search answer has no such field to show', () => {
    const hits = visibleSearchHits({ ...answer, unions: [] } as unknown as SearchResponse, true);
    expect(JSON.stringify(hits)).not.toMatch(/simplesAccessCode|accountantPassword|senha/i);
  });
});
