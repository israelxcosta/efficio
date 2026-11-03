import { useId, useRef, useState, type DragEvent } from 'react';
import { Download, FileArchive, FileCode, FileImage, FileSpreadsheet, FileText, Paperclip, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { dateInTimeZone, type TaskAttachmentType, type TaskDetail } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ApiRequestError, errorMessage } from '@/lib/api';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { downloadAttachment, useDeleteAttachment, useUploadAttachment } from '../api';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_ERRORS,
  attachmentIconKind,
  checkAttachments,
  fileToBase64,
  formatBytes,
  middleTruncate,
  type AttachmentIconKind,
} from '../attachments';
import { shortDate, shortName } from '../due';

const ICONS: Record<AttachmentIconKind, typeof FileText> = {
  text: FileText,
  image: FileImage,
  sheet: FileSpreadsheet,
  code: FileCode,
  archive: FileArchive,
};

interface Upload {
  id: string;
  file: File;
  contentType: TaskAttachmentType | null;
  phase: 'reading' | 'sending' | 'error';
  progress: number;
  error?: string;
  controller?: AbortController;
}

function AttachmentIcon({ type }: { type: TaskAttachmentType | null }) {
  const Icon = ICONS[type ? attachmentIconKind(type) : 'text'];
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-muted" aria-hidden>
      <Icon className="size-4" />
    </span>
  );
}

/**
 * Attachments of a task (spec §9.1, item 5): pick or drop files (up to 5 at once), checked in the
 * browser before sending (type, 10 MB, 50 files and 50 MB per task) and again by the API; each upload
 * shows its progress and can be cancelled; downloads are always files; removing confirms in the row.
 */
export function AttachmentList({ task, readOnly, today }: { task: TaskDetail; readOnly: boolean; today: string }) {
  const upload = useUploadAttachment(task.id);
  const remove = useDeleteAttachment(task.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const headingId = useId();

  const patch = (id: string, p: Partial<Upload>) => setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...p } : u)));

  async function send(u: Upload) {
    if (!u.contentType) return;
    const controller = new AbortController();
    patch(u.id, { phase: 'reading', progress: 0, error: undefined, controller });
    try {
      const content = await fileToBase64(u.file, (f) => patch(u.id, { progress: f }), controller.signal);
      patch(u.id, { phase: 'sending', progress: 1 });
      await upload.mutateAsync({ input: { fileName: u.file.name, contentType: u.contentType, content }, signal: controller.signal });
      setUploads((list) => list.filter((x) => x.id !== u.id));
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setUploads((list) => list.filter((x) => x.id !== u.id));
        return;
      }
      const message = error instanceof ApiRequestError && error.status !== 0 ? errorMessage(error) : ATTACHMENT_ERRORS.network;
      patch(u.id, { phase: 'error', error: message, controller: undefined });
    }
  }

  function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (!files.length) return;
    const pending = uploads.filter((u) => u.phase !== 'error');
    const check = checkAttachments(files, {
      count: task.attachments.length + pending.length,
      bytes: task.attachments.reduce((n, a) => n + a.sizeBytes, 0) + pending.reduce((n, u) => n + u.file.size, 0),
    });
    const next: Upload[] = [
      ...check.accepted.map(({ file, contentType }) => ({ id: crypto.randomUUID(), file, contentType, phase: 'reading' as const, progress: 0 })),
      ...check.rejected.map(({ file, message }) => ({ id: crypto.randomUUID(), file, contentType: null, phase: 'error' as const, progress: 0, error: message })),
    ];
    setUploads((u) => [...u, ...next]);
    for (const u of next) if (u.phase === 'reading') void send(u);
  }

  async function confirmRemove(id: string) {
    try {
      await remove.mutateAsync(id);
      setConfirming(null);
      toast.success('Anexo removido.');
    } catch (error) {
      toastError(error);
    }
  }

  const onDrag = (e: DragEvent) => {
    if (readOnly || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    if (!dragging) setDragging(true);
  };

  return (
    <section
      className="flex flex-col gap-2.5"
      aria-labelledby={headingId}
      onDragEnter={onDrag}
      onDragOver={onDrag}
      onDragLeave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        if (readOnly) return;
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-body-sm font-semibold text-fg">
          Anexos{task.attachments.length ? <span className="ml-1.5 font-normal text-muted">{task.attachments.length}</span> : null}
        </h3>
        {!readOnly ? (
          <>
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <Paperclip /> Anexar arquivo
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </>
        ) : null}
      </div>

      {dragging ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface-muted py-6 text-center text-body-sm text-muted">Solte para anexar</div>
      ) : null}

      {task.attachments.length === 0 && uploads.length === 0 && !dragging ? (
        <p className="text-body-sm text-subtle">
          {readOnly ? 'Nenhum anexo.' : 'Nenhum anexo. Arraste arquivos para cá ou use Anexar arquivo. Até 10 MB por arquivo.'}
        </p>
      ) : null}

      <ul className="flex flex-col">
        {task.attachments.map((a) => (
          <li key={a.id} className="group/att flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-muted">
            {confirming === a.id ? (
              <>
                <span className="min-w-0 flex-1 truncate text-body-sm text-fg">Remover {middleTruncate(a.fileName, 28)}?</span>
                <Button variant="danger" size="sm" loading={remove.isPending} onClick={() => void confirmRemove(a.id)}>
                  Remover
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <AttachmentIcon type={a.contentType} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg" title={a.fileName}>
                    {middleTruncate(a.fileName)}
                  </span>
                  <span className="block truncate text-caption text-muted">
                    {formatBytes(a.sizeBytes)}
                    {a.uploadedBy ? ` · ${shortName(a.uploadedBy.name)}` : ''} · {shortDate(dateInTimeZone(new Date(a.createdAt)), today)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Baixar ${a.fileName}`}
                  onClick={() => void downloadAttachment(task.id, a).catch(toastError)}
                >
                  <Download />
                </Button>
                {a.canDelete && !readOnly ? (
                  <Button variant="ghost" size="icon-sm" aria-label={`Remover ${a.fileName}`} onClick={() => setConfirming(a.id)}>
                    <X />
                  </Button>
                ) : null}
              </>
            )}
          </li>
        ))}
        {uploads.map((u) => (
          <li key={u.id} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5">
            <AttachmentIcon type={u.contentType} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg" title={u.file.name}>
                {middleTruncate(u.file.name)}
              </span>
              {u.phase === 'error' ? (
                <span role="alert" className="block text-caption text-danger">
                  {u.error}
                </span>
              ) : (
                <span className="mt-1 flex items-center gap-2">
                  <ProgressBar
                    size="sm"
                    value={u.phase === 'sending' ? 1 : u.progress}
                    className={cn('max-w-48', u.phase === 'sending' && 'animate-shimmer')}
                    label={`Enviando ${u.file.name}`}
                  />
                  <span className="shrink-0 text-caption text-muted tabular">
                    {u.phase === 'sending' ? 'Enviando…' : `Preparando… ${Math.round(u.progress * 100)}%`}
                  </span>
                </span>
              )}
            </span>
            {u.phase === 'error' && u.contentType ? (
              <Button variant="ghost" size="sm" onClick={() => void send(u)}>
                <RotateCcw /> Tentar de novo
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={u.phase === 'error' ? `Dispensar ${u.file.name}` : `Cancelar o envio de ${u.file.name}`}
              onClick={() => {
                u.controller?.abort();
                setUploads((list) => list.filter((x) => x.id !== u.id));
              }}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
