// Demo data shared by the CLI seed (`pnpm --filter @effinance/api db:seed`) and the in-browser
// demo build. Idempotent — the demo user and her workspaces are removed and recreated: Marina signs up
// with her company, the accounting office "Efficio Contabilidade" (business plan, active), its only
// workspace: clients with fee periods, generated fees paid on time (some with the punctuality
// discount), late (some with juros e multa) or still open, suppliers and the office's fixed costs,
// plus the task module (team, departments, client responsibles and tasks: demo-seed-tasks.ts).
// Keep this module free of Node-only imports: it also runs in the browser (PGlite).

import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  addDays,
  addMonthKey,
  clientInputSchema,
  contactInputSchema,
  discountAmount,
  earnsDiscount,
  FEE_CATEGORY,
  feePeriodIndexAt,
  monthKey,
  suggestLateFees,
  todayISO,
  transactionInputSchema,
  type ClientInput,
  type InactivationReason,
} from '@effinance/shared';
import type { DbExecutor } from './client';
import { accounts, categories, subscriptions, transactions, users, workspaceMembers, workspaces } from './schema';
import { withTenant } from '../lib/tenant';
import { register } from '../modules/auth/service';
import { createAccount } from '../modules/accounts/service';
import { createContact } from '../modules/contacts/service';
import { addFee, createClient, inactivateClient } from '../modules/clients/service';
import { createTransaction, setPaid } from '../modules/transactions/service';
import { generateFees, setFeeEmployees } from '../modules/fee-charges/service';
import { commitImport, previewImport } from '../modules/imports/service';
import { FakeOpenFinanceProvider } from '../modules/open-finance/providers/fake';
import { createConnection, linkAccounts, syncConnection } from '../modules/open-finance/service';
import { DEMO_TEAM, seedTasks } from './demo-seed-tasks';

export const DEMO_EMAIL = 'demo@efficio.app';
export const DEMO_PASSWORD = 'demo12345';
/** Marina's company (business workspace), created with her account: the accounting office. */
export const COMPANY_WORKSPACE_NAME = 'Efficio Contabilidade';
/** The office's main bank account (fees are received there). */
const OFFICE_ACCOUNT = 'Conta PJ Inter';

function makeCnpj(base: string): string {
  const d = base.split('').map(Number);
  for (const weights of [
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  ]) {
    const sum = weights.reduce((acc, w, i) => acc + w * d[i]!, 0);
    const rest = sum % 11;
    d.push(rest < 2 ? 0 : 11 - rest);
  }
  return d.join('');
}

interface DemoClient {
  input: Omit<ClientInput, 'contractStartDate'> & { feeDueDay: number };
  /** Contract start, in months before today (day 1 of that month). */
  startedMonthsAgo: number;
  /** Monthly fee of the current period (cents); earlier periods were ~7% cheaper each. */
  fee: number;
  employeeFee: number;
  /** Discount for paying by the due date, in basis points (every period). */
  discountBps?: number;
  /** The current period was not registered yet (readjustment pending). */
  renewalPending?: boolean;
  inactive?: { monthsAgo: number; reason: InactivationReason; notes?: string };
}

const DEMO_CLIENTS: DemoClient[] = [
  {
    input: {
      name: 'Padaria Pão Quente Ltda',
      tradeName: 'Pão Quente',
      feeDueDay: 5,
      document: '11222333000181',
      openedAt: '2015-04-06',
      mainActivity: '1091-1/02 — Fabricação de produtos de padaria e confeitaria',
      email: 'financeiro@paoquente.com.br',
      phone: '1932345678',
      responsibleName: 'Marina Albuquerque',
      responsibleEmail: 'marina@paoquente.com.br',
      responsiblePhone: '19998765432',
      taxRegime: 'simples_nacional',
      simplesAnnex: 'I',
      zipCode: '13010111',
      street: 'Rua Barão de Jaguara',
      number: '1200',
      district: 'Centro',
      city: 'Campinas',
      state: 'SP',
    },
    startedMonthsAgo: 43,
    fee: 78000,
    employeeFee: 3500,
    discountBps: 200,
  },
  {
    input: {
      name: 'Tecnova Soluções em Software Ltda',
      tradeName: 'Tecnova',
      feeDueDay: 10,
      document: '45723174000110',
      openedAt: '2019-09-16',
      mainActivity: '6201-5/01 — Desenvolvimento de programas de computador sob encomenda',
      email: 'contato@tecnova.dev',
      phone: '19987654321',
      responsibleName: 'Renato Siqueira',
      responsibleEmail: 'renato@tecnova.dev',
      responsiblePhone: '19987654321',
      taxRegime: 'presumed_profit',
      city: 'Campinas',
      state: 'SP',
    },
    startedMonthsAgo: 30,
    fee: 240000,
    employeeFee: 4500,
    discountBps: 500,
  },
  {
    input: {
      name: 'Clínica Odontológica Sorriso Pleno Ltda',
      tradeName: 'Sorriso Pleno',
      feeDueDay: 15,
      document: makeCnpj('279310120001'),
      mainActivity: '8630-5/04 — Atividade odontológica',
      email: 'adm@sorrisopleno.com.br',
      phone: '1933221144',
      responsibleName: 'Paula Menezes',
      responsibleEmail: 'paula@sorrisopleno.com.br',
      responsiblePhone: '19991234567',
      taxRegime: 'simples_nacional',
      simplesAnnex: 'III',
      city: 'Valinhos',
      state: 'SP',
    },
    startedMonthsAgo: 26,
    fee: 125000,
    employeeFee: 4000,
    discountBps: 300,
  },
  {
    input: {
      name: 'Transportadora Rota Sul Ltda',
      tradeName: 'Rota Sul',
      feeDueDay: 20,
      document: makeCnpj('190340680001'),
      mainActivity: '4930-2/02 — Transporte rodoviário de carga',
      email: 'financeiro@rotasul.com.br',
      phone: '1932567890',
      responsibleName: 'Sérgio Bittencourt',
      responsiblePhone: '19992345678',
      taxRegime: 'real_profit',
      city: 'Hortolândia',
      state: 'SP',
    },
    startedMonthsAgo: 20,
    fee: 480000,
    employeeFee: 5000,
  },
  {
    input: {
      name: 'Juliana Prado Design 31847759806',
      tradeName: 'Ju Prado Design',
      feeDueDay: 10,
      document: '34028316000103',
      mainActivity: '7410-2/02 — Design de interiores',
      phone: '19991112233',
      responsibleName: 'Juliana Prado',
      responsibleEmail: 'ju@juprado.design',
      responsiblePhone: '19991112233',
      taxRegime: 'mei',
      city: 'Campinas',
      state: 'SP',
    },
    startedMonthsAgo: 14,
    fee: 18000,
    employeeFee: 0,
  },
  {
    input: {
      name: 'Construtora Alicerce Engenharia Ltda',
      tradeName: 'Alicerce',
      feeDueDay: 15,
      document: makeCnpj('082417390001'),
      mainActivity: '4120-4/00 — Construção de edifícios',
      email: 'obras@alicerce.eng.br',
      phone: '1932109876',
      responsibleName: 'Fábio Laranjeira',
      responsibleEmail: 'fabio@alicerce.eng.br',
      taxRegime: 'presumed_profit',
      city: 'Campinas',
      state: 'SP',
      notes: 'Proposta de reajuste enviada; aguardando aprovação do sócio.',
    },
    startedMonthsAgo: 38,
    fee: 190000,
    employeeFee: 4000,
    renewalPending: true,
  },
  {
    input: {
      name: 'Farmácia Vida Saudável Ltda',
      tradeName: 'Vida Saudável',
      feeDueDay: 5,
      document: makeCnpj('517830150001'),
      mainActivity: '4771-7/01 — Comércio varejista de produtos farmacêuticos',
      email: 'compras@farmaciavida.com.br',
      phone: '1933445566',
      responsibleName: 'Camila Rocha',
      responsiblePhone: '19993456789',
      taxRegime: 'simples_nacional',
      simplesAnnex: 'I',
      city: 'Sumaré',
      state: 'SP',
    },
    startedMonthsAgo: 2,
    fee: 95000,
    employeeFee: 3500,
  },
  {
    input: {
      name: 'Instituto Aprender Educação Ltda',
      tradeName: 'Instituto Aprender',
      feeDueDay: 20,
      document: makeCnpj('623904440001'),
      mainActivity: '8599-6/04 — Treinamento em desenvolvimento profissional e gerencial',
      email: 'secretaria@institutoaprender.com.br',
      responsibleName: 'Lúcia Andrade',
      responsibleEmail: 'lucia@institutoaprender.com.br',
      taxRegime: 'simples_nacional',
      simplesAnnex: 'III',
      city: 'Campinas',
      state: 'SP',
    },
    startedMonthsAgo: 9,
    fee: 110000,
    employeeFee: 4000,
  },
  {
    input: {
      name: 'Mercadinho Bom Preço Ltda',
      tradeName: 'Bom Preço',
      feeDueDay: 10,
      document: makeCnpj('734421980001'),
      email: 'bompreco@exemplo.com.br',
      responsibleName: 'José Batista',
      taxRegime: 'simples_nacional',
      simplesAnnex: 'I',
      city: 'Paulínia',
      state: 'SP',
    },
    startedMonthsAgo: 50,
    fee: 62000,
    employeeFee: 3000,
    inactive: { monthsAgo: 2, reason: 'accounting_transfer', notes: 'Migrou para um escritório no próprio bairro.' },
  },
  {
    input: {
      name: 'Studio Arte & Forma Ltda',
      tradeName: 'Arte & Forma',
      feeDueDay: 10,
      document: makeCnpj('305571260001'),
      responsibleName: 'Ana Ferraz',
      taxRegime: 'simples_nacional',
      simplesAnnex: 'III',
      city: 'Campinas',
      state: 'SP',
    },
    startedMonthsAgo: 28,
    fee: 54000,
    employeeFee: 0,
    inactive: { monthsAgo: 6, reason: 'company_closure' },
  },
];

type Payment = 'open' | { daysLate: number; charged?: boolean };

/**
 * How each client pays its fees, by the position of the fee among those already due (0 = the most
 * recent). Deterministic, relative to today: two always on time, some a few days late (a few of those
 * charged juros e multa), Rota Sul owing the latest one and Ju Prado Design six months in a row.
 * Clients whose fee period offers a discount (Tecnova, Sorriso Pleno, Pão Quente) get it whenever they
 * pay by the due date.
 */
const PAYMENT_HABITS: Record<string, (k: number) => Payment> = {
  Tecnova: () => ({ daysLate: 0 }),
  'Sorriso Pleno': (k) => ({ daysLate: k % 2 ? -3 : 0 }), // pays the bank slip early now and then
  'Vida Saudável': () => ({ daysLate: 0 }),
  'Bom Preço': () => ({ daysLate: 0 }),
  'Arte & Forma': () => ({ daysLate: 0 }),
  'Pão Quente': (k) => ({ daysLate: k % 3 === 1 ? 4 : k % 4 === 3 ? 6 : 0 }),
  'Instituto Aprender': (k) => ({ daysLate: k === 1 || k === 4 ? 2 : 0 }),
  Alicerce: (k) => (k === 2 ? { daysLate: 18, charged: true } : { daysLate: 0 }),
  'Rota Sul': (k) => (k === 0 ? 'open' : k % 2 ? { daysLate: 12 + k, charged: true } : { daysLate: 5 }),
  'Ju Prado Design': (k) => (k < 6 ? 'open' : { daysLate: 20 + 3 * k, charged: true }),
};

/**
 * The accounting office (business plan, created with Marina's account): clients with yearly fee
 * periods (one awaiting its readjustment, two inactive), each with its due day and some with a
 * discount for paying on time, suppliers, fees receivable generated per competence month (some with
 * the employee charge) and the office's fixed costs. Fees follow each client's payment habit.
 */
async function seedCompany(db: DbExecutor, workspaceId: string): Promise<void> {
  const periodEnd = new Date();
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  await db
    .update(subscriptions)
    .set({ planCode: 'business_monthly', status: 'active', provider: 'fake', trialEndsAt: null, currentPeriodEnd: periodEnd })
    .where(eq(subscriptions.workspaceId, workspaceId));

  await withTenant(db, workspaceId, async (tx) => {
    // The business categories and the "Caixa" wallet come with the sign-up.
    const cats = await tx.select().from(categories).where(eq(categories.workspaceId, workspaceId));
    const find = (name: string, sub?: string) => {
      const parent = cats.find((c) => c.name === name && !c.parentId);
      if (!parent) throw new Error(`category ${name} not found`);
      const child = sub ? cats.find((c) => c.parentId === parent.id && c.name === sub) : undefined;
      if (sub && !child) throw new Error(`subcategory ${sub} not found`);
      return { categoryId: parent.id, subcategoryId: child?.id ?? null };
    };
    const today = todayISO();
    const month = monthKey(today);
    const firstMonth = addMonthKey(month, -5);

    const bank = await createAccount(tx, workspaceId, {
      name: OFFICE_ACCOUNT,
      type: 'checking',
      bank: 'inter',
      color: '#FF7A00',
      icon: 'landmark',
      initialBalance: 1850000,
      includeInTotal: true,
      archived: false,
    });
    await createAccount(tx, workspaceId, {
      name: 'Reserva PJ (CDB)',
      type: 'investment',
      bank: 'itau',
      color: '#EC7000',
      icon: 'piggy-bank',
      initialBalance: 4500000,
      includeInTotal: true,
      archived: false,
    });

    const supplier = (input: Parameters<typeof contactInputSchema.parse>[0]) =>
      createContact(tx, workspaceId, contactInputSchema.parse(input));
    const landlord = await supplier({
      name: 'Barão Imóveis e Administração Ltda',
      document: makeCnpj('402187650001'),
      email: 'locacao@baraoimoveis.com.br',
      phone: '1932321010',
      city: 'Campinas',
      state: 'SP',
    });
    const software = await supplier({
      name: 'ContaSoft Sistemas Contábeis Ltda',
      document: makeCnpj('218765430001'),
      email: 'cobranca@contasoft.com.br',
      phone: '1140041234',
      city: 'São Paulo',
      state: 'SP',
    });
    const telecom = await supplier({ name: 'Conecta Fibra Telecom', document: makeCnpj('563219870001'), phone: '1930303030' });
    const energy = await supplier({ name: 'Energia Paulista Distribuidora', document: makeCnpj('117654320001') });
    await supplier({ name: 'Papelaria Central Campinas', email: 'vendas@papelariacentral.com.br', city: 'Campinas', state: 'SP' });

    const base = { accountId: bank.id, creditCardId: null, paymentMethod: 'pix' as const, notes: null };
    const add = (input: Record<string, unknown>) => createTransaction(tx, workspaceId, transactionInputSchema.parse({ ...base, ...input }));
    const fixed = (
      type: 'income' | 'expense',
      description: string,
      amount: number,
      startMonth: string,
      day: number,
      cat: ReturnType<typeof find>,
      contactId: string | null = null,
      paymentMethod: 'pix' | 'bank_slip' | 'auto_debit' = 'pix',
    ) =>
      add({
        ...cat,
        type,
        description,
        amount,
        date: `${startMonth}-${String(day).padStart(2, '0')}`,
        paid: false,
        contactId,
        paymentMethod,
        recurrenceKind: 'fixed',
        frequency: 'monthly',
      });

    // --- clients and fee periods ----------------------------------------------------------------------
    const clientIds = new Map<string, string>();
    for (const demo of DEMO_CLIENTS) {
      const contractStartDate = `${addMonthKey(month, -demo.startedMonthsAgo)}-01`;
      const client = await createClient(tx, workspaceId, clientInputSchema.parse({ ...demo.input, contractStartDate }));
      clientIds.set(demo.input.tradeName ?? demo.input.name, client.id);
      const until = demo.inactive ? `${addMonthKey(month, -demo.inactive.monthsAgo)}-01` : today;
      const last = feePeriodIndexAt(contractStartDate, until) - (demo.renewalPending ? 1 : 0);
      for (let i = 0; i <= last; i++) {
        const factor = Math.pow(1.07, last - i);
        await addFee(tx, workspaceId, client.id, {
          amount: Math.round(demo.fee / factor / 1000) * 1000,
          employeeFee: Math.round(demo.employeeFee / factor / 100) * 100,
          discountBps: demo.discountBps ?? 0,
        });
      }
      if (demo.inactive) {
        await inactivateClient(tx, workspaceId, client.id, {
          date: until,
          reason: demo.inactive.reason,
          notes: demo.inactive.notes ?? null,
        });
      }
    }
    await add({
      ...find(FEE_CATEGORY.name, 'Serviços avulsos'),
      type: 'income',
      description: 'Abertura de filial — Vida Saudável',
      amount: 150000,
      date: addDays(today, -12),
      paid: true,
      contactId: clientIds.get('Vida Saudável') ?? null,
    });

    // --- fees receivable: "Gerar honorários" for the 10 competence months before the current one ------
    // Competence M is due on the client's due day of M+1 (5, 10, 15 or 20). The current competence is
    // left for the user to generate (that is what the button is tried with). Former clients are billed
    // until their inactivation; Alicerce has no fee for the current period (renewal pending).
    for (let k = 10; k >= 1; k--) {
      await generateFees(tx, workspaceId, { competence: addMonthKey(month, -k), dryRun: false });
    }
    const feeRows = await tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.feeKind, 'fee')))
      .orderBy(asc(transactions.date));
    const feesOf = (name: string) => feeRows.filter((r) => r.contactId === clientIds.get(name));

    // "+ Empregados" on the latest competences of the clients with staff on payroll.
    const headcounts: [string, number[]][] = [
      ['Pão Quente', [6, 6, 7]],
      ['Rota Sul', [12, 12, 13, 14]],
      ['Sorriso Pleno', [4, 4]],
    ];
    const employeeCharges = new Map<string, string>();
    for (const [name, counts] of headcounts) {
      const latest = feesOf(name).slice(-counts.length);
      for (const [i, fee] of latest.entries()) {
        const res = await setFeeEmployees(tx, workspaceId, fee.id, { employees: counts[i]!, dryRun: false });
        if (res.transaction) employeeCharges.set(fee.id, res.transaction.id);
      }
    }

    // --- fixed costs of the office --------------------------------------------------------------------
    await fixed('expense', 'Aluguel do escritório', 180000, firstMonth, 5, find('Ocupação', 'Aluguel'), landlord.id, 'bank_slip');
    await fixed('expense', 'Sistema contábil', 59000, firstMonth, 15, find('Tecnologia', 'Sistema contábil'), software.id, 'auto_debit');
    await fixed('expense', 'Internet e telefone', 19990, firstMonth, 20, find('Ocupação', 'Internet e telefone'), telecom.id, 'auto_debit');
    await fixed('expense', 'Energia elétrica', 28000, firstMonth, 12, find('Ocupação', 'Energia'), energy.id, 'auto_debit');
    await fixed('expense', 'Salários da equipe', 480000, firstMonth, 5, find('Pessoal', 'Salários'));
    await fixed('expense', 'Pró-labore dos sócios', 300000, firstMonth, 5, find('Pessoal', 'Pró-labore'));
    await fixed('expense', 'INSS e FGTS', 130000, firstMonth, 20, find('Pessoal', 'Encargos (INSS/FGTS)'), null, 'bank_slip');
    await fixed('expense', 'Simples Nacional (DAS)', 95000, firstMonth, 20, find('Impostos e taxas', 'Simples Nacional (DAS)'), null, 'bank_slip');
    await add({
      ...find('Tecnologia', 'Certificado digital'),
      type: 'expense',
      description: 'Renovação de certificados digitais A1',
      amount: 54000,
      date: addDays(today, -20),
      paid: true,
      contactId: null,
      recurrenceKind: 'installment',
      installments: 3,
    });

    // Bills due until today were paid on their due date; the fees follow each client's habit.
    await tx
      .update(transactions)
      .set({ paid: true, paidAt: sql`${transactions.date}` })
      .where(and(eq(transactions.workspaceId, workspaceId), lte(transactions.date, today), isNull(transactions.feeKind)));
    for (const [name, habit] of Object.entries(PAYMENT_HABITS)) {
      // k = 0 is the most recent fee already due.
      const due = feesOf(name).filter((f) => f.date < today).reverse();
      for (const [k, fee] of due.entries()) {
        const payment = habit(k);
        if (payment === 'open') continue;
        const paidAt = addDays(fee.date, payment.daysLate);
        if (paidAt > today) continue; // still late today
        const charge = employeeCharges.get(fee.id);
        // The same paths as confirming in the app (linked rows): settled late with juros e multa, or
        // by the due date with the discount the fee offers (the employee charge has none).
        const extra = payment.charged ? suggestLateFees(fee.amount, fee.date, paidAt) : null;
        const discount = earnsDiscount(fee.date, paidAt) ? discountAmount(fee.amount, fee.feeDiscountBps) : 0;
        await setPaid(tx, workspaceId, fee.id, {
          paid: true,
          paidAt,
          accountId: bank.id,
          interest: extra?.interest,
          fine: extra?.fine,
          discount: discount || undefined,
        });
        if (charge) await setPaid(tx, workspaceId, charge, { paid: true, paidAt, accountId: bank.id });
      }
    }
  });
}

/**
 * Earlier demo addresses (Effinance base; Rafael, of the former "Família Costa" workspace): removed
 * too, so a reseed leaves no stale demo users.
 */
const LEGACY_DEMO_EMAILS = ['rafael@efficio.app', 'demo@effinance.app', 'rafael@effinance.app'];

/** Removes the demo users and every workspace they own (data cascades). */
async function removeDemoUsers(db: DbExecutor) {
  const demoUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, [DEMO_EMAIL, ...LEGACY_DEMO_EMAILS, ...DEMO_TEAM.map((m) => m.email)]));
  if (demoUsers.length === 0) return;
  const ids = demoUsers.map((u) => u.id);
  const owned = await db
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(and(inArray(workspaceMembers.userId, ids), eq(workspaceMembers.role, 'owner')));
  if (owned.length) await db.delete(workspaces).where(inArray(workspaces.id, owned.map((w) => w.id)));
  await db.delete(users).where(inArray(users.id, ids));
}

/**
 * Integrations of the office: a simulated Open Finance connection (Banco Inter) whose checking account
 * feeds a new local account, synced once, and a CSV statement imported into the office's bank account
 * — so the import and connection screens have data.
 */
async function seedIntegrations(db: DbExecutor, workspaceId: string, userId: string) {
  const provider = new FakeOpenFinanceProvider();
  const ctx = { db, of: { provider, webhookUrl: null, webhookSecret: null } };
  const { itemId } = provider.connect('inter', workspaceId)!;
  const { connection } = await createConnection(ctx, workspaceId, userId, itemId);
  const bankFeed = connection.accounts.find((a) => a.kind === 'bank')!;
  await linkAccounts(db, workspaceId, connection.id, {
    links: [{ connectionAccountId: bankFeed.id, target: { kind: 'new' }, syncFrom: addDays(todayISO(), -10) }],
  });
  await syncConnection(ctx, workspaceId, connection.id, { userId });

  const [account] = await withTenant(db, workspaceId, (tx) =>
    tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.name, OFFICE_ACCOUNT))),
  );
  if (!account) return;
  const day = (n: number) => addDays(todayISO(), -n).split('-').reverse().join('/');
  const content = [
    'Data;Descrição;Valor',
    `${day(5)};Papelaria Central Campinas;-89,90`,
    `${day(4)};Uber *Trip;-23,45`,
    `${day(3)};Correios - envio de documentos;-18,70`,
    `${day(2)};Café e copa do escritório;-64,30`,
    `${day(1)};Cartório 2º Ofício de Notas;-37,80`,
  ].join('\n');
  const target = { kind: 'account' as const, accountId: account.id };
  const preview = await previewImport(db, workspaceId, { fileName: 'inter-extrato.csv', content, target });
  await commitImport(db, workspaceId, userId, {
    fileName: preview.fileName,
    format: preview.format,
    target,
    rows: preview.rows
      .filter((r) => !r.skip)
      .map((r) => ({ date: r.date, description: r.description, amount: r.amount, type: r.type, externalId: r.externalId, categoryId: r.categoryId })),
  });
}

/**
 * Marina signs up with her company (the same path as the sign-up form): the office is her only
 * workspace and the one every session opens.
 */
export async function seedDemo(db: DbExecutor) {
  await removeDemoUsers(db);
  const { user, workspaceId } = await register(db, {
    name: 'Marina Costa',
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    companyName: COMPANY_WORKSPACE_NAME,
    acceptTerms: true,
  });
  await seedCompany(db, workspaceId);
  await seedIntegrations(db, workspaceId, user.id);
  await seedTasks(db, workspaceId, user.id);
  const [{ n } = { n: 0 }] = await withTenant(db, workspaceId, (tx) =>
    tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(transactions).where(eq(transactions.workspaceId, workspaceId)),
  );
  return { userId: user.id, workspaceId, transactions: n };
}
