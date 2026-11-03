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

/** A simple 160×64 logo (navy with an "E" mark), generated once as a PNG. */
const DEMO_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABACAIAAAAS6ev4AAAAtklEQVR42u3cYQnAIBCAUUuYwlT2McmCWUMjCIIHO558AcY9Njh/rNTWlbhiBIAFWIAFWIAFWIABC7AAC7AAKwh4PTsYAAuwAAMGDBgw4BfAy7l6JQADPo045lMDFTBgwIABAwYMGLA1yRVE8osOowcswAIMGDBgwIABpwWOedDxzV8HGDBgwIABAwYMGLCVyR4MGDBgwAIswIABAwbsJywCLMACLMACDFiABViABViABRiwkrUBk0U/aDulaGkAAAAASUVORK5CYII=';

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
      userName: owner?.name ?? 'Marina Costa',
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
