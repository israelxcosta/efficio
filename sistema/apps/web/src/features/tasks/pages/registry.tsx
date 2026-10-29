import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CircleAlert, Ellipsis, ListChecks, MailPlus, Pencil, Plus, Tags, Trash2, UsersRound, Building2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { TaskCategory, TaskDepartment, TaskMember } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CategoryIcon } from '@/components/ui/category-icon';
import { ConfirmDialog, Modal } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { AvatarStack, MemberAvatar } from '@/components/ui/member-avatar';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { ROLE_HINTS, ROLE_LABELS } from '@/features/auth/roles';
import { useMembers } from '@/features/workspaces/api';
import { ApiRequestError } from '@/lib/api';
import { toastError } from '@/lib/notify';
import { cn, pluralize } from '@/lib/utils';
import {
  useDeleteDepartment,
  useDeleteTaskCategory,
  useSetMemberDepartment,
  useTaskCategories,
  useTaskDepartments,
  useTaskOptions,
  useTasks,
} from '../api';
import { DepartmentSheet, TaskCategorySheet } from '../components/registry-sheets';
import { namesSummary } from '../format';
import { tasksHref } from '../url-state';

type Tab = 'departamentos' | 'categorias' | 'equipe';
const TABS: Tab[] = ['departamentos', 'categorias', 'equipe'];
const ADMIN_ONLY_NOTE = 'Somente administradores alteram estes cadastros.';

const rowClass = 'group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-muted @lg:px-4';
const neutralIcon = 'flex size-10 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-muted [&_svg]:size-[18px]';

function RowMenuButton({ label }: { label: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-70 transition hover:bg-bg-subtle hover:text-fg group-hover:opacity-100 pointer-coarse:opacity-100"
        aria-label={label}
      >
        <Ellipsis className="size-4" />
      </button>
    </DropdownMenuTrigger>
  );
}

export default function TaskRegistryPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('aba') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'departamentos';
  const { isAdmin, isOwner } = usePermissions();
  const options = useTaskOptions();
  const departments = useTaskDepartments();
  const categories = useTaskCategories();
  const [deptSheet, setDeptSheet] = useState<{ open: boolean; department: TaskDepartment | null }>({ open: false, department: null });
  const [catSheet, setCatSheet] = useState<{ open: boolean; category: TaskCategory | null }>({ open: false, category: null });

  const members = options.data?.members ?? [];
  const admins = members.filter((m) => m.isAdmin).length;
  const note = isAdmin ? '' : ` ${ADMIN_ONLY_NOTE}`;
  const description =
    tab === 'departamentos'
      ? `${departments.data ? pluralize(departments.data.length, 'departamento', 'departamentos') : 'Departamentos'} · cada tarefa pertence a um departamento.${note}`
      : tab === 'categorias'
        ? `Rótulos para filtrar e analisar as tarefas.${note}`
        : `${pluralize(members.length, 'pessoa', 'pessoas')} · ${pluralize(admins, 'administrador', 'administradores')} e ${pluralize(members.length - admins, 'colaborador', 'colaboradores')}.${note}`;

  const action =
    tab === 'departamentos' ? (
      <WriteGate scope="admin">
        <Button onClick={() => setDeptSheet({ open: true, department: null })}>
          <Plus /> Novo departamento
        </Button>
      </WriteGate>
    ) : tab === 'categorias' ? (
      <WriteGate scope="admin">
        <Button onClick={() => setCatSheet({ open: true, category: null })}>
          <Plus /> Nova categoria
        </Button>
      </WriteGate>
    ) : isOwner ? (
      <Button variant="outline" asChild>
        <Link to="/configuracoes?aba=membros">
          <MailPlus /> Convidar pessoa
        </Link>
      </Button>
    ) : isAdmin ? (
      <p className="max-w-xs text-body-sm text-muted">Convites e papéis ficam com o proprietário em Configurações › Membros.</p>
    ) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Cadastros" description={description} actions={action} />
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <SegmentedControl<Tab>
          variant="solid"
          ariaLabel="Cadastros"
          value={tab}
          onChange={(t) => setParams(t === 'departamentos' ? {} : { aba: t }, { replace: true })}
          options={[
            { value: 'departamentos', label: 'Departamentos', icon: <UsersRound /> },
            { value: 'categorias', label: 'Categorias', icon: <Tags /> },
            { value: 'equipe', label: 'Equipe', icon: <ShieldCheck /> },
          ]}
        />
      </div>

      {tab === 'departamentos' ? (
        <DepartmentsTab
          departments={departments}
          isAdmin={isAdmin}
          onNew={() => setDeptSheet({ open: true, department: null })}
          onEdit={(d) => setDeptSheet({ open: true, department: d })}
        />
      ) : tab === 'categorias' ? (
        <CategoriesTab categories={categories} isAdmin={isAdmin} onNew={() => setCatSheet({ open: true, category: null })} onEdit={(c) => setCatSheet({ open: true, category: c })} />
      ) : (
        <TeamTab />
      )}

      {isAdmin ? (
        <>
          <DepartmentSheet open={deptSheet.open} department={deptSheet.department} members={members} onOpenChange={(open) => setDeptSheet((s) => ({ ...s, open }))} />
          <TaskCategorySheet open={catSheet.open} category={catSheet.category} onOpenChange={(open) => setCatSheet((s) => ({ ...s, open }))} />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Departamentos
// ---------------------------------------------------------------------------

function DepartmentsTab({
  departments,
  isAdmin,
  onNew,
  onEdit,
}: {
  departments: ReturnType<typeof useTaskDepartments>;
  isAdmin: boolean;
  onNew: () => void;
  onEdit: (d: TaskDepartment) => void;
}) {
  const options = useTaskOptions();
  const remove = useDeleteDepartment();
  const [toDelete, setToDelete] = useState<TaskDepartment | null>(null);
  const [blocked, setBlocked] = useState<{ department: TaskDepartment; message: string } | null>(null);
  const active = (options.data?.clients ?? []).filter((c) => c.status === 'active');
  const responsibles = options.data?.clientResponsibles ?? [];

  function askDelete(d: TaskDepartment) {
    const parts = [d.members.length ? pluralize(d.members.length, 'membro', 'membros') : null, d.taskCount ? pluralize(d.taskCount, 'tarefa', 'tarefas') : null].filter(Boolean);
    if (parts.length) {
      const one = d.members.length + d.taskCount === 1;
      setBlocked({ department: d, message: `${parts.join(' e ')} ainda ${one ? 'está' : 'estão'} neste departamento. Mova-os antes de excluir.` });
    } else setToDelete(d);
  }

  return (
    <Card className="@container overflow-hidden">
      <div className="hidden items-center gap-3 border-b border-border px-5.5 py-2.5 text-xs font-medium text-muted @xl:flex">
        <span className="flex-1">Departamento</span>
        <span className="hidden w-32 @2xl:block">Membros</span>
        <span className="w-28 text-right">Em aberto</span>
        <span className="hidden w-36 text-right whitespace-nowrap @4xl:block">Com responsável</span>
        <span className="w-8" aria-hidden />
      </div>
      <div className="p-1.5">
        {departments.isPending ? (
          <SkeletonRows rows={4} className="p-3" />
        ) : departments.isError ? (
          <ErrorState error={departments.error} onRetry={() => departments.refetch()} className="m-3" />
        ) : departments.data.length === 0 ? (
          <EmptyState
            className="m-3"
            icon={<UsersRound />}
            title="Nenhum departamento"
            description="Departamentos agrupam a equipe (Fiscal, Pessoal, Contábil). Cada tarefa pertence a um, e o Início mostra o trabalho de cada departamento."
            action={
              <WriteGate scope="admin">
                <Button variant="outline" onClick={onNew}>
                  Novo departamento
                </Button>
              </WriteGate>
            }
          />
        ) : (
          departments.data.map((d) => {
            const covered = active.filter((c) => responsibles.some((r) => r.clientId === c.id && r.departmentId === d.id)).length;
            return (
              <div key={d.id} className={rowClass}>
                <span className={neutralIcon} aria-hidden>
                  <UsersRound />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{d.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{namesSummary(d.members.map((m) => m.name))}</span>
                </span>
                <span className="hidden w-32 @2xl:block">
                  {d.members.length ? <AvatarStack names={d.members.map((m) => m.name)} /> : <span className="text-body-sm text-subtle">—</span>}
                </span>
                <Link to={tasksHref({ scope: 'all', department: d.id })} className="w-28 rounded-md text-right hover:underline" aria-label={`${d.name}: ${d.openCount} em aberto, ${d.overdueCount} atrasadas. Ver tarefas.`}>
                  <span className="tabular block text-body-sm font-semibold text-fg">{d.openCount}</span>
                  {d.overdueCount ? (
                    <span className="tabular block text-mini text-danger">{pluralize(d.overdueCount, 'atrasada', 'atrasadas')}</span>
                  ) : null}
                </Link>
                <span className={cn('tabular hidden w-36 text-right text-body-sm @4xl:block', covered < active.length ? 'text-warning' : 'text-fg')}>
                  {covered}/{active.length}
                </span>
                {isAdmin ? (
                  <DropdownMenu>
                    <RowMenuButton label={`Ações de ${d.name}`} />
                    <DropdownMenuContent>
                      <DropdownMenuItem icon={<Pencil />} onSelect={() => onEdit(d)}>
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => askDelete(d)}>
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="size-8 shrink-0" aria-hidden />
                )}
              </div>
            );
          })
        )}
      </div>
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Excluir o departamento ${toDelete?.name ?? ''}?`}
        description="Os responsáveis de clientes neste departamento também saem. Esta ação não pode ser desfeita."
        confirmLabel="Excluir departamento"
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(toDelete!.id);
            toast.success('Departamento excluído.');
            setToDelete(null);
          } catch (error) {
            setToDelete(null);
            if (error instanceof ApiRequestError && error.status === 409) setBlocked({ department: toDelete!, message: error.message });
            else toastError(error);
          }
        }}
      />
      <Modal
        open={Boolean(blocked)}
        onOpenChange={(o) => !o && setBlocked(null)}
        title={`Não é possível excluir ${blocked?.department.name ?? ''}`}
        description={blocked?.message}
        footer={<Button onClick={() => setBlocked(null)}>Entendi</Button>}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

function CategoriesTab({
  categories,
  isAdmin,
  onNew,
  onEdit,
}: {
  categories: ReturnType<typeof useTaskCategories>;
  isAdmin: boolean;
  onNew: () => void;
  onEdit: (c: TaskCategory) => void;
}) {
  const remove = useDeleteTaskCategory();
  const [toDelete, setToDelete] = useState<TaskCategory | null>(null);
  return (
    <Card className="@container overflow-hidden">
      <div className="p-1.5">
        {categories.isPending ? (
          <SkeletonRows rows={4} className="p-3" />
        ) : categories.isError ? (
          <ErrorState error={categories.error} onRetry={() => categories.refetch()} className="m-3" />
        ) : categories.data.length === 0 ? (
          <EmptyState
            className="m-3"
            icon={<Tags />}
            title="Nenhuma categoria"
            description="Categorias são rótulos livres para filtros e relatórios."
            action={
              <WriteGate scope="admin">
                <Button variant="outline" onClick={onNew}>
                  Nova categoria
                </Button>
              </WriteGate>
            }
          />
        ) : (
          categories.data.map((c) => (
            <div key={c.id} className={rowClass}>
              <CategoryIcon icon={c.icon} color={c.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg">{c.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{pluralize(c.taskCount, 'tarefa', 'tarefas')}</span>
              </span>
              <Link to={tasksHref({ scope: 'all', category: c.id, situation: 'all' })} className="hidden text-caption font-medium text-brand-text hover:underline @md:inline">
                Ver tarefas
              </Link>
              {isAdmin ? (
                <DropdownMenu>
                  <RowMenuButton label={`Ações de ${c.name}`} />
                  <DropdownMenuContent>
                    <DropdownMenuItem icon={<Pencil />} onSelect={() => onEdit(c)}>
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setToDelete(c)}>
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="size-8 shrink-0" aria-hidden />
              )}
            </div>
          ))
        )}
      </div>
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Excluir a categoria ${toDelete?.name ?? ''}?`}
        description={
          toDelete?.taskCount
            ? `${pluralize(toDelete.taskCount, 'tarefa ficará', 'tarefas ficarão')} sem categoria.`
            : 'Nenhuma tarefa usa esta categoria.'
        }
        confirmLabel="Excluir categoria"
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(toDelete!.id);
            toast.success('Categoria excluída.');
            setToDelete(null);
          } catch (error) {
            toastError(error);
          }
        }}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------

function TeamTab() {
  const navigate = useNavigate();
  const options = useTaskOptions();
  const people = useMembers();
  const { isAdmin, isOwner } = usePermissions();
  // Open work per person: the summary of all open tasks (every member may read it).
  const open = useTasks({ scope: 'all', situation: 'open', page: 1, pageSize: 1, occurrences: 'false' });
  const setDepartment = useSetMemberDepartment();
  const [onlyWithout, setOnlyWithout] = useState(false);
  const o = options.data;

  const rows = useMemo(() => {
    if (!o) return [];
    return [...o.members]
      .sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name, 'pt-BR'))
      .filter((m) => !onlyWithout || !m.department);
  }, [o, onlyWithout]);
  const withoutDept = o ? o.members.filter((m) => !m.department).length : 0;

  async function changeDepartment(m: TaskMember, departmentId: string) {
    try {
      await setDepartment.mutateAsync({ userId: m.id, departmentId: departmentId || null });
      const dept = o?.departments.find((d) => d.id === departmentId);
      toast.success(dept ? `${m.name.split(' ')[0]} agora está em ${dept.name}.` : `${m.name.split(' ')[0]} saiu do departamento.`);
    } catch (error) {
      toastError(error);
    }
  }

  if (options.isError && !o) return <ErrorState error={options.error} onRetry={() => options.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      {o && withoutDept > 0 && o.departments.length > 0 ? (
        <Card className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-4 py-3 sm:px-5">
          <p className="flex min-w-0 max-w-[72ch] items-start gap-2 text-body-sm text-fg">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            {withoutDept === 1 ? '1 pessoa sem departamento não aparece' : `${withoutDept} pessoas sem departamento não aparecem`} no Início de nenhum departamento.
          </p>
          <Button size="sm" variant="outline" aria-pressed={onlyWithout} onClick={() => setOnlyWithout((v) => !v)}>
            {onlyWithout ? 'Ver todos' : 'Ver quem'}
          </Button>
        </Card>
      ) : null}
      <Card className="@container overflow-hidden">
        <div className="hidden items-center gap-3 border-b border-border px-5.5 py-2.5 text-xs font-medium text-muted @xl:flex">
          <span className="flex-1">Pessoa</span>
          <span className="hidden w-32 @2xl:block">Papel</span>
          <span className="w-48">Departamento</span>
          <span className="hidden w-28 @3xl:block">Carteira</span>
          <span className="hidden w-28 text-right @3xl:block">Em aberto</span>
          <span className="w-8" aria-hidden />
        </div>
        <div className="p-1.5">
          {!o ? (
            <SkeletonRows rows={4} className="p-3" />
          ) : o.members.length <= 1 ? (
            <EmptyState
              className="m-3"
              icon={<UsersRound />}
              title="Só você neste espaço"
              description="Convide a equipe e distribua as pessoas pelos departamentos."
              action={
                isOwner ? (
                  <Button variant="outline" asChild>
                    <Link to="/configuracoes?aba=membros">Convidar pessoa</Link>
                  </Button>
                ) : null
              }
            />
          ) : (
            rows.map((m) => {
              const email = people.data?.find((p) => p.userId === m.id)?.email;
              const portfolio = new Set(o.clientResponsibles.filter((r) => r.user.id === m.id).map((r) => r.clientId)).size;
              const load = open.data?.summary.openByAssignee.find((r) => r.assignee?.id === m.id);
              return (
                <div key={m.id} className={rowClass}>
                  <MemberAvatar size="md" name={m.name} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-fg">{m.name}</span>
                      {m.isYou ? <Badge tone="brand">Você</Badge> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {email ?? ROLE_LABELS[m.role]}
                      <span className="@2xl:hidden">{email ? ` · ${ROLE_LABELS[m.role]}` : ''}</span>
                    </span>
                    {isAdmin && o.departments.length ? (
                      <span className="mt-1.5 block max-w-56 @xl:hidden">
                        <DepartmentSelect member={m} departments={o.departments} onChange={(v) => void changeDepartment(m, v)} />
                      </span>
                    ) : (
                      <span className="mt-0.5 block truncate text-xs @xl:hidden">
                        <span className={m.department ? 'text-muted' : 'text-subtle'}>{m.department?.name ?? 'Sem departamento'}</span>
                      </span>
                    )}
                  </span>
                  <Tooltip content={ROLE_HINTS[m.role]}>
                    <span tabIndex={0} className="hidden w-32 rounded-sm text-body-sm text-muted @2xl:block">
                      {ROLE_LABELS[m.role]}
                    </span>
                  </Tooltip>
                  <span className="hidden w-48 min-w-0 @xl:block">
                    {isAdmin && o.departments.length ? (
                      <DepartmentSelect member={m} departments={o.departments} onChange={(v) => void changeDepartment(m, v)} />
                    ) : (
                      <span className={cn('block truncate text-body-sm', m.department ? 'text-fg' : 'text-subtle')}>{m.department?.name ?? 'Sem departamento'}</span>
                    )}
                  </span>
                  <Link to={`/tarefas/clientes?responsavel=${m.id}`} className="hidden w-28 text-body-sm text-brand-text hover:underline @3xl:block">
                    {pluralize(portfolio, 'cliente', 'clientes')}
                  </Link>
                  <span className="hidden w-28 text-right @3xl:block">
                    <span className="tabular block text-body-sm font-semibold text-fg">{load?.open ?? 0}</span>
                    {load?.overdue ? <span className="tabular block text-mini text-danger">{pluralize(load.overdue, 'atrasada', 'atrasadas')}</span> : null}
                  </span>
                  <DropdownMenu>
                    <RowMenuButton label={`Ações de ${m.name}`} />
                    <DropdownMenuContent>
                      <DropdownMenuItem icon={<ListChecks />} onSelect={() => navigate(tasksHref({ scope: 'all', assignee: m.id }))}>
                        Ver tarefas
                      </DropdownMenuItem>
                      <DropdownMenuItem icon={<Building2 />} onSelect={() => navigate(`/tarefas/clientes?responsavel=${m.id}`)}>
                        Ver clientes
                      </DropdownMenuItem>
                      {isOwner && !m.isYou ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem icon={<ShieldCheck />} onSelect={() => navigate('/configuracoes?aba=membros')}>
                            Alterar papel
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })
          )}
        </div>
      </Card>
      {isAdmin && o && o.departments.length > 0 ? (
        <p className="text-caption text-muted">Cada pessoa fica em um departamento; trocar aqui leva junto as tarefas em aberto dela.</p>
      ) : null}
    </div>
  );
}

function DepartmentSelect({ member, departments, onChange }: { member: TaskMember; departments: { id: string; name: string }[]; onChange: (id: string) => void }) {
  return (
    <Select size_="sm" value={member.department?.id ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={`Departamento de ${member.name}`}>
      <option value="">Sem departamento</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </Select>
  );
}
