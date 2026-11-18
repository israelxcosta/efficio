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

/** The Efficio logo supplied by the owner ("efficio" + "CONTABILIDADE"), recolored to navy #152b61 on transparent. */
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
