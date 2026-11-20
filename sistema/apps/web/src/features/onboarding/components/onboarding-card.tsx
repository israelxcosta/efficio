import { useState } from 'react';
import {
  Eye,
  Laptop,
  Mail,
  MessageCircle,
  Smartphone,
  Tablet,
  MonitorSmartphone,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ONBOARDING_LINK_CHANNEL_LABELS,
  type OnboardingAccessView,
  type OnboardingLinkView,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/misc';
import { SkeletonRows } from '@/components/ui/skeleton';
import { WriteGate } from '@/features/auth/permissions';
import { ProfileItem } from '@/features/clients/client-profile';
import { formatDateTime } from '@/lib/datetime';
import { toastError } from '@/lib/notify';
import { useOnboardingHistory, useRevokeOnboardingLink } from '../api';
import {
  DEVICE_LABELS,
  LINK_STATUS_LABELS,
  ONBOARDING_STATUS_LABELS,
  ONBOARDING_STATUS_TONES,
  accessDescription,
  onboardingStatus,
} from '../onboarding-logic';

const DEVICE_ICONS: Record<OnboardingAccessView['device'], React.ReactNode> = {
  mobile: <Smartphone />,
  tablet: <Tablet />,
  desktop: <Laptop />,
  unknown: <MonitorSmartphone />,
};
const LINK_TONES = { active: 'success', expired: 'neutral', revoked: 'danger' } as const;
const ACCESSES_SHOWN = 6;

interface OnboardingCardProps {
  clientId: string;
  onView: () => void;
  onSend: () => void;
}

/** The client's onboarding on its page: status, sending, accesses, confirmation and links. */
export function OnboardingCard({ clientId, onView, onSend }: OnboardingCardProps) {
  const history = useOnboardingHistory(clientId);
  const revoke = useRevokeOnboardingLink(clientId);
  const [revoking, setRevoking] = useState<OnboardingLinkView | null>(null);
  const [allAccesses, setAllAccesses] = useState(false);
  const h = history.data;
  const status = h ? onboardingStatus(h) : null;
  const latest = h?.links[0] ?? null;

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            Onboarding
            {status ? (
              <Badge tone={ONBOARDING_STATUS_TONES[status]} size="md">
                {ONBOARDING_STATUS_LABELS[status]}
              </Badge>
            ) : null}
          </span>
        }
        info="Documento com as obrigações, prazos e orientações do cliente. O link vale 30 dias; cada abertura fica registrada com data, hora e aparelho."
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onView}>
              <Eye /> Ver
            </Button>
            <WriteGate scope="tasks" permission="clients">
              <Button size="sm" onClick={onSend}>
                <Send /> Enviar
              </Button>
            </WriteGate>
          </div>
        }
      />
      {h?.paramsSaved === false ? (
        <p role="status" className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-body-sm text-fg">
          Os Parâmetros do onboarding (e-mails, prazos e contato do escritório) ainda não foram salvos em Configurações: a prévia
          mostra os valores de fábrica e o envio fica bloqueado até salvá-los.
        </p>
      ) : null}
      {history.isPending ? (
        <SkeletonRows rows={3} />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => history.refetch()} />
      ) : !latest ? (
        <p className="text-body-sm text-subtle">Ainda não enviado.</p>
      ) : (
        <>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
            <ProfileItem label="Último envio">
              <span className="tabular">{formatDateTime(latest.sentAt)}</span>
              <span className="block text-xs text-muted">por {latest.sentByName}</span>
            </ProfileItem>
            <ProfileItem label="Para">
              {latest.recipientName ?? '—'}
              <span className="block text-xs text-muted">
                {ONBOARDING_LINK_CHANNEL_LABELS[latest.channel]} ·{' '}
                <span className="tabular">{latest.to}</span>
              </span>
            </ProfileItem>
            <ProfileItem label="Acessos">
              <span className="tabular font-semibold">{h!.accesses.count}</span>
              {h!.accesses.firstAt ? (
                <span className="block text-xs text-muted">
                  primeiro {formatDateTime(h!.accesses.firstAt)}
                  {h!.accesses.lastAt && h!.accesses.lastAt !== h!.accesses.firstAt ? (
                    <>
                      <br />
                      último {formatDateTime(h!.accesses.lastAt)}
                    </>
                  ) : null}
                </span>
              ) : null}
            </ProfileItem>
            <ProfileItem label="Leitura confirmada">
              {h!.confirmation ? (
                <>
                  <span className="font-medium text-success">{h!.confirmation.name}</span>
                  <span className="block text-xs text-muted">
                    {formatDateTime(h!.confirmation.at)} · CPF{' '}
                    <span className="tabular">{h!.confirmation.cpf}</span>
                  </span>
                </>
              ) : (
                <span className="text-muted">Ainda não</span>
              )}
            </ProfileItem>
          </dl>

          <div className="grid gap-5 border-t border-border pt-4 lg:grid-cols-2">
            <section aria-label="Links enviados">
              <p className="text-xs font-medium text-muted">Links</p>
              <ul className="mt-1 flex flex-col">
                {h!.links.map((link) => (
                  <li
                    key={link.id}
                    className="flex min-h-11 items-center gap-3 border-b border-border py-2 last:border-b-0"
                  >
                    <span className="text-muted [&_svg]:size-4" aria-hidden>
                      {link.channel === 'whatsapp' ? <MessageCircle /> : <Mail />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">
                        {link.recipientName ?? link.to}{' '}
                        <span className="tabular text-muted">· {link.to}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {formatDateTime(link.sentAt)} · {link.accessCount}{' '}
                        {link.accessCount === 1 ? 'acesso' : 'acessos'}
                        {link.status === 'active'
                          ? ` · vale até ${formatDateTime(link.expiresAt)}`
                          : ''}
                        {link.revokedAt ? ` · revogado por ${link.revokedByName ?? '—'}` : ''}
                      </span>
                    </span>
                    <Badge tone={LINK_TONES[link.status]}>{LINK_STATUS_LABELS[link.status]}</Badge>
                    {link.status === 'active' ? (
                      <WriteGate scope="tasks" permission="clients">
                        <Button variant="ghost" size="sm" onClick={() => setRevoking(link)}>
                          Revogar
                        </Button>
                      </WriteGate>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Acessos ao link">
              <p className="text-xs font-medium text-muted">Acessos</p>
              {h!.accesses.items.length === 0 ? (
                <p className="mt-2 text-body-sm text-subtle">Nenhum acesso ainda.</p>
              ) : (
                <ul className="mt-1 flex flex-col">
                  {(allAccesses
                    ? h!.accesses.items
                    : h!.accesses.items.slice(0, ACCESSES_SHOWN)
                  ).map((a) => (
                    <li
                      key={a.id}
                      className="flex min-h-10 items-center gap-3 border-b border-border py-1.5 last:border-b-0"
                    >
                      <span className="text-muted [&_svg]:size-4" aria-hidden>
                        {DEVICE_ICONS[a.device]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">
                        {DEVICE_LABELS[a.device]}{' '}
                        <span className="text-muted">· {accessDescription(a)}</span>
                      </span>
                      <span className="tabular shrink-0 text-xs text-muted">
                        {formatDateTime(a.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {h!.accesses.items.length > ACCESSES_SHOWN ? (
                <button
                  type="button"
                  className="mt-2 text-caption font-medium text-brand-text hover:underline"
                  onClick={() => setAllAccesses((v) => !v)}
                >
                  {allAccesses ? 'Mostrar menos' : `Ver todos (${h!.accesses.items.length})`}
                </button>
              ) : null}
            </section>
          </div>
        </>
      )}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revogar o link?"
        description="Quem tiver o link deixa de abrir o onboarding. O histórico de acessos continua guardado."
        confirmLabel="Revogar"
        loading={revoke.isPending}
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await revoke.mutateAsync(revoking.id);
            toast.success('Link revogado.');
            setRevoking(null);
          } catch (error) {
            toastError(error);
          }
        }}
      />
    </Card>
  );
}
