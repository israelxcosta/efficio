import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Copy, Ellipsis, Eye, EyeOff, ListPlus, Scale } from 'lucide-react';
import { toast } from 'sonner';
import {
  CLIENT_CREDENTIAL_FIELD_LABELS,
  SIMPLES_ACCESS_REGIMES,
  formatDateBR,
  type Client,
  type ClientCredentialField,
  type ClientCredentialReveal,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/features/auth/permissions';
import { deadlineClass, deadlineLabel, documentIcon, documentsSummary, renewalDueDate, renewalTitle, sortByDeadline } from '@/features/deadlines/deadline-logic';
import { NeutralIcon } from '@/features/tasks/components/neutral-icon';
import { useTaskSheetLinks } from '@/features/tasks/task-links';
import { api, ApiRequestError } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { ProfileItem } from './client-profile';

// Read-only fiscal data, accesses, documents and unions of a client (spec §13.8.2, §13.8.3): the Gestão
// client sheet and the finance "Consultar" dialog.

/** Seconds a revealed access stays on screen. */
export const REVEAL_SECONDS = 30;

/** Names of the accesses in the reveal button: "Mostrar o código de acesso do Simples de …". */
const REVEAL_NOUN: Record<ClientCredentialField, string> = {
  simplesAccessCode: 'o código de acesso do Simples',
  accountantPassword: 'a senha do contador',
};

const masked = (
  <span className="tabular tracking-widest text-muted" aria-label="Valor oculto">
    ••••••••
  </span>
);

/**
 * An encrypted access (spec §13.8.3). Revealing is a POST (never cached, audited by the API); the value
 * lives only in this component's state, never in the query cache, the URL, the storage, the title or a
 * log. It goes back to the mask after 30 s, on "Ocultar", when the tab is hidden and when the sheet
 * closes or shows another client (the component unmounts or `clientId` changes).
 */
export function CredentialField({ clientId, clientName, field, stored }: { clientId: string; clientName: string; field: ClientCredentialField; stored: boolean }) {
  const { can } = usePermissions();
  const allowed = can('clientCredentials');
  const [value, setValue] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [left, setLeft] = useState(REVEAL_SECONDS);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const request = useRef(0);

  const hide = useCallback(() => {
    request.current++;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setValue(null);
    setPending(false);
  }, []);

  // Another client (or field), or unmounting: the value goes away.
  useEffect(() => hide, [clientId, field, hide]);
  useEffect(() => {
    const onVisibility = () => document.visibilityState === 'hidden' && hide();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [hide]);

  async function reveal() {
    const ticket = ++request.current;
    setPending(true);
    try {
      const res = await api<ClientCredentialReveal>(`/clients/${clientId}/credentials/reveal`, { method: 'POST', body: { field } });
      if (ticket !== request.current) return;
      setValue(res.value);
      setLeft(REVEAL_SECONDS);
      const started = Date.now();
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => {
        const remaining = REVEAL_SECONDS - Math.floor((Date.now() - started) / 1000);
        if (remaining <= 0) hide();
        else setLeft(remaining);
      }, 1000);
    } catch (error) {
      if (ticket !== request.current) return;
      if (error instanceof ApiRequestError && error.status === 403) toast.error('Você não tem permissão para ver este acesso.', { id: 'forbidden' });
      else toastError(error);
    } finally {
      if (ticket === request.current) setPending(false);
    }
  }

  if (!stored) return <span className="text-subtle">Não cadastrado</span>;
  if (!allowed) {
    return (
      <span className="flex flex-col">
        {masked}
        <span className="text-caption text-muted">Restrito: peça a um administrador</span>
      </span>
    );
  }
  if (value === null) {
    return (
      <span className="flex flex-wrap items-center gap-3">
        {masked}
        <Button variant="outline" size="sm" loading={pending} onClick={() => void reveal()} aria-label={`Mostrar ${REVEAL_NOUN[field]} de ${clientName}`}>
          {pending ? null : <Eye />} Mostrar
        </Button>
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* `translate="no"`: the browser's page translation would send the value to an outside service. */}
        <span className="notranslate w-full font-mono text-sm break-all text-fg sm:w-auto" data-sensitive translate="no">
          {value}
        </span>
        <span className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Copiar ${CLIENT_CREDENTIAL_FIELD_LABELS[field].toLowerCase()}`}
            onClick={async () => {
              if (await copyText(value)) toast.success('Copiado.');
              else toast.error('Não foi possível copiar.');
            }}
          >
            <Copy />
          </Button>
          <Button variant="ghost" size="sm" onClick={hide}>
            <EyeOff /> Ocultar
          </Button>
        </span>
      </span>
      <span className="text-caption text-subtle" aria-live="off">
        Some em {left} s
      </span>
    </span>
  );
}

/** "Inscrições e acessos" as a definition list (spec §13.8.3). */
export function ClientRegistrations({ client: c }: { client: Client }) {
  const { can } = usePermissions();
  const simples = (SIMPLES_ACCESS_REGIMES as readonly string[]).includes(c.taxRegime);
  const anyStored = c.credentials.accountantPassword || (simples && c.credentials.simplesAccessCode);
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`registrations-${c.id}`}>
      <h3 id={`registrations-${c.id}`} className="text-body-sm font-semibold text-fg">
        Inscrições e acessos
      </h3>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <ProfileItem label="Inscrição estadual">{c.stateRegistrationExempt ? 'Isenta' : c.stateRegistration}</ProfileItem>
        <ProfileItem label="Inscrição municipal">{c.municipalRegistration}</ProfileItem>
        {simples ? (
          <div>
            <dt className="text-xs font-medium text-muted">{CLIENT_CREDENTIAL_FIELD_LABELS.simplesAccessCode}</dt>
            <dd className="mt-0.5 text-sm">
              <CredentialField clientId={c.id} clientName={c.tradeName || c.name} field="simplesAccessCode" stored={c.credentials.simplesAccessCode} />
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-medium text-muted">{CLIENT_CREDENTIAL_FIELD_LABELS.accountantPassword}</dt>
          <dd className="mt-0.5 text-sm">
            <CredentialField clientId={c.id} clientName={c.tradeName || c.name} field="accountantPassword" stored={c.credentials.accountantPassword} />
          </dd>
        </div>
      </dl>
      {can('clientCredentials') && anyStored ? (
        <p className="text-caption text-subtle">Os acessos ficam cifrados. Cada visualização fica registrada com o nome de quem viu.</p>
      ) : null}
    </section>
  );
}

/** "Documentos" of a client (spec §13.8.3): most urgent first, with "Criar tarefa de renovação". */
export function ClientDocumentsList({ client: c, today, id }: { client: Client; today: string; id?: string }) {
  const { can } = usePermissions();
  const { newTask } = useTaskSheetLinks();
  const docs = sortByDeadline(c.documents);
  const summary = documentsSummary(docs);
  return (
    <section className="flex scroll-mt-4 flex-col gap-2" aria-labelledby={`documents-${c.id}`} id={id}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 id={`documents-${c.id}`} className="text-body-sm font-semibold text-fg">
          Documentos{docs.length ? <span className="tabular font-medium text-muted"> {docs.length}</span> : null}
        </h3>
        {summary.length ? (
          <p className="text-body-sm">
            {summary.map((p, i) => (
              <span key={p.text}>
                {i ? <span className="text-muted"> · </span> : null}
                <span className={p.tone === 'danger' ? 'text-danger' : 'text-warning'}>{p.text}</span>
              </span>
            ))}
          </p>
        ) : null}
      </div>
      {docs.length === 0 ? (
        <p className="text-body-sm text-subtle">
          Nenhum documento cadastrado.
          {can('finance') ? (
            <>
              {' '}
              <Link to={`/clientes?editar=${c.id}`} className="font-medium text-brand-text hover:underline">
                Cadastrar no financeiro
              </Link>
            </>
          ) : null}
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {docs.map((d) => (
            <li key={d.id} className="group flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-muted">
              <NeutralIcon icon={documentIcon(d.kind)} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{d.name.replace(/\s*\([^)]*\)$/, '')}</span>
                {d.note ? <span className="block truncate text-xs text-muted">{d.note}</span> : null}
              </span>
              <span className="flex shrink-0 flex-col items-end text-right">
                <span className="tabular text-[13px] font-medium text-fg">{d.expiresAt ? formatDateBR(d.expiresAt) : '—'}</span>
                <span className={cn('text-xs', deadlineClass(d.deadline))}>{deadlineLabel(d.deadline, 'Sem vencimento')}</span>
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-70 transition hover:bg-bg-subtle hover:text-fg group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                    aria-label={`Ações de ${d.name}`}
                  >
                    <Ellipsis className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    icon={<ListPlus />}
                    onSelect={() => newTask({ title: renewalTitle(d.name), clientId: c.id, dueDate: renewalDueDate(d.expiresAt, today) })}
                  >
                    Criar tarefa de renovação
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "Sindicatos" of a client (spec §13.8.3). */
export function ClientUnionsList({ client: c }: { client: Client }) {
  const { can } = usePermissions();
  return (
    <section className="flex flex-col gap-2" aria-labelledby={`unions-${c.id}`}>
      <h3 id={`unions-${c.id}`} className="text-body-sm font-semibold text-fg">
        Sindicatos
      </h3>
      {c.unions.length === 0 ? (
        <p className="text-body-sm text-subtle">
          Nenhum sindicato vinculado.
          {can('registry') ? (
            <>
              {' '}
              <Link to="/tarefas/cadastros?aba=sindicatos" className="font-medium text-brand-text hover:underline">
                Vincular em Sindicatos
              </Link>
            </>
          ) : null}
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {c.unions.map((u) => (
            <li key={u.id}>
              <Link to={`/tarefas/cadastros?aba=sindicatos&sindicato=${u.id}`} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-muted">
                <NeutralIcon icon={Scale} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm', u.active ? 'text-fg' : 'text-muted')}>
                    {[u.name, u.category].filter(Boolean).join(' · ')}
                    {!u.active ? ' · inativo' : ''}
                  </span>
                  <span className={cn('block truncate text-xs', u.tracked ? deadlineClass(u.tracked) : 'text-subtle')}>
                    {u.tracked
                      ? `Convenção ${u.tracked.label} ${u.tracked.bucket === 'overdue' ? 'venceu' : 'vence'} em ${formatDateBR(u.tracked.dueDate)}`
                      : 'Sem data-base'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
