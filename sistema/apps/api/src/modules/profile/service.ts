// Profile photo (spec §15.3, §18.17): one per user, across workspaces (identity data, outside RLS, on
// the system connection). Stored encrypted with a platform key (AAD bound to the user), PNG/JPEG/WebP
// up to 100 KB checked by signature (the browser sends a 256×256 WebP). Only members of a workspace the
// person is in see it (here: the requester's current workspace); it goes with the account (cascade) and
// into the requester's data export.

import { and, eq, sql } from 'drizzle-orm';
import { MAX_PROFILE_PHOTO_BYTES, type ProfilePhotoContentType } from '@effinance/shared';
import type { DbExecutor } from '../../db/client';
import { userPhotos, workspaceMembers } from '../../db/schema';
import { platformDecryptBytes, platformEncryptBytes } from '../../lib/crypto/platform-keys';
import { NotFoundError } from '../../lib/errors';
import { decodeImageDataUri } from '../../lib/images';

export const PHOTO_KEY = 'user-photos';

export async function setProfilePhoto(db: DbExecutor, userId: string, dataUri: string): Promise<Date> {
  const image = decodeImageDataUri(dataUri, MAX_PROFILE_PHOTO_BYTES, 'A imagem passa de 100 KB.');
  const content = await platformEncryptBytes(db, PHOTO_KEY, userId, image.bytes);
  const values = { contentType: image.type as ProfilePhotoContentType, sizeBytes: image.bytes.length, content, updatedAt: new Date() };
  const [row] = await db
    .insert(userPhotos)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userPhotos.userId, set: values })
    .returning({ updatedAt: userPhotos.updatedAt });
  return row!.updatedAt;
}

export async function deleteProfilePhoto(db: DbExecutor, userId: string): Promise<void> {
  await db.delete(userPhotos).where(eq(userPhotos.userId, userId));
}

/**
 * The photo of `userId` for a requester in `workspaceId`: themselves, or a member of the same workspace.
 * Anything else is "not found" (no probing of who has a photo).
 */
export async function readProfilePhoto(
  db: DbExecutor,
  requester: { userId: string; workspaceId: string },
  userId: string,
): Promise<{ contentType: ProfilePhotoContentType; bytes: Uint8Array; updatedAt: Date }> {
  const [row] = await db
    .select({ contentType: userPhotos.contentType, content: userPhotos.content, updatedAt: userPhotos.updatedAt })
    .from(userPhotos)
    .where(
      and(
        eq(userPhotos.userId, userId),
        userId === requester.userId
          ? undefined
          : sql`exists (select 1 from ${workspaceMembers} where ${workspaceMembers.workspaceId} = ${requester.workspaceId} and ${workspaceMembers.userId} = ${userId})`,
      ),
    );
  if (!row) throw new NotFoundError('Foto não encontrada');
  return { contentType: row.contentType, bytes: await platformDecryptBytes(db, PHOTO_KEY, userId, row.content), updatedAt: row.updatedAt };
}
