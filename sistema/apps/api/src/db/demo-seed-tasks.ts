// Task module demo data, part of the demo seed: the office team (four colleagues of Marina who cannot
// sign in — only Marina can), the departments Fiscal, Contábil, Pessoal/DP and Societário, task
// categories, the responsible of each client per department, ~25 tasks of an accounting office (some
// overdue, some concluded on time or late, appointments, subtasks and comments) and, from phase 2,
// the office's recurring obligations (DAS, DCTFWeb, EFD-Reinf, folha, FGTS Digital, eSocial, SPED,
// DEFIS, DASN-SIMEI, ECD, ECF, a weekly check…) with occurrences of the previous and the current
// competence in several situations, two process templates (abertura de empresa, admissão de
// funcionário) with one process in progress, Marina's notes and a small attachment. Written through
// the task services, so free text and files are encrypted like the API's. Keep it free of Node-only
// imports.

import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import {
  addDays,
  addMonthKey,
  applyFlowTemplateSchema,
  flowTemplateInputSchema,
  formatMonthKey,
  monthKey,
  recurringTaskInputSchema,
  TASK_TIME_ZONE,
  taskAttachmentInputSchema,
  taskCategoryInputSchema,
  taskInputSchema,
  taskNoteInputSchema,
  type MemberRole,
  type RecurringTaskInput,
  type TaskInput,
} from '@effinance/shared';
import type { DbExecutor } from './client';
import { contacts, tasks, users, workspaceMembers } from './schema';
import { todayIn } from '../lib/clock';
import { getCipher } from '../lib/crypto/keyring';
import { withTenant } from '../lib/tenant';
import { loadMembers, type TaskContext } from '../modules/tasks/access';
import { addAttachment } from '../modules/tasks/attachments';
import { applyTemplate, createTemplate } from '../modules/tasks/flows';
import { createNote } from '../modules/tasks/notes';
import { createRecurring } from '../modules/tasks/recurring';
import { createCategory, createDepartment, setClientResponsible } from '../modules/tasks/registry';
import {
  addComment,
  addSubtask,
  changeTaskStatus,
  createTask,
  updateSubtask,
  updateTask,
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
  // Members and the workspace key are read on the system connection, before the tenant transaction
  // (as in a request; the demo's PGlite has a single connection).
  const members = await loadMembers(db, workspaceId);
  const cipher = await getCipher(workspaceId);
  const today = todayIn(TASK_TIME_ZONE);
  const month = monthKey(today);
  const previousMonth = addMonthKey(month, -1);
  const previous = formatMonthKey(previousMonth).toLowerCase();
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
      cipher,
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

    // --- phase 2: recurring obligations, processes, notes, an attachment ---------------------------
    const staff = [...withStaff].map(client).filter((v): v is string => v !== null);
    const recurring = async (input: RecurringTaskInput) =>
      createRecurring(admin, recurringTaskInputSchema.parse({ startCompetence: previousMonth, ...input }));
    const fiscalOrders = { departmentId: fiscal.id, categoryId: cat.obrigacoes, assigneeId: ids.ana };
    const dpOrders = { departmentId: pessoal.id, categoryId: cat.folha, assigneeId: ids.juliana };
    const contabilOrders = { departmentId: contabil.id, categoryId: cat.contabil, assigneeId: ids.bruno };
    await recurring({
      ...fiscalOrders,
      name: 'DAS do Simples Nacional',
      description: 'Apurar o Simples no PGDAS-D, emitir a guia e enviar ao cliente.',
      dueDay: 20,
      targetDaysBefore: 3,
      regimes: ['simples_nacional'],
    });
    await recurring({ ...fiscalOrders, name: 'DAS-MEI', dueDay: 20, targetDaysBefore: 2, regimes: ['mei'] });
    await recurring({
      ...fiscalOrders,
      name: 'DCTFWeb',
      description: 'Transmitir a DCTFWeb com os débitos do eSocial e da EFD-Reinf.',
      dueDay: 15,
      targetDaysBefore: 2,
      regimes: ['simples_nacional', 'presumed_profit', 'real_profit'],
      excludedClientIds: [client('Vida Saudável')].filter((v): v is string => v !== null),
    });
    await recurring({ ...fiscalOrders, name: 'EFD-Reinf', dueDay: 15, regimes: ['presumed_profit', 'real_profit'] });
    await recurring({ ...fiscalOrders, name: 'EFD-Contribuições', dueDay: 14, referenceOffset: 2, nonBusinessDayRule: 'anticipate', regimes: ['presumed_profit', 'real_profit'] });
    await recurring({ ...fiscalOrders, name: 'SPED Fiscal (EFD ICMS/IPI)', dueDay: 20, nonBusinessDayRule: 'postpone', regimes: ['real_profit'] });
    await recurring({
      ...fiscalOrders,
      name: 'IRPJ e CSLL trimestrais',
      period: 'quarterly',
      dueMonth: 1,
      dueDay: 31,
      referenceOffset: 1,
      regimes: ['presumed_profit'],
    });
    await recurring({ ...fiscalOrders, name: 'DEFIS', period: 'annual', dueMonth: 3, dueDay: 31, referenceOffset: 3, regimes: ['simples_nacional'] });
    await recurring({ ...fiscalOrders, name: 'DASN-SIMEI', period: 'annual', dueMonth: 5, dueDay: 31, referenceOffset: 5, regimes: ['mei'] });
    await recurring({
      ...dpOrders,
      name: 'Folha de pagamento',
      description: 'Fechar a folha, conferir os eventos e enviar holerites e guias ao cliente.',
      dueDay: 5,
      targetDaysBefore: 2,
      nonBusinessDayRule: 'postpone',
      clientIds: staff,
    });
    await recurring({ ...dpOrders, name: 'FGTS Digital', dueDay: 20, clientIds: staff });
    await recurring({ ...dpOrders, name: 'eSocial: fechamento dos eventos periódicos', dueDay: 15, clientIds: staff });
    await recurring({ ...contabilOrders, name: 'Balancete mensal', dueDay: 25, targetDaysBefore: 5, regimes: ['simples_nacional', 'presumed_profit', 'real_profit'] });
    await recurring({ ...contabilOrders, name: 'ECD', period: 'annual', dueMonth: 6, dueDay: 30, referenceOffset: 6, regimes: ['presumed_profit', 'real_profit'] });
    await recurring({ ...contabilOrders, name: 'ECF', period: 'annual', dueMonth: 7, dueDay: 31, referenceOffset: 7, regimes: ['presumed_profit', 'real_profit'] });
    await recurring({
      ...contabilOrders,
      name: 'Conferência semanal de extratos',
      period: 'weekly',
      dueDay: 5,
      clientIds: [client('Tecnova')].filter((v): v is string => v !== null),
    });

    // Occurrences of the previous and the current competence in several situations: concluded on time
    // and late, in progress, waiting for the client, canceled, assigned by hand, reopened with a reason.
    const occurrences = await tx
      .select({ id: tasks.id, competence: tasks.competence, dueDate: tasks.dueDate, assigneeId: tasks.assigneeId })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), isNotNull(tasks.recurringTaskId), inArray(tasks.competence, [previousMonth, month])))
      .orderBy(asc(tasks.dueDate), asc(tasks.id));
    const byWho = (assigneeId: string | null) => (Object.entries(ids).find(([, v]) => v === assigneeId)?.[0] ?? 'marina') as Who;
    /** Concludes as the responsible, then moves the conclusion to 15:00 (São Paulo) of `date` (seed only). */
    const conclude = async (o: (typeof occurrences)[number], date: string) => {
      await changeTaskStatus(as(byWho(o.assigneeId)), o.id, 'done');
      const at = new Date(`${date}T18:00:00Z`);
      if (at.getTime() < Date.now()) {
        await tx.update(tasks).set({ completedAt: at }).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, o.id)));
      }
    };
    let i = 0;
    for (const o of occurrences) {
      const due = o.dueDate!;
      const past = due < today;
      if (o.competence === previousMonth) {
        // Almost everything of last month is done (some late); a few are still open (overdue).
        if (i % 9 === 4) {
          i++;
          continue;
        }
        await conclude(o, i % 5 === 1 && addDays(due, 2) < today ? addDays(due, 2) : addDays(due, -1) < today ? addDays(due, -1) : today);
      } else if (past) {
        const step = i % 6;
        if (step === 0 || step === 3) await conclude(o, addDays(due, -1) < today ? addDays(due, -1) : today);
        else if (step === 1) await conclude(o, addDays(due, 1) < today ? addDays(due, 1) : today);
        else if (step === 2) await changeTaskStatus(as(byWho(o.assigneeId)), o.id, 'in_progress');
        // step 4, 5: overdue, still open.
      } else {
        const step = i % 7;
        if (step === 0) await conclude(o, today);
        else if (step === 2) await changeTaskStatus(as(byWho(o.assigneeId)), o.id, 'in_progress');
        else if (step === 4) await changeTaskStatus(as(byWho(o.assigneeId)), o.id, 'waiting_client');
      }
      i++;
    }
    const current = occurrences.filter((o) => o.competence === month && o.dueDate! >= today);
    if (current[1]) {
      await updateTask(as('marina'), current[1].id, { assigneeId: ids.rafael });
      await addComment(as('rafael'), current[1].id, { text: 'Assumo este mês: a Ana está de férias.' });
    }
    if (current[3]) await changeTaskStatus(as('marina'), current[3].id, 'canceled', 'Cliente sem movimento neste mês');
    const reopenable = occurrences.find((o) => o.competence === previousMonth && o.assigneeId === ids.ana);
    if (reopenable) {
      await changeTaskStatus(admin, reopenable.id, 'in_progress', 'Guia emitida com o valor errado; recalcular');
      await changeTaskStatus(as('ana'), reopenable.id, 'done');
    }

    // Process templates and one process in progress.
    await createTemplate(
      admin,
      flowTemplateInputSchema.parse({
        title: 'Abertura de empresa',
        description: 'Da consulta de viabilidade ao enquadramento no Simples.',
        steps: [
          { title: 'Consulta de viabilidade na prefeitura', departmentId: societario.id, assigneeId: ids.rafael, relativeDays: 2, categoryId: cat.abertura },
          { title: 'Solicitar documentos dos sócios', departmentId: societario.id, assigneeId: ids.rafael, relativeDays: 3, description: 'RG, CPF, comprovante de endereço e certidão de casamento, se houver.' },
          { title: 'Contrato social', departmentId: societario.id, assigneeId: ids.rafael, relativeDays: 3, priority: 'high' },
          { title: 'Registro na Junta Comercial', departmentId: societario.id, assigneeId: ids.rafael, relativeDays: 5 },
          { title: 'Inscrição municipal e alvará', departmentId: societario.id, assigneeId: ids.rafael, relativeDays: 5 },
          { title: 'Opção pelo Simples Nacional', departmentId: fiscal.id, assigneeId: ids.ana, relativeDays: 3 },
        ],
      }),
    );
    const admission = await createTemplate(
      admin,
      flowTemplateInputSchema.parse({
        title: 'Admissão de funcionário',
        description: 'Do recebimento dos documentos à inclusão na folha.',
        steps: [
          { title: 'Receber os documentos do funcionário', departmentId: pessoal.id, assigneeId: ids.juliana, relativeDays: 1, categoryId: cat.folha },
          { title: 'Exame admissional', departmentId: pessoal.id, assigneeId: ids.juliana, relativeDays: 2 },
          { title: 'Contrato de trabalho assinado', departmentId: pessoal.id, assigneeId: ids.juliana, relativeDays: 1 },
          { title: 'Evento S-2200 no eSocial', departmentId: pessoal.id, assigneeId: ids.juliana, relativeDays: 1, priority: 'high' },
          { title: 'Incluir na folha do mês', departmentId: pessoal.id, assigneeId: ids.juliana, relativeDays: 0 },
        ],
      }),
    );
    const process = await applyTemplate(
      as('juliana'),
      admission.id,
      applyFlowTemplateSchema.parse({ clientId: client('Rota Sul'), title: 'Admissão de motorista · Rota Sul' }),
    );
    await changeTaskStatus(as('juliana'), process.task.id, 'done');

    // Notes of Marina (private) and a small attachment.
    await createNote(admin, taskNoteInputSchema.parse({ title: 'Portais das prefeituras', content: 'NFS-e de Campinas: nfse.campinas.sp.gov.br\nNFS-e de Sumaré: sumare.sp.gov.br/nfse' }));
    await createNote(admin, taskNoteInputSchema.parse({ title: 'Pendências da semana', content: 'Cobrar extratos da Tecnova.\nConfirmar férias da Ana.' }));
    const pdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    await addAttachment(
      as('ana'),
      icms.id,
      taskAttachmentInputSchema.parse({ fileName: 'Relação de notas de entrada.pdf', contentType: 'application/pdf', content: btoa(String.fromCharCode(...pdf)) }),
    );
  });
}
