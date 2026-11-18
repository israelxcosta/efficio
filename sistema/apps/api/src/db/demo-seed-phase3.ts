// Phase 3 of the demo (spec §13.7–§13.10): unions with their collective agreements (one overdue, one
// due within 30 days, one within 60, one later), fiscal data, accesses and documents of the clients
// (some overdue or about to expire), the office "Efficio Contabilidade" (fictitious data and a simple
// logo; the factory contract template) and a couple of permission adjustments in the team.
// Dates are relative to today, so the alerts always have something to show. Free of Node-only imports.

import { and, eq } from 'drizzle-orm';
import {
  addDays,
  addMonths,
  rolePermissions,
  startOfMonth,
  TASK_TIME_ZONE,
  unionInputSchema,
  officeInputSchema,
  type ClientDocumentKind,
} from '@effinance/shared';
import type { DbExecutor } from './client';
import { contacts, unionConventions, users, workspaceMembers } from './schema';
import { todayIn } from '../lib/clock';
import { getCipher } from '../lib/crypto/keyring';
import type { ScopedContext } from '../lib/scoped-context';
import { withTenant } from '../lib/tenant';
import { fiscalColumns, replaceDocuments } from '../modules/clients/fiscal';
import { saveOffice, setLogo } from '../modules/office/service';
import { createUnion } from '../modules/unions/service';

/** The Efficio logo (blue rounded square with a white "e" + "efficio Contabilidade" in navy), rendered once as a 678×216 PNG. */
const DEMO_LOGO = 'data:image/png;base64,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';

function checkDigits(base: number[], weightsFor: (len: number) => number[]): number[] {
  const d = [...base];
  for (let round = 0; round < 2; round++) {
    const weights = weightsFor(d.length);
    const sum = weights.reduce((acc, w, i) => acc + w * d[i]!, 0);
    const rest = sum % 11;
    d.push(rest < 2 ? 0 : 11 - rest);
  }
  return d;
}

const cnpj = (base12: string) =>
  checkDigits(base12.split('').map(Number), (len) =>
    len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  ).join('');

const cpf = (base9: string) =>
  checkDigits(base9.split('').map(Number), (len) => Array.from({ length: len }, (_, i) => len + 1 - i)).join('');

interface DemoDocument {
  kind: ClientDocumentKind;
  /** Days from today (negative = overdue); null = no expiry. */
  in: number | null;
  note?: string;
  customName?: string;
}

interface DemoFiscal {
  stateRegistration?: string;
  exempt?: boolean;
  municipalRegistration?: string;
  responsibleCpf?: string;
  simplesAccessCode?: string;
  accountantPassword?: string;
  documents: DemoDocument[];
}

const FISCAL: Record<string, DemoFiscal> = {
  'Pão Quente': {
    stateRegistration: '110.042.490.114',
    municipalRegistration: '45.123',
    responsibleCpf: cpf('529982247'),
    simplesAccessCode: '1234.5678.9012',
    accountantPassword: 'PaoQuente#2026',
    documents: [
      { kind: 'digital_certificate', in: -3, note: 'A1, emitido pela Certisign' },
      { kind: 'cnd_federal', in: 12 },
      { kind: 'sanitary_license', in: 45, note: 'Vigilância Sanitária municipal' },
    ],
  },
  Tecnova: {
    exempt: true,
    municipalRegistration: '78.900-1',
    responsibleCpf: cpf('111444777'),
    accountantPassword: 'Tecnova!portal',
    documents: [
      { kind: 'digital_certificate', in: 20, note: 'A3, token da diretoria' },
      { kind: 'crf_fgts', in: -10 },
      { kind: 'cnd_state', in: 95 },
    ],
  },
  'Sorriso Pleno': {
    stateRegistration: '298.112.334.556',
    municipalRegistration: '12.877',
    responsibleCpf: cpf('390533447'),
    simplesAccessCode: '9988.7766.5544',
    documents: [
      { kind: 'operating_license', in: 25 },
      { kind: 'pcmso', in: null, note: 'Aguardando o laudo da clínica' },
    ],
  },
  'Rota Sul': {
    stateRegistration: '407.556.889.001',
    municipalRegistration: '33.010',
    documents: [
      { kind: 'fire_certificate', in: 55, note: 'AVCB do galpão' },
      { kind: 'cndt', in: 5 },
    ],
  },
  'Vida Saudável': {
    stateRegistration: '515.220.871.300',
    documents: [{ kind: 'other', customName: 'Registro na ANVISA', in: 150 }],
  },
};

interface DemoUnion {
  name: string;
  acronym: string;
  category: string;
  territory: string;
  base: string;
  /** Due date of the tracked agreement (day 1 of a month). */
  due: string;
  clients: string[];
}

export async function seedPhase3(db: DbExecutor, workspaceId: string, ownerId: string): Promise<void> {
  const today = todayIn(TASK_TIME_ZONE);
  const year = Number(today.slice(0, 4));
  const thisYear = (date: string) => (date.slice(0, 4) === String(year) ? date : `${year}-01-01`);
  const unionsToSeed: DemoUnion[] = [
    {
      name: 'Sindicato dos Empregados no Comércio de Mogi Guaçu',
      acronym: 'SINDCOM',
      category: 'Comerciários',
      territory: 'Mogi Guaçu e região',
      base: '11358000',
      due: startOfMonth(addMonths(today, 1)),
      clients: ['Pão Quente', 'Vida Saudável', 'Bom Preço'],
    },
    {
      name: 'Sindicato dos Trabalhadores nas Indústrias Metalúrgicas de Mogi Guaçu',
      acronym: 'SINDMETAL',
      category: 'Metalúrgicos',
      territory: 'Mogi Guaçu, Mogi Mirim e Itapira',
      base: '22871000',
      due: thisYear(startOfMonth(addDays(today, -35))),
      clients: ['Alicerce'],
    },
    {
      name: 'Sindicato dos Empregados em Estabelecimentos de Serviços de Saúde de Campinas e Região',
      acronym: 'SINSAÚDE',
      category: 'Saúde',
      territory: 'Campinas e região',
      base: '33492000',
      due: startOfMonth(addMonths(today, 5)),
      clients: ['Sorriso Pleno', 'Vida Saudável'],
    },
    {
      name: 'Sindicato dos Trabalhadores em Transportes Rodoviários de Campinas e Região',
      acronym: 'SINDTRANS',
      category: 'Transporte rodoviário',
      territory: 'Campinas e região',
      base: '44713000',
      due: startOfMonth(addMonths(today, 2)),
      clients: ['Rota Sul'],
    },
  ];

  // Permission adjustments: Ana (administrator) without the office; Rafael without the task reports.
  const team = await db
    .select({ id: users.id, email: users.email })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  const idOf = (email: string) => team.find((m) => m.email === email)?.id;
  const adjust = async (email: string, permissions: Record<string, boolean>) => {
    const id = idOf(email);
    if (id) {
      await db
        .update(workspaceMembers)
        .set({ permissions })
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, id)));
    }
  };
  await adjust('ana.ribeiro@efficio.app', { office: false });
  await adjust('rafael.lima@efficio.app', { 'page.reports': false });

  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, ownerId));
  const cipher = await getCipher(workspaceId);
  await withTenant(db, workspaceId, async (tx) => {
    const ctx: ScopedContext = {
      db: tx,
      workspaceId,
      userId: ownerId,
      userName: owner?.name ?? 'Israel',
      permissions: rolePermissions('owner'),
      cipher,
      today,
    };
    const actor = { userId: ownerId, name: ctx.userName };
    const clients = await tx
      .select({ id: contacts.id, tradeName: contacts.tradeName })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.kind, 'client')));
    const clientId = (tradeName: string) => clients.find((c) => c.tradeName === tradeName)?.id;

    // --- fiscal data, accesses and documents of the clients -----------------------------------------
    for (const [tradeName, fiscal] of Object.entries(FISCAL)) {
      const id = clientId(tradeName);
      if (!id) continue;
      const values = await fiscalColumns(cipher, {
        stateRegistration: fiscal.stateRegistration ?? null,
        stateRegistrationExempt: fiscal.exempt ?? false,
        municipalRegistration: fiscal.municipalRegistration ?? null,
        responsibleDocument: fiscal.responsibleCpf ?? null,
        simplesAccessCode: fiscal.simplesAccessCode ? { action: 'set', value: fiscal.simplesAccessCode } : undefined,
        accountantPassword: fiscal.accountantPassword ? { action: 'set', value: fiscal.accountantPassword } : undefined,
      });
      await tx.update(contacts).set(values).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, id)));
      await replaceDocuments(
        tx,
        cipher,
        workspaceId,
        id,
        fiscal.documents.map((d) => ({
          kind: d.kind,
          customName: d.customName ?? null,
          expiresAt: d.in === null ? null : addDays(today, d.in),
          note: d.note ?? null,
        })),
        actor,
      );
    }

    // --- unions and their agreements ---------------------------------------------------------------
    for (const u of unionsToSeed) {
      const dueYear = Number(u.due.slice(0, 4));
      const union = await createUnion(
        ctx,
        unionInputSchema.parse({
          name: u.name,
          document: cnpj(`${u.base}0001`),
          acronym: u.acronym,
          category: u.category,
          territory: u.territory,
          city: 'Mogi Guaçu',
          state: 'SP',
          phone: '(19) 3861-0000',
          email: `contato@${u.acronym.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}.org.br`,
          responsibleRole: 'Presidente',
          baseMonth: Number(u.due.slice(5, 7)),
          clientIds: u.clients.map(clientId).filter((id): id is string => Boolean(id)),
        }),
      );
      // History: the two cycles before the tracked one were published (plus every year up to it).
      const publishedYears = new Set([dueYear - 2, dueYear - 1]);
      for (let y = year; y < dueYear; y++) publishedYears.add(y);
      for (const y of publishedYears) {
        await tx.insert(unionConventions).values({
          workspaceId,
          unionId: union.id,
          year: y,
          published: true,
          publishedAt: new Date(`${y}-${u.due.slice(5, 7)}-15T12:00:00Z`),
          publishedBy: ownerId,
          publishedByName: ctx.userName,
        });
      }
    }

    // --- the office ----------------------------------------------------------------------------------
    await saveOffice(
      ctx,
      officeInputSchema.parse({
        document: cnpj('604157320001'),
        legalName: 'Efficio Contabilidade Ltda',
        tradeName: 'Efficio Contabilidade',
        stateRegistration: null,
        municipalRegistration: '98.765',
        zipCode: '13840-000',
        street: 'Rua das Palmeiras',
        number: '120',
        complement: 'Sala 4',
        district: 'Centro',
        city: 'Mogi Guaçu',
        state: 'SP',
        phone: '(19) 3818-1200',
        email: 'contato@efficio.app',
        website: 'efficio.app',
        responsibleName: 'Marina Costa',
        responsibleDocument: cpf('987654321'),
        responsibleEmail: 'marina@efficio.app',
        responsiblePhone: '(19) 99876-5432',
        pixKeyType: 'email',
        pixKey: 'financeiro@efficio.app',
      }),
    );
    await setLogo(ctx, DEMO_LOGO);
  });
}
