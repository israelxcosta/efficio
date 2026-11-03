import { Outlet } from 'react-router';
import { OccurrenceSheetHost } from './components/occurrence-sheet';
import { TaskSheetHost } from './components/task-sheet';

/**
 * Layout of the Gestão pages: the page, the occurrence sheet (`?recorrente=&periodo=`) and the task
 * sheet (`?tarefa=`), which opens over any of them — the occurrence of a client over its sheet.
 */
export default function GestaoLayout() {
  return (
    <>
      <Outlet />
      <OccurrenceSheetHost />
      <TaskSheetHost />
    </>
  );
}
