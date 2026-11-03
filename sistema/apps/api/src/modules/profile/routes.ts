// Profile photo under /api/profile (spec §15.3). The person's own data (like the name in PUT /auth/me):
// no subscription needed. Reading another person's photo needs to share the current workspace.

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idSchema, profilePhotoInputSchema, type ProfilePhotoResponse } from '@effinance/shared';
import { rateLimited } from '../../lib/platform';
import { deleteProfilePhoto, readProfilePhoto, setProfilePhoto } from './service';

/** 100 KB in base64 plus the JSON around it. */
export const PROFILE_PHOTO_BODY_LIMIT = 256 * 1024;

export const profileRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.put(
    '/photo',
    { bodyLimit: PROFILE_PHOTO_BODY_LIMIT, schema: { body: profilePhotoInputSchema }, config: rateLimited(app.platform, 20, '1 minute') },
    async (req): Promise<ProfilePhotoResponse> => ({ photoUpdatedAt: (await setProfilePhoto(app.db, req.userId, req.body.photo)).toISOString() }),
  );

  app.delete('/photo', async (req, reply) => {
    await deleteProfilePhoto(app.db, req.userId);
    return reply.code(204).send();
  });

  app.get('/photos/:userId', { schema: { params: z.object({ userId: idSchema }) } }, async (req, reply) => {
    const photo = await readProfilePhoto(app.db, { userId: req.userId, workspaceId: req.workspaceId }, req.params.userId);
    // An image of the allowlist (checked by signature), no sniffing, sandboxed if opened directly;
    // personal data: private cache only, short (the URL carries ?v=<photoUpdatedAt>).
    return reply
      .header('content-type', photo.contentType)
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('cache-control', 'private, max-age=300')
      .send(photo.bytes);
  });
};
