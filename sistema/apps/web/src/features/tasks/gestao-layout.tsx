import { Outlet, useLocation } from 'react-router';
import { HIDDEN_PAGE_REASON, RestrictedAccess } from '@/components/layout/finance-gate';
import { pagePermissionOf } from '@/components/layout/nav';
import { usePermissions } from '@/features/auth/permissions';
import { OccurrenceSheetHost } from './components/occurrence-sheet';
import { TaskSheetHost } from './components/task-sheet';

/**
 * Layout of the Gestão pages: the page, the occurrence sheet (`?recorrente=&periodo=`) and the task
 * sheet (`?tarefa=`), which opens over any of them — the occurrence of a client over its sheet. A page
 * hidden for the person (`page.*`, spec §13.10) shows "Acesso restrito" at its URL and never mounts.
 */
export default function GestaoLayout() {
  const { pathname } = useLocation();
  const { can } = usePermissions();
  const key = pagePermissionOf(pathname);
  return (
    <>
      {key && !can(key) ? <RestrictedAccess message={HIDDEN_PAGE_REASON} /> : <Outlet />}
      <OccurrenceSheetHost />
      <TaskSheetHost />
    </>
  );
}
