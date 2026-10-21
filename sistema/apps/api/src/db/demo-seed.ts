// Demo data shared by the CLI seed (`pnpm --filter @effinance/api db:seed`) and the in-browser
// demo build. Idempotent — the demo users and their workspaces are removed and recreated: Marina's
// personal workspace (in trial) with ~8 months of history, and "Família Costa" (Família plan) shared
// with Rafael. Keep this module free of Node-only imports: it also runs in the browser (PGlite).

import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import {
  addDays,
  addMonthKey,
  addMonths,
  clientInputSchema,
  contactInputSchema,
  daysInMonth,
  feePeriodIndexAt,
  getInvoiceDates,
  monthKey,
  parseISODate,
  todayISO,
  transactionInputSchema,
  type ClientInput,
  type InactivationReason,
  type ISODate,
  type TransactionInput,
} from '@effinance/shared';
import type { DbExecutor } from './client';
import { accounts, categories, creditCards, subscriptions, transactions, users, workspaceMembers, workspaces } from './schema';
import { withTenant } from '../lib/tenant';
import { register } from '../modules/auth/service';
import { seedDefaultCategories } from '../modules/categories/service';
import { createWorkspace } from '../modules/workspaces/service';
import { createAccount } from '../modules/accounts/service';
import { createCreditCard, payInvoice } from '../modules/credit-cards/service';
import { createContact } from '../modules/contacts/service';
import { addFee, createClient, inactivateClient } from '../modules/clients/service';
import { addContribution, createGoal } from '../modules/goals/service';
import { createTransaction } from '../modules/transactions/service';
import { createTransfer } from '../modules/transfers/service';
import { commitImport, previewImport } from '../modules/imports/service';
import { FakeOpenFinanceProvider } from '../modules/open-finance/providers/fake';
import { createConnection, linkAccounts, syncConnection } from '../modules/open-finance/service';

export const DEMO_EMAIL = 'demo@efficio.app';
export const DEMO_PASSWORD = 'demo12345';
/** Second member of the shared "Família Costa" workspace. */
export const DEMO_PARTNER_EMAIL = 'rafael@efficio.app';
export const FAMILY_WORKSPACE_NAME = 'Família Costa';
/** Business workspace opened at login: the accounting office, its clients, fees and suppliers. */
export const COMPANY_WORKSPACE_NAME = 'Efficio Contabilidade';

/** Deterministic PRNG so every seed run produces the same numbers. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCpf(base: string): string {
  const d = base.split('').map(Number);
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i]! * (len + 1 - i);
    const rest = (sum * 10) % 11;
    d.push(rest === 10 ? 0 : rest);
  }
  return d.join('');
}

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

async function seedPersonal(db: DbExecutor, workspaceId: string): Promise<number> {
  const today = todayISO();
  const rand = mulberry32(20261020);
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
  const dayIn = (month: string, day: number): ISODate => {
    const { year, month: m } = parseISODate(`${month}-01`);
    return `${month}-${String(Math.min(day, daysInMonth(year, m))).padStart(2, '0')}`;
  };
  const currentMonth = monthKey(today);
  const firstMonth = addMonthKey(currentMonth, -7);
  const months: string[] = [];
  for (let m = firstMonth; m <= currentMonth; m = addMonthKey(m, 1)) months.push(m);

  const cats = await db.select().from(categories).where(eq(categories.workspaceId, workspaceId));
  const cat = (name: string, sub?: string) => {
    const parent = cats.find((c) => c.name === name && !c.parentId);
    if (!parent) throw new Error(`category ${name} not found`);
    const child = sub ? cats.find((c) => c.parentId === parent.id && c.name === sub) : undefined;
    if (sub && !child) throw new Error(`subcategory ${sub} not found`);
    return { categoryId: parent.id, subcategoryId: child?.id ?? null };
  };

  // --- accounts & cards -----------------------------------------------------
  const [wallet] = await db.select().from(accounts).where(eq(accounts.workspaceId, workspaceId));
  await db.update(accounts).set({ initialBalance: 30000 }).where(eq(accounts.id, wallet!.id));
  const nubank = await createAccount(db, workspaceId, {
    name: 'Nubank',
    type: 'checking',
    bank: 'nubank',
    color: '#820AD1',
    icon: 'wallet',
    initialBalance: 320000,
    includeInTotal: true,
    archived: false,
  });
  const itau = await createAccount(db, workspaceId, {
    name: 'Itaú Personnalité',
    type: 'checking',
    bank: 'itau',
    color: '#EC7000',
    icon: 'landmark',
    initialBalance: 850000,
    includeInTotal: true,
    archived: false,
  });
  const xp = await createAccount(db, workspaceId, {
    name: 'XP Investimentos',
    type: 'investment',
    bank: 'xp',
    color: '#111111',
    icon: 'trending-up',
    initialBalance: 1500000,
    includeInTotal: true,
    archived: false,
  });

  const nuCard = await createCreditCard(db, workspaceId, {
    name: 'Nubank Mastercard',
    bank: 'nubank',
    brand: 'mastercard',
    limit: 800000,
    closingDay: 3,
    dueDay: 10,
    color: '#820AD1',
    defaultAccountId: nubank.id,
    archived: false,
  });
  const itauCard = await createCreditCard(db, workspaceId, {
    name: 'Itaú Visa Infinite',
    bank: 'itau',
    brand: 'visa',
    limit: 1200000,
    closingDay: 25,
    dueDay: 5,
    color: '#EC7000',
    defaultAccountId: itau.id,
    archived: false,
  });

  // --- contacts -------------------------------------------------------------
  const contact = async (input: Parameters<typeof createContact>[2]) => (await createContact(db, workspaceId, input)).id;
  const blank = {
    email: null,
    phone: null,
    zipCode: null,
    street: null,
    number: null,
    complement: null,
    district: null,
    city: null,
    state: null,
    notes: null,
  };
  const employer = await contact({
    ...blank,
    name: 'Tech Solutions Ltda',
    document: makeCnpj('112223330001'),
    email: 'rh@techsolutions.com.br',
    phone: '1130304040',
    city: 'São Paulo',
    state: 'SP',
  });
  const landlord = await contact({
    ...blank,
    name: 'Imobiliária Lar Doce Lar',
    document: makeCnpj('445556660001'),
    email: 'contato@lardocelar.com.br',
    phone: '1132324545',
    zipCode: '04538133',
    street: 'Av. Brigadeiro Faria Lima',
    number: '3477',
    district: 'Itaim Bibi',
    city: 'São Paulo',
    state: 'SP',
  });
  const condo = await contact({
    ...blank,
    name: 'Condomínio Residencial Aurora',
    document: makeCnpj('778889990001'),
    city: 'São Paulo',
    state: 'SP',
  });
  const mariana = await contact({
    ...blank,
    name: 'Mariana Souza',
    document: makeCpf('529982247'),
    email: 'mariana.souza@email.com',
    phone: '11987654321',
    zipCode: '01310100',
    street: 'Av. Paulista',
    number: '1000',
    complement: 'Sala 12',
    district: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    notes: 'Cliente de projetos de design',
  });
  const carlos = await contact({
    ...blank,
    name: 'Carlos Pereira',
    document: makeCpf('390533447'),
    email: 'carlos.pereira@email.com',
    phone: '21998761234',
    city: 'Rio de Janeiro',
    state: 'RJ',
  });
  const dentist = await contact({
    ...blank,
    name: 'Dra. Fernanda Lima',
    document: makeCpf('111444777'),
    phone: '1133445566',
    city: 'São Paulo',
    state: 'SP',
  });

  // --- helpers --------------------------------------------------------------
  const create = (input: TransactionInput) => createTransaction(db, workspaceId, transactionInputSchema.parse(input));
  /** Marks every account-based occurrence of a series due before today as paid on its due date. */
  const settlePast = async (recurrenceId: string | null | undefined, inclusive = false) => {
    if (!recurrenceId) return;
    await db
      .update(transactions)
      .set({ paid: true, paidAt: sql`${transactions.date}` })
      .where(
        and(
          eq(transactions.recurrenceId, recurrenceId),
          inclusive ? lte(transactions.date, today) : sql`${transactions.date} < ${today}`,
        ),
      );
  };

  // --- fixed income & bills -------------------------------------------------
  const start = (day: number) => dayIn(firstMonth, day);
  const salary = await create({
    type: 'income',
    description: 'Salário',
    amount: 850000,
    date: start(5),
    accountId: itau.id,
    contactId: employer,
    paymentMethod: 'transfer',
    recurrenceKind: 'fixed',
    ...cat('Salário', 'Salário mensal'),
  });
  await settlePast(salary[0]?.recurrenceId, true);

  const fixedBills: [string, number, number, string, string | undefined, TransactionInput['paymentMethod'], string | null][] = [
    ['Aluguel', 220000, 10, 'Moradia', 'Aluguel', 'bank_slip', landlord],
    ['Condomínio', 65000, 10, 'Moradia', 'Condomínio', 'bank_slip', condo],
    ['Plano de saúde', 48000, 8, 'Saúde', 'Plano de saúde', 'auto_debit', null],
  ];
  for (const [description, amount, day, c, s, paymentMethod, contactId] of fixedBills) {
    const rows = await create({
      type: 'expense',
      description,
      amount,
      date: start(day),
      accountId: itau.id,
      paymentMethod,
      contactId,
      recurrenceKind: 'fixed',
      ...cat(c, s),
    });
    await settlePast(rows[0]?.recurrenceId);
  }
  const internet = await create({
    type: 'expense',
    description: 'Internet fibra',
    amount: 11990,
    date: start(15),
    accountId: nubank.id,
    paymentMethod: 'auto_debit',
    recurrenceKind: 'fixed',
    ...cat('Moradia', 'Internet'),
  });
  await settlePast(internet[0]?.recurrenceId);

  // Subscriptions charged on the cards (settled by invoice payments below).
  await create({
    type: 'expense',
    description: 'Smart Fit',
    amount: 12990,
    date: start(12),
    creditCardId: nuCard.id,
    recurrenceKind: 'fixed',
    ...cat('Saúde', 'Academia'),
  });
  await create({
    type: 'expense',
    description: 'Netflix',
    amount: 5590,
    date: start(18),
    creditCardId: nuCard.id,
    recurrenceKind: 'fixed',
    ...cat('Assinaturas', 'Streaming'),
  });
  await create({
    type: 'expense',
    description: 'Spotify Família',
    amount: 3490,
    date: start(20),
    creditCardId: itauCard.id,
    recurrenceKind: 'fixed',
    ...cat('Assinaturas', 'Música'),
  });

  // Semiannual car insurance (open-ended) and IPTU in 10 installments.
  const insurance = await create({
    type: 'expense',
    description: 'Seguro auto',
    amount: 98000,
    date: dayIn(addMonthKey(firstMonth, 2), 15),
    accountId: itau.id,
    paymentMethod: 'bank_slip',
    recurrenceKind: 'recurring',
    frequency: 'semiannual',
    ...cat('Transporte', 'Manutenção do veículo'),
  });
  await settlePast(insurance[0]?.recurrenceId);
  const iptu = await create({
    type: 'expense',
    description: 'IPTU',
    amount: 18000,
    date: dayIn(firstMonth, 7),
    accountId: itau.id,
    paymentMethod: 'bank_slip',
    recurrenceKind: 'installment',
    installments: 10,
    installmentAmountMode: 'per_installment',
    ...cat('Impostos e taxas', 'IPTU/IPVA'),
  });
  await settlePast(iptu[0]?.recurrenceId);

  // --- monthly variable spending ---------------------------------------------
  const paidUntilToday = (date: ISODate) => ({ paid: date < today, paidAt: date < today ? date : null });
  for (const month of months) {
    const isCurrent = month === currentMonth;
    const { year, month: monthNumber } = parseISODate(`${month}-01`);
    const lastDay = isCurrent ? parseISODate(today).day : daysInMonth(year, monthNumber);
    const randomDay = () => between(1, Math.max(1, lastDay));
    const seasonal = month.endsWith('-12') ? 1.35 : 1;

    // Utilities paid from Itaú (current month still pending).
    const energyDate = dayIn(month, 22);
    await create({
      type: 'expense',
      description: 'Conta de luz',
      amount: Math.round(between(17000, 26000) * seasonal),
      date: energyDate,
      accountId: itau.id,
      paymentMethod: 'auto_debit',
      ...paidUntilToday(energyDate),
      ...cat('Moradia', 'Energia'),
    });
    const waterDate = dayIn(month, 17);
    await create({
      type: 'expense',
      description: 'Conta de água',
      amount: between(8000, 11500),
      date: waterDate,
      accountId: itau.id,
      paymentMethod: 'bank_slip',
      ...(isCurrent ? { paid: false } : { paid: true, paidAt: waterDate }),
      ...cat('Moradia', 'Água'),
    });

    // Card purchases.
    const purchases: [string, number, number, string, string, string][] = [];
    for (let i = 0; i < 4; i++) purchases.push(['Supermercado Pão de Açúcar', 18000, 46000, 'Alimentação', 'Supermercado', nuCard.id]);
    for (let i = 0; i < 5; i++) purchases.push(['iFood', 3500, 9000, 'Alimentação', 'Delivery', nuCard.id]);
    for (let i = 0; i < 7; i++) purchases.push(['Uber', 1500, 4800, 'Transporte', 'App de transporte', nuCard.id]);
    for (let i = 0; i < 3; i++) purchases.push(['Restaurante', 8000, 26000, 'Alimentação', 'Restaurantes', itauCard.id]);
    for (let i = 0; i < 2; i++) purchases.push(['Posto Shell', 20000, 28000, 'Transporte', 'Combustível', itauCard.id]);
    purchases.push(['Padaria Real', 1500, 4500, 'Alimentação', 'Padaria e café', nuCard.id]);
    if (rand() > 0.5) purchases.push(['Renner', 12000, 38000, 'Compras', 'Roupas', itauCard.id]);
    if (rand() > 0.6) purchases.push(['Cinema Cinemark', 6000, 11000, 'Lazer', 'Cinema e shows', nuCard.id]);
    if (rand() > 0.6) purchases.push(['Petz', 9000, 22000, 'Pets', 'Ração', nuCard.id]);
    for (const [description, min, max, c, s, card] of purchases) {
      await create({
        type: 'expense',
        description,
        amount: Math.round(between(min, max) * seasonal),
        date: dayIn(month, randomDay()),
        creditCardId: card,
        ...cat(c, s),
      });
    }

    // Pharmacy via Pix.
    const pharmacyDate = dayIn(month, randomDay());
    await create({
      type: 'expense',
      description: 'Drogasil',
      amount: between(3000, 12000),
      date: pharmacyDate,
      accountId: nubank.id,
      paymentMethod: 'pix',
      paid: true,
      paidAt: pharmacyDate,
      ...cat('Saúde', 'Farmácia'),
    });

    // Freelance income every other month.
    if (months.indexOf(month) % 2 === 0 && !isCurrent) {
      const date = dayIn(month, between(12, 26));
      await create({
        type: 'income',
        description: 'Projeto de identidade visual',
        amount: between(120000, 260000),
        date,
        accountId: nubank.id,
        contactId: mariana,
        paymentMethod: 'pix',
        paid: true,
        paidAt: date,
        ...cat('Freelance', 'Projetos'),
      });
    }

    // Dividends straight into the investment account.
    const divDate = dayIn(month, 15);
    if (divDate <= today) {
      await create({
        type: 'income',
        description: 'Dividendos FIIs',
        amount: between(3000, 6500),
        date: divDate,
        accountId: xp.id,
        paymentMethod: 'transfer',
        paid: true,
        paidAt: divDate,
        ...cat('Rendimentos', 'Dividendos'),
      });
    }

    // Moving money around: salary share to Nubank and the monthly investment.
    const moveDate = dayIn(month, 6);
    if (moveDate <= today) {
      await createTransfer(db, workspaceId, {
        fromAccountId: itau.id,
        toAccountId: nubank.id,
        amount: 300000,
        date: moveDate,
        description: 'Transferência para Nubank',
        notes: null,
        paid: true,
      });
      await createTransfer(db, workspaceId, {
        fromAccountId: nubank.id,
        toAccountId: xp.id,
        amount: 100000,
        date: moveDate,
        description: null,
        notes: 'Aporte mensal',
        paid: true,
      });
    }
  }

  // Bigger installment purchases.
  await create({
    type: 'expense',
    description: 'iPhone 16',
    amount: 720000,
    date: dayIn(addMonthKey(currentMonth, -4), 14),
    creditCardId: itauCard.id,
    recurrenceKind: 'installment',
    installments: 12,
    ...cat('Compras', 'Eletrônicos'),
  });
  await create({
    type: 'expense',
    description: 'Viagem Florianópolis',
    amount: 360000,
    date: dayIn(addMonthKey(currentMonth, -2), 8),
    creditCardId: nuCard.id,
    recurrenceKind: 'installment',
    installments: 6,
    ...cat('Lazer', 'Viagens'),
  });
  await create({
    type: 'expense',
    description: 'Curso de UX Design',
    amount: 89700,
    date: dayIn(addMonthKey(currentMonth, -1), 3),
    creditCardId: nuCard.id,
    recurrenceKind: 'installment',
    installments: 3,
    ...cat('Educação', 'Cursos'),
  });

  // One-off redemption from investments three months ago.
  await createTransfer(db, workspaceId, {
    fromAccountId: xp.id,
    toAccountId: itau.id,
    amount: 200000,
    date: dayIn(addMonthKey(currentMonth, -3), 20),
    description: null,
    notes: 'Resgate para a viagem',
    paid: true,
  });

  // Payables / receivables that need attention.
  await create({
    type: 'expense',
    description: 'Tratamento dentário',
    amount: 35000,
    date: addDays(today, -5),
    contactId: dentist,
    paymentMethod: 'pix',
    notes: 'Restauração + limpeza',
    ...cat('Saúde', 'Consultas e exames'),
  });
  await create({
    type: 'expense',
    description: 'Revisão do carro',
    amount: 65000,
    date: addDays(today, 6),
    accountId: itau.id,
    paymentMethod: 'debit_card',
    ...cat('Transporte', 'Manutenção do veículo'),
  });
  await create({
    type: 'income',
    description: 'Empréstimo devolvido',
    amount: 50000,
    date: addDays(today, -10),
    accountId: nubank.id,
    contactId: carlos,
    paymentMethod: 'pix',
    notes: 'Combinado em 2x — 1ª parcela',
    ...cat('Outras receitas', 'Reembolsos'),
  });
  await create({
    type: 'income',
    description: 'Projeto landing page',
    amount: 180000,
    date: addDays(today, 12),
    accountId: nubank.id,
    contactId: mariana,
    paymentMethod: 'pix',
    ...cat('Freelance', 'Projetos'),
  });
  await create({
    type: 'income',
    description: '13º salário — 1ª parcela',
    amount: 425000,
    date: dayIn(addMonthKey(currentMonth, currentMonth.endsWith('-11') ? 0 : 1), 28),
    accountId: itau.id,
    contactId: employer,
    paymentMethod: 'transfer',
    ...cat('Salário', '13º salário'),
  });

  // --- settle past card invoices ---------------------------------------------
  for (const card of [nuCard, itauCard]) {
    const open = await db
      .selectDistinct({ month: transactions.invoiceMonth })
      .from(transactions)
      .where(and(eq(transactions.creditCardId, card.id), eq(transactions.paid, false)));
    const monthsToPay = open
      .map((o) => o.month!)
      .filter((m) => getInvoiceDates(m, card.closingDay, card.dueDay).dueDate < today)
      .sort();
    for (const m of monthsToPay) {
      const due = getInvoiceDates(m, card.closingDay, card.dueDay).dueDate;
      await payInvoice(db, workspaceId, card.id, m, { accountId: card.defaultAccountId!, date: due });
    }
  }

  // --- goals -----------------------------------------------------------------
  const goal = async (input: Parameters<typeof createGoal>[2], contributions: [ISODate, number][]) => {
    const g = await createGoal(db, workspaceId, input);
    for (const [date, amount] of contributions) await addContribution(db, workspaceId, g.id, { amount, date, note: null });
  };
  const monthly = (amount: number, day = 7) =>
    months.filter((m) => dayIn(m, day) <= today).map((m) => [dayIn(m, day), amount] as [ISODate, number]);
  await goal(
    {
      name: 'Reserva de emergência',
      targetAmount: 3000000,
      deadline: dayIn(addMonthKey(currentMonth, 12), 28),
      icon: 'shield',
      color: '#152B61',
      accountId: xp.id,
      notes: '6 meses de custo de vida',
      archived: false,
    },
    [[dayIn(firstMonth, 2), 800000], ...monthly(100000)],
  );
  await goal(
    {
      name: 'Viagem para Europa',
      targetAmount: 1500000,
      deadline: dayIn(addMonthKey(currentMonth, 18), 1),
      icon: 'plane',
      color: '#0EA5E9',
      accountId: null,
      notes: 'Portugal e Espanha em 15 dias',
      archived: false,
    },
    monthly(80000, 10).slice(-6),
  );
  await goal(
    {
      name: 'Notebook novo',
      targetAmount: 800000,
      deadline: dayIn(addMonthKey(currentMonth, 3), 15),
      icon: 'laptop',
      color: '#A855F7',
      accountId: nubank.id,
      notes: null,
      archived: false,
    },
    [[dayIn(addMonthKey(currentMonth, -5), 20), 300000], ...monthly(70000, 20).slice(-5)],
  );
  await goal(
    {
      name: 'Entrada do apartamento',
      targetAmount: 8000000,
      deadline: dayIn(addMonthKey(currentMonth, 36), 1),
      icon: 'house',
      color: '#12A150',
      accountId: xp.id,
      notes: null,
      archived: false,
    },
    [[dayIn(firstMonth, 3), 1200000]],
  );

  const [count] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(transactions)
    .where(inArray(transactions.workspaceId, [workspaceId]));
  return count?.n ?? 0;
}

interface DemoClient {
  input: Omit<ClientInput, 'contractStartDate'>;
  /** Contract start, in months before today (day 1 of that month). */
  startedMonthsAgo: number;
  /** Monthly fee of the current period (cents); earlier periods were ~7% cheaper each. */
  fee: number;
  employeeFee: number;
  /** The current period was not registered yet (readjustment pending). */
  renewalPending?: boolean;
  inactive?: { monthsAgo: number; reason: InactivationReason; notes?: string };
}

const DEMO_CLIENTS: DemoClient[] = [
  {
    input: {
      name: 'Padaria Pão Quente Ltda',
      tradeName: 'Pão Quente',
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
  },
  {
    input: {
      name: 'Tecnova Soluções em Software Ltda',
      tradeName: 'Tecnova',
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
  },
  {
    input: {
      name: 'Clínica Odontológica Sorriso Pleno Ltda',
      tradeName: 'Sorriso Pleno',
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
  },
  {
    input: {
      name: 'Transportadora Rota Sul Ltda',
      tradeName: 'Rota Sul',
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

/**
 * The accounting office (business plan): clients with yearly fee periods (one awaiting its
 * readjustment, two inactive), suppliers, monthly fees receivable linked to each client and the
 * office's fixed costs. Past occurrences are paid, except one overdue fee.
 */
async function seedCompany(db: DbExecutor, ownerId: string): Promise<string> {
  const workspaceId = await db.transaction((tx) =>
    createWorkspace(tx, { name: COMPANY_WORKSPACE_NAME, kind: 'business', ownerId }),
  );
  const periodEnd = new Date();
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  await db
    .update(subscriptions)
    .set({ planCode: 'business_monthly', status: 'active', provider: 'fake', trialEndsAt: null, currentPeriodEnd: periodEnd })
    .where(eq(subscriptions.workspaceId, workspaceId));

  await withTenant(db, workspaceId, async (tx) => {
    await seedDefaultCategories(tx, workspaceId, 'business');
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
      name: 'Conta PJ Inter',
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

    // --- clients, fee periods and the monthly fees receivable --------------------------------------
    const fees = find('Honorários', 'Honorários mensais');
    let overdue: string | null = null;
    for (const demo of DEMO_CLIENTS) {
      const contractStartDate = `${addMonthKey(month, -demo.startedMonthsAgo)}-01`;
      const client = await createClient(tx, workspaceId, clientInputSchema.parse({ ...demo.input, contractStartDate }));
      const until = demo.inactive ? `${addMonthKey(month, -demo.inactive.monthsAgo)}-01` : today;
      const last = feePeriodIndexAt(contractStartDate, until) - (demo.renewalPending ? 1 : 0);
      for (let i = 0; i <= last; i++) {
        const factor = Math.pow(1.07, last - i);
        await addFee(tx, workspaceId, client.id, {
          amount: Math.round(demo.fee / factor / 1000) * 1000,
          employeeFee: Math.round(demo.employeeFee / factor / 100) * 100,
        });
      }
      const name = demo.input.tradeName ?? demo.input.name;
      const startMonth = monthKey(contractStartDate) > firstMonth ? monthKey(addMonths(contractStartDate, 1)) : firstMonth;
      if (demo.inactive) {
        // Former client: the last fees before the transfer stay as history (and block deletion).
        if (demo.inactive.reason === 'accounting_transfer') {
          for (let m = 4; m >= 1; m--) {
            await add({
              ...fees,
              type: 'income',
              description: `Honorários — ${name}`,
              amount: demo.fee,
              date: `${addMonthKey(month, -demo.inactive.monthsAgo - m)}-10`,
              paid: true,
              contactId: client.id,
              paymentMethod: 'bank_slip',
            });
          }
        }
        await inactivateClient(tx, workspaceId, client.id, {
          date: until,
          reason: demo.inactive.reason,
          notes: demo.inactive.notes ?? null,
        });
        continue;
      }
      const rows = await fixed('income', `Honorários — ${name}`, demo.fee, startMonth, 10, fees, client.id, 'bank_slip');
      if (demo.input.tradeName === 'Rota Sul') overdue = rows.find((r) => r.date.startsWith(addMonthKey(month, -1)))?.id ?? null;
    }
    await add({
      ...find('Honorários', 'Serviços avulsos'),
      type: 'income',
      description: 'Abertura de filial — Vida Saudável',
      amount: 150000,
      date: addDays(today, -12),
      paid: true,
      contactId: null,
    });

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

    // Everything due until today was paid or received, except one client's last fee.
    await tx
      .update(transactions)
      .set({ paid: true, paidAt: sql`${transactions.date}` })
      .where(and(eq(transactions.workspaceId, workspaceId), lte(transactions.date, today)));
    if (overdue) await tx.update(transactions).set({ paid: false, paidAt: null }).where(eq(transactions.id, overdue));
  });
  return workspaceId;
}

/** Demo addresses of the Effinance base: removed too, so a reseed leaves no stale demo users. */
const LEGACY_DEMO_EMAILS = ['demo@effinance.app', 'rafael@effinance.app'];

/** Removes the demo users and every workspace they own (data cascades). */
async function removeDemoUsers(db: DbExecutor) {
  const demoUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, [DEMO_EMAIL, DEMO_PARTNER_EMAIL, ...LEGACY_DEMO_EMAILS]));
  if (demoUsers.length === 0) return;
  const ids = demoUsers.map((u) => u.id);
  const owned = await db
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(and(inArray(workspaceMembers.userId, ids), eq(workspaceMembers.role, 'owner')));
  if (owned.length) await db.delete(workspaces).where(inArray(workspaces.id, owned.map((w) => w.id)));
  await db.delete(users).where(inArray(users.id, ids));
}

/** Shared household workspace on the Família plan, with Rafael as editor. */
async function seedFamily(db: DbExecutor, ownerId: string, partnerId: string): Promise<string> {
  const workspaceId = await db.transaction((tx) =>
    createWorkspace(tx, { name: FAMILY_WORKSPACE_NAME, kind: 'family', ownerId }),
  );
  const periodEnd = new Date();
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  await db
    .update(subscriptions)
    .set({ planCode: 'family_monthly', status: 'active', provider: 'fake', trialEndsAt: null, currentPeriodEnd: periodEnd })
    .where(eq(subscriptions.workspaceId, workspaceId));
  await db.insert(workspaceMembers).values({ workspaceId, userId: partnerId, role: 'editor' });

  await withTenant(db, workspaceId, async (tx) => {
    await seedDefaultCategories(tx, workspaceId);
    const cats = await tx.select().from(categories).where(eq(categories.workspaceId, workspaceId));
    const find = (name: string, sub?: string) => {
      const parent = cats.find((c) => c.name === name && !c.parentId)!;
      const child = sub ? cats.find((c) => c.parentId === parent.id && c.name === sub) : undefined;
      return { categoryId: parent.id, subcategoryId: child?.id ?? null };
    };
    const joint = await createAccount(tx, workspaceId, {
      name: 'Conta conjunta',
      type: 'checking',
      bank: 'inter',
      color: '#FF7A00',
      icon: 'house',
      initialBalance: 450000,
      includeInTotal: true,
      archived: false,
    });
    const today = todayISO();
    const month = monthKey(today);
    const base = { accountId: joint.id, creditCardId: null, contactId: null, paymentMethod: 'pix' as const, notes: null };
    const fixed = (description: string, amount: number, day: number, cat: ReturnType<typeof find>) =>
      createTransaction(
        tx,
        workspaceId,
        transactionInputSchema.parse({
          ...base,
          ...cat,
          type: 'expense',
          description,
          amount,
          date: `${addMonthKey(month, -2)}-${String(day).padStart(2, '0')}`,
          paid: false,
          recurrenceKind: 'fixed',
          frequency: 'monthly',
        }),
      );
    await fixed('Aluguel', 280000, 5, find('Moradia'));
    await fixed('Condomínio', 65000, 10, find('Moradia'));
    await fixed('Escola das crianças', 190000, 8, find('Educação'));
    await createTransaction(
      tx,
      workspaceId,
      transactionInputSchema.parse({
        ...base,
        ...find('Alimentação'),
        type: 'expense',
        description: 'Compras do mês',
        amount: 98000,
        date: addDays(today, -3),
        paid: true,
      }),
    );
    // Past occurrences of the fixed bills are already paid.
    await tx
      .update(transactions)
      .set({ paid: true, paidAt: sql`${transactions.date}` })
      .where(and(eq(transactions.workspaceId, workspaceId), lte(transactions.date, today)));
  });
  return workspaceId;
}

/**
 * Integrations of Marina's workspace: a simulated Open Finance connection (Banco Inter) whose checking
 * account feeds a new local account, synced once, and a CSV invoice export imported into her
 * Nubank card — so the import and connection screens have data.
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

  const [card] = await withTenant(db, workspaceId, (tx) =>
    tx.select({ id: creditCards.id }).from(creditCards).where(and(eq(creditCards.workspaceId, workspaceId), eq(creditCards.name, 'Nubank Mastercard'))),
  );
  if (!card) return;
  const day = (n: number) => addDays(todayISO(), -n);
  const content = [
    'date,title,amount',
    `${day(5)},Livraria Exemplo,89.90`,
    `${day(4)},Uber *Trip,23.45`,
    `${day(3)},Padaria Pão Quente,18.70`,
    `${day(2)},Farmácia Saúde Exemplo,64.30`,
    `${day(2)},Pagamento recebido,-1200.00`,
  ].join('\n');
  const target = { kind: 'credit_card' as const, creditCardId: card.id };
  const preview = await previewImport(db, workspaceId, { fileName: 'nubank-fatura.csv', content, target });
  await commitImport(db, workspaceId, userId, {
    fileName: preview.fileName,
    format: preview.format,
    target,
    rows: preview.rows
      .filter((r) => !r.skip)
      .map((r) => ({ date: r.date, description: r.description, amount: r.amount, type: r.type, externalId: r.externalId, categoryId: r.categoryId })),
  });
}

export async function seedDemo(db: DbExecutor) {
  await removeDemoUsers(db);
  const { user, workspaceId } = await register(db, {
    name: 'Marina Costa',
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    acceptTerms: true,
  });
  await withTenant(db, workspaceId, (tx) => seedPersonal(tx, workspaceId));
  await seedIntegrations(db, workspaceId, user.id);
  const [{ n } = { n: 0 }] = await withTenant(db, workspaceId, (tx) =>
    tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(transactions).where(eq(transactions.workspaceId, workspaceId)),
  );
  const partner = await register(db, {
    name: 'Rafael Costa',
    email: DEMO_PARTNER_EMAIL,
    password: DEMO_PASSWORD,
    acceptTerms: true,
  });
  const familyId = await seedFamily(db, user.id, partner.user.id);
  const companyId = await seedCompany(db, user.id);
  // Marina opens the office (business) workspace; Rafael opens the family one.
  await db.update(users).set({ lastWorkspaceId: companyId }).where(eq(users.id, user.id));
  await db.update(users).set({ lastWorkspaceId: familyId }).where(eq(users.id, partner.user.id));
  return { userId: user.id, workspaceId, familyWorkspaceId: familyId, companyWorkspaceId: companyId, transactions: n };
}
