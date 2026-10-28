// Task module demo data (phase 1), part of the demo seed: the office team (four colleagues of Marina
// who cannot sign in — only Marina can), the departments Fiscal, Contábil, Pessoal/DP and Societário,
// task categories, the responsible of each client per department, and ~25 tasks of an accounting
// office (some overdue, some concluded on time or late, appointments, subtasks and comments).
// Recurring work, flows and notes come with the next phases. Keep it free of Node-only imports.

import { and, eq } from 'drizzle-orm';
import {
  addDays,
  addMonthKey,
  formatMonthKey,
  monthKey,
  TASK_TIME_ZONE,
  taskCategoryInputSchema,
  taskInputSchema,
  type MemberRole,
  type TaskInput,
} from '@effinance/shared';
import type { DbExecutor } from './client';
import { contacts, users, workspaceMembers } from './schema';
import { todayIn } from '../lib/clock';
import { withTenant } from '../lib/tenant';
import { loadMembers, type TaskContext } from '../modules/tasks/access';
import { createCategory, createDepartment, setClientResponsible } from '../modules/tasks/registry';
import {
  addComment,
  addSubtask,
  changeTaskStatus,
  createTask,
  updateSubtask,
} from '../modules/tasks/service';

/** Colleagues of Marina in the office. They exist to be assigned; their login is disabled. */
export const DEMO_TEAM = [
  { name: 'Ana Paula Ribeiro', email: 'ana.ribeiro@efficio.app', role: 'editor' },
  { name: 'Bruno Carvalho', email: 'bruno.carvalho@efficio.app', role: 'viewer' },
  { name: 'Juliana Martins', email: 'juliana.martins@efficio.app', role: 'viewer' },
  { name: 'Rafael Lima', email: 'rafael.lima@efficio.app', role: 'viewer' },
] as const satisfies readonly { name: string; email: string; role: MemberRole }[];

/** Not a password hash: both password verifiers (API and demo) refuse it, so nobody signs in with it. */
const LOGIN_DISABLED = 'login-disabled';

type Who = 'marina' | 'ana' | 'bruno' | 'juliana' | 'rafael';

export async function seedTasks(
  db: DbExecutor,
  workspaceId: string,
  ownerId: string,
): Promise<void> {
  const ids: Record<Who, string> = { marina: ownerId, ana: '', bruno: '', juliana: '', rafael: '' };
  for (const person of DEMO_TEAM) {
    const [user] = await db
      .insert(users)
      .values({
        name: person.name,
        email: person.email,
        passwordHash: LOGIN_DISABLED,
        acceptedTermsAt: new Date(),
      })
      .returning({ id: users.id });
    await db.insert(workspaceMembers).values({ workspaceId, userId: user!.id, role: person.role });
    ids[person.email.split('.')[0] as Exclude<Who, 'marina'>] = user!.id;
  }
  // Members are read on the system connection, before the tenant transaction (as in a request).
  const members = await loadMembers(db, workspaceId);
  const today = todayIn(TASK_TIME_ZONE);
  const month = monthKey(today);
  const previous = formatMonthKey(addMonthKey(month, -1)).toLowerCase();
  const day = (n: number) => addDays(today, n);

  await withTenant(db, workspaceId, async (tx) => {
    const as = (who: Who): TaskContext => ({
      db: tx,
      workspaceId,
      userId: ids[who],
      role: members.get(ids[who])!.role,
      isAdmin: true,
      canWrite: true,
      members,
      today,
    });
    const admin = as('marina');

    // --- departments, categories, responsibles per client -----------------------------------------
    const fiscal = await createDepartment(admin, {
      name: 'Fiscal',
      memberIds: [ids.marina, ids.ana],
    });
    const contabil = await createDepartment(admin, { name: 'Contábil', memberIds: [ids.bruno] });
    const pessoal = await createDepartment(admin, { name: 'Pessoal/DP', memberIds: [ids.juliana] });
    const societario = await createDepartment(admin, {
      name: 'Societário',
      memberIds: [ids.rafael],
    });

    const category = async (name: string, icon: string, color: string) =>
      (await createCategory(admin, taskCategoryInputSchema.parse({ name, icon, color }))).id;
    const cat = {
      obrigacoes: await category('Obrigações acessórias', 'receipt', '#3F64BE'),
      certidoes: await category('Certidões', 'shield', '#14B8A6'),
      atendimento: await category('Atendimento', 'briefcase', '#0EA5E9'),
      folha: await category('Folha e admissões', 'banknote', '#12A150'),
      abertura: await category('Abertura e alterações', 'building-2', '#A855F7'),
      contabil: await category('Fechamento contábil', 'book-open', '#152B61'),
    };

    const clientRows = await tx
      .select({ id: contacts.id, tradeName: contacts.tradeName, status: contacts.status })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.kind, 'client')));
    const client = (name: string) => clientRows.find((c) => c.tradeName === name)?.id ?? null;
    const active = clientRows.filter((c) => c.status === 'active');
    const fiscalOf: Record<string, Who> = {
      'Pão Quente': 'ana',
      'Vida Saudável': 'ana',
      'Sorriso Pleno': 'ana',
      Tecnova: 'marina',
      'Rota Sul': 'marina',
      Alicerce: 'marina',
      'Ju Prado Design': 'marina',
    };
    const withStaff = new Set(['Pão Quente', 'Rota Sul', 'Sorriso Pleno', 'Tecnova']);
    for (const c of active) {
      const name = c.tradeName ?? '';
      const set = (departmentId: string, who: Who) =>
        setClientResponsible(admin, { clientId: c.id, departmentId, userId: ids[who] });
      await set(fiscal.id, fiscalOf[name] ?? 'ana');
      await set(contabil.id, 'bruno');
      await set(societario.id, 'rafael');
      if (withStaff.has(name)) await set(pessoal.id, 'juliana');
    }

    // --- tasks -------------------------------------------------------------------------------------
    const task = async (who: Who, input: TaskInput & { by?: Who }) => {
      const { by, ...rest } = input;
      return createTask(
        as(by ?? 'marina'),
        taskInputSchema.parse({ ...rest, assigneeId: rest.assigneeId ?? ids[who] }),
      );
    };
    const unassigned = (input: TaskInput) => createTask(admin, taskInputSchema.parse(input));

    // Fiscal (Marina and Ana).
    const icms = await task('ana', {
      title: `Apuração do ICMS de ${previous}`,
      clientId: client('Pão Quente'),
      categoryId: cat.obrigacoes,
      priority: 'high',
      dueDate: day(-3),
      description: 'Conferir os créditos das notas de entrada antes de fechar a apuração.',
    });
    await addComment(as('ana'), icms.id, {
      text: 'Faltam as notas de devolução de dois fornecedores; já pedi ao cliente.',
    });
    const dctf = await task('marina', {
      title: 'Retificar DCTFWeb de setembro',
      clientId: client('Tecnova'),
      categoryId: cat.obrigacoes,
      priority: 'urgent',
      status: 'in_progress',
      dueDate: day(-1),
      by: 'ana',
    });
    await addComment(as('ana'), dctf.id, {
      text: 'O cliente enviou a folha corrigida. Pode transmitir a retificadora.',
    });
    await task('ana', {
      title: 'Conferir notas de entrada do mês',
      clientId: client('Vida Saudável'),
      status: 'in_progress',
      dueDate: today,
    });
    const parcelamento = await task('marina', {
      title: 'Parcelamento de débitos do Simples',
      clientId: client('Ju Prado Design'),
      status: 'waiting_client',
      dueDate: day(2),
      description: 'Aguardando a cliente confirmar o número de parcelas (até 60).',
    });
    await addComment(as('juliana'), parcelamento.id, {
      text: 'A Juliana Prado ligou: prefere 24 parcelas.',
    });
    await task('marina', {
      title: 'Certidão negativa de débitos federais',
      clientId: client('Alicerce'),
      categoryId: cat.certidoes,
      dueDate: day(5),
    });
    await task('ana', {
      title: 'Revisar enquadramento no Simples Nacional',
      clientId: client('Sorriso Pleno'),
      dueDate: day(12),
      priority: 'low',
    });
    await task('marina', {
      title: 'Reunião de planejamento tributário',
      clientId: client('Tecnova'),
      categoryId: cat.atendimento,
      dueDate: day(1),
      startTime: '14:00',
      endTime: '15:00',
    });
    await task('ana', {
      title: 'Emitir guias de ISS retido',
      clientId: client('Rota Sul'),
      dueDate: day(-2),
      status: 'done',
      by: 'ana',
    });
    await task('ana', {
      title: 'Atualizar cadastro na SEFAZ',
      clientId: client('Pão Quente'),
      dueDate: day(3),
      status: 'done',
      by: 'ana',
    });

    // Contábil (Bruno).
    const balancete = await task('bruno', {
      title: `Balancete de ${previous}`,
      clientId: client('Pão Quente'),
      categoryId: cat.contabil,
      dueDate: day(-5),
      priority: 'high',
    });
    await addComment(as('marina'), balancete.id, {
      text: 'O banco ainda não mandou o extrato da conta garantida.',
    });
    const conciliacao = await task('bruno', {
      title: 'Conciliação bancária',
      clientId: client('Tecnova'),
      categoryId: cat.contabil,
      dueDate: day(3),
    });
    for (const [title, done] of [
      ['Importar extratos OFX', true],
      ['Conferir tarifas bancárias', true],
      ['Lançar rendimentos de aplicação', false],
    ] as const) {
      const sub = await addSubtask(as('bruno'), conciliacao.id, { title });
      if (done) await updateSubtask(as('bruno'), conciliacao.id, sub.id, { done: true });
    }
    await task('bruno', {
      title: `Fechamento contábil de ${previous}`,
      clientId: client('Rota Sul'),
      categoryId: cat.contabil,
      status: 'in_progress',
      dueDate: day(6),
    });
    await task('bruno', {
      title: 'Preparar a ECD do ano',
      clientId: client('Alicerce'),
      categoryId: cat.contabil,
      dueDate: day(25),
      priority: 'low',
    });
    await task('bruno', {
      title: 'Balanço patrimonial anual',
      clientId: client('Sorriso Pleno'),
      categoryId: cat.contabil,
      dueDate: day(-10),
      status: 'done',
      by: 'bruno',
    });
    await task('bruno', {
      title: 'Reclassificar lançamentos de despesas',
      dueDate: day(-8),
      priority: 'low',
    });

    // Pessoal/DP (Juliana).
    const admissao = await task('juliana', {
      title: 'Admissão de funcionário — atendente',
      clientId: client('Pão Quente'),
      categoryId: cat.folha,
      dueDate: day(2),
      priority: 'high',
    });
    for (const title of [
      'Exame admissional',
      'Contrato de trabalho assinado',
      'Evento S-2200 no eSocial',
    ]) {
      await addSubtask(as('juliana'), admissao.id, { title });
    }
    await task('juliana', {
      title: 'Programar férias de dois motoristas',
      clientId: client('Rota Sul'),
      categoryId: cat.folha,
      dueDate: day(-2),
    });
    await task('juliana', {
      title: 'Rescisão contratual',
      clientId: client('Sorriso Pleno'),
      categoryId: cat.folha,
      status: 'waiting_client',
      dueDate: day(4),
    });
    await task('juliana', {
      title: `Folha de pagamento de ${formatMonthKey(month).toLowerCase()}`,
      clientId: client('Tecnova'),
      categoryId: cat.folha,
      dueDate: day(8),
    });
    await task('juliana', {
      title: '13º salário — primeira parcela',
      clientId: client('Rota Sul'),
      categoryId: cat.folha,
      dueDate: day(30),
    });

    // Societário (Rafael).
    await task('rafael', {
      title: 'Alteração contratual — inclusão de sócio',
      clientId: client('Tecnova'),
      categoryId: cat.abertura,
      status: 'in_progress',
      dueDate: day(10),
    });
    await task('rafael', {
      title: 'Abertura de filial em Sumaré',
      clientId: client('Vida Saudável'),
      categoryId: cat.abertura,
      dueDate: day(-4),
      priority: 'urgent',
    });
    await task('rafael', {
      title: 'Baixa de inscrição municipal antiga',
      clientId: client('Alicerce'),
      status: 'canceled',
      dueDate: day(-6),
    });

    // Internal (no client).
    await unassigned({
      title: 'Renovar o certificado digital do escritório',
      departmentId: societario.id,
      dueDate: day(15),
      categoryId: cat.certidoes,
    });
    await task('marina', { title: 'Treinamento da equipe: novo leiaute do eSocial' });
    await unassigned({ title: 'Organizar o arquivo físico de 2024', priority: 'low' });

    // Concluded by someone other than the assignee: Ana closes one of Marina's.
    const nota = await task('marina', {
      title: 'Enviar notas fiscais de serviço ao cliente',
      clientId: client('Ju Prado Design'),
      dueDate: day(-1),
    });
    await changeTaskStatus(as('ana'), nota.id, 'done');
  });
}
