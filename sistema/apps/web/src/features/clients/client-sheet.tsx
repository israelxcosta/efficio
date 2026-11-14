import { useEffect, useState } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  Building2,
  CloudDownload,
  FileClock,
  Info,
  KeyRound,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import type { z } from 'zod';
import {
  BR_STATES,
  SIMPLES_ACCESS_REGIMES,
  SIMPLES_ANNEXES,
  SIMPLES_ANNEX_LABELS,
  TAX_REGIMES,
  TAX_REGIME_LABELS,
  clientInputSchema,
  clientRegistrationInputSchema,
  formatCEP,
  formatCNPJ,
  formatCPF,
  formatDateBR,
  formatPhone,
  isValidCNPJ,
  onlyDigits,
  type Client,
  type CnpjLookupResult,
  type TaxRegime,
} from '@effinance/shared';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toastError } from '@/lib/notify';
import { WriteGate } from '@/features/auth/permissions';
import { Checkbox } from '@/components/ui/checkbox';
import { useCnpjLookup, useSaveClient, useSaveClientRegistration } from './api';
import { pickRegistration, registrationPatch } from './client-page-logic';
import { ClientDocumentsEditor, type DocumentRowErrors } from './client-documents-editor';
import { SecretInput } from './secret-input';

type FormIn = z.input<typeof clientInputSchema>;
type FormOut = z.output<typeof clientInputSchema>;
type MaskedField = 'document' | 'phone' | 'responsiblePhone' | 'zipCode' | 'responsibleDocument';

const takesSimplesCode = (regime: string | undefined) =>
  (SIMPLES_ACCESS_REGIMES as readonly string[]).includes(regime ?? '');

/** The registration form (`clients`): the PATCH schema plus the annex rule (also checked by the API). */
const registrationFormSchema = clientRegistrationInputSchema.superRefine((v, ctx) => {
  if (v.taxRegime === 'simples_nacional' && !v.simplesAnnex) {
    ctx.addIssue({
      code: 'custom',
      path: ['simplesAnnex'],
      message: 'Selecione o anexo do Simples Nacional',
    });
  }
});
const fullResolver = zodResolver(clientInputSchema);
const registrationBase = zodResolver(registrationFormSchema) as unknown as Resolver<
  FormIn,
  unknown,
  FormOut
>;
/** Validates only the registration fields (the PATCH refuses any other). */
const registrationResolver: Resolver<FormIn, unknown, FormOut> = (values, ctx, options) =>
  registrationBase(pickRegistration(values) as FormIn, ctx, options);

function defaults(c?: Client | null): FormIn {
  return {
    name: c?.name ?? '',
    tradeName: c?.tradeName ?? '',
    document: c?.document ? formatCNPJ(c.document) : '',
    openedAt: c?.openedAt ?? '',
    mainActivity: c?.mainActivity ?? '',
    email: c?.email ?? '',
    phone: c?.phone ? formatPhone(c.phone) : '',
    responsibleName: c?.responsibleName ?? '',
    responsibleEmail: c?.responsibleEmail ?? '',
    responsiblePhone: c?.responsiblePhone ? formatPhone(c.responsiblePhone) : '',
    // No default regime: it has to be confirmed for each company.
    taxRegime: (c?.taxRegime ?? '') as TaxRegime,
    simplesAnnex: c?.simplesAnnex ?? '',
    contractStartDate: c?.contractStartDate ?? '',
    feeDueDay: c?.feeDueDay ?? 10,
    zipCode: c?.zipCode ? formatCEP(c.zipCode) : '',
    street: c?.street ?? '',
    number: c?.number ?? '',
    complement: c?.complement ?? '',
    district: c?.district ?? '',
    city: c?.city ?? '',
    state: c?.state ?? '',
    notes: c?.notes ?? '',
    // Phase 3 (spec §13.8.1): fiscal data, accesses (never prefilled: keep/set/clear) and documents.
    stateRegistration: c?.stateRegistration ?? '',
    stateRegistrationExempt: c?.stateRegistrationExempt ?? false,
    municipalRegistration: c?.municipalRegistration ?? '',
    responsibleDocument: c?.responsibleDocument ? formatCPF(c.responsibleDocument) : '',
    simplesAccessCode: { action: 'keep' },
    accountantPassword: { action: 'keep' },
    documents: (c?.documents ?? []).map((d) => ({
      id: d.id,
      kind: d.kind,
      customName: d.customName ?? '',
      expiresAt: d.expiresAt ?? '',
      note: d.note ?? '',
    })),
  };
}

export function ClientSheet({
  open,
  onOpenChange,
  client,
  mode = 'full',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  client?: Client | null;
  /**
   * `full` (finance): the whole client, PUT. `registration` (the client page with `clients` and
   * without `finance`): registration, contacts, regime and registrations only, PATCH of what changed.
   */
  mode?: 'full' | 'registration';
}) {
  const save = useSaveClient();
  const saveRegistration = useSaveClientRegistration();
  const lookup = useCnpjLookup();
  const [imported, setImported] = useState<CnpjLookupResult | null>(null);
  const full = mode === 'full' || !client;
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: full ? fullResolver : registrationResolver,
    defaultValues: defaults(client),
  });
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState,
    getValues,
    setValue,
    setError,
    clearErrors,
    watch,
  } = form;
  const e = formState.errors;
  const regime = watch('taxRegime');
  const exempt = watch('stateRegistrationExempt');
  const docErrors = (Array.isArray(e.documents) ? e.documents : []) as (
    { [K in keyof DocumentRowErrors]?: { message?: string } } | undefined
  )[];

  useEffect(() => {
    if (open) {
      reset(defaults(client));
      setImported(null);
    } else {
      // Closed without saving: what was typed in the accesses does not stay in the form state.
      setValue('simplesAccessCode', { action: 'keep' });
      setValue('accountantPassword', { action: 'keep' });
    }
  }, [open, client, reset, setValue]);

  const onSubmit = handleSubmit(async (input) => {
    try {
      if (!full && client) {
        const patch = registrationPatch(
          input as Record<string, unknown>,
          formState.dirtyFields as Record<string, unknown>,
        );
        if (Object.keys(patch).length)
          await saveRegistration.mutateAsync({ id: client.id, input: patch });
        toast.success(
          Object.keys(patch).length ? 'Dados do cliente atualizados' : 'Nada foi alterado',
        );
        onOpenChange(false);
        return;
      }
      await save.mutateAsync({ id: client?.id, input });
      // Drops the request (with any typed access) from the mutation cache right away.
      save.reset();
      toast.success(client ? 'Cliente atualizado' : 'Cliente cadastrado');
      onOpenChange(false);
    } catch (error) {
      toastError(error);
    }
  });

  async function importFromReceita() {
    const digits = onlyDigits(getValues('document'));
    if (!isValidCNPJ(digits)) {
      setError('document', { message: digits ? 'CNPJ inválido' : 'Informe o CNPJ para importar' });
      return;
    }
    clearErrors('document');
    try {
      const data = await lookup.mutateAsync(digits);
      const fill = (
        name: Exclude<keyof FormIn, 'taxRegime' | 'simplesAnnex'>,
        value: string | null,
      ) => {
        if (value) setValue(name, value, { shouldDirty: true });
      };
      fill('name', data.name);
      fill('tradeName', data.tradeName);
      fill('openedAt', data.openedAt);
      fill('mainActivity', data.mainActivity);
      fill('email', data.email);
      fill('phone', data.phone ? formatPhone(data.phone) : null);
      fill('zipCode', data.zipCode ? formatCEP(data.zipCode) : null);
      fill('street', data.street);
      fill('number', data.number);
      fill('complement', data.complement);
      fill('district', data.district);
      fill('city', data.city);
      fill('state', data.state);
      if (data.taxRegime) setValue('taxRegime', data.taxRegime, { shouldDirty: true });
      if (data.responsibleName && !getValues('responsibleName'))
        setValue('responsibleName', data.responsibleName, { shouldDirty: true });
      clearErrors();
      setImported(data);
      toast.success('Dados importados da Receita Federal');
    } catch (error) {
      toastError(error);
    }
  }

  const masked = (
    name: MaskedField,
    format: (v: string) => string,
    props: React.InputHTMLAttributes<HTMLInputElement>,
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Input
          {...props}
          value={field.value ?? ''}
          onChange={(ev) => field.onChange(format(ev.target.value))}
          onBlur={field.onBlur}
          ref={field.ref}
        />
      )}
    />
  );

  const situationOk =
    !imported?.registrationStatus || imported.registrationStatus.toUpperCase() === 'ATIVA';

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={!full ? 'Editar dados do cliente' : client ? 'Editar cliente' : 'Novo cliente'}
      description={
        full
          ? 'Empresas atendidas pelo escritório'
          : 'Dados cadastrais, contatos, endereço, regime e inscrições'
      }
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <WriteGate scope={full ? 'finance' : 'tasks'} permission={full ? undefined : 'clients'}>
            <Button
              onClick={onSubmit}
              loading={save.isPending || saveRegistration.isPending}
              className="min-w-[110px]"
            >
              Salvar
            </Button>
          </WriteGate>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          void onSubmit();
        }}
        noValidate
      >
        <p className="eyebrow flex items-center gap-1.5 text-brand-text">
          <Building2 className="size-3.5" /> Dados da empresa
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-document">CNPJ</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            {masked('document', formatCNPJ, {
              id: 'client-document',
              placeholder: '00.000.000/0000-00',
              inputMode: 'numeric',
              className: 'sm:flex-1',
              'aria-invalid': e.document ? true : undefined,
              'aria-describedby': 'client-document-help',
            })}
            <Button
              type="button"
              variant="soft"
              onClick={importFromReceita}
              loading={lookup.isPending}
              className="h-11"
            >
              {lookup.isPending ? null : <CloudDownload />} Importar da Receita
            </Button>
          </div>
          {e.document?.message ? (
            <p id="client-document-help" role="alert" className="text-xs font-medium text-danger">
              {e.document.message}
            </p>
          ) : (
            <p id="client-document-help" className="text-xs text-muted">
              Digite o CNPJ e importe os dados básicos da Receita Federal
            </p>
          )}
        </div>

        {imported ? (
          <div
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-3 text-[13px]',
              situationOk
                ? 'border-brand-200 bg-brand-50 text-fg'
                : 'border-warning/30 bg-warning-soft text-fg',
            )}
            role="status"
          >
            <p className="flex items-center gap-1.5 font-semibold">
              {situationOk ? (
                <Info className="size-4 text-brand-text" />
              ) : (
                <TriangleAlert className="size-4 text-warning" />
              )}
              Receita Federal: situação {imported.registrationStatus ?? 'não informada'}
              {imported.openedAt ? (
                <span className="font-normal text-muted">
                  · aberta em {formatDateBR(imported.openedAt)}
                </span>
              ) : null}
            </p>
            {!imported.taxRegime ? (
              <p className="text-muted">
                A Receita só informa Simples Nacional e MEI. Confirme o regime tributário abaixo.
              </p>
            ) : null}
            {imported.partners.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted">Sócios:</span>
                {imported.partners.slice(0, 6).map((p) => (
                  <button
                    key={`${p.name}-${p.role}`}
                    type="button"
                    className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium hover:border-brand-300 hover:text-brand-text"
                    title={`Usar ${p.name} como responsável`}
                    onClick={() => setValue('responsibleName', p.name, { shouldDirty: true })}
                  >
                    {p.name}
                    {p.role ? <span className="text-muted"> · {p.role}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <Field label="Razão social" error={e.name?.message}>
          <Input placeholder="Razão social da empresa" {...register('name')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome fantasia" hint="Opcional" error={e.tradeName?.message}>
            <Input {...register('tradeName')} />
          </Field>
          <Field label="Data de abertura" hint="Opcional" error={e.openedAt?.message}>
            <Input type="date" {...register('openedAt')} />
          </Field>
        </div>
        <Field label="Atividade principal (CNAE)" hint="Opcional" error={e.mainActivity?.message}>
          <Input placeholder="0000-0/00 — descrição" {...register('mainActivity')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="E-mail da empresa" error={e.email?.message}>
            <Controller
              control={control}
              name="email"
              render={({ field }) => (
                <Input
                  type="email"
                  placeholder="contato@empresa.com.br"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </Field>
          <Field label="Telefone da empresa" error={e.phone?.message}>
            {masked('phone', formatPhone, { placeholder: '(00) 0000-0000', inputMode: 'tel' })}
          </Field>
        </div>

        <p className="eyebrow mt-2 text-brand-text">
          {full ? 'Contrato e tributação' : 'Tributação'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Regime tributário" error={e.taxRegime?.message}>
            <Controller
              control={control}
              name="taxRegime"
              render={({ field }) => (
                <Select
                  value={field.value ?? ''}
                  onChange={(ev) => {
                    field.onChange(ev.target.value);
                    if (ev.target.value !== 'simples_nacional') setValue('simplesAnnex', '');
                    // The Simples access code only exists for Simples Nacional and MEI.
                    if (!takesSimplesCode(ev.target.value))
                      setValue('simplesAccessCode', { action: 'keep' });
                  }}
                >
                  <option value="">Selecione…</option>
                  {TAX_REGIMES.map((r) => (
                    <option key={r} value={r}>
                      {TAX_REGIME_LABELS[r]}
                    </option>
                  ))}
                </Select>
              )}
            />
          </Field>
          {regime === 'simples_nacional' ? (
            <Field label="Anexo do Simples" error={e.simplesAnnex?.message}>
              <Controller
                control={control}
                name="simplesAnnex"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onChange={field.onChange}>
                    <option value="">Selecione…</option>
                    {SIMPLES_ANNEXES.map((a) => (
                      <option key={a} value={a}>
                        {SIMPLES_ANNEX_LABELS[a]}
                      </option>
                    ))}
                  </Select>
                )}
              />
            </Field>
          ) : null}
        </div>
        {full ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Início do contrato"
              error={e.contractStartDate?.message}
              hint={
                client
                  ? 'Alterar a data reposiciona as vigências de honorários'
                  : 'A primeira vigência de honorários começa nesta data'
              }
            >
              <Input type="date" {...register('contractStartDate')} />
            </Field>
            <Field
              label="Vencimento do honorário"
              error={e.feeDueDay?.message}
              hint="No mês seguinte à competência (dia 31 vira o último dia em meses curtos)"
            >
              <Select {...register('feeDueDay', { valueAsNumber: true })}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    Dia {day}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        <p className="eyebrow mt-2 flex items-center gap-1.5 text-brand-text">
          <KeyRound className="size-3.5" /> {full ? 'Inscrições e acessos' : 'Inscrições'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Field label="Inscrição estadual" error={e.stateRegistration?.message}>
              <Controller
                control={control}
                name="stateRegistration"
                render={({ field }) => (
                  <Input
                    placeholder="Ex.: 110.042.490.114"
                    value={exempt ? '' : (field.value ?? '')}
                    disabled={Boolean(exempt)}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </Field>
            <Controller
              control={control}
              name="stateRegistrationExempt"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-body-sm text-fg">
                  <Checkbox
                    checked={Boolean(field.value)}
                    onCheckedChange={(v) => {
                      field.onChange(v);
                      if (v) setValue('stateRegistration', '');
                    }}
                  />
                  Isenta de inscrição estadual
                </label>
              )}
            />
          </div>
          <Field
            label="Inscrição municipal"
            hint="Opcional"
            error={e.municipalRegistration?.message}
          >
            <Input {...register('municipalRegistration')} />
          </Field>
          {full && takesSimplesCode(regime) ? (
            <Controller
              control={control}
              name="simplesAccessCode"
              render={({ field }) => (
                <SecretInput
                  label="Código de acesso do Simples Nacional"
                  hint="Usado no portal do Simples Nacional. Fica cifrado; só quem tem permissão vê."
                  stored={Boolean(client?.credentials.simplesAccessCode)}
                  value={field.value}
                  onChange={field.onChange}
                  error={
                    e.simplesAccessCode?.message ??
                    (e.simplesAccessCode as { value?: { message?: string } } | undefined)?.value
                      ?.message
                  }
                  resetKey={`${client?.id ?? 'new'}-${open}`}
                />
              )}
            />
          ) : null}
          {full ? (
            <Controller
              control={control}
              name="accountantPassword"
              render={({ field }) => (
                <SecretInput
                  label="Senha do contador"
                  hint="Senha do escritório nos portais deste cliente. Fica cifrada; só quem tem permissão vê."
                  stored={Boolean(client?.credentials.accountantPassword)}
                  value={field.value}
                  onChange={field.onChange}
                  error={
                    e.accountantPassword?.message ??
                    (e.accountantPassword as { value?: { message?: string } } | undefined)?.value
                      ?.message
                  }
                  resetKey={`${client?.id ?? 'new'}-${open}`}
                />
              )}
            />
          ) : null}
        </div>

        {full ? (
          <>
            <p className="eyebrow mt-2 flex items-center gap-1.5 text-brand-text">
              <FileClock className="size-3.5" /> Documentos com vencimento
            </p>
            <Controller
              control={control}
              name="documents"
              render={({ field }) => (
                <ClientDocumentsEditor
                  value={field.value ?? []}
                  onChange={field.onChange}
                  errors={docErrors.map((d) =>
                    d
                      ? {
                          kind: d.kind?.message,
                          customName: d.customName?.message,
                          expiresAt: d.expiresAt?.message,
                          note: d.note?.message,
                        }
                      : undefined,
                  )}
                />
              )}
            />
            {e.documents?.message ? (
              <p className="text-xs font-medium text-danger">{e.documents.message}</p>
            ) : null}
          </>
        ) : null}

        <p className="eyebrow mt-2 flex items-center gap-1.5 text-brand-text">
          <UserRound className="size-3.5" /> Responsável
        </p>
        <div className={cn('grid gap-3', full && 'sm:grid-cols-[minmax(0,1fr)_12rem]')}>
          <Field label="Nome" error={e.responsibleName?.message}>
            <Input placeholder="Quem responde pela empresa" {...register('responsibleName')} />
          </Field>
          {full ? (
            <Field
              label="CPF do responsável"
              hint="Usado no contrato de prestação de serviços."
              error={e.responsibleDocument?.message}
            >
              {masked('responsibleDocument', formatCPF, {
                placeholder: '000.000.000-00',
                inputMode: 'numeric',
              })}
            </Field>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="E-mail" error={e.responsibleEmail?.message}>
            <Controller
              control={control}
              name="responsibleEmail"
              render={({ field }) => (
                <Input
                  type="email"
                  placeholder="responsavel@empresa.com.br"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </Field>
          <Field label="Telefone / WhatsApp" error={e.responsiblePhone?.message}>
            {masked('responsiblePhone', formatPhone, {
              placeholder: '(00) 00000-0000',
              inputMode: 'tel',
            })}
          </Field>
        </div>

        <p className="eyebrow mt-2 text-brand-text">Endereço</p>
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
                <Select value={field.value ?? ''} onChange={field.onChange}>
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
        {full ? (
          <Field label="Observações" error={e.notes?.message}>
            <Controller
              control={control}
              name="notes"
              render={({ field }) => (
                <Textarea value={field.value ?? ''} onChange={field.onChange} />
              )}
            />
          </Field>
        ) : (
          <p className="text-caption text-muted">
            Honorários, vigências, contrato, observações, CPF do responsável e acessos ficam com
            quem tem o financeiro. Os documentos têm a própria aba.
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
