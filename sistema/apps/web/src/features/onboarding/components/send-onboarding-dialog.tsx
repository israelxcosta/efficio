import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Building2,
  CircleAlert,
  Copy,
  ExternalLink,
  Mail,
  MessageCircle,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ONBOARDING_LINK_DAYS,
  ONBOARDING_PLACEHOLDERS,
  formatDateBR,
  formatPhone,
  type Client,
  type OnboardingContact,
  type OnboardingLinkChannel,
  type OnboardingLinkCreated,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { HelpTip } from '@/components/ui/help-tip';
import { Field, Input, Textarea } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { formatDateTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { useCreateOnboardingLink, useOnboardingDocument, useOnboardingTemplate } from '../api';
import {
  LINK_PLACEHOLDER,
  defaultLinkMessage,
  fillLinkMessage,
  mailtoUrl,
  missingFieldLabel,
  whatsappUrl,
} from '../onboarding-logic';

/** Phone or e-mail of the client's registry for a recipient and channel (null when not registered). */
export function registryContact(
  client: Client,
  contact: OnboardingContact,
  channel: OnboardingLinkChannel,
): string | null {
  if (channel === 'whatsapp') {
    const phone = contact === 'company' ? client.phone : client.responsiblePhone;
    return phone ? formatPhone(phone) : null;
  }
  return (contact === 'company' ? client.email : client.responsibleEmail) || null;
}

/** Where the created link opens: WhatsApp (`wa.me`) or the e-mail app (`mailto:`), with the message. */
export function openTarget(
  created: OnboardingLinkCreated,
  message: string,
  subject: string,
): string {
  const text = fillLinkMessage(message, created.url);
  return created.channel === 'whatsapp'
    ? whatsappUrl(created.to, text)
    : mailtoUrl(created.to, subject, text);
}

interface SendOnboardingDialogProps {
  client: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "Enviar onboarding": creates a 30-day link and opens WhatsApp or the e-mail with the message. */
export function SendOnboardingDialog({ client, open, onOpenChange }: SendOnboardingDialogProps) {
  const doc = useOnboardingDocument(client.id, open);
  const template = useOnboardingTemplate(open);
  const create = useCreateOnboardingLink(client.id);
  const [contact, setContact] = useState<OnboardingContact>(
    client.responsiblePhone || client.responsibleEmail ? 'responsible' : 'company',
  );
  const [channel, setChannel] = useState<OnboardingLinkChannel>('whatsapp');
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<OnboardingLinkCreated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const display = client.tradeName || client.name;

  useEffect(() => {
    if (!open) {
      setCreated(null);
      setError(null);
      setMessage(null);
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const officeName = doc.data?.office.name ?? 'Efficio Contabilidade';
  const days = template.data?.params.deadlines.linkDays ?? ONBOARDING_LINK_DAYS;
  const text = message ?? defaultLinkMessage(display, officeName, days);
  const destination = registryContact(client, contact, channel);
  const what = channel === 'whatsapp' ? 'o WhatsApp' : 'o e-mail';
  const whose = contact === 'company' ? 'da empresa' : 'do responsável';
  const subject = `Onboarding · ${display} · ${officeName}`;
  const expires = new Date(Date.now() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

  async function send() {
    setError(null);
    // Opened during the click (popup blockers): it receives the WhatsApp address once the link exists.
    const tab = channel === 'whatsapp' ? window.open('about:blank', '_blank') : null;
    try {
      const link = await create.mutateAsync({ channel, contact });
      setCreated(link);
      const target = openTarget(link, text, subject);
      if (tab) {
        tab.opener = null;
        tab.location.href = target;
      } else if (channel === 'email') {
        const a = document.createElement('a');
        a.href = target;
        a.click();
      }
      toast.success('Link de onboarding criado.');
    } catch (e) {
      tab?.close();
      if (e instanceof ApiRequestError && e.status >= 400 && e.status < 500 && e.status !== 403) {
        setError(
          e.status === 422
            ? `Cadastre ${what} ${whose} em "Editar dados" ou escolha outro destinatário.`
            : e.message,
        );
      } else setError(e instanceof Error ? e.message : 'Não foi possível criar o link.');
    }
  }

  if (created) {
    const target = openTarget(created, text, subject);
    return (
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title="Link de onboarding criado"
        description={`Para ${created.recipientName ?? display} · válido até ${formatDateTime(created.expiresAt)}`}
        className="max-w-lg"
        footer={<Button onClick={() => onOpenChange(false)}>Concluir</Button>}
      >
        <div className="flex flex-col gap-4">
          <Field label="Link">
            <div className="flex gap-2">
              <Input
                readOnly
                value={created.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Link do onboarding"
              />
              <Button
                variant="outline"
                onClick={async () => {
                  if (await copyText(created.url)) toast.success('Link copiado.');
                  else toast.error('Não foi possível copiar.');
                }}
              >
                <Copy /> Copiar
              </Button>
            </div>
          </Field>
          <Button variant="outline" asChild className="self-start">
            <a href={target} target="_blank" rel="noopener noreferrer">
              <ExternalLink />{' '}
              {created.channel === 'whatsapp'
                ? 'Abrir o WhatsApp de novo'
                : 'Abrir o e-mail de novo'}
            </a>
          </Button>
        </div>
      </Modal>
    );
  }

  const option = (value: OnboardingContact, label: string, icon: React.ReactNode) => ({
    value,
    label,
    icon,
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Enviar onboarding"
      description={display}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void send()} loading={create.isPending} disabled={!destination}>
            {channel === 'whatsapp' ? <MessageCircle /> : <Mail />}
            {channel === 'whatsapp' ? 'Gerar link e abrir WhatsApp' : 'Gerar link e abrir e-mail'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Destinatário">
            <SegmentedControl<OnboardingContact>
              ariaLabel="Destinatário"
              fullWidth
              value={contact}
              onChange={(v) => {
                setContact(v);
                setError(null);
              }}
              options={[
                option('company', 'Empresa', <Building2 />),
                option('responsible', 'Responsável', <UserRound />),
              ]}
            />
          </Field>
          <Field label="Canal">
            <SegmentedControl<OnboardingLinkChannel>
              ariaLabel="Canal"
              fullWidth
              value={channel}
              onChange={(v) => {
                setChannel(v);
                setError(null);
              }}
              options={[
                { value: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle /> },
                { value: 'email', label: 'E-mail', icon: <Mail /> },
              ]}
            />
          </Field>
        </div>
        <p
          className={cn(
            'rounded-lg px-3 py-2.5 text-sm',
            destination ? 'bg-surface-muted text-fg' : 'bg-warning-soft text-fg',
          )}
        >
          {destination ? (
            <>
              <span className="text-muted">
                {contact === 'responsible' && client.responsibleName
                  ? `${client.responsibleName} · `
                  : ''}
              </span>
              <span className="tabular font-medium">{destination}</span>
            </>
          ) : (
            <span className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              Cadastre {what} {whose} em "Editar dados" para enviar por aqui.
            </span>
          )}
        </p>
        <Field
          label={
            <span className="inline-flex items-center gap-1">
              Mensagem
              <HelpTip label="Sobre a mensagem">
                {LINK_PLACEHOLDER} é trocado pelo endereço do link. Sem ele, o link vai no fim da
                mensagem.
              </HelpTip>
            </span>
          }
        >
          {doc.isPending ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <Textarea
              rows={5}
              value={text}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1500}
            />
          )}
        </Field>
        <p className="text-sm text-muted">
          Validade: {days} {days === 1 ? 'dia' : 'dias'} (até {formatDateBR(expires)})
          <HelpTip label="Sobre a validade" className="ml-1 align-middle">
            Reenviar gera um link novo; os anteriores continuam valendo até expirar ou ser revogados
            no cartão Onboarding.
          </HelpTip>
        </p>
        {doc.data?.missing.length ? (
          <div
            role="note"
            className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-fg"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p>
              Aparecem como "—" no documento:{' '}
              {doc.data.missing
                .map((m) => missingFieldLabel(m, ONBOARDING_PLACEHOLDERS))
                .join(', ')}
              .{' '}
              <Link
                to="/configuracoes?aba=onboarding"
                className="font-semibold text-brand-text hover:underline"
              >
                Completar
              </Link>
            </p>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
