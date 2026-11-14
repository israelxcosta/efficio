import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { clientDocumentsInputSchema, type Client, type ClientDocumentInput } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { WriteGate } from '@/features/auth/permissions';
import { toastError } from '@/lib/notify';
import { useSaveClientDocuments } from './api';
import { ClientDocumentsEditor, type DocumentRowErrors } from './client-documents-editor';

const ROW_FIELDS = ['kind', 'customName', 'expiresAt', 'note'] as const;

/** Errors of the list schema by row (`documents.<i>.<field>`) and for the whole list. */
export function documentErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const rows: (DocumentRowErrors | undefined)[] = [];
  let list: string | null = null;
  for (const issue of issues) {
    const [, index, field] = issue.path;
    if (typeof index === 'number' && (ROW_FIELDS as readonly PropertyKey[]).includes(field ?? '')) {
      const row = (rows[index] ??= {});
      row[field as (typeof ROW_FIELDS)[number]] ??= issue.message;
    } else list ??= issue.message;
  }
  return { rows, list };
}

const toInput = (c: Client): ClientDocumentInput[] =>
  c.documents.map((d) => ({ id: d.id, kind: d.kind, customName: d.customName ?? '', expiresAt: d.expiresAt ?? '', note: d.note ?? '' }));

/** "Documentos e certidões" of the client page (`clients`): the editor of the finance form, saved alone. */
export function ClientDocumentsSheet({ client, open, onOpenChange }: { client: Client; open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useSaveClientDocuments();
  const [docs, setDocs] = useState<ClientDocumentInput[]>([]);
  const [errors, setErrors] = useState<ReturnType<typeof documentErrors>>({ rows: [], list: null });

  useEffect(() => {
    if (!open) return;
    setDocs(toInput(client));
    setErrors({ rows: [], list: null });
    // Only when it opens: a refetch of the client while editing does not wipe what was typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    const parsed = clientDocumentsInputSchema.safeParse({ documents: docs });
    if (!parsed.success) {
      setErrors(documentErrors(parsed.error.issues));
      return;
    }
    try {
      await save.mutateAsync({ id: client.id, input: { documents: docs } });
      toast.success('Documentos atualizados');
      onOpenChange(false);
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Documentos e certidões"
      description={`${client.tradeName || client.name}: certificados, certidões e alvarás com vencimento`}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <WriteGate scope="tasks" permission="clients">
            <Button onClick={() => void submit()} loading={save.isPending} className="min-w-[110px]">
              Salvar
            </Button>
          </WriteGate>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          void submit();
        }}
      >
        <ClientDocumentsEditor value={docs} onChange={setDocs} errors={errors.rows} />
        {errors.list ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.list}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
