import { CircleAlert, PenLine, Send } from 'lucide-react';
import { ONBOARDING_PLACEHOLDERS, type Client } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/datetime';
import { useOnboardingDocument } from '../api';
import { missingFieldLabel } from '../onboarding-logic';
import { OnboardingDeck } from './onboarding-deck';

interface OnboardingPreviewSheetProps {
  client: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Ajustar textos deste cliente" (only with `office`). */
  onAdjust?: () => void;
  /** "Enviar onboarding" (only with `clients`). */
  onSend?: () => void;
}

/** "Ver onboarding": the current document as the client sees it (the preview records no access). */
export function OnboardingPreviewSheet({
  client,
  open,
  onOpenChange,
  onAdjust,
  onSend,
}: OnboardingPreviewSheetProps) {
  const doc = useOnboardingDocument(client.id, open);
  const missing = doc.data?.missing ?? [];
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      width="xl"
      title="Onboarding"
      description={
        doc.data
          ? `${client.tradeName || client.name} · versão de ${formatDateTime(doc.data.updatedAt)}`
          : client.tradeName || client.name
      }
      headerExtra={
        <div className="flex flex-col gap-3">
          {missing.length ? (
            <div
              role="note"
              className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-fg"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p>
                Sem dado, aparecem como "—":{' '}
                {missing.map((m) => missingFieldLabel(m, ONBOARDING_PLACEHOLDERS)).join(', ')}.
              </p>
            </div>
          ) : null}
          {onAdjust || onSend ? (
            <div className="flex flex-wrap gap-2">
              {onAdjust ? (
                <Button variant="outline" size="sm" onClick={onAdjust}>
                  <PenLine /> Ajustar textos deste cliente
                </Button>
              ) : null}
              {onSend ? (
                <Button size="sm" onClick={onSend}>
                  <Send /> Enviar onboarding
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      }
    >
      {doc.isError ? (
        <ErrorState error={doc.error} onRetry={() => doc.refetch()} />
      ) : !doc.data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="aspect-video w-full rounded-2xl" />
          <Skeleton className="aspect-video w-full rounded-2xl" />
        </div>
      ) : (
        <OnboardingDeck
          doc={doc.data}
          confirm={
            <p className="ob-ct" style={{ marginTop: 40 }}>
              <b>Prévia:</b> no link enviado, o cliente informa nome e CPF aqui para confirmar a
              leitura.
            </p>
          }
        />
      )}
    </Sheet>
  );
}
