import { useEffect, useMemo, useState } from 'react';
import { NotebookPen, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { taskNoteInputSchema, type TaskNote } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Textarea } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { formatRelative } from '@/lib/datetime';
import { toastError } from '@/lib/notify';
import { useDeleteNote, useSaveNote, useTaskNotes } from '../api';

/** Notes newest edit first, filtered by title and text in the browser (they are encrypted on the server). */
export function filterNotes(notes: TaskNote[], search: string): TaskNote[] {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const q = norm(search.trim());
  return [...notes]
    .filter((n) => !q || norm(n.title).includes(q) || norm(n.content ?? '').includes(q))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** "Minhas anotações" (spec §15.2): personal notes, visible only to their author, in this workspace. */
export function NotesSheet({ open, onOpenChange, onOpenNote }: { open: boolean; onOpenChange: (open: boolean) => void; onOpenNote: (note: TaskNote | null) => void }) {
  const notes = useTaskNotes({ enabled: open });
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);
  const list = useMemo(() => filterNotes(notes.data ?? [], search), [notes.data, search]);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Minhas anotações"
      description="Visíveis somente para você, neste espaço."
      headerExtra={
        <div className="flex items-center gap-2">
          {(notes.data?.length ?? 0) > 10 ? (
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar anotação" aria-label="Buscar anotação" className="h-9 pl-9 text-[13px]" />
            </div>
          ) : (
            <span className="flex-1" />
          )}
          <Button variant="ghost" size="sm" onClick={() => onOpenNote(null)}>
            <Plus /> Nova
          </Button>
        </div>
      }
    >
      {notes.isPending ? (
        <SkeletonRows rows={4} />
      ) : notes.isError && !notes.data ? (
        <ErrorState error={notes.error} onRetry={() => notes.refetch()} />
      ) : (notes.data ?? []).length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title="Nenhuma anotação"
          description="Guarde lembretes e endereços de portais. Só você vê."
          action={
            <Button variant="outline" size="sm" onClick={() => onOpenNote(null)}>
              Nova anotação
            </Button>
          }
        />
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-muted">Nenhuma anotação com esse texto.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {list.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onOpenNote(n)} className="flex min-h-14 w-full flex-col justify-center rounded-lg px-2 py-2 text-left hover:bg-surface-muted">
                <span className="truncate text-sm font-semibold text-fg">{n.title}</span>
                {n.content ? <span className="truncate text-body-sm text-muted">{n.content.split('\n')[0]}</span> : null}
                <span className="text-caption text-subtle">editada {formatRelative(n.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/** Create or edit a note (title up to 200, text up to 20,000 characters). */
export function NoteSheet({ open, note, onOpenChange }: { open: boolean; note: TaskNote | null; onOpenChange: (open: boolean) => void }) {
  const save = useSaveNote();
  const remove = useDeleteNote();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle(note?.title ?? '');
    setContent(note?.content ?? '');
    setError(null);
  }, [open, note?.id]);

  async function submit() {
    const parsed = taskNoteInputSchema.safeParse({ title, content: content.trim() || null });
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Informe o título da anotação';
      setError(msg.endsWith('.') ? msg : `${msg}.`);
      return;
    }
    try {
      await save.mutateAsync({ id: note?.id, input: parsed.data });
      toast.success('Anotação salva.');
      onOpenChange(false);
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={note ? 'Editar anotação' : 'Nova anotação'}
        description="Visível somente para você."
        footer={
          <>
            {note ? (
              <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={() => setConfirming(true)}>
                Excluir
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button loading={save.isPending} onClick={() => void submit()}>
              Salvar
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Título*" error={error ?? undefined}>
            <Input
              data-autofocus
              maxLength={200}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              placeholder="Ex.: Portal da prefeitura"
            />
          </Field>
          <Field label="Anotação">
            <Textarea rows={8} maxLength={20000} value={content} onChange={(e) => setContent(e.target.value)} />
          </Field>
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Excluir a anotação “${note?.title ?? ''}”?`}
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir anotação"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!note) return;
          try {
            await remove.mutateAsync(note.id);
            setConfirming(false);
            onOpenChange(false);
            toast.success('Anotação excluída.');
          } catch (e) {
            toastError(e);
          }
        }}
      />
    </>
  );
}
