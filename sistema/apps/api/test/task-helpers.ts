// Helpers of the task module suites (phase 2): an office with an owner, an editor and a collaborator,
// departments, clients with valid CNPJs. Today is pinned to 2026-10-20, a Tuesday (vitest.config.ts).

import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { App } from '../src/app';
import { registerUser, type Client } from './helpers';

export async function member(app: App, owner: Client, role: 'editor' | 'viewer', name: string): Promise<Client> {
  const email = `${role}-${randomUUID()}@teste.com`;
  const invite = await owner.post('/workspaces/current/invites', { email, role });
  expect(invite.status).toBe(201);
  const guest = await registerUser(app, name, email);
  expect((await guest.post(`/invites/${invite.body.inviteUrl.split('/convite/')[1]}/accept`)).status).toBe(200);
  return guest;
}

export async function workspaceOf(c: Client): Promise<string> {
  return (await c.get('/auth/me')).body.workspace.id;
}

/** A valid CNPJ from 8 base digits (+ 0001 and the two check digits). */
export function cnpj(seed: number): string {
  const base = `${String(seed).padStart(8, '0')}0001`.split('').map(Number);
  const digit = (digits: number[]) => {
    const weights = digits.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = digits.reduce((acc, d, i) => acc + d * weights[i]!, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = digit(base);
  const d2 = digit([...base, d1]);
  return [...base, d1, d2].join('');
}

let seed = 11_000_000;

export async function createClient(
  owner: Client,
  overrides: { name?: string; tradeName?: string; taxRegime?: string; contractStartDate?: string } = {},
): Promise<string> {
  seed += 7;
  const regime = overrides.taxRegime ?? 'simples_nacional';
  const res = await owner.post('/clients', {
    name: overrides.name ?? `Cliente ${seed} Ltda`,
    tradeName: overrides.tradeName ?? `Cliente ${seed}`,
    document: cnpj(seed),
    taxRegime: regime,
    simplesAnnex: regime === 'simples_nacional' ? 'I' : undefined,
    contractStartDate: overrides.contractStartDate ?? '2025-01-10',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id;
}

/**
 * Owner Ana (Fiscal), editor Bruno (Pessoal) and collaborator Carla (Fiscal); departments Fiscal and
 * Pessoal.
 */
export async function office(app: App) {
  const ana = await registerUser(app, 'Ana Paula Ribeiro');
  const bruno = await member(app, ana, 'editor', 'Bruno Carvalho');
  const carla = await member(app, ana, 'viewer', 'Carla Souza');
  const fiscal = await ana.post('/tasks/departments', { name: 'Fiscal', memberIds: [ana.userId, carla.userId] });
  const pessoal = await ana.post('/tasks/departments', { name: 'Pessoal', memberIds: [bruno.userId] });
  expect(fiscal.status).toBe(201);
  expect(pessoal.status).toBe(201);
  return { ana, bruno, carla, fiscal: fiscal.body.id as string, pessoal: pessoal.body.id as string };
}

/** A tiny but real PDF (the signature check needs `%PDF-`). */
export const PDF_BASE64 = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64');
