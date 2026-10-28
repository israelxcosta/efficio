import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { onlyDigits, type SearchResponse } from '@effinance/shared';
import type { DbExecutor } from '../../db/client';
import { accounts, categories, contacts, transactions, type CategoryRow, type TransactionRow } from '../../db/schema';
import { today } from '../../lib/clock';
import { likePattern } from '../../lib/sql';
import { listAccountsWithBalances } from '../accounts/service';
import { toCategory } from '../categories/service';
import { getCipher } from '../../lib/crypto/keyring';
import { documentIndex, toContact } from '../contacts/service';
import { toTransactions } from '../transactions/mapper';

/**
 * What the requesting member may find. Without access to the finances (lib/finance-access.ts) the
 * search covers clients and suppliers only: transactions, accounts and categories are not queried.
 */
export interface SearchScope {
  finance: boolean;
}

const none = <T>(): Promise<T[]> => Promise.resolve([]);

/** Notes and contact details are encrypted: search covers descriptions, names and exact CPF/CNPJ. */
export async function search(db: DbExecutor, workspaceId: string, q: string, scope: SearchScope): Promise<SearchResponse> {
  const pattern = likePattern(q);
  const digits = onlyDigits(q);
  const cipher = await getCipher(workspaceId);
  const documentHash =
    digits.length === 11 || digits.length === 14 ? await documentIndex(cipher, digits) : null;
  const [txRows, accountRows, categoryRows, contactRows] = await Promise.all([
    !scope.finance
      ? none<TransactionRow>()
      : db
          .select()
          .from(transactions)
          .where(and(eq(transactions.workspaceId, workspaceId), ilike(transactions.description, pattern)))
          // Closest to today first, so far-future occurrences of a series don't crowd the results.
          .orderBy(asc(sql`abs(${transactions.date} - ${today()}::date)`), desc(transactions.date))
          .limit(8),
    !scope.finance
      ? none<{ id: string }>()
      : db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.workspaceId, workspaceId), ilike(accounts.name, pattern)))
          .limit(5),
    !scope.finance
      ? none<CategoryRow>()
      : db
          .select()
          .from(categories)
          .where(and(eq(categories.workspaceId, workspaceId), ilike(categories.name, pattern)))
          .limit(5),
    db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          or(
            ilike(contacts.name, pattern),
            ilike(contacts.tradeName, pattern),
            documentHash ? eq(contacts.documentHash, documentHash) : undefined,
          ),
        ),
      )
      .limit(5),
  ]);

  const matchedAccounts = new Set(accountRows.map((a) => a.id));
  const allAccounts = matchedAccounts.size ? await listAccountsWithBalances(db, workspaceId, true) : [];

  return {
    transactions: await toTransactions(db, txRows),
    accounts: allAccounts.filter((a) => matchedAccounts.has(a.id)),
    categories: categoryRows.map(toCategory),
    contacts: await Promise.all(contactRows.map((r) => toContact(cipher, r))),
  };
}
