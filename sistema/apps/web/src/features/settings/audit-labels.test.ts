// QA #10: the audit trail must never show an action in English. Collects every action the API and the
// demo write (constants `*_ACTION = '…'`, `action: …` in the audit calls and the `record(req, '…')`
// helpers) and requires a label for each.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIT_LABELS, auditLabel } from './audit-labels';

const ROOTS = [join(import.meta.dirname, '../../../../api/src'), join(import.meta.dirname, '../../demo')];
const DOTTED = /'([a-z_]+\.[a-z_]+)'/g;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [path] : [];
  });
}

function writtenActions(): Set<string> {
  const found = new Set<string>();
  for (const file of ROOTS.flatMap(sources)) {
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(/_ACTION = '([a-z_]+\.[a-z_]+)'/g)) found.add(m[1]!);
    if (!code.includes('audit(')) continue;
    for (const m of code.matchAll(/\baction: ([^,\n]+)/g)) for (const d of m[1]!.matchAll(DOTTED)) found.add(d[1]!);
    for (const m of code.matchAll(/\b(?:record|recordChange)\(req, '([a-z_]+\.[a-z_]+)'/g)) found.add(m[1]!);
  }
  return found;
}

describe('AUDIT_LABELS', () => {
  it('labels every action the API and the demo write', () => {
    const actions = writtenActions();
    expect(actions.size).toBeGreaterThan(30);
    const missing = [...actions].filter((a) => !AUDIT_LABELS[a]).sort();
    expect(missing).toEqual([]);
  });

  it('falls back without showing a raw English sentence', () => {
    expect(auditLabel('fee_adjustment.applied')).toBe('Reajuste de honorários aplicado');
    expect(auditLabel('x.y')).toBe('Outra ação (x.y)');
  });
});
