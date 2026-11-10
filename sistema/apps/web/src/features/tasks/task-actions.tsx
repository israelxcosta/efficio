import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { FlowTemplate, TaskNote } from '@effinance/shared';
import { useAuth } from '@/features/auth/auth-context';
import { useTaskOptions } from './api';
import { ApplyTemplateDialog, FlowBuilderSheet, TemplatePickerDialog } from './components/flow-sheets';
import { NoteSheet, NotesSheet } from './components/notes-sheet';
import { taskHref } from './task-links';
import { DeadlinesSheet, useOpenDeadlines } from '@/features/deadlines/components/deadlines-sheet';
import type { DeadlineGroupKey, DeadlineKind } from '@/features/deadlines/deadline-logic';

interface TaskActions {
  /** "Escolha o modelo", then "Aplicar" (Tarefas, the floating bar, the phone's "+", ⌘K). */
  openTemplatePicker: () => void;
  applyTemplate: (template: FlowTemplate) => void;
  /** "Criar processo avulso". */
  openFlowBuilder: () => void;
  /** "Minhas anotações" (avatar menu, "Mais", ⌘K) in both areas. */
  openNotes: () => void;
  newNote: () => void;
  /** Opens one note (Minha área's card). */
  editNote: (note: TaskNote) => void;
  /** "Vencimentos" (strip of the home page, bell, "Mais", ⌘K), over the current page. */
  openDeadlines: (kind?: DeadlineKind, group?: DeadlineGroupKey) => void;
}

const Ctx = createContext<TaskActions | null>(null);

/**
 * Dialogs of the task module that open from the shell, in either area: the process template picker
 * and the "apply" dialog, the ad hoc process and the personal notes. Mounted by the AppShell.
 */
export function TaskActionsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const [picker, setPicker] = useState(false);
  const [applying, setApplying] = useState<FlowTemplate | null>(null);
  const [builder, setBuilder] = useState(false);
  const [notes, setNotes] = useState(false);
  const [note, setNote] = useState<{ note: TaskNote | null } | null>(null);
  const anyOpen = picker || applying !== null || builder;
  const options = useTaskOptions({ enabled: anyOpen && Boolean(workspace) });
  const openTask = useCallback((id: string) => navigate(taskHref(id)), [navigate]);
  const openDeadlinesRaw = useOpenDeadlines();
  const openDeadlinesRef = useRef(openDeadlinesRaw);
  openDeadlinesRef.current = openDeadlinesRaw;

  const value = useMemo<TaskActions>(
    () => ({
      openTemplatePicker: () => setPicker(true),
      applyTemplate: (t) => setApplying(t),
      openFlowBuilder: () => setBuilder(true),
      openNotes: () => setNotes(true),
      newNote: () => setNote({ note: null }),
      editNote: (n) => setNote({ note: n }),
      openDeadlines: (kind, group) => openDeadlinesRef.current(kind, group),
    }),
    [],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {workspace ? (
        <>
          <TemplatePickerDialog
            open={picker}
            onOpenChange={setPicker}
            onPick={(t) => {
              setPicker(false);
              setApplying(t);
            }}
            onNewTemplate={() => {
              setPicker(false);
              navigate('/tarefas/processos?modelo=novo');
            }}
            onAdHoc={() => {
              setPicker(false);
              setBuilder(true);
            }}
          />
          <ApplyTemplateDialog template={applying} options={options.data} onOpenChange={(o) => !o && setApplying(null)} onOpenTask={openTask} />
          <FlowBuilderSheet open={builder} onOpenChange={setBuilder} options={options.data} onCreated={openTask} />
          <NotesSheet open={notes} onOpenChange={setNotes} onOpenNote={(n) => setNote({ note: n })} />
          <NoteSheet open={note !== null} note={note?.note ?? null} onOpenChange={(o) => !o && setNote(null)} />
          <DeadlinesSheet />
        </>
      ) : null}
    </Ctx.Provider>
  );
}

export function useTaskActions(): TaskActions {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTaskActions outside TaskActionsProvider');
  return ctx;
}
