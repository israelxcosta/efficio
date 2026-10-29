import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Copy, Mail, Phone, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { formatCNPJ, formatDateBR, formatPhone, TAX_REGIME_LABELS, type Client, type ClientResponsiblesResponse, type TaskOptionsResponse } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ClientProfile } from '@/features/clients/client-profile';
import { copyText } from '@/lib/clipboard';
import { pluralize } from '@/lib/utils';
import { useTasks } from '../api';
import { tasksHref } from '../url-state';
import { ClientResponsibleCell, responsibleOf } from './client-responsible';
import { TaskRow } from './task-row';

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Copiar ${label}`}
      onClick={async () => {
        if (await copyText(value)) toast.success('Copiado.');
        else toast.error('Não foi possível copiar.');
      }}
    >
      <Copy />
    </Button>
  );
}

function ContactLine({ icon, href, text, label }: { icon: ReactNode; href: string; text: string; label: string }) {
  return (
    <li className="flex min-h-10 items-center gap-3">
      <span className="text-muted [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <a href={href} className="min-w-0 flex-1 truncate text-sm text-brand-text hover:underline">
        {text}
      </a>
      <CopyButton value={text} label={label} />
    </li>
  );
}

interface TaskClientSheetProps {
  client: Client | null;
  loading: boolean;
  notFound: boolean;
  error: unknown;
  onClose: () => void;
  grid: ClientResponsiblesResponse | undefined;
  options: TaskOptionsResponse | undefined;
}

/**
 * Read-only client sheet of the Gestão (spec §13.2): contacts, the responsible of each department,
 * the open tasks and the registration data, never the fees. Editing stays in the finances.
 */
export function TaskClientSheet({ client: c, loading, notFound, error, onClose, grid, options }: TaskClientSheetProps) {
  const open = Boolean(c) || loading || notFound || Boolean(error);
  const isAdmin = options?.me.isAdmin ?? false;
  const tasks = useTasks(
    { scope: 'all', clientId: c?.id, situation: 'open', page: 1, pageSize: 5, occurrences: 'false' },
    { enabled: Boolean(c) },
  );
  const summary = tasks.data?.summary;
  const departments = grid?.departments ?? [];

  const description = c
    ? `${TAX_REGIME_LABELS[c.taxRegime]} · ${formatCNPJ(c.document)} · ${c.status === 'active' ? 'Ativo' : `Inativo${c.inactivation ? ` desde ${formatDateBR(c.inactivation.date)}` : ''}`}`
    : undefined;
  const hasContacts = c && (c.email || c.phone || c.responsibleName || c.responsibleEmail || c.responsiblePhone);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={c ? c.tradeName || c.name : 'Cliente'}
      description={description}
      width="lg"
      footer={
        <>
          {isAdmin && c ? (
            <Button variant="outline" asChild>
              <Link to={`/clientes?editar=${c.id}`}>
                <Wallet /> Editar no financeiro
              </Link>
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </>
      }
    >
      {notFound ? (
        <EmptyState title="Cliente não encontrado" description="Ele pode ter sido excluído." />
      ) : error && !c ? (
        <ErrorState error={error} />
      ) : !c ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="flex flex-col gap-7">
          <section className="flex flex-col gap-2" aria-labelledby="client-contacts">
            <h3 id="client-contacts" className="text-body-sm font-semibold text-fg">
              Contatos
            </h3>
            {hasContacts ? (
              <>
                <ul className="flex flex-col">
                  {c.email ? <ContactLine icon={<Mail />} href={`mailto:${c.email}`} text={c.email} label="e-mail" /> : null}
                  {c.phone ? <ContactLine icon={<Phone />} href={`tel:+55${c.phone}`} text={formatPhone(c.phone)} label="telefone" /> : null}
                </ul>
                {c.responsibleName || c.responsibleEmail || c.responsiblePhone ? (
                  <div className="mt-1 rounded-lg bg-surface-muted px-3 py-2">
                    <p className="text-caption text-muted">Responsável na empresa</p>
                    <p className="text-sm font-medium text-fg">{c.responsibleName ?? '—'}</p>
                    <ul className="flex flex-col">
                      {c.responsibleEmail ? (
                        <ContactLine icon={<Mail />} href={`mailto:${c.responsibleEmail}`} text={c.responsibleEmail} label="e-mail do responsável" />
                      ) : null}
                      {c.responsiblePhone ? (
                        <ContactLine
                          icon={<Phone />}
                          href={`tel:+55${c.responsiblePhone}`}
                          text={formatPhone(c.responsiblePhone)}
                          label="telefone do responsável"
                        />
                      ) : null}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-body-sm text-subtle">
                Nenhum contato cadastrado.
                {isAdmin ? (
                  <>
                    {' '}
                    <Link to={`/clientes?editar=${c.id}`} className="font-medium text-brand-text hover:underline">
                      Cadastrar no financeiro
                    </Link>
                  </>
                ) : null}
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2" aria-labelledby="client-responsibles">
            <h3 id="client-responsibles" className="text-body-sm font-semibold text-fg">
              Responsáveis por departamento
            </h3>
            {departments.length === 0 ? (
              <p className="text-body-sm text-subtle">Nenhum departamento cadastrado.</p>
            ) : (
              <ul className="flex flex-col">
                {departments.map((d) => (
                  <li key={d.id} className="flex min-h-10 items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-body-sm text-muted">{d.name}</span>
                    <span className="min-w-0 flex-1">
                      <ClientResponsibleCell
                        full
                        client={{ id: c.id, name: c.tradeName || c.name }}
                        department={d}
                        member={responsibleOf(grid?.items ?? [], c.id, d.id)}
                        editable={isAdmin}
                        members={options?.members ?? []}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-caption text-subtle">Quem cuida deste cliente em cada departamento: a sugestão de responsável ao criar uma tarefa para ele.</p>
          </section>

          <section className="flex flex-col gap-2" aria-labelledby="client-tasks">
            <div className="flex items-center justify-between gap-3">
              <h3 id="client-tasks" className="text-body-sm font-semibold text-fg">
                Tarefas
              </h3>
              <Link to={tasksHref({ scope: 'all', client: c.id })} className="text-caption font-medium text-brand-text hover:underline">
                Ver tarefas do cliente
              </Link>
            </div>
            {summary ? (
              <p className="text-body-sm text-muted">
                {pluralize(summary.open, 'em aberto', 'em aberto')}
                {summary.overdue ? (
                  <>
                    {' · '}
                    <span className="text-danger">{pluralize(summary.overdue, 'atrasada', 'atrasadas')}</span>
                  </>
                ) : null}
              </p>
            ) : null}
            {tasks.isPending ? (
              <SkeletonRows rows={2} />
            ) : tasks.data && tasks.data.items.length ? (
              <div className="-mx-2">
                {tasks.data.items.map((t) => (
                  <TaskRow key={t.id} task={t} today={tasks.data.today} density="compact" />
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-subtle">Nenhuma tarefa em aberto.</p>
            )}
          </section>

          <section className="flex flex-col gap-3" aria-label="Dados cadastrais">
            <h3 className="text-body-sm font-semibold text-fg">Dados cadastrais</h3>
            <ClientProfile client={c} showContacts={false} showNotes={false} />
          </section>
        </div>
      )}
    </Sheet>
  );
}
