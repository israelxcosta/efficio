// Task module routes under /api/tasks (phase 1). Mounted next to the financial boundary, with its
// own guards (access.ts): every member reads and writes tasks, subtasks and comments; registries and
// deletions are for administrators (`onRequest: requireTaskAdmin`). Static paths are registered before
// `/:id` (the browser demo's router takes the first match).

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  clientResponsibleInputSchema,
  idSchema,
  memberDepartmentSchema,
  subtaskInputSchema,
  subtaskUpdateSchema,
  taskCategoryInputSchema,
  taskCommentInputSchema,
  taskDepartmentInputSchema,
  taskHomeQuerySchema,
  taskInputSchema,
  taskQuerySchema,
  taskStatusInputSchema,
  taskUpdateSchema,
} from '@effinance/shared';
import { idParams } from '../common/params';
import { requireTaskAdmin, runTasks, taskGuards } from './access';
import { taskHome } from './home';
import {
  clientOptions,
  createCategory,
  createDepartment,
  deleteCategory,
  deleteDepartment,
  listCategories,
  listClientResponsibles,
  listDepartments,
  listMembers,
  setClientResponsible,
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
  deleteSubtask,
  deleteTask,
  getTaskDetail,
  listTasks,
  recentActivity,
  updateSubtask,
  updateTask,
} from './service';

const memberParams = z.object({ userId: idSchema });
const subtaskParams = z.object({ id: idSchema, subtaskId: idSchema });
const admin = { onRequest: requireTaskAdmin };

export const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  taskGuards(app);
  const run = runTasks.bind(null, app.db);

  // --- options, members, registries ----------------------------------------------------------------
  app.get('/options', async (req) => run(req, (ctx) => taskOptions(ctx)));
  app.get('/clients', async (req) => run(req, (ctx) => clientOptions(ctx)));
  app.get('/members', async (req) => run(req, (ctx) => listMembers(ctx)));
  app.put(
    '/members/:userId/department',
    { ...admin, schema: { params: memberParams, body: memberDepartmentSchema } },
    async (req) =>
      run(req, (ctx) => setMemberDepartment(ctx, req.params.userId, req.body.departmentId)),
  );

  app.get('/departments', async (req) => run(req, (ctx) => listDepartments(ctx)));
  app.post(
    '/departments',
    { ...admin, schema: { body: taskDepartmentInputSchema } },
    async (req, reply) =>
      reply.code(201).send(await run(req, (ctx) => createDepartment(ctx, req.body))),
  );
  app.put(
    '/departments/:id',
    { ...admin, schema: { params: idParams, body: taskDepartmentInputSchema } },
    async (req) => run(req, (ctx) => updateDepartment(ctx, req.params.id, req.body)),
  );
  app.delete('/departments/:id', { ...admin, schema: { params: idParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteDepartment(ctx, req.params.id));
    return reply.code(204).send();
  });

  app.get('/categories', async (req) => run(req, (ctx) => listCategories(ctx)));
  app.post(
    '/categories',
    { ...admin, schema: { body: taskCategoryInputSchema } },
    async (req, reply) =>
      reply.code(201).send(await run(req, (ctx) => createCategory(ctx, req.body))),
  );
  app.put(
    '/categories/:id',
    { ...admin, schema: { params: idParams, body: taskCategoryInputSchema } },
    async (req) => run(req, (ctx) => updateCategory(ctx, req.params.id, req.body)),
  );
  app.delete('/categories/:id', { ...admin, schema: { params: idParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteCategory(ctx, req.params.id));
    return reply.code(204).send();
  });

  app.get('/client-responsibles', async (req) => run(req, (ctx) => listClientResponsibles(ctx)));
  app.put(
    '/client-responsibles',
    { ...admin, schema: { body: clientResponsibleInputSchema } },
    async (req, reply) => {
      const result = await run(req, (ctx) => setClientResponsible(ctx, req.body));
      return result ? result : reply.code(204).send();
    },
  );

  // --- summaries ---------------------------------------------------------------------------------------
  app.get('/home', { schema: { querystring: taskHomeQuerySchema } }, async (req) =>
    run(req, (ctx) => taskHome(ctx, req.query)),
  );
  app.get('/activity', async (req) => run(req, (ctx) => recentActivity(ctx)));

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
    async (req) => run(req, (ctx) => changeTaskStatus(ctx, req.params.id, req.body.status)),
  );
  app.delete('/:id', { ...admin, schema: { params: idParams } }, async (req, reply) => {
    await run(req, (ctx) => deleteTask(ctx, req.params.id));
    return reply.code(204).send();
  });

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
};
