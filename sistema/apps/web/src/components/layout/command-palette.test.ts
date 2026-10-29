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
    expect(hits).toEqual({ transactions: [], accounts: [], categories: [], contacts: [answer.contacts[0]] });
  });

  it('handles no answer yet', () => {
    expect(visibleSearchHits(undefined, false)).toEqual({ transactions: [], accounts: [], categories: [], contacts: [] });
  });
});
