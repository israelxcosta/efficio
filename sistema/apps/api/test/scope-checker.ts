// The checker of the scope tests (tasks-scope.test.ts, phase3-scope.test.ts): every statement a
// module sends must be tied to the workspace of the request. A heuristic on Drizzle's SQL (and the
// modules' hand-written fragments), not a SQL parser: it looks for the equalities, not for how they are
// combined.

import { TENANT_TABLES } from './db-roles';

export interface Statement {
  sql: string;
  params: unknown[];
}

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

const TENANT = new Set<string>(TENANT_TABLES);
/** Words that may follow a table name without being its alias. */
const NOT_ALIAS = new Set([
  ...'where on set left right inner full cross join order group limit offset'.split(' '),
  ...'returning values union having for using as default'.split(' '),
]);
/** `from|join|update|into <table> [as] [alias]` — the alias is a lookahead so `… join` is not swallowed. */
const REFERENCE =
  /\b(from|join|update|into)\s+"?([a-z_][a-z0-9_]*)"?(?=(?:\s+(?:as\s+)?"?([a-z_][a-z0-9_]*)"?)?)/g;
const OPERAND = String.raw`(?:(?:"?[a-z_][a-z0-9_]*"?\.)?"?workspace_id"?|\$\d+(?:::uuid)?)`;
const EQUALITY = new RegExp(`(${OPERAND})\\s*=\\s*(${OPERAND})`, 'g');
const WS = '<workspace>';
const UNQUALIFIED = '<unqualified>';

/** Splits `a, (b, c), d` at the commas outside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/** The parenthesized groups of `(…), (…)` (rows of a VALUES list). */
function groups(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (text[i] === ')') {
      depth--;
      if (depth === 0) out.push(text.slice(start, i));
    }
  }
  return out;
}

const isWorkspaceParam = (operand: string, params: unknown[], workspaceId: string) => {
  const p = /^\$(\d+)/.exec(operand);
  return p !== null && params[Number(p[1]) - 1] === workspaceId;
};

/**
 * Tenant tables a statement reaches without a filter by `workspaceId` (empty = scoped). A heuristic on
 * Drizzle's SQL (and the module's hand-written fragments), not a SQL parser: it looks for the
 * equalities, not for how they are combined.
 */
export function unscopedReferences(statement: Statement, workspaceId: string): string[] {
  const text = statement.sql.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();

  const insert =
    /^insert into "?([a-z_][a-z0-9_]*)"? \(([^)]*)\) values (.*?)(?: on conflict .*| returning .*)?$/s.exec(
      lower,
    );
  if (insert) {
    const [, table, columnList, values] = insert as unknown as [string, string, string, string];
    if (!TENANT.has(table)) return [];
    const column = splitTopLevel(columnList)
      .map((c) => c.replaceAll('"', ''))
      .indexOf('workspace_id');
    if (column < 0) return [table];
    const rows = groups(values);
    const scoped =
      rows.length > 0 &&
      rows.every((row) =>
        isWorkspaceParam(splitTopLevel(row)[column] ?? '', statement.params, workspaceId),
      );
    return scoped ? [] : [table];
  }

  // UPDATE: the SET list is not a filter (and without WHERE nothing is).
  let body = lower;
  if (body.startsWith('update ')) {
    const where = body.indexOf(' where ');
    body =
      where < 0
        ? body.slice(0, body.indexOf(' set '))
        : body.replace(/ set .*? where /s, ' where ');
  }

  const references: { table: string; alias: string }[] = [];
  for (const m of body.matchAll(REFERENCE)) {
    const table = m[2]!;
    if (!TENANT.has(table)) continue;
    const alias = m[3] && !NOT_ALIAS.has(m[3]) ? m[3] : table;
    references.push({ table, alias });
  }
  if (references.length === 0) return [];

  // Graph of workspace equalities: tables (by alias) and the request's workspace parameter.
  const edges = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      if (!edges.has(x)) edges.set(x, new Set());
      edges.get(x)!.add(y);
    }
  };
  const node = (operand: string): string | null => {
    if (operand.startsWith('$'))
      return isWorkspaceParam(operand, statement.params, workspaceId) ? WS : null;
    const q = /^"?([a-z_][a-z0-9_]*)"?\./.exec(operand);
    if (q) return q[1]!;
    // An unqualified column belongs to the only table of the statement (otherwise it proves nothing).
    return references.length === 1 ? references[0]!.alias : UNQUALIFIED;
  };
  for (const m of body.matchAll(EQUALITY)) {
    const a = node(m[1]!);
    const b = node(m[2]!);
    if (a && b && a !== UNQUALIFIED && b !== UNQUALIFIED) link(a, b);
  }
  const reached = new Set<string>([WS]);
  const queue = [WS];
  while (queue.length) {
    for (const next of edges.get(queue.pop()!) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  return references
    .filter((r) => !reached.has(r.alias))
    .map((r) => (r.alias === r.table ? r.table : `${r.table} as ${r.alias}`));
}

/** Wraps each exported function of the services to record that it ran. */
export function tracked<T extends Record<string, unknown>>(mod: T, called: Set<string>): T {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(mod)) {
    out[name] =
      typeof value === 'function'
        ? (...args: unknown[]) => {
            called.add(name);
            return (value as (...a: unknown[]) => unknown)(...args);
          }
        : value;
  }
  return out as T;
}

export const exportedFunctions = (...mods: Record<string, unknown>[]) =>
  mods
    .flatMap((m) =>
      Object.entries(m)
        .filter(([, v]) => typeof v === 'function')
        .map(([k]) => k),
    )
    .sort();
