// Task module routes under /api/tasks. Mounted next to the financial boundary, with its own guards
// (access.ts): every member reads and writes tasks, occurrences, audit cells, processes, comments,
// attachments and their own notes; registries (departments, categories, recurring tasks, regime
// groups, process templates) need `registry`, their deletion `deleteRegistry`, and deleting a
// task or a process `deleteTasks` (`onRequest: requireTaskPermission(key)`; by default the
// administrators, spec §13.10); a few rules are checked by the services (removing someone else's
// comment or attachment: `deleteTasks`; reopening an occurrence someone else concluded: `reopenOthers`;
// saving a process as a template: `registry`). Static
// paths are registered before `/:id` (the browser demo's router takes the first match).

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  applyFlowTemplateSchema,
  flowTemplateInputSchema,
  idSchema,
  MAX_ATTACHMENT_BYTES,
  memberDepartmentSchema,
  monthKeySchema,
  occurrencePeriodSchema,
  recurringGenerateSchema,
  recurringTaskInputSchema,
  recurringTaskQuerySchema,
  regimeGroupApplySchema,
  regimeGroupParamsSchema,
  subtaskInputSchema,
  subtaskUpdateSchema,
  taskAttachmentInputSchema,
  taskAuditQuerySchema,
  taskCalendarQuerySchema,
  taskCategoryInputSchema,
  taskCommentInputSchema,
  taskDashboardQuerySchema,
  taskDepartmentInputSchema,
  taskFlowInputSchema,
  taskFlowQuerySchema,
  taskHomeQuerySchema,
  taskInputSchema,
  taskMyOverviewQuerySchema,
  taskNoteInputSchema,
  taskQuerySchema,
  taskReportExportQuerySchema,
  taskReportQuerySchema,
  taskStatusInputSchema,
  taskUpdateSchema,
} from '@effinance/shared';
import { rateLimited } from '../../lib/platform';
import { idParams } from '../common/params';
import { requireTaskPermission, runTasks, taskGuards } from './access';
import { addAttachment, deleteAttachment, downloadAttachment, listAttachments } from './attachments';
import { auditMatrix } from './audit';
import { contentDisposition } from './file-check';
import {
  applyTemplate,
  createFlow,
  createTemplate,
  deleteFlow,
  deleteTemplate,
  getFlow,
  getTemplate,
  listFlows,
  listTemplates,
  updateTemplate,
} from './flows';
import { taskDashboard } from './dashboard';
import { taskHome } from './home';
import { exportTaskReport, taskCalendar, taskReport } from './insights';
import { createNote, deleteNote, listNotes, updateNote } from './notes';
import { myOverview } from './overview';
import { applyRegimeGroup, listRegimeGroups } from './regime-groups';
import {
  createRecurring,
  deleteRecurring,
  generateOccurrences,
  getRecurring,
  listRecurring,
  occurrenceDetail,
  updateRecurring,
} from './recurring';
import {
  clientOptions,
  createCategory,
  createDepartment,
  deleteCategory,
  deleteDepartment,
  listCategories,
  listDepartments,
  listMembers,
  setMemberDepartment,
  taskOptions,
  updateCategory,
  updateDepartment,
} from './registry';
import {
  addComment,
  addSubtask,
  changeTaskStatus,
  createTask,
  deleteComment,
  deleteSubtask,
  deleteTask,
  getTaskDetail,
  listTasks,
  recentActivity,
  taskHistory,
  updateSubtask,
  updateTask,
} from './service';

const memberParams = z.object({ userId: idSchema });
const subtaskParams = z.object({ id: idSchema, subtaskId: idSchema });
const commentParams = z.object({ id: idSchema, commentId: idSchema });
const attachmentParams = z.object({ id: idSchema, attachmentId: idSchema });
const occurrenceParams = z.object({ id: idSchema, period: occurrencePeriodSchema });
const monthQuery = z.object({ month: monthKeySchema.optional() });
const registry = { onRequest: requireTaskPermission('registry') };
const deleteRegistry = { onRequest: requireTaskPermission('deleteRegistry') };
const deleteTasks = { onRequest: requireTaskPermission('deleteTasks') };

/** The file in base64 (4/3 of the bytes) plus the rest of the JSON. */
export const ATTACHMENT_BODY_LIMIT = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 + 64 * 1024;

export const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  taskGuards(app);
  const run = runTasks.bind(null, app.db);

  // --- options, members, registries ----------------------------------------------------------------
  app.get('/options', async (req) => run(req, (ctx) => taskOptions(ctx)));
  app.get('/clients', async (req) => run(req, (ctx) => clientOptions(ctx)));
  app.get('/members', async (req) => run(req, (ctx) => listMembers(ctx)));
  app.put(
    '/members/:userId/department',
    { ...registry, schema: { params: memberParams, body: memberDepartmentSchema } },
    async (req) =>
      run(req, (ctx) => setMemberDepartment(ctx, req.params.userId, req.body.departmentId)),
  );

  app.get('/departments', async (req) => run(req, (ctx) => listDepartments(ctx)));
  app.post(
    '/departments',
    { ...registry, schema: { body: taskDepartmentInputSchema } },
    async (req, reply) =>
      reply.code(201).send(await run(req, (ctx) => createDepartment(ctx, req.body))),
  );
  app.put(
    '/departments/:id',
    { ...registry, schema: { params: idParams, body: taskDepartmentInputSchema } },
    async (req) => run(req, (ctx) => updateDepartment(ctx, req.params.id, req.body)),
  );
  app.delete('/departments/:id', { ...deleteRegistry, schema: { params: idParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteDepartment(ctx, req.params.id));
    return reply.code(204).send();
  });

  app.get('/categories', async (req) => run(req, (ctx) => listCategories(ctx)));
  app.post(
    '/categories',
    { ...registry, schema: { body: taskCategoryInputSchema } },
    async (req, reply) =>
      reply.code(201).send(await run(req, (ctx) => createCategory(ctx, req.body))),
  );
  app.put(
    '/categories/:id',
    { ...registry, schema: { params: idParams, body: taskCategoryInputSchema } },
    async (req) => run(req, (ctx) => updateCategory(ctx, req.params.id, req.body)),
  );
  app.delete('/categories/:id', { ...deleteRegistry, schema: { params: idParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteCategory(ctx, req.params.id));
    return reply.code(204).send();
  });

  // --- summaries, calendar, reports ------------------------------------------------------------------
  app.get('/home', { schema: { querystring: taskHomeQuerySchema } }, async (req) =>
    run(req, (ctx) => taskHome(ctx, req.query)),
  );
  app.get('/dashboard', { schema: { querystring: taskDashboardQuerySchema } }, async (req) =>
    run(req, (ctx) => taskDashboard(ctx, req.query)),
  );
  app.get('/activity', async (req) => run(req, (ctx) => recentActivity(ctx)));
  // The personal area: only your numbers and your department's aggregate.
  app.get('/me/overview', { schema: { querystring: taskMyOverviewQuerySchema } }, async (req) =>
    run(req, (ctx) => myOverview(ctx, req.query)),
  );
  app.get('/calendar', { schema: { querystring: taskCalendarQuerySchema } }, async (req) =>
    run(req, (ctx) => taskCalendar(ctx, req.query)),
  );
  app.get('/reports', { schema: { querystring: taskReportQuerySchema } }, async (req) =>
    run(req, (ctx) => taskReport(ctx, req.query)),
  );
  app.get(
    '/reports/export.csv',
    { schema: { querystring: taskReportExportQuerySchema }, config: rateLimited(app.platform, 30, '1 minute') },
    async (req, reply) => {
      const { fileName, csv } = await runTasks(app.db, req, (ctx) => exportTaskReport(ctx, req.query));
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', contentDisposition(fileName))
        .header('x-content-type-options', 'nosniff')
        .send(csv);
    },
  );

  // --- monthly audit -----------------------------------------------------------------------------------
  app.get('/audit', { schema: { querystring: taskAuditQuerySchema } }, async (req) =>
    run(req, (ctx) => auditMatrix(ctx, req.query)),
  );

  // --- regime groups (default recurring tasks per tax regime) -------------------------------------------
  app.get('/regime-groups', async (req) => run(req, (ctx) => listRegimeGroups(ctx)));
  app.post(
    '/regime-groups/:regime/apply',
    { ...registry, schema: { params: regimeGroupParamsSchema, body: regimeGroupApplySchema } },
    async (req) => run(req, (ctx) => applyRegimeGroup(ctx, req.params.regime, req.body)),
  );

  // --- recurring tasks ---------------------------------------------------------------------------------
  app.get('/recurring', { schema: { querystring: recurringTaskQuerySchema } }, async (req) =>
    run(req, (ctx) => listRecurring(ctx, req.query)),
  );
  app.post(
    '/recurring',
    { ...registry, schema: { body: recurringTaskInputSchema } },
    async (req, reply) => reply.code(201).send(await run(req, (ctx) => createRecurring(ctx, req.body))),
  );
  app.post(
    '/recurring/generate',
    { ...registry, schema: { body: recurringGenerateSchema } },
    async (req) => run(req, (ctx) => generateOccurrences(ctx, req.body.competence)),
  );
  app.get('/recurring/:id', { schema: { params: idParams, querystring: monthQuery } }, async (req) =>
    run(req, (ctx) => getRecurring(ctx, req.params.id, req.query.month)),
  );
  app.put(
    '/recurring/:id',
    { ...registry, schema: { params: idParams, body: recurringTaskInputSchema } },
    async (req) => run(req, (ctx) => updateRecurring(ctx, req.params.id, req.body)),
  );
  app.delete('/recurring/:id', { ...deleteRegistry, schema: { params: idParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteRecurring(ctx, req.params.id));
    return reply.code(204).send();
  });
  app.get('/recurring/:id/occurrences/:period', { schema: { params: occurrenceParams } }, async (req) =>
    run(req, (ctx) => occurrenceDetail(ctx, req.params.id, req.params.period)),
  );

  // --- processes and templates -------------------------------------------------------------------------
  app.get('/flows', { schema: { querystring: taskFlowQuerySchema } }, async (req) =>
    run(req, (ctx) => listFlows(ctx, req.query)),
  );
  app.post('/flows', { schema: { body: taskFlowInputSchema } }, async (req, reply) =>
    reply.code(201).send(await run(req, (ctx) => createFlow(ctx, req.body))),
  );
  app.get('/flows/:id', { schema: { params: idParams } }, async (req) => run(req, (ctx) => getFlow(ctx, req.params.id)));
  app.delete('/flows/:id', { ...deleteTasks, schema: { params: idParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteFlow(ctx, req.params.id));
    return reply.code(204).send();
  });
  app.get('/flow-templates', async (req) => run(req, (ctx) => listTemplates(ctx)));
  app.post(
    '/flow-templates',
    { ...registry, schema: { body: flowTemplateInputSchema } },
    async (req, reply) => reply.code(201).send(await run(req, (ctx) => createTemplate(ctx, req.body))),
  );
  app.get('/flow-templates/:id', { schema: { params: idParams } }, async (req) =>
    run(req, (ctx) => getTemplate(ctx, req.params.id)),
  );
  app.put(
    '/flow-templates/:id',
    { ...registry, schema: { params: idParams, body: flowTemplateInputSchema } },
    async (req) => run(req, (ctx) => updateTemplate(ctx, req.params.id, req.body)),
  );
  app.delete('/flow-templates/:id', { ...deleteRegistry, schema: { params: idParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteTemplate(ctx, req.params.id));
    return reply.code(204).send();
  });
  app.post(
    '/flow-templates/:id/apply',
    { schema: { params: idParams, body: applyFlowTemplateSchema } },
    async (req, reply) => reply.code(201).send(await run(req, (ctx) => applyTemplate(ctx, req.params.id, req.body))),
  );

  // --- personal notes (each member, their own) ---------------------------------------------------------
  app.get('/notes', async (req) => run(req, (ctx) => listNotes(ctx)));
  app.post('/notes', { schema: { body: taskNoteInputSchema } }, async (req, reply) =>
    reply.code(201).send(await run(req, (ctx) => createNote(ctx, req.body))),
  );
  app.put('/notes/:id', { schema: { params: idParams, body: taskNoteInputSchema } }, async (req) =>
    run(req, (ctx) => updateNote(ctx, req.params.id, req.body)),
  );
  app.delete('/notes/:id', { schema: { params: idParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteNote(ctx, req.params.id));
    return reply.code(204).send();
  });

  // --- tasks -------------------------------------------------------------------------------------------
  app.get('/', { schema: { querystring: taskQuerySchema } }, async (req) =>
    run(req, (ctx) => listTasks(ctx, req.query)),
  );
  app.post('/', { schema: { body: taskInputSchema } }, async (req, reply) =>
    reply.code(201).send(await run(req, (ctx) => createTask(ctx, req.body))),
  );
  app.get('/:id', { schema: { params: idParams } }, async (req) =>
    run(req, (ctx) => getTaskDetail(ctx, req.params.id)),
  );
  app.patch('/:id', { schema: { params: idParams, body: taskUpdateSchema } }, async (req) =>
    run(req, (ctx) => updateTask(ctx, req.params.id, req.body)),
  );
  app.patch(
    '/:id/status',
    { schema: { params: idParams, body: taskStatusInputSchema } },
    async (req) => run(req, (ctx) => changeTaskStatus(ctx, req.params.id, req.body.status, req.body.reason)),
  );
  app.delete('/:id', { ...deleteTasks, schema: { params: idParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteTask(ctx, req.params.id));
    return reply.code(204).send();
  });
  app.get('/:id/history', { schema: { params: idParams } }, async (req) =>
    run(req, (ctx) => taskHistory(ctx, req.params.id)),
  );

  app.post(
    '/:id/subtasks',
    { schema: { params: idParams, body: subtaskInputSchema } },
    async (req, reply) =>
      reply.code(201).send(await run(req, (ctx) => addSubtask(ctx, req.params.id, req.body))),
  );
  app.patch(
    '/:id/subtasks/:subtaskId',
    { schema: { params: subtaskParams, body: subtaskUpdateSchema } },
    async (req) =>
      run(req, (ctx) => updateSubtask(ctx, req.params.id, req.params.subtaskId, req.body)),
  );
  app.delete(
    '/:id/subtasks/:subtaskId',
    { schema: { params: subtaskParams } },
    async (req, reply) => {
      await run(req, (ctx) => deleteSubtask(ctx, req.params.id, req.params.subtaskId));
      return reply.code(204).send();
    },
  );

  app.post(
    '/:id/comments',
    { schema: { params: idParams, body: taskCommentInputSchema } },
    async (req, reply) =>
      reply.code(201).send(await run(req, (ctx) => addComment(ctx, req.params.id, req.body))),
  );
  app.delete('/:id/comments/:commentId', { schema: { params: commentParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteComment(ctx, req.params.id, req.params.commentId));
    return reply.code(204).send();
  });

  app.get('/:id/attachments', { schema: { params: idParams } }, async (req) =>
    run(req, (ctx) => listAttachments(ctx, req.params.id)),
  );
  app.post(
    '/:id/attachments',
    {
      bodyLimit: ATTACHMENT_BODY_LIMIT,
      schema: { params: idParams, body: taskAttachmentInputSchema },
      config: rateLimited(app.platform, 60, '1 minute'),
    },
    async (req, reply) => reply.code(201).send(await run(req, (ctx) => addAttachment(ctx, req.params.id, req.body))),
  );
  app.get('/:id/attachments/:attachmentId/download', { schema: { params: attachmentParams } }, async (req, reply) => {
    const file = await runTasks(app.db, req, (ctx) => downloadAttachment(ctx, req.params.id, req.params.attachmentId));
    // Never rendered by the browser: a download, the stored type (from the allowlist; never HTML or
    // SVG), no sniffing, and a CSP that sandboxes it if someone opens it anyway.
    return reply
      .header('content-type', file.contentType)
      .header('content-disposition', contentDisposition(file.fileName))
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('cache-control', 'private, no-store')
      .send(file.content);
  });
  app.delete('/:id/attachments/:attachmentId', { schema: { params: attachmentParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteAttachment(ctx, req.params.id, req.params.attachmentId));
    return reply.code(204).send();
  });
};
