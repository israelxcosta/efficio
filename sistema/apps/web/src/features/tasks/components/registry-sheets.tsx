import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_COLOR,
  taskCategoryInputSchema,
  taskDepartmentInputSchema,
  type IconName,
  type TaskCategory,
  type TaskDepartment,
  type TaskMember,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/ui/category-icon';
import { Checkbox } from '@/components/ui/checkbox';
import { ColorPicker } from '@/components/ui/color-picker';
import { IconPicker } from '@/components/ui/icon-picker';
import { Field, Input } from '@/components/ui/input';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Sheet } from '@/components/ui/sheet';
import { WriteGate } from '@/features/auth/permissions';
import { ApiRequestError } from '@/lib/api';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useSaveDepartment, useSaveTaskCategory } from '../api';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const firstIssue = (issues: { path: PropertyKey[]; message: string }[], key: string) => issues.find((i) => i.path[0] === key)?.message;

/**
 * New or edited department (spec §13.4): name and members. The API keeps one department per member,
 * so marking someone here moves them out of their current department (the list says where they are).
 */
export function DepartmentSheet({
  open,
  department,
  members,
  onOpenChange,
}: {
  open: boolean;
  department: TaskDepartment | null;
  members: TaskMember[];
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveDepartment();
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    setName(department?.name ?? '');
    setChosen(new Set(department?.members.map((m) => m.id) ?? []));
    setQuery('');
    setError(undefined);
  }, [open, department]);

  const list = useMemo(() => {
    const q = normalize(query.trim());
    return [...members]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .filter((m) => !q || normalize(m.name).includes(q));
  }, [members, query]);

  async function submit() {
    const parsed = taskDepartmentInputSchema.safeParse({ name, memberIds: [...chosen] });
    if (!parsed.success) {
      setError(firstIssue(parsed.error.issues, 'name') ?? 'Informe o nome');
      return;
    }
    try {
      await save.mutateAsync({ id: department?.id, input: parsed.data });
      toast.success(department ? 'Departamento salvo.' : 'Departamento criado.');
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) setError(e.message);
      toastError(e);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={department ? 'Editar departamento' : 'Novo departamento'}
      description="Departamentos agrupam a equipe; o Início mostra o trabalho de cada um."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <WriteGate scope="admin">
            <Button onClick={() => void submit()} loading={save.isPending}>
              Salvar departamento
            </Button>
          </WriteGate>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Nome" error={error}>
          <Input data-autofocus value={name} maxLength={80} placeholder="Ex.: Fiscal" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-fg">Membros</span>
            <span className="tabular text-xs text-muted">{chosen.size} marcados</span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar pessoa" aria-label="Buscar pessoa" className="h-10 pl-9" />
          </div>
          <ul className="flex flex-col rounded-lg border border-border p-1">
            {list.map((m) => {
              const checked = chosen.has(m.id);
              const elsewhere = m.department && m.department.id !== department?.id ? m.department.name : null;
              return (
                <li key={m.id}>
                  <label className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 hover:bg-surface-muted')}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(on) =>
                        setChosen((s) => {
                          const next = new Set(s);
                          if (on) next.add(m.id);
                          else next.delete(m.id);
                          return next;
                        })
                      }
                      aria-label={m.name}
                    />
                    <MemberAvatar name={m.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{m.name}</span>
                      {elsewhere ? (
                        <span className={cn('block text-xs', checked ? 'text-warning' : 'text-muted')}>
                          {checked ? `sai de ${elsewhere}` : `está em ${elsewhere}`}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
            {list.length === 0 ? <li className="px-3 py-4 text-center text-sm text-muted">Ninguém com esse nome</li> : null}
          </ul>
          <p className="text-xs text-muted">Cada pessoa fica em um departamento: marcar aqui tira a pessoa do departamento atual.</p>
        </div>
      </div>
    </Sheet>
  );
}

/** New or edited task category (spec §13.5): name, icon, colour and the preview. */
export function TaskCategorySheet({
  open,
  category,
  onOpenChange,
}: {
  open: boolean;
  category: TaskCategory | null;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveTaskCategory();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconName>('tag');
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setIcon(category?.icon ?? 'tag');
    setColor(category?.color ?? DEFAULT_COLOR);
    setError(undefined);
  }, [open, category]);

  async function submit() {
    const parsed = taskCategoryInputSchema.safeParse({ name, icon, color });
    if (!parsed.success) {
      setError(firstIssue(parsed.error.issues, 'name') ?? 'Revise os campos');
      return;
    }
    try {
      await save.mutateAsync({ id: category?.id, input: parsed.data });
      toast.success(category ? 'Categoria salva.' : 'Categoria criada.');
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) setError(e.message);
      toastError(e);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? 'Editar categoria' : 'Nova categoria'}
      description="Rótulos para filtrar e analisar as tarefas."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <WriteGate scope="admin">
            <Button onClick={() => void submit()} loading={save.isPending}>
              Salvar categoria
            </Button>
          </WriteGate>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Nome" error={error}>
          <Input data-autofocus value={name} maxLength={60} placeholder="Ex.: Abertura, Alteração, Certidões, Atendimento" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Ícone">
          <IconPicker value={icon} onChange={setIcon} color={color} />
        </Field>
        <Field label="Cor">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">Prévia</span>
          <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
            <CategoryIcon tinted icon={icon} color={color} />
            <span className="text-sm font-semibold text-fg">{name.trim() || 'Nova categoria'}</span>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
