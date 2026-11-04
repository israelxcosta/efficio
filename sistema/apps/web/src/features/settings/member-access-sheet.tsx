import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  ACTION_PERMISSION_KEYS,
  PAGE_PERMISSION_KEYS,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_LABELS,
  type MemberPermissions,
  type PermissionKey,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/auth-context';
import { usePermissions } from '@/features/auth/permissions';
import { ROLE_HINTS, ROLE_LABELS } from '@/features/auth/roles';
import { useMemberPermissions, useSaveMemberPermissions } from '@/features/workspaces/api';
import { toastError } from '@/lib/notify';
import { isUuid } from '@/lib/safe-url';
import { cn } from '@/lib/utils';
import {
  adjustedKeys,
  canEditMemberAccess,
  defaultHint,
  draftChanged,
  draftEffective,
  resetDraftKey,
  setDraftKey,
  setDraftRole,
  ungrantableKeys,
  type AdjustableRole,
  type PermissionDraft,
} from './member-access';

/** `?pessoa=<id>`: Configurações › Membros and Cadastros › Equipe open the sheet through the URL. */
export function useMemberAccessParam() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  // Without `members` the param is ignored (spec §13.10), and so is anything that is not a person's id.
  const raw = params.get('pessoa');
  const userId = can('members') && isUuid(raw) ? raw : null;
  const set = (id: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id) next.set('pessoa', id);
        else next.delete('pessoa');
        return next;
      },
      { replace: !id },
    );
  return { userId, open: (id: string) => set(id), close: () => set(null) };
}

/**
 * Permissions of one person (spec §13.10): the role segmented control, the action keys and the page
 * keys. Nobody adjusts the owner nor themselves (the API answers `editable: false`).
 */
export function MemberAccessSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const query = useMemberPermissions(userId);
  const data = query.data && query.data.userId === userId ? query.data : null;
  const [draft, setDraft] = useState<PermissionDraft | null>(null);
  const save = useSaveMemberPermissions();
  const { subscriptionActive } = usePermissions();
  const { user } = useAuth();
  const allowed = data ? canEditMemberAccess(data, user?.id) : false;

  // A new person (or a fresh answer after saving) starts a new draft.
  useEffect(() => {
    if (!data || data.role === 'owner') setDraft(null);
    else setDraft({ role: data.role, overrides: { ...data.overrides } });
  }, [data]);

  const firstName = data?.name.split(' ')[0] ?? '';
  const editable = Boolean(allowed && draft);
  const changed = data && draft ? draftChanged(draft, data) : false;
  const adjusted = draft ? adjustedKeys(draft.role, draft.overrides) : [];

  /** The role control: a role whose defaults include keys the editor does not have is refused. */
  function changeRole(role: AdjustableRole) {
    if (!editable || !data || !draft) return;
    const next = setDraftRole(draft, role);
    const blocked = ungrantableKeys(data, next, data.grantable);
    if (blocked.length) {
      toast.error(`Você não pode conceder uma permissão que não tem: ${blocked.map((k) => PERMISSION_LABELS[k]).join(', ')}.`, { id: 'member-access-role' });
      return;
    }
    setDraft(next);
  }

  async function submit() {
    if (!data || !draft || !userId || !editable) return;
    try {
      await save.mutateAsync({
        userId,
        input: { role: draft.role !== data.role ? draft.role : undefined, overrides: draft.overrides },
      });
      toast.success(`Permissões de ${firstName} salvas. Valem a partir da próxima ação ${pronounOf(data)}.`);
      onClose();
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <Sheet
      open={Boolean(userId)}
      onOpenChange={(o) => !o && onClose()}
      title={data ? `Permissões de ${data.name}` : 'Permissões'}
      description="O papel define o padrão; aqui você ajusta só o que for diferente para esta pessoa."
      headerExtra={
        data && draft ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm font-semibold text-fg" id="member-access-role">
              Papel
            </span>
            <SegmentedControl
              size="sm"
              ariaLabel="Papel"
              value={draft.role}
              onChange={changeRole}
              options={[
                { value: 'editor' as const, label: ROLE_LABELS.editor },
                { value: 'viewer' as const, label: ROLE_LABELS.viewer },
              ]}
              className="self-start"
            />
            <span className="text-caption text-muted">{ROLE_HINTS[draft.role]}</span>
          </div>
        ) : null
      }
      footer={
        data && draft && editable ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <Button variant="ghost" disabled={!adjusted.length && !Object.keys(draft.overrides).length} onClick={() => setDraft({ ...draft, overrides: {} })}>
              Voltar ao padrão do papel
            </Button>
            <span className="ml-auto flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={() => void submit()} loading={save.isPending} disabled={!changed || !subscriptionActive}>
                Salvar permissões
              </Button>
            </span>
          </div>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        )
      }
    >
      {query.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
              </div>
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : data && !allowed ? (
        <p className="text-body-sm text-muted">
          {data.role === 'owner'
            ? 'O proprietário tem todas as permissões, sempre.'
            : 'Ninguém ajusta as próprias permissões. Peça a outra pessoa com a permissão de membros.'}
        </p>
      ) : data && draft ? (
        <div className="flex flex-col gap-6">
          <PermissionGroup
            title="Ações"
            hint="Conferidas pelo servidor em cada operação: desligar aqui bloqueia a ação, não só o botão."
            keys={ACTION_PERMISSION_KEYS}
            data={data}
            draft={draft}
            onChange={setDraft}
          />
          <PermissionGroup
            title="Páginas da gestão"
            hint="Escondem a página do menu desta pessoa. Início e Tarefas aparecem sempre."
            keys={PAGE_PERMISSION_KEYS}
            data={data}
            draft={draft}
            onChange={setDraft}
          />
        </div>
      ) : null}
    </Sheet>
  );
}

/** "dele"/"dela" is not known: the toast uses the neutral "desta pessoa" when the name is ambiguous. */
function pronounOf(data: MemberPermissions): string {
  return `de ${data.name.split(' ')[0]}`;
}

function PermissionGroup({
  title,
  hint,
  keys,
  data,
  draft,
  onChange,
}: {
  title: string;
  hint: string;
  keys: readonly PermissionKey[];
  data: MemberPermissions;
  draft: PermissionDraft;
  onChange: (d: PermissionDraft) => void;
}) {
  const effective = draftEffective(draft);
  const adjusted = new Set(adjustedKeys(draft.role, draft.overrides));
  const grantable = new Set(data.grantable);
  return (
    <section className="flex flex-col">
      <h3 className="text-body-sm font-semibold text-fg">{title}</h3>
      <p className="text-caption text-muted">{hint}</p>
      <ul className="mt-2 flex flex-col divide-y divide-border">
        {keys.map((key) => {
          const id = `perm-${key.replace('.', '-')}`;
          const canGrant = grantable.has(key);
          const description = PERMISSION_DESCRIPTIONS[key];
          return (
            <li key={key} className="flex min-h-14 items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <label htmlFor={id} className={cn('flex flex-wrap items-center gap-2 text-sm font-medium', canGrant ? 'text-fg' : 'text-muted')}>
                  {PERMISSION_LABELS[key]}
                  {adjusted.has(key) ? <Badge tone="neutral">Ajustado</Badge> : null}
                </label>
                {description ? <p className="mt-0.5 text-caption text-muted">{description}</p> : null}
                {!canGrant ? <p className="mt-0.5 text-caption text-subtle">Você não tem esta permissão para conceder.</p> : null}
                {adjusted.has(key) && canGrant ? (
                  <button
                    type="button"
                    className="mt-1 text-caption font-semibold text-brand-text underline-offset-4 hover:underline"
                    onClick={() => onChange(resetDraftKey(draft, key))}
                  >
                    Voltar ao padrão
                  </button>
                ) : null}
              </div>
              <Tooltip content={defaultHint(draft.role, key)}>
                <span className="mt-0.5 inline-flex">
                  <Switch
                    id={id}
                    checked={effective[key]}
                    disabled={!canGrant}
                    onCheckedChange={(v) => onChange(setDraftKey(draft, key, v))}
                  />
                </span>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
