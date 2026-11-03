import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Info, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  addMonthKey,
  formatMonthKey,
  MAX_REFERENCE_OFFSET,
  MONTH_NAMES,
  NON_BUSINESS_DAY_RULES,
  recurringTaskInputSchema,
  TAX_REGIME_LABELS,
  TAX_REGIMES,
  WEEKDAY_LABELS,
  type MonthKey,
  type NonBusinessDayRule,
  type RecurrencePeriod,
  type RecurringTask,
  type RecurringTaskInput,
  type TaskOptionsResponse,
  type TaxRegime,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { ADMIN_ONLY_REASON } from '@/features/auth/permissions';
import { ApiRequestError } from '@/lib/api';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { recurringInputOf, useSaveRecurring } from '../api';
import { competenceName } from '../occurrence';
import {
  appliesTo,
  competenceOptions,
  distributionText,
  dueRuleHint,
  holidaysText,
  NON_BUSINESS_HINTS,
  PERIOD_OPTIONS,
  previewLines,
  referenceOptionLabel,
} from '../recurring-rules';
import { ClientPicker, MemberPicker, NONE } from './pickers';

/** Form state: numbers as strings while typing; `endCompetence` '' = no end. */
export interface RecurringForm {
  name: string;
  description: string;
  departmentId: string;
  categoryId: string;
  assigneeId: string;
  period: RecurrencePeriod;
  dueDay: string;
  dueMonth: string;
  targetDaysBefore: string;
  nonBusinessDayRule: NonBusinessDayRule;
  referenceOffset: string;
  startCompetence: MonthKey;
  endCompetence: MonthKey | '';
  regimes: TaxRegime[];
  clientIds: string[];
  excludedClientIds: string[];
}

export function emptyRecurringForm(current: MonthKey): RecurringForm {
  return {
    name: '',
    description: '',
    departmentId: '',
    categoryId: '',
    assigneeId: '',
    period: 'monthly',
    dueDay: '',
    dueMonth: '',
    targetDaysBefore: '0',
    nonBusinessDayRule: 'anticipate',
    referenceOffset: '1',
    startCompetence: current,
    endCompetence: '',
    regimes: [],
    clientIds: [],
    excludedClientIds: [],
  };
}

export function recurringFormOf(r: RecurringTask, copy = false): RecurringForm {
  return {
    name: copy ? `${r.name} (cópia)` : r.name,
    description: r.description ?? '',
    departmentId: r.department?.id ?? '',
    categoryId: r.category?.id ?? '',
    assigneeId: r.assignee?.id ?? '',
    period: r.period,
    dueDay: String(r.dueDay),
    dueMonth: r.dueMonth ? String(r.dueMonth) : '',
    targetDaysBefore: String(r.targetDaysBefore),
    nonBusinessDayRule: r.nonBusinessDayRule,
    referenceOffset: String(r.referenceOffset),
    startCompetence: r.startCompetence,
    endCompetence: copy ? '' : (r.endCompetence ?? ''),
    regimes: r.regimes,
    clientIds: r.clientIds,
    excludedClientIds: r.excludedClientIds,
  };
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export function recurringInputFromForm(f: RecurringForm): RecurringTaskInput {
  return {
    name: f.name,
    description: f.description.trim() || null,
    period: f.period,
    departmentId: f.departmentId || null,
    categoryId: f.categoryId || null,
    assigneeId: f.assigneeId || null,
    dueDay: num(f.dueDay) as number,
    dueMonth: num(f.dueMonth),
    targetDaysBefore: num(f.targetDaysBefore) ?? 0,
    nonBusinessDayRule: f.nonBusinessDayRule,
    referenceOffset: num(f.referenceOffset) ?? 1,
    regimes: f.regimes,
    clientIds: f.clientIds,
    excludedClientIds: f.excludedClientIds,
    startCompetence: f.startCompetence,
    endCompetence: f.endCompetence || null,
  };
}

export type RecurringErrors = Partial<Record<keyof RecurringForm, string>>;

/** Validates with the contract's schema; the messages of the screen end with a period. */
export function validateRecurring(f: RecurringForm, needsDepartment: boolean): RecurringErrors {
  const out: RecurringErrors = {};
  const parsed = recurringTaskInputSchema.safeParse(recurringInputFromForm(f));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof RecurringForm | undefined;
      if (!key || out[key]) continue;
      const msg = issue.message.includes('expected') || issue.message.includes('Invalid') ? 'Informe o prazo legal' : issue.message;
      out[key] = msg.endsWith('.') ? msg : `${msg}.`;
    }
  }
  if (needsDepartment && !f.departmentId) out.departmentId = 'Escolha o departamento.';
  return out;
}

interface RecurringTaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The recurring task (edit or read), a copy to duplicate, or null to create. */
  recurring: RecurringTask | null;
  duplicate?: boolean;
  options: TaskOptionsResponse | undefined;
  /** Administrators edit; the others read. */
  canEdit: boolean;
  loading?: boolean;
  /** Why it is read-only (role or subscription). */
  readOnlyReason?: string;
  onSaved?: (r: RecurringTask) => void;
}

/**
 * Registry of a recurring task (spec §10.3), in five groups: what, when (periodicity, legal deadline,
 * target, non-business days, reference and the preview of the next 3 periods with holidays), term,
 * who and for which clients. Read-only for collaborators.
 */
export function RecurringTaskSheet({ open, onOpenChange, recurring, duplicate, options, canEdit, loading, readOnlyReason = ADMIN_ONLY_REASON, onSaved }: RecurringTaskSheetProps) {
  const save = useSaveRecurring();
  const current = (options?.today ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
  const editing = Boolean(recurring) && !duplicate;
  const readOnly = !canEdit;
  const [form, setForm] = useState<RecurringForm>(() => (recurring ? recurringFormOf(recurring, duplicate) : emptyRecurringForm(current)));
  const [errors, setErrors] = useState<RecurringErrors>({});
  const [showExceptions, setShowExceptions] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(recurring ? recurringFormOf(recurring, duplicate) : emptyRecurringForm(current));
    setErrors({});
    setShowExceptions(Boolean(recurring?.excludedClientIds.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recurring?.id, duplicate]);

  const set = <K extends keyof RecurringForm>(key: K, value: RecurringForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const departments = options?.departments ?? [];
  const department = departments.find((d) => d.id === form.departmentId);
  const schedule = useMemo(() => {
    const dueDay = Number(form.dueDay);
    if (!dueDay || (form.period === 'weekly' && dueDay > 7)) return null;
    if (form.period !== 'monthly' && form.period !== 'weekly' && !form.dueMonth) return null;
    return {
      period: form.period,
      dueDay,
      dueMonth: form.dueMonth ? Number(form.dueMonth) : null,
      targetDaysBefore: Math.max(0, Math.min(form.period === 'weekly' ? 6 : 30, Number(form.targetDaysBefore) || 0)),
      nonBusinessDayRule: form.nonBusinessDayRule,
      referenceOffset: form.period === 'weekly' ? 0 : Number(form.referenceOffset) || 0,
    };
  }, [form.period, form.dueDay, form.dueMonth, form.targetDaysBefore, form.nonBusinessDayRule, form.referenceOffset]);

  async function submit() {
    const next = validateRecurring(form, departments.length > 0);
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      const saved = await save.mutateAsync({ id: editing ? recurring!.id : undefined, input: recurringInputFromForm(form) });
      toast.success(editing ? 'Tarefa recorrente salva.' : 'Tarefa recorrente criada.');
      onSaved?.(saved);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const fields = error.fieldErrors();
        if (Object.keys(fields).length) setErrors(fields as RecurringErrors);
      }
      toastError(error);
    }
  }

  const title = readOnly && recurring ? recurring.name : editing ? 'Editar tarefa recorrente' : duplicate ? 'Duplicar tarefa recorrente' : 'Nova tarefa recorrente';
  const monthName = competenceName(current).split(' ')[0];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Vira uma coluna da auditoria mensal e uma tarefa por cliente a cada período, para o responsável do cliente no departamento."
      width="lg"
      footer={
        readOnly ? (
          <>
            <p className="mr-auto text-caption text-muted">{readOnlyReason}</p>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </>
        ) : (
          <div className="flex w-full flex-col gap-3">
            {editing ? (
              <p className="text-caption text-subtle">
                As mudanças valem para as tarefas desta recorrente ainda não iniciadas, a partir de {monthName}; as em andamento e as concluídas não mudam.
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button loading={save.isPending} onClick={() => void submit()}>
                Salvar tarefa recorrente
              </Button>
            </div>
          </div>
        )
      }
    >
      {loading || !options ? (
        <SkeletonRows rows={8} />
      ) : (
        <form
          className="flex flex-col gap-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Group title="O quê">
            <Field label="Nome*" error={errors.name}>
              <Input
                data-autofocus
                disabled={readOnly}
                maxLength={200}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Ex.: DCTFWeb, DAS do Simples, Folha de pagamento"
              />
            </Field>
            <Field label="Descrição" hint="Vai para a descrição de cada tarefa gerada.">
              <Textarea disabled={readOnly} rows={2} maxLength={5000} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Detalhes ou observações (opcional)" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {departments.length ? (
                <Field label="Departamento*" error={errors.departmentId} hint="Recebe as tarefas desta obrigação. O responsável de cada cliente vem deste departamento.">
                  <Select disabled={readOnly} value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                    <option value="">Escolha o departamento</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field label="Categoria">
                <Select disabled={readOnly} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">Sem categoria</option>
                  {options.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Group>

          <Group title="Quando">
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg">Periodicidade*</span>
              <div className="hidden sm:block">
                <SegmentedControl<RecurrencePeriod>
                  size="sm"
                  ariaLabel="Periodicidade"
                  value={form.period}
                  onChange={(p) => !readOnly && set('period', p)}
                  options={PERIOD_OPTIONS}
                />
              </div>
              <Select className="sm:hidden" wrapperClassName="sm:hidden" aria-label="Periodicidade" disabled={readOnly} value={form.period} onChange={(e) => set('period', e.target.value as RecurrencePeriod)}>
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <DueFields form={form} errors={errors} readOnly={readOnly} set={set} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Meta interna" error={errors.targetDaysBefore} hint={errors.targetDaysBefore ? undefined : 'Com 0, a meta é o próprio prazo legal.'}>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={form.period === 'weekly' ? 6 : 30}
                    inputMode="numeric"
                    disabled={readOnly}
                    className="w-20"
                    aria-label="Meta interna, em dias antes do prazo legal"
                    value={form.targetDaysBefore}
                    onChange={(e) => set('targetDaysBefore', e.target.value)}
                  />
                  <span className="text-body-sm text-muted">dias antes do prazo legal</span>
                </div>
              </Field>
              <Field
                label="Competência de referência"
                hint={form.period === 'weekly' ? 'Na semanal, a referência é a própria semana.' : 'O DAS que vence em outubro se refere a setembro: aparece como ref. 09/2026.'}
              >
                <Select disabled={readOnly || form.period === 'weekly'} value={form.period === 'weekly' ? '0' : form.referenceOffset} onChange={(e) => set('referenceOffset', e.target.value)}>
                  {Array.from({ length: MAX_REFERENCE_OFFSET + 1 }, (_, i) => (
                    <option key={i} value={String(i)}>
                      {referenceOptionLabel(i)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg">Se cair em dia não útil</span>
              <SegmentedControl<NonBusinessDayRule>
                size="sm"
                ariaLabel="Se cair em dia não útil"
                value={form.nonBusinessDayRule}
                onChange={(v) => !readOnly && set('nonBusinessDayRule', v)}
                options={NON_BUSINESS_DAY_RULES.map((r) => ({ value: r, label: r === 'anticipate' ? 'Antecipar' : r === 'postpone' ? 'Postergar' : 'Manter' }))}
                className="self-start"
              />
              <p className="text-xs text-muted">{NON_BUSINESS_HINTS[form.nonBusinessDayRule]} Vale para o prazo legal; a meta sempre antecipa.</p>
            </div>
            <Preview schedule={schedule} current={current} start={form.startCompetence} />
          </Group>

          <Group title="Vigência">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Começa em" hint="Competências antes desta não geram tarefas.">
                <Select disabled={readOnly} value={form.startCompetence} onChange={(e) => set('startCompetence', e.target.value)}>
                  {competenceOptions(current).map((m) => (
                    <option key={m} value={m}>
                      {formatMonthKey(m)}
                      {m === current ? ' (atual)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Encerra em"
                error={errors.endCompetence}
                hint="Última competência com tarefas. Depois dela, a recorrente sai da auditoria e das listas; o histórico fica."
              >
                <Select disabled={readOnly} value={form.endCompetence} onChange={(e) => set('endCompetence', e.target.value)}>
                  <option value="">Sem data para encerrar</option>
                  {competenceOptions(form.startCompetence, 0, 36).map((m) => (
                    <option key={m} value={m}>
                      {formatMonthKey(m)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Group>

          <Group title="Quem">
            <Field
              label="Responsável padrão"
              hint={
                <>
                  Recebe as tarefas dos clientes que não têm responsável{department ? ` no ${department.name}` : ' no departamento'}.
                  {editing && recurring && distributionText(recurring) ? (
                    <span className="mt-1 block">
                      {distributionText(recurring)}
                      {department ? (
                        <>
                          {' · '}
                          <Link className="font-medium text-brand-text hover:underline" to={`/tarefas/clientes?departamento=${department.id}&sem-responsavel=1`}>
                            Definir responsáveis dos clientes
                          </Link>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </>
              }
            >
              <MemberPicker
                value={form.assigneeId || NONE}
                onChange={(v) => set('assigneeId', v === NONE ? '' : v)}
                members={options.members}
                allowNone
                noneLabel="Sem responsável padrão"
                departmentId={form.departmentId || undefined}
                disabled={readOnly}
              />
            </Field>
          </Group>

          <Group title="Para quais clientes">
            <ClientsField
              form={form}
              errors={errors}
              options={options}
              current={current}
              readOnly={readOnly}
              set={set}
              showExceptions={showExceptions}
              onShowExceptions={() => setShowExceptions(true)}
            />
          </Group>
        </form>
      )}
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-4">
      <legend className="mb-3 text-body-sm font-semibold text-fg">{title}</legend>
      {children}
    </fieldset>
  );
}

type Setter = <K extends keyof RecurringForm>(key: K, value: RecurringForm[K]) => void;

/** Legal deadline by periodicity: the weekday, the day, or the day and the (first) month. */
function DueFields({ form, errors, readOnly, set }: { form: RecurringForm; errors: RecurringErrors; readOnly: boolean; set: Setter }) {
  const dueDay = Number(form.dueDay);
  const rule = { period: form.period, dueDay, dueMonth: form.dueMonth ? Number(form.dueMonth) : null };
  const hint = dueDay && (form.period === 'monthly' || form.period === 'weekly' || form.dueMonth) ? dueRuleHint(rule) : undefined;
  if (form.period === 'weekly') {
    return (
      <Field label="Prazo legal*" error={errors.dueDay} hint={hint}>
        <Select disabled={readOnly} value={Number(form.dueDay) <= 7 ? form.dueDay : ''} onChange={(e) => set('dueDay', e.target.value)}>
          <option value="">Escolha o dia da semana</option>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={String(d)}>
              {WEEKDAY_LABELS[d]}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  const daySelect = (
    <Select disabled={readOnly} aria-label="Dia do prazo legal" value={form.dueDay} onChange={(e) => set('dueDay', e.target.value)}>
      <option value="">Dia</option>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
        <option key={d} value={String(d)}>
          {d === 31 ? '31 ou o último dia do mês' : `Dia ${d}`}
        </option>
      ))}
    </Select>
  );
  if (form.period === 'monthly') {
    return (
      <Field label="Prazo legal*" error={errors.dueDay} hint={hint}>
        {daySelect}
      </Field>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-fg">Prazo legal*</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {daySelect}
        <Select disabled={readOnly} aria-label={form.period === 'annual' ? 'Mês do prazo legal' : '1º mês do prazo legal'} value={form.dueMonth} onChange={(e) => set('dueMonth', e.target.value)}>
          <option value="">{form.period === 'annual' ? 'Mês' : '1º mês'}</option>
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={String(i + 1)}>
              {m}
            </option>
          ))}
        </Select>
      </div>
      {errors.dueDay || errors.dueMonth ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {errors.dueDay ?? errors.dueMonth}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : form.period !== 'annual' ? (
        <p className="text-xs text-muted">O 1º mês se repete a cada {form.period === 'bimonthly' ? 2 : form.period === 'quarterly' ? 3 : 6} meses.</p>
      ) : null}
    </div>
  );
}

/** Read-only preview of the next 3 periods (§10.3), with the holidays of the year in a tooltip. */
function Preview({ schedule, current, start }: { schedule: Parameters<typeof previewLines>[0] | null; current: MonthKey; start: MonthKey }) {
  const year = Number((start > current ? start : current).slice(0, 4));
  return (
    <div className="rounded-lg bg-surface-muted p-3 text-caption text-muted" aria-live="polite">
      <p className="font-semibold text-fg">Prévia</p>
      {schedule ? (
        <ul className="mt-1 flex flex-col gap-1">
          {previewLines(schedule, current, start).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1">Informe o prazo legal para ver as próximas datas.</p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-1">
        Considera fins de semana e feriados nacionais
        <Tooltip
          content={`${holidaysText(year)} Carnaval e Corpus Christi entram porque não há expediente bancário.`}
        >
          <span tabIndex={0} role="img" aria-label={`Feriados nacionais de ${year}`} className="inline-flex text-subtle hover:text-muted">
            <Info className="size-3.5" aria-hidden />
          </span>
        </Tooltip>
      </p>
      <p>Feriados estaduais e municipais ainda não entram.</p>
    </div>
  );
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Regimes, specific clients and exceptions, with the summary of who it applies to. */
function ClientsField({
  form,
  errors,
  options,
  current,
  readOnly,
  set,
  showExceptions,
  onShowExceptions,
}: {
  form: RecurringForm;
  errors: RecurringErrors;
  options: TaskOptionsResponse;
  current: MonthKey;
  readOnly: boolean;
  set: Setter;
  showExceptions: boolean;
  onShowExceptions: () => void;
}) {
  const [search, setSearch] = useState('');
  const active = options.clients.filter((c) => c.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const visible = active.filter((c) => !search || normalize(c.name).includes(normalize(search)) || normalize(c.legalName).includes(normalize(search)));
  const summary = appliesTo(options.clients, current, form);
  const monthName = competenceName(current).split(' ')[0];
  const regimeCount = (r: TaxRegime) => active.filter((c) => c.taxRegime === r).length;
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));
  const exceptionCandidates = options.clients.filter((c) => form.regimes.includes(c.taxRegime) && !form.excludedClientIds.includes(c.id));

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">Regimes</span>
        <div className="grid gap-1 sm:grid-cols-2">
          {TAX_REGIMES.map((r) => (
            <label key={r} className="flex min-h-9 items-center gap-2.5 rounded-md px-1 text-sm text-fg">
              <Checkbox
                disabled={readOnly}
                checked={form.regimes.includes(r)}
                onCheckedChange={(on) => set('regimes', on ? [...form.regimes, r] : form.regimes.filter((x) => x !== r))}
                aria-label={TAX_REGIME_LABELS[r]}
              />
              <span>
                {TAX_REGIME_LABELS[r]} <span className="text-muted">· {regimeCount(r)} {regimeCount(r) === 1 ? 'cliente ativo' : 'clientes ativos'}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-fg">Clientes específicos</span>
          <span className="flex items-center gap-1 text-caption text-muted">
            <span className="tabular">{form.clientIds.length} selecionados</span>
            {!readOnly ? (
              <>
                <Button variant="ghost" size="xs" onClick={() => set('clientIds', [...new Set([...form.clientIds, ...visible.map((c) => c.id)])].filter((id) => !form.excludedClientIds.includes(id)))}>
                  Marcar os visíveis
                </Button>
                <Button variant="ghost" size="xs" onClick={() => set('clientIds', [])}>
                  Limpar
                </Button>
              </>
            ) : null}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente específico" className="h-9 pl-9 text-[13px]" />
        </div>
        <ul className="scrollbar-thin max-h-72 overflow-y-auto rounded-lg border border-border p-1">
          {visible.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-9 items-center gap-2.5 rounded-md px-2 text-sm hover:bg-surface-muted">
                <Checkbox
                  disabled={readOnly || form.excludedClientIds.includes(c.id)}
                  checked={form.clientIds.includes(c.id)}
                  onCheckedChange={(on) => set('clientIds', toggle(form.clientIds, c.id, on))}
                  aria-label={c.name}
                />
                <span className="min-w-0 flex-1 truncate text-fg">{c.name}</span>
                <span className="shrink-0 text-caption text-muted">{TAX_REGIME_LABELS[c.taxRegime]}</span>
              </label>
            </li>
          ))}
          {visible.length === 0 ? <li className="px-2 py-3 text-center text-caption text-muted">Nenhum cliente encontrado</li> : null}
        </ul>
        <p className="text-xs text-muted">Somam-se aos regimes.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">Exceções</span>
        {form.excludedClientIds.length ? (
          <ul className="flex flex-col">
            {form.excludedClientIds.map((id) => {
              const c = options.clients.find((x) => x.id === id);
              return (
                <li key={id} className="flex min-h-9 items-center gap-2 rounded-md px-2 hover:bg-surface-muted">
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{c?.name ?? 'Cliente'}</span>
                  <span className="text-caption text-muted">{c ? TAX_REGIME_LABELS[c.taxRegime] : ''}</span>
                  {!readOnly ? (
                    <Button variant="ghost" size="icon-sm" aria-label={`Tirar ${c?.name ?? 'cliente'} das exceções`} onClick={() => set('excludedClientIds', form.excludedClientIds.filter((x) => x !== id))}>
                      <X />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {!readOnly ? (
          showExceptions ? (
            <ClientPicker
              value=""
              onChange={(v) => v && set('excludedClientIds', [...new Set([...form.excludedClientIds, v])])}
              clients={exceptionCandidates}
              placeholder={exceptionCandidates.length ? 'Adicionar cliente às exceções' : 'Escolha um regime antes'}
              disabled={exceptionCandidates.length === 0}
              aria-label="Adicionar exceção"
            />
          ) : (
            <Button variant="ghost" size="sm" className="self-start" onClick={onShowExceptions}>
              <Plus /> Adicionar exceção
            </Button>
          )
        ) : form.excludedClientIds.length === 0 ? (
          <p className="text-body-sm text-subtle">Nenhuma exceção.</p>
        ) : null}
        {errors.excludedClientIds ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.excludedClientIds}
          </p>
        ) : (
          <p className="text-xs text-muted">
            Clientes do regime que não fazem esta obrigação. As tarefas deles ainda não iniciadas, da competência atual em diante, são canceladas; as em andamento continuam.
          </p>
        )}
      </div>

      <p className={cn('text-body-sm', errors.regimes ? 'text-danger' : 'text-fg')} role={errors.regimes ? 'alert' : undefined}>
        {errors.regimes ? (
          errors.regimes
        ) : (
          <>
            Aplica-se a <span className="font-semibold">{summary.total} {summary.total === 1 ? 'cliente ativo' : 'clientes ativos'}</span> em {monthName}: {summary.byRegime} pelo regime, mais{' '}
            {summary.specific} {summary.specific === 1 ? 'específico' : 'específicos'}, menos {summary.exceptions} {summary.exceptions === 1 ? 'exceção' : 'exceções'}.
          </>
        )}
      </p>
    </>
  );
}

interface EndRecurringDialogProps {
  recurring: RecurringTask | null;
  current: MonthKey;
  onOpenChange: (open: boolean) => void;
}

/** "Encerrar" (spec §10.3): the last competence with tasks; the history stays. */
export function EndRecurringDialog({ recurring, current, onOpenChange }: EndRecurringDialogProps) {
  const save = useSaveRecurring();
  const [last, setLast] = useState<MonthKey>(current);
  useEffect(() => {
    if (recurring) setLast(current);
  }, [recurring, current]);
  if (!recurring) return null;
  const after = addMonthKey(last, 1);
  const afterName = competenceName(after);

  async function confirm() {
    if (!recurring) return;
    const previous = recurring.endCompetence;
    try {
      await save.mutateAsync({ id: recurring.id, input: recurringInputOf(recurring, { endCompetence: last }) });
      onOpenChange(false);
      toast(`${recurring.name} encerrada a partir de ${afterName.split(' ')[0]}.`, {
        duration: 6000,
        action: {
          label: 'Desfazer',
          onClick: () => void save.mutateAsync({ id: recurring.id, input: recurringInputOf(recurring, { endCompetence: previous }) }).catch(toastError),
        },
      });
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <Modal
      open
      onOpenChange={onOpenChange}
      title={`Encerrar “${recurring.name}”`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button loading={save.isPending} onClick={() => void confirm()}>
            Encerrar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Última competência">
          <Select value={last} onChange={(e) => setLast(e.target.value)}>
            {competenceOptions(current, 0, 12)
              .filter((m) => m >= recurring.startCompetence)
              .map((m) => (
                <option key={m} value={m}>
                  {formatMonthKey(m)}
                  {m === current ? ' (atual)' : ''}
                </option>
              ))}
          </Select>
        </Field>
        <p className="text-body-sm text-fg">
          A partir de {afterName}, {recurring.name} não gera mais tarefas. {competenceName(last).split(' ')[0]!.replace(/^./, (c) => c.toUpperCase())} e os meses anteriores
          continuam na auditoria e nos relatórios.
        </p>
      </div>
    </Modal>
  );
}
