import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, CloudDownload, FileSignature, ImageUp, Stamp } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  BR_STATES,
  MAX_OFFICE_IMAGE_BYTES,
  PIX_KEY_TYPES,
  PIX_KEY_TYPE_LABELS,
  formatCEP,
  formatCNPJ,
  formatCPF,
  formatDateBR,
  formatPhone,
  isValidCNPJ,
  officeInputSchema,
  onlyDigits,
  type Office,
  type PixKeyType,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, Label } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { WriteGate } from '@/features/auth/permissions';
import { Cell, TabGrid } from '@/features/settings/tabs/layout';
import { useCnpjLookup } from '@/features/clients/api';
import { ApiRequestError } from '@/lib/api';
import { checkImageFile, pickImage, readAsDataUrl } from '@/lib/image';
import { toastError } from '@/lib/notify';
import { useOffice, useRemoveOfficeLogo, useSaveOffice, useSaveOfficeLogo } from '../api';

type FormIn = z.input<typeof officeInputSchema>;
type FormOut = z.output<typeof officeInputSchema>;
type MaskedField = 'document' | 'phone' | 'responsiblePhone' | 'zipCode' | 'responsibleDocument';

function pixDisplay(type: PixKeyType | null, key: string | null): string {
  if (!key) return '';
  if (type === 'cnpj') return formatCNPJ(key);
  if (type === 'cpf') return formatCPF(key);
  if (type === 'phone') return formatPhone(key.replace(/^\+55/, ''));
  return key;
}

function defaults(o?: Office | null): FormIn {
  return {
    document: o?.document ? formatCNPJ(o.document) : '',
    legalName: o?.legalName ?? '',
    tradeName: o?.tradeName ?? '',
    stateRegistration: o?.stateRegistration ?? '',
    municipalRegistration: o?.municipalRegistration ?? '',
    zipCode: o?.zipCode ? formatCEP(o.zipCode) : '',
    street: o?.street ?? '',
    number: o?.number ?? '',
    complement: o?.complement ?? '',
    district: o?.district ?? '',
    city: o?.city ?? '',
    state: o?.state ?? '',
    phone: o?.phone ? formatPhone(o.phone) : '',
    email: o?.email ?? '',
    website: o?.website ?? '',
    responsibleName: o?.responsibleName ?? '',
    responsibleDocument: o?.responsibleDocument ? formatCPF(o.responsibleDocument) : '',
    responsibleEmail: o?.responsibleEmail ?? '',
    responsiblePhone: o?.responsiblePhone ? formatPhone(o.responsiblePhone) : '',
    pixKeyType: o?.pixKeyType ?? null,
    pixKey: pixDisplay(o?.pixKeyType ?? null, o?.pixKey ?? null),
  };
}

/** Configurações › Escritório (spec §13.9, `office`): the registry, the logo and the contract template. */
export function OfficeTab() {
  const office = useOffice(true);
  if (office.isError) return <ErrorState error={office.error} onRetry={() => office.refetch()} />;
  return (
    <TabGrid>
      <Cell wide>{office.data ? <OfficeForm office={office.data} /> : <Card className="p-6"><SkeletonRows rows={6} /></Card>}</Cell>
      <Cell>
        <LogoCard office={office.data} />
      </Cell>
      <Cell>
        <ContractTemplateCard office={office.data} />
      </Cell>
    </TabGrid>
  );
}

const group = 'text-body-sm font-semibold text-fg';

function OfficeForm({ office }: { office: Office }) {
  const save = useSaveOffice();
  const lookup = useCnpjLookup();
  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(officeInputSchema), defaultValues: defaults(office) });
  const { register, control, handleSubmit, reset, formState, getValues, setValue, setError, clearErrors, watch } = form;
  const e = formState.errors;
  const pixType = watch('pixKeyType');
  useEffect(() => reset(defaults(office)), [office, reset]);

  const onSubmit = handleSubmit(async (input) => {
    try {
      await save.mutateAsync(input);
      toast.success('Dados do escritório salvos.');
    } catch (error) {
      if (error instanceof ApiRequestError && Object.keys(error.fieldErrors()).length) {
        for (const [k, m] of Object.entries(error.fieldErrors())) setError(k as keyof FormIn, { message: m });
      } else toastError(error);
    }
  });

  async function importFromReceita() {
    const digits = onlyDigits(getValues('document'));
    if (!isValidCNPJ(digits)) {
      setError('document', { message: digits ? 'CNPJ inválido.' : 'Informe o CNPJ do escritório.' });
      return;
    }
    clearErrors('document');
    try {
      const data = await lookup.mutateAsync(digits);
      const fill = (name: 'legalName' | 'tradeName' | 'email' | 'phone' | 'zipCode' | 'street' | 'number' | 'complement' | 'district' | 'city' | 'state' | 'responsibleName', value: string | null) => {
        if (value) setValue(name, value, { shouldDirty: true });
      };
      fill('legalName', data.name);
      fill('tradeName', data.tradeName);
      fill('email', data.email);
      fill('phone', data.phone ? formatPhone(data.phone) : null);
      fill('zipCode', data.zipCode ? formatCEP(data.zipCode) : null);
      fill('street', data.street);
      fill('number', data.number);
      fill('complement', data.complement);
      fill('district', data.district);
      fill('city', data.city);
      fill('state', data.state);
      if (!getValues('responsibleName')) fill('responsibleName', data.responsibleName);
      toast.success('Dados importados da Receita Federal.');
    } catch (error) {
      toastError(error);
    }
  }

  const masked = (name: MaskedField, format: (v: string) => string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <Input {...props} value={field.value ?? ''} onChange={(ev) => field.onChange(format(ev.target.value))} onBlur={field.onBlur} ref={field.ref} />}
    />
  );

  const pixPlaceholder: Record<PixKeyType, string> = {
    cnpj: '00.000.000/0000-00',
    cpf: '000.000.000-00',
    email: 'financeiro@escritorio.com.br',
    phone: '(00) 00000-0000',
    random: '00000000-0000-0000-0000-000000000000',
  };
  const pixFormat = (v: string) => (pixType === 'cnpj' ? formatCNPJ(v) : pixType === 'cpf' ? formatCPF(v) : pixType === 'phone' ? formatPhone(v) : v);

  return (
    <Card className="p-6">
      <CardHeader title="Dados do escritório" subtitle="Aparecem no contrato, nos relatórios em PDF e na mensagem de cobrança." icon={<Stamp />} />
      <form
        className="mt-5 flex flex-col gap-6"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          void onSubmit();
        }}
      >
        <section className="flex flex-col gap-3">
          <h3 className={group}>Identificação</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="office-document">CNPJ*</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                {masked('document', formatCNPJ, { id: 'office-document', placeholder: '00.000.000/0000-00', inputMode: 'numeric', className: 'sm:flex-1', 'aria-invalid': e.document ? true : undefined })}
                <Button type="button" variant="soft" onClick={importFromReceita} loading={lookup.isPending} className="h-11">
                  {lookup.isPending ? null : <CloudDownload />} Importar da Receita
                </Button>
              </div>
              {e.document?.message ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {e.document.message}
                </p>
              ) : null}
            </div>
            <Field label="Razão social*" error={e.legalName?.message}>
              <Input {...register('legalName')} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nome fantasia" error={e.tradeName?.message}>
              <Input {...register('tradeName')} />
            </Field>
            <Field label="Inscrição estadual" error={e.stateRegistration?.message}>
              <Input {...register('stateRegistration')} />
            </Field>
            <Field label="Inscrição municipal" error={e.municipalRegistration?.message}>
              <Input {...register('municipalRegistration')} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className={group}>Endereço</h3>
          <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)_120px]">
            <Field label="CEP" error={e.zipCode?.message}>
              {masked('zipCode', formatCEP, { placeholder: '00000-000', inputMode: 'numeric' })}
            </Field>
            <Field label="Logradouro" error={e.street?.message}>
              <Input placeholder="Rua, avenida…" {...register('street')} />
            </Field>
            <Field label="Número" error={e.number?.message}>
              <Input {...register('number')} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_110px]">
            <Field label="Complemento" error={e.complement?.message}>
              <Input placeholder="Sala, andar…" {...register('complement')} />
            </Field>
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
        </section>

        <section className="flex flex-col gap-3">
          <h3 className={group}>Contato</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Telefone" error={e.phone?.message}>
              {masked('phone', formatPhone, { placeholder: '(00) 0000-0000', inputMode: 'tel' })}
            </Field>
            <Field label="E-mail" error={e.email?.message}>
              <Input type="email" {...register('email')} />
            </Field>
            <Field label="Site" error={e.website?.message}>
              <Input {...register('website')} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className={group}>Responsável</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Nome*" error={e.responsibleName?.message}>
              <Input {...register('responsibleName')} />
            </Field>
            <Field label="CPF*" hint="Assina o contrato pelo escritório." error={e.responsibleDocument?.message}>
              {masked('responsibleDocument', formatCPF, { placeholder: '000.000.000-00', inputMode: 'numeric' })}
            </Field>
            <Field label="E-mail" error={e.responsibleEmail?.message}>
              <Input type="email" {...register('responsibleEmail')} />
            </Field>
            <Field label="Telefone" error={e.responsiblePhone?.message}>
              {masked('responsiblePhone', formatPhone, { placeholder: '(00) 00000-0000', inputMode: 'tel' })}
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className={group}>Cobrança</h3>
          <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <Field label="Tipo da chave Pix" error={e.pixKeyType?.message}>
              <Controller
                control={control}
                name="pixKeyType"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onChange={(ev) => {
                      field.onChange(ev.target.value || null);
                      setValue('pixKey', '');
                    }}
                  >
                    <option value="">Sem chave Pix</option>
                    {PIX_KEY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {PIX_KEY_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                )}
              />
            </Field>
            <Field label="Chave Pix" hint="Aparece no contrato e na mensagem de cobrança." error={e.pixKey?.message}>
              <Controller
                control={control}
                name="pixKey"
                render={({ field }) => (
                  <Input
                    value={field.value ?? ''}
                    disabled={!pixType}
                    placeholder={pixType ? pixPlaceholder[pixType] : 'Escolha o tipo da chave'}
                    onChange={(ev) => field.onChange(pixFormat(ev.target.value))}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-caption text-muted">
            {office.updatedAt ? `Atualizado${office.updatedBy ? ` por ${office.updatedBy.name}` : ''} em ${formatDateBR(office.updatedAt.slice(0, 10))}.` : 'Ainda não cadastrado.'}
          </p>
          <WriteGate scope="tasks" permission="office">
            <Button type="submit" loading={save.isPending}>
              Salvar dados do escritório
            </Button>
          </WriteGate>
        </div>
      </form>
    </Card>
  );
}

function LogoCard({ office }: { office: Office | undefined }) {
  const saveLogo = useSaveOfficeLogo();
  const removeLogo = useRemoveOfficeLogo();
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    const file = await pickImage();
    if (!file) return;
    const check = checkImageFile(file, MAX_OFFICE_IMAGE_BYTES, 'A logo passa de 500 KB.');
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    try {
      await saveLogo.mutateAsync(await readAsDataUrl(file));
      toast.success('Logo atualizada.');
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 400) setError(err.message);
      else toastError(err);
    }
  }

  return (
    <Card className="p-6">
      <CardHeader title="Logo" subtitle="PNG, JPG ou WebP de até 500 KB. Aparece no contrato e nos PDFs." icon={<ImageUp />} />
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-muted">
          {!office ? (
            <Skeleton className="h-full w-full" />
          ) : office.logo ? (
            <img src={office.logo} alt="Logo do escritório" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-body-sm text-subtle">Sem logo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <WriteGate scope="tasks" permission="office">
            <Button variant="outline" size="sm" onClick={() => void upload()} loading={saveLogo.isPending} disabled={!office}>
              {office?.logo ? 'Trocar logo' : 'Enviar logo'}
            </Button>
          </WriteGate>
          {office?.logo ? (
            <WriteGate scope="tasks" permission="office">
              <Button
                variant="ghost"
                size="sm"
                loading={removeLogo.isPending}
                onClick={async () => {
                  try {
                    await removeLogo.mutateAsync();
                    toast.success('Logo removida.');
                  } catch (err) {
                    toastError(err);
                  }
                }}
              >
                Remover
              </Button>
            </WriteGate>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <p className="mt-3 text-caption text-muted">A logo não substitui a marca Efficio no menu.</p>
    </Card>
  );
}

/** "Modelo de contrato" (spec §13.9): the situation, the watermark and the way to the editor. */
function ContractTemplateCard({ office }: { office: Office | undefined }) {
  const c = office?.contract;
  const situation = !c
    ? null
    : c.source === 'factory'
      ? c.updatedAt
        ? `Modelo de fábrica · restaurado${c.updatedBy ? ` por ${c.updatedBy.name}` : ''} em ${formatDateBR(c.updatedAt.slice(0, 10))}`
        : 'Modelo de fábrica, nunca editado'
      : `Modelo próprio${c.updatedBy ? ` · editado por ${c.updatedBy.name}` : ''}${c.updatedAt ? ` em ${formatDateBR(c.updatedAt.slice(0, 10))}` : ''}`;
  const watermark = !c ? null : `Marca d'água: ${c.watermark.enabled ? `ligada, ${c.watermark.source === 'factory' ? 'a de fábrica' : 'própria'}` : 'desligada'}`;
  const missing = office?.missingForContract ?? [];
  return (
    <Card className="flex flex-col p-6">
      <CardHeader title="Modelo de contrato" subtitle="Um modelo para todos os clientes. O sistema preenche os dados do cliente, do escritório e do honorário." icon={<FileSignature />} />
      <div className="mt-5 flex flex-1 flex-col gap-1.5 text-body-sm">
        {c ? (
          <>
            <p className="font-medium text-fg">{situation}</p>
            <p className="text-muted">{watermark}</p>
          </>
        ) : (
          <SkeletonRows rows={2} />
        )}
        {missing.length ? (
          <p className="mt-2 flex items-start gap-2 text-body-sm text-fg">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            Faltam dados do escritório para gerar contratos: {missing.join(', ')}.
          </p>
        ) : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link to="/configuracoes/contrato">Editar modelo</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/configuracoes/contrato?visao=previa">Pré-visualizar</Link>
        </Button>
      </div>
    </Card>
  );
}
