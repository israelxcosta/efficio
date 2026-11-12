import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { BILLING_ENABLED, PLANS, TRIAL_DAYS, workspaceInputSchema, type WorkspaceSummary } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Field, Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { toastError } from '@/lib/notify';
import { useAuth } from '@/features/auth/auth-context';
import { ROLE_LABELS } from '@/features/auth/roles';
import { useCreateWorkspace } from './api';
import { WORKSPACE_KIND_ICONS } from './kind-icon';

/** Switches the active workspace: the server re-issues the session, cached data is dropped. */
export function useSwitchWorkspace() {
  const { workspace, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState<string | null>(null);
  async function switchTo(target: WorkspaceSummary, { to = '/', silent = false }: { to?: string; silent?: boolean } = {}) {
    if (target.id === workspace?.id && !silent) return;
    setSwitching(target.id);
    try {
      await switchWorkspace(target.id);
      navigate(to);
      if (!silent) toast.success(`Você está em ${target.name}`);
    } catch (error) {
      toastError(error);
    } finally {
      setSwitching(null);
    }
  }
  return { switchTo, switching };
}

/** " · somente leitura" beside a workspace whose subscription lapsed; nothing while paid subscriptions are off. */
export function workspaceAccessNote(ws: Pick<WorkspaceSummary, 'subscription'>): string {
  return BILLING_ENABLED && !ws.subscription.canWrite ? ' · somente leitura' : '';
}

/** The trial and the plan of a new company, in its sheet; null while paid subscriptions are off (`BILLING_ENABLED`). */
export function newWorkspaceTrialNote(): { title: string; detail: string } | null {
  if (!BILLING_ENABLED) return null;
  const plan = PLANS.find((p) => p.workspaceKinds.includes('business'));
  return {
    title: `${TRIAL_DAYS} dias grátis, sem cartão`,
    detail: `Contas a pagar e a receber da empresa com a sua equipe.${plan ? ` Depois, plano ${plan.name} com até ${plan.maxMembers} membros.` : ''}`,
  };
}

/** Toast after creating a company: the trial only while paid subscriptions are on. */
export function newWorkspaceCreatedMessage(name: string): string {
  return BILLING_ENABLED ? `${name} criada com ${TRIAL_DAYS} dias grátis. Convide quem vai participar.` : `${name} criada. Convide quem vai participar.`;
}

function WorkspaceRow({ ws, active }: { ws: WorkspaceSummary; active: boolean }) {
  const Icon = WORKSPACE_KIND_ICONS[ws.kind];
  return (
    <>
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-[10px] [&_svg]:size-4',
          active ? 'bg-primary text-primary-fg' : 'bg-bg-subtle text-muted',
        )}
      >
        <Icon />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-fg">{ws.name}</span>
        <span className="block text-[11px] font-medium text-muted">
          {ROLE_LABELS[ws.role]}
          {workspaceAccessNote(ws)}
        </span>
      </span>
      {active ? <Check className="size-4 text-primary dark:text-fg" aria-label="Espaço atual" /> : null}
    </>
  );
}

/** Workspace list for the avatar dropdown (desktop). */
export function WorkspaceMenuItems({ onCreate }: { onCreate: () => void }) {
  const { workspace, workspaces } = useAuth();
  const { switchTo } = useSwitchWorkspace();
  return (
    <>
      <DropdownMenuLabel>Empresas</DropdownMenuLabel>
      <div className="scrollbar-thin max-h-64 overflow-y-auto">
        {workspaces.map((ws) => (
          <DropdownMenuItem key={ws.id} className="py-1.5" onSelect={() => void switchTo(ws)} aria-current={ws.id === workspace?.id ? 'true' : undefined}>
            <WorkspaceRow ws={ws} active={ws.id === workspace?.id} />
          </DropdownMenuItem>
        ))}
      </div>
      <DropdownMenuItem icon={<Plus />} onSelect={onCreate}>
        Nova empresa
      </DropdownMenuItem>
    </>
  );
}

/** Workspace list for the mobile "Mais" sheet. */
export function WorkspaceList({ onCreate, onSwitched }: { onCreate: () => void; onSwitched?: () => void }) {
  const { workspace, workspaces } = useAuth();
  const { switchTo, switching } = useSwitchWorkspace();
  return (
    <div className="flex flex-col gap-1" role="list" aria-label="Empresas">
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          type="button"
          role="listitem"
          aria-current={ws.id === workspace?.id ? 'true' : undefined}
          disabled={switching !== null}
          className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-bg-subtle disabled:opacity-60"
          onClick={async () => {
            await switchTo(ws);
            onSwitched?.();
          }}
        >
          <WorkspaceRow ws={ws} active={ws.id === workspace?.id} />
        </button>
      ))}
      <button type="button" onClick={onCreate} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold text-brand-text hover:bg-bg-subtle">
        <Plus className="size-5" /> Nova empresa
      </button>
    </div>
  );
}

type WorkspaceForm = z.input<typeof workspaceInputSchema>;

/** "Nova empresa": a business workspace with its own data and members (and subscription, with billing on). */
export function WorkspaceSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateWorkspace();
  const { switchTo } = useSwitchWorkspace();
  const form = useForm<WorkspaceForm, unknown, z.output<typeof workspaceInputSchema>>({
    resolver: zodResolver(workspaceInputSchema),
    defaultValues: { name: '', kind: 'business' },
  });
  const trial = newWorkspaceTrialNote();

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const ws = await create.mutateAsync({ ...values, kind: 'business' });
      onOpenChange(false);
      form.reset({ name: '', kind: 'business' });
      await switchTo(ws, { to: '/configuracoes?aba=membros', silent: true });
      toast.success(newWorkspaceCreatedMessage(ws.name));
    } catch (error) {
      toastError(error);
    }
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Nova empresa"
      description={BILLING_ENABLED ? 'Uma empresa separada, com dados, membros e assinatura próprios.' : 'Uma empresa separada, com dados e membros próprios.'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="workspace-form" loading={form.formState.isSubmitting}>
            Criar empresa
          </Button>
        </>
      }
    >
      <form id="workspace-form" onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field label="Nome da empresa" error={form.formState.errors.name?.message}>
          <Input placeholder="Ex.: Costa Contabilidade Ltda." {...form.register('name')} />
        </Field>
        {trial ? (
          <div className="rounded-xl border border-border bg-surface-muted px-4 py-3.5 text-[13px]">
            <p className="font-semibold text-fg">{trial.title}</p>
            <p className="mt-1 text-muted">{trial.detail}</p>
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
