// Profile photo (spec §15.3, §18.17): PNG/JPEG/WebP up to 100 KB checked by signature, encrypted at
// rest with a platform key, read only by members of the requester's workspace, listed with the members
// (`photoUpdatedAt`), in the requester's data export, and gone with the account.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, registerUser, resetDb, TEST_PASSWORD } from './helpers';
import { office } from './task-helpers';

let app: App;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb(app);
});

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAABACAIAAAAS6ev4AAAAtklEQVR42u3cYQnAIBCAUUuYwlT2McmCWUMjCIIHO558AcY9Njh/rNTWlbhiBIAFWIAFWIAFWIABC7AAC7AAKwh4PTsYAAuwAAMGDBgw4BfAy7l6JQADPo045lMDFTBgwIABAwYMGLA1yRVE8osOowcswAIMGDBgwIABpwWOedDxzV8HGDBgwIABAwYMGLCVyR4MGDBgwAIswIABAwbsJywCLMACLMACDFiABViABViABRiwkrUBk0U/aDulaGkAAAAASUVORK5CYII=';
const PNG = `data:image/png;base64,${PNG_BASE64}`;
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64')}`;

describe('profile photo', () => {
  it('uploads, lists and serves the photo to members of the same workspace only', async () => {
    const { ana, carla } = await office(app);
    const saved = await carla.put('/profile/photo', { photo: PNG });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const version = saved.body.photoUpdatedAt as string;
    expect(version).toEqual(expect.any(String));

    // Encrypted at rest (IV + ciphertext + tag), never the PNG bytes.
    const [row] = await executeRows<{ size_bytes: number; len: number; head: string }>(
      admin(),
      sql`select size_bytes, octet_length(content) as len, encode(substring(content from 1 for 8), 'hex') as head from user_photos`,
    );
    expect(row!.len).toBe(row!.size_bytes + 28);
    expect(row!.head).not.toBe('89504e470d0a1a0a');

    expect((await carla.get('/auth/me')).body.user.photoUpdatedAt).toBe(version);
    const members = await ana.get('/workspaces/current/members');
    expect(members.body.find((m: { userId: string }) => m.userId === carla.userId).photoUpdatedAt).toBe(version);
    const options = await ana.get('/tasks/options');
    expect(options.body.members.find((m: { id: string }) => m.id === carla.userId).photoUpdatedAt).toBe(version);

    const served = await ana.get(`/profile/photos/${carla.userId}?v=${encodeURIComponent(version)}`);
    expect(served.status).toBe(200);
    expect(served.raw.headers['content-type']).toBe('image/png');
    expect(served.raw.headers['x-content-type-options']).toBe('nosniff');
    expect(served.raw.headers['cache-control']).toBe('private, max-age=300');
    expect(served.raw.rawPayload.toString('base64')).toBe(PNG_BASE64);
    expect((await carla.get(`/profile/photos/${carla.userId}`)).status).toBe(200);

    // Someone from another workspace cannot see it (nor tell whether it exists).
    const outsider = await registerUser(app, 'Fora do Escritório');
    expect((await outsider.get(`/profile/photos/${carla.userId}`)).status).toBe(404);
    expect((await ana.get(`/profile/photos/${outsider.userId}`)).status).toBe(404);

    // The requester's export carries their own photo only.
    const exported = await ana.get('/workspaces/current/export');
    expect(exported.body.profilePhoto).toBeNull();

    // Replace, then remove.
    expect((await carla.put('/profile/photo', { photo: JPEG })).status).toBe(200);
    expect((await ana.get(`/profile/photos/${carla.userId}`)).raw.headers['content-type']).toBe('image/jpeg');
    expect((await carla.del('/profile/photo')).status).toBe(204);
    expect((await ana.get(`/profile/photos/${carla.userId}`)).status).toBe(404);
    expect((await carla.get('/auth/me')).body.user.photoUpdatedAt).toBeNull();
  });

  it('refuses a fake signature, SVG, other formats and more than 100 KB', async () => {
    const owner = await registerUser(app, 'Dona');
    const fake = await owner.put('/profile/photo', { photo: `data:image/png;base64,${Buffer.from('GIF89a fake png').toString('base64')}` });
    expect(fake.status).toBe(422);
    expect(fake.body.message).toMatch(/não corresponde a uma imagem/);
    const jpegAsWebp = await owner.put('/profile/photo', { photo: JPEG.replace('image/jpeg', 'image/webp') });
    expect(jpegAsWebp.status).toBe(422);
    expect((await owner.put('/profile/photo', { photo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })).status).toBe(400);
    expect((await owner.put('/profile/photo', { photo: 'data:image/gif;base64,R0lGODlh' })).status).toBe(400);
    const big = Buffer.concat([Buffer.from(PNG_BASE64, 'base64'), Buffer.alloc(101 * 1024)]).toString('base64');
    expect((await owner.put('/profile/photo', { photo: `data:image/png;base64,${big}` })).status).toBe(400);
    const [row] = await executeRows<{ n: number }>(admin(), sql`select count(*)::int as n from user_photos`);
    expect(row!.n).toBe(0);
  });

  it('is in the owner\'s export and goes with the account', async () => {
    const owner = await registerUser(app, 'Dona');
    expect((await owner.put('/profile/photo', { photo: PNG })).status).toBe(200);
    const exported = await owner.get('/workspaces/current/export');
    expect(exported.body.profilePhoto).toMatchObject({ contentType: 'image/png', dataUri: PNG });
    expect((await owner.del('/auth/me', { password: TEST_PASSWORD })).status).toBe(204);
    const [row] = await executeRows<{ n: number }>(admin(), sql`select count(*)::int as n from user_photos`);
    expect(row!.n).toBe(0);
  });
});
