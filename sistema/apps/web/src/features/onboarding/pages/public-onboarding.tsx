import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { Download, Hourglass, LinkIcon, List, RotateCw } from 'lucide-react';
import { onboardingTokenSchema } from '@effinance/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ApiRequestError } from '@/lib/api';
import { useConfirmOnboarding, usePublicOnboarding } from '../api';
import { ConfirmReadingForm, ConfirmedReading } from '../components/confirm-reading';
import { OnboardingDeck, scrollToSlide } from '../components/onboarding-deck';
import '../onboarding-deck.css';

/** Print: one 1920×1080 slide per page, no margins (overrides the app's A4 print rules while mounted). */
const PRINT_CSS =
  '@media print { @page { size: 1920px 1080px; margin: 0; } html { zoom: 1 !important; } [data-sonner-toaster] { display: none !important; } }';

const INVALID = 'Link inválido ou expirado. Peça um novo link ao escritório.';

function Head({ title }: { title: string }) {
  return (
    <>
      <title>{title}</title>
      <meta name="robots" content="noindex, nofollow" />
    </>
  );
}

function StatePanel({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <main className="ob ob-state">
      <Head title={`${title} · Onboarding`} />
      <div>
        <span className="ob-state-icon" aria-hidden="true">
          {icon}
        </span>
        <h1>{title}</h1>
        <p>{children}</p>
        {action}
      </div>
    </main>
  );
}

/**
 * Public onboarding page (`/o/:token`, `#/o/<token>` in the demo): the client's document, without login
 * and without anything of the signed-in app. Each load records an access on the server.
 */
export default function PublicOnboardingPage() {
  const { token = '' } = useParams();
  const valid = onboardingTokenSchema.safeParse(token).success;
  const query = usePublicOnboarding(token, valid);
  const confirm = useConfirmOnboarding(token);

  if (!valid) {
    return (
      <StatePanel icon={<LinkIcon />} title="Link inválido">
        {INVALID}
      </StatePanel>
    );
  }
  if (query.isError) {
    const status = query.error instanceof ApiRequestError ? query.error.status : 0;
    if (status === 404) {
      return (
        <StatePanel icon={<LinkIcon />} title="Não foi possível abrir o link">
          {query.error.message || INVALID}
        </StatePanel>
      );
    }
    return (
      <StatePanel
        icon={<Hourglass />}
        title={status === 429 ? 'Muitas tentativas' : 'Não foi possível abrir'}
        action={
          <button type="button" className="ob-tool ob-primary" onClick={() => void query.refetch()}>
            <RotateCw aria-hidden="true" /> Tentar novamente
          </button>
        }
      >
        {status === 429
          ? 'Aguarde um minuto e tente de novo.'
          : 'Verifique sua conexão e tente de novo.'}
      </StatePanel>
    );
  }
  if (!query.data) {
    return (
      <div className="ob ob-page" aria-busy="true" aria-label="Carregando o onboarding">
        <Head title="Onboarding do cliente" />
        <div className="ob-main">
          <div className="ob-loading" />
        </div>
      </div>
    );
  }

  const { document: doc, confirmedAt } = query.data;
  return (
    <div className="ob ob-page">
      <Head title={doc.title} />
      <style>{PRINT_CSS}</style>
      <header className="ob-bar">
        <p className="ob-bar-title">
          <b>{doc.client.tradeName || doc.client.name}</b>
          <span>{doc.office.name} · Onboarding do cliente</span>
        </p>
        <div className="ob-bar-actions">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="ob-tool">
                <List aria-hidden="true" /> Sumário
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[70dvh] overflow-y-auto">
              {doc.slides.map((s) => (
                <DropdownMenuItem key={s.key} onSelect={() => scrollToSlide(s.key)}>
                  <span className="tabular w-6 text-subtle">
                    {String(s.number).padStart(2, '0')}
                  </span>
                  {s.key === 'cover' ? 'Capa' : s.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" className="ob-tool ob-primary" onClick={() => window.print()}>
            <Download aria-hidden="true" /> Baixar PDF
          </button>
        </div>
      </header>
      <main className="ob-main">
        <OnboardingDeck
          doc={doc}
          confirm={
            confirmedAt ? (
              <ConfirmedReading at={confirmedAt} />
            ) : (
              <ConfirmReadingForm
                onConfirm={(input) => confirm.mutateAsync(input)}
                pending={confirm.isPending}
                error={confirm.error}
              />
            )
          }
        />
      </main>
    </div>
  );
}
