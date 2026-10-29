import { Outlet } from 'react-router';
import { TaskSheetHost } from './components/task-sheet';

/** Layout of the Gestão pages: the page and the task sheet that opens over any of them (`?tarefa=`). */
export default function GestaoLayout() {
  return (
    <>
      <Outlet />
      <TaskSheetHost />
    </>
  );
}
