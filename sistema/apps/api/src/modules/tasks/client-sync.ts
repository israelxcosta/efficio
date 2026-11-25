// A client's registration changed (regime, contract start, inactivation, reactivation): the task rules
// follow in the same tenant transaction — not-started occurrences that no longer apply are canceled
// with the reason, the ones the system canceled come back, the new regime's are generated.

import type { DbExecutor } from '../../db/client';
import type { Access } from '../workspaces/access';
import { taskContextOfRequest, type TaskContext } from './access';
import { syncClientOccurrences } from './generation';

export async function syncClientTasks(
  system: DbExecutor,
  req: { db: DbExecutor; workspaceId: string; userId: string; access: Access; log?: TaskContext['log'] },
  clientId: string,
): Promise<void> {
  await syncClientOccurrences(await taskContextOfRequest(system, req), clientId);
}
