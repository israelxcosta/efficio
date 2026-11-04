import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CloudDownload, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  BR_STATES,
  MONTH_NAMES,
  TAX_REGIME_LABELS,
  formatCEP,
  formatCNPJ,
  formatDateBR,
  formatPhone,
  isValidCNPJ,
  onlyDigits,
  unionInputSchema,
  type TaskOptionsResponse,
  type UnionDetail,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ADMIN_ONLY_REASON, usePermissions, WriteGate } from '@/features/auth/permissions';
import { useCnpjLookup } from '@/features/clients/api';
import { useTaskOptions } from '@/features/tasks/api';
import { ApiRequestError } from '@/lib/api';
import { toastError } from '@/lib/notify';
import { isUuid } from '@/lib/safe-url';
import { cn, pluralize } from '@/lib/utils';
import { useSaveUnion, useUnion } from '../api';

type FormIn = z.input<typeof unionInputSchema>;
type FormOut = z.output<typeof unionInputSchema>;
type MaskedField = 'document' | 'phone' | 'responsiblePhone' | 'zipCode';

function defaults(u?: UnionDetail | null): FormIn {
  return {
    name: u?.name ?? '',
    document: u?.document ? formatCNPJ(u.document) : '',
    acronym: u?.acronym ?? '',
    category: u?.category ?? '',
    territory: u?.territory ?? '',
    zipCode: u?.zipCode ? formatCEP(u.zipCode) : '',
    street: u?.street ?? '',
    number: u?.number ?? '',
    complement: u?.complement ?? '',
    district: u?.district ?? '',
    city: u?.city ?? '',
    state: u?.state ?? '',
    phone: u?.phone ? formatPhone(u.phone) : '',
    email: u?.email ?? '',
    website: u?.website ?? '',
    responsibleName: u?.responsibleName ?? '',
    responsibleRole: u?.responsibleRole ?? '',
    responsibleEmail: u?.responsibleEmail ?? '',
    responsiblePhone: u?.responsiblePhone ? formatPhone(u.responsiblePhone) : '',
    baseMonth: u?.baseMonth ?? null,
    notes: u?.notes ?? '',
    active: u?.active ?? true,
    clientIds: u?.clients.map((c) => c.id) ?? [],
  };
}

const groupTitle = 'text-body-sm font-semibold text-fg';

/**
 * Union registry (spec §13.7): `?sindicato=novo` creates, `?sindicato=<id>` edits (or shows, without
 * `registry`). The agreement cycles have their own dialog and request: saving here never erases them.
 */
export function UnionSheet({ param, onClose, onCycles }: { param: string | null; onClose: () => void; onCycles: (id: string) => void }) {
  const isNew = param === 'novo';
  const id = isUuid(param) ? param : null;
  const open = isNew || id !== null;
  const detail = useUnion(id);
  const union = id ? detail.data : null;
  const { can } = usePermissions();
  const readOnly = !can('registry');
  const options = useTaskOptions({ enabled: open });
  const save = useSaveUnion();
  const lookup = useCnpjLookup();
  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(unionInputSchema), defaultValues: defaults(null) });
  const { register, control, handleSubmit, reset, formState, getValues, setValue, setError, clearErrors, watch } = form;
  const e = formState.errors;

  useEffect(() => {
    if (open) reset(defaults(union ?? null));
  }, [open, union, reset]);

  const onSubmit = handleSubmit(async (input) => {
    try {
      const saved = await save.mutateAsync({ id: id ?? undefined, input });
      toast.success(id ? 'Sindicato atualizado.' : 'Sindicato cadastrado.');
      onClose();
      if (!id && saved.baseMonth) toast.info('Marque as convenções já publicadas em "Convenções coletivas…".', { id: 'union-cycles-hint' });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) setError('document', { message: 'Já existe um sindicato com este CNPJ.' });
      else if (error instanceof ApiRequestError && Object.keys(error.fieldErrors()).length) {
        for (const [k, m] of Object.entries(error.fieldErrors())) setError(k as keyof FormIn, { message: m });
      } else toastError(error);
    }
  });

  async function importFromReceita() {
    const digits = onlyDigits(getValues('document'));
    if (!isValidCNPJ(digits)) {
      setError('document', { message: digits ? 'CNPJ inválido.' : 'Informe o CNPJ do sindicato.' });
      return;
    }
    clearErrors('document');
    try {
      const data = await lookup.mutateAsync(digits);
      const fill = (name: 'name' | 'email' | 'phone' | 'zipCode' | 'street' | 'number' | 'complement' | 'district' | 'city' | 'state', value: string | null) => {
        if (value) setValue(name, value, { shouldDirty: true });
      };
      fill('name', data.name);
      fill('email', data.email);
      fill('phone', data.phone ? formatPhone(data.phone) : null);
      fill('zipCode', data.zipCode ? formatCEP(data.zipCode) : null);
      fill('street', data.street);
      fill('number', data.number);
      fill('complement', data.complement);
      fill('district', data.district);
      fill('city', data.city);
      fill('state', data.state);
      toast.success('Dados importados da Receita Federal.');
    } catch (error) {
      toastError(error);
    }
  }

  const masked = (name: MaskedField, format: (v: string) => string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Input {...props} disabled={readOnly} value={field.value ?? ''} onChange={(ev) => field.onChange(format(ev.target.value))} onBlur={field.onBlur} ref={field.ref} />
      )}
    />
  );

  const title = isNew ? 'Novo sindicato' : readOnly ? (union?.acronym ?? union?.name ?? 'Sindicato') : 'Editar sindicato';
  const loading = id !== null && detail.isPending;
  const missing = id !== null && detail.isError && detail.error instanceof ApiRequestError && detail.error.status === 404;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description="Dados da entidade, data-base e os clientes cujos empregados seguem esta convenção."
      width="lg"
      footer={
        readOnly ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-muted">{ADMIN_ONLY_REASON}</p>
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <WriteGate scope="admin">
              <Button onClick={onSubmit} loading={save.isPending} disabled={loading || missing}>
                Salvar sindicato
              </Button>
            </WriteGate>
          </>
        )
      }
    >
      {loading ? (
        <SkeletonRows rows={6} />
      ) : missing ? (
        <EmptyState icon={<SearchX />} title="Sindicato não encontrado" description="Ele pode ter sido excluído." />
      ) : id !== null && detail.isError ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : (
        <form
          className="flex flex-col gap-6"
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!readOnly) void onSubmit();
          }}
        >
          <fieldset className="flex flex-col gap-3" disabled={readOnly}>
            <legend className={groupTitle}>Identificação</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="union-document">CNPJ*</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                {masked('document', formatCNPJ, {
                  id: 'union-document',
                  placeholder: '00.000.000/0000-00',
                  inputMode: 'numeric',
                  className: 'sm:flex-1',
                  'aria-invalid': e.document ? true : undefined,
                  'aria-describedby': 'union-document-help',
                })}
                {!readOnly ? (
                  <Button type="button" variant="soft" onClick={importFromReceita} loading={lookup.isPending} className="h-11">
                    {lookup.isPending ? null : <CloudDownload />} Importar da Receita
                  </Button>
                ) : null}
              </div>
              {e.document?.message ? (
                <p id="union-document-help" role="alert" className="text-xs font-medium text-danger">
                  {e.document.message}
                </p>
              ) : !readOnly ? (
                <p id="union-document-help" className="text-xs text-muted">
                  Importa nome, endereço, telefone e e-mail da Receita Federal.
                </p>
              ) : null}
            </div>
            <Field label="Nome do sindicato*" error={e.name?.message}>
              <Input placeholder="Ex.: Sindicato dos Comerciários de Mogi Guaçu" {...register('name')} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <Field label="Sigla" error={e.acronym?.message}>
                <Input placeholder="Ex.: SINDCOM" {...register('acronym')} />
              </Field>
              <Field label="Categoria representada" error={e.category?.message}>
                <Input placeholder="Ex.: Comerciários" {...register('category')} />
              </Field>
            </div>
            <Field label="Base territorial" error={e.territory?.message}>
              <Input placeholder="Ex.: Mogi Guaçu e região" {...register('territory')} />
            </Field>
          </fieldset>

          <fieldset className="flex flex-col gap-3" disabled={readOnly}>
            <legend className={groupTitle}>Convenção coletiva</legend>
            <Field
              label="Mês da data-base"
              error={e.baseMonth?.message}
              hint="A data-base se repete todo ano: o vencimento é o dia 1º deste mês, no ano da convenção acompanhada. Sem o mês, o sindicato não entra nos alertas."
            >
              <Controller
                control={control}
                name="baseMonth"
                render={({ field }) => (
                  <Select value={field.value ? String(field.value) : ''} disabled={readOnly} onChange={(ev) => field.onChange(ev.target.value ? Number(ev.target.value) : null)} wrapperClassName="sm:max-w-60">
                    <option value="">Não definido</option>
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={String(i + 1)}>
                        {m}
                      </option>
                    ))}
                  </Select>
                )}
              />
            </Field>
            {union ? (
              <p className="text-body-sm text-muted">
                {union.tracked ? (
                  <>
                    Acompanhando a Convenção Coletiva {union.tracked.label}, que vence em {formatDateBR(union.tracked.dueDate)}.{' '}
                  </>
                ) : null}
                <button type="button" className="font-semibold text-brand-text underline-offset-4 hover:underline" onClick={() => onCycles(union.id)}>
                  Convenções coletivas…
                </button>
              </p>
            ) : null}
          </fieldset>

          <section className="flex flex-col gap-3">
            <h3 className={groupTitle}>Clientes vinculados</h3>
            <Controller
              control={control}
              name="clientIds"
              render={({ field }) => (
                <UnionClientsPicker value={field.value ?? []} onChange={field.onChange} options={options.data} disabled={readOnly} linked={union?.clients ?? []} />
              )}
            />
            <p className="text-caption text-muted">
              Clientes cujos empregados seguem esta convenção. O alerta mostra quantos clientes cada convenção afeta, e a ficha do cliente mostra os sindicatos dele.
            </p>
          </section>

          <fieldset className="flex flex-col gap-3" disabled={readOnly}>
            <legend className={groupTitle}>Endereço</legend>
            <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
              <Field label="CEP" error={e.zipCode?.message}>
                {masked('zipCode', formatCEP, { placeholder: '00000-000', inputMode: 'numeric' })}
              </Field>
              <Field label="Logradouro" error={e.street?.message}>
                <Input placeholder="Rua, avenida…" {...register('street')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
              <Field label="Número" error={e.number?.message}>
                <Input {...register('number')} />
              </Field>
              <Field label="Complemento" error={e.complement?.message}>
                <Input placeholder="Sala, andar…" {...register('complement')} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px]">
              <Field label="Bairro" error={e.district?.message}>
                <Input {...register('district')} />
              </Field>
              <Field label="Cidade" error={e.city?.message}>
                <Input {...register('city')} />
              </Field>
              <Field label="UF" error={e.state?.message}>
                <Controller
                  control={control}
                  name="state"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onChange={field.onChange} disabled={readOnly}>
                      <option value="">—</option>
                      {BR_STATES.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3" disabled={readOnly}>
            <legend className={groupTitle}>Contato e responsável</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Telefone" error={e.phone?.message}>
                {masked('phone', formatPhone, { placeholder: '(00) 0000-0000', inputMode: 'tel' })}
              </Field>
              <Field label="E-mail" error={e.email?.message}>
                <Input type="email" {...register('email')} />
              </Field>
            </div>
            <Field label="Site" error={e.website?.message}>
              <Input placeholder="www.sindicato.org.br" {...register('website')} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Responsável" error={e.responsibleName?.message}>
                <Input {...register('responsibleName')} />
              </Field>
              <Field label="Cargo" error={e.responsibleRole?.message}>
                <Input placeholder="Ex.: Presidente" {...register('responsibleRole')} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="E-mail do responsável" error={e.responsibleEmail?.message}>
                <Input type="email" {...register('responsibleEmail')} />
              </Field>
              <Field label="Telefone do responsável" error={e.responsiblePhone?.message}>
                {masked('responsiblePhone', formatPhone, { placeholder: '(00) 00000-0000', inputMode: 'tel' })}
              </Field>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3" disabled={readOnly}>
            <legend className="sr-only">Observações e situação</legend>
            <Field label="Observações" error={e.notes?.message}>
              <Textarea rows={3} {...register('notes')} />
            </Field>
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="union-active">Sindicato ativo</Label>
                    <p className="text-caption text-muted">Inativo sai dos alertas e da lista padrão; o histórico fica.</p>
                  </div>
                  <Switch id="union-active" checked={field.value !== false} onCheckedChange={field.onChange} disabled={readOnly} />
                </div>
              )}
            />
          </fieldset>
          <button type="submit" hidden />
        </form>
      )}
    </Sheet>
  );
}

const ALL = '';

/** The linked clients: a filter by department responsible, a search and the checkbox list. */
function UnionClientsPicker({
  value,
  onChange,
  options,
  disabled,
  linked,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  options: TaskOptionsResponse | undefined;
  disabled: boolean;
  linked: { id: string; name: string; legalName: string; taxRegime: UnionDetail['clients'][number]['taxRegime']; status: string }[];
}) {
  const [dept, setDept] = useState(ALL);
  const [search, setSearch] = useState('');
  const selected = useMemo(() => new Set(value), [value]);
  const rows = useMemo(() => {
    const all = options?.clients ?? [];
    // Active clients, plus the inactive ones still linked (so they can be unlinked).
    const base = all.filter((c) => c.status === 'active' || selected.has(c.id));
    for (const l of linked) if (!base.some((c) => c.id === l.id)) base.push({ id: l.id, name: l.name, legalName: l.legalName, taxRegime: l.taxRegime, status: l.status as 'active', contractStartDate: '', inactivatedAt: null });
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return base
      .filter((c) => !dept || options?.clientResponsibles.some((r) => r.clientId === c.id && r.departmentId === dept))
      .filter((c) => !q || c.name.toLocaleLowerCase('pt-BR').includes(q) || c.legalName.toLocaleLowerCase('pt-BR').includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [options, selected, linked, search, dept]);
  const responsibleOf = (clientId: string) => (dept ? options?.clientResponsibles.find((r) => r.clientId === clientId && r.departmentId === dept)?.user.name : undefined);
  const deptName = options?.departments.find((d) => d.id === dept)?.name;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Select size_="sm" aria-label="Mostrar" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value={ALL}>Todos os clientes ativos</option>
          {(options?.departments ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              Com responsável no {d.name}
            </option>
          ))}
        </Select>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" className="h-9 rounded-[10px] text-[13px]" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-body-sm">
        <span className="tabular text-muted">{pluralize(value.length, 'selecionado', 'selecionados')}</span>
        {!disabled ? (
          <span className="ml-auto flex gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...new Set([...value, ...rows.map((r) => r.id)])])} disabled={!rows.length}>
              Marcar os visíveis
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])} disabled={!value.length}>
              Limpar
            </Button>
          </span>
        ) : null}
      </div>
      <ul className="scrollbar-thin max-h-72 overflow-y-auto rounded-lg border border-border">
        {!options ? (
          <li className="p-3">
            <SkeletonRows rows={3} />
          </li>
        ) : rows.length === 0 ? (
          <li className="p-4 text-center text-body-sm text-muted">{search || dept ? 'Nenhum cliente com esse filtro.' : 'Nenhum cliente ativo.'}</li>
        ) : (
          rows.map((c) => {
            const id = `union-client-${c.id}`;
            const responsible = responsibleOf(c.id);
            return (
              <li key={c.id} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
                <Checkbox
                  id={id}
                  checked={selected.has(c.id)}
                  disabled={disabled}
                  onCheckedChange={(v) => onChange(v ? [...value, c.id] : value.filter((x) => x !== c.id))}
                />
                <label htmlFor={id} className={cn('min-w-0 flex-1', disabled ? 'cursor-default' : 'cursor-pointer')}>
                  <span className={cn('block truncate text-sm', c.status === 'active' ? 'text-fg' : 'text-muted')}>
                    {c.name}
                    {c.status !== 'active' ? ' · inativo' : ''}
                  </span>
                  <span className="block truncate text-caption text-muted">
                    {TAX_REGIME_LABELS[c.taxRegime]}
                    {responsible ? ` · ${responsible} (${deptName})` : ''}
                  </span>
                </label>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
