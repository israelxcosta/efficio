import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { ExternalLink } from 'lucide-react';
import type { z } from 'zod';
import {
  ONBOARDING_DEPARTMENT_LABELS,
  ONBOARDING_DEPARTMENTS,
  ONBOARDING_SUGGESTED_PARAMS,
  formatOfficeAddress,
  formatPhone,
  type onboardingParamsSchema,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { HelpTip } from '@/components/ui/help-tip';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useOffice } from '@/features/office/api';
import { cn } from '@/lib/utils';
import { safeLogo } from '../onboarding-logic';

export type ParamsIn = z.input<typeof onboardingParamsSchema>;
export type ParamsOut = z.output<typeof onboardingParamsSchema>;
type Form = UseFormReturn<ParamsIn, unknown, ParamsOut>;

/** "sugestão": the factory value is a suggestion the owner has not confirmed yet. */
function Suggestion({ name }: { name: string }) {
  if (!ONBOARDING_SUGGESTED_PARAMS.includes(name)) return null;
  return (
    <Badge tone="warning" title="Valor sugerido, ainda não confirmado">
      sugestão
    </Badge>
  );
}

function Group({ title, help, children }: { title: string; help?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="inline-flex items-center gap-1 text-sm font-semibold text-fg">
        {title}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </h3>
      {children}
    </section>
  );
}

/** Name, phone, e-mail, site, address and logo of the office registry (read only here). */
function RegistryContact() {
  const office = useOffice(true);
  if (!office.data) return <Skeleton className="h-24 w-full" />;
  const o = office.data;
  const logo = safeLogo(o.logo);
  const rows: [string, string | null][] = [
    ['Nome', o.tradeName?.trim() ? o.tradeName : o.legalName],
    ['Telefone', o.phone ? formatPhone(o.phone) : null],
    ['E-mail', o.email],
    ['Site', o.website],
    ['Endereço', formatOfficeAddress(o)],
  ];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted p-4 sm:flex-row sm:items-start">
      <div className="flex h-16 w-40 shrink-0 items-center justify-center rounded-lg border border-border bg-white p-2">
        {logo ? (
          <img src={logo} alt="Logo do escritório" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-caption text-muted">Sem logo</span>
        )}
      </div>
      <dl className="grid flex-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className={cn('flex min-w-0 gap-2', label === 'Endereço' && 'sm:col-span-2')}>
            <dt className="shrink-0 text-muted">{label}</dt>
            <dd className="min-w-0 font-medium break-words text-fg">{value?.trim() ? value : '—'}</dd>
          </div>
        ))}
      </dl>
      <Link
        to="/configuracoes?aba=escritorio"
        className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        Editar no cadastro do escritório <ExternalLink className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

const SUBJECTS: { key: keyof ParamsIn['subjects']; label: string }[] = [
  { key: 'statements', label: 'Extratos bancários' },
  { key: 'invoices', label: 'Notas fiscais' },
  { key: 'payrollVariables', label: 'Variáveis da folha' },
  { key: 'admission', label: 'Registro de empregado' },
  { key: 'vacation', label: 'Férias' },
  { key: 'termination', label: 'Rescisão' },
];

const RULES: { key: keyof ParamsIn['rules']; label: string; help: string }[] = [
  {
    key: 'admissionExamByClient',
    label: 'Exame admissional agendado pelo cliente',
    help: 'Desligado: o escritório agenda o exame (ASO).',
  },
  {
    key: 'terminationRequestFirst',
    label: 'Rescisão: o cliente pede ao escritório antes de comunicar o empregado',
    help: 'Desligado: o cliente avisa no dia do aviso.',
  },
  {
    key: 'unionAssistance',
    label: 'Homologação/assistência sindical feita pelo escritório',
    help: 'Quando a convenção coletiva exige. Desligado: o cliente agenda; o escritório envia os documentos.',
  },
  {
    key: 'payrollAdvance',
    label: 'Adiantamento quinzenal na folha',
    help: 'Ligado: a tabela de Pessoal mostra o adiantamento do dia 20.',
  },
];

/** Configurações › Onboarding: the onboarding parameters (contact, e-mails, subjects, deadlines, rules). */
export function OnboardingParamsCard({ form, readOnly }: { form: Form; readOnly: boolean }) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const num = { setValueAs: (v: string) => (v === '' ? undefined : Number(v)) };
  const d = errors.deadlines;

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <CardHeader
        title="Parâmetros do onboarding"
        info="Valem para todos os clientes. Os textos do modelo usam estes dados por marcadores: mudar um parâmetro muda o documento sem reescrever texto."
      />
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-5">
        <Group title="Contato" help="Nome, telefone, e-mail, site, endereço e logo vêm do cadastro do escritório.">
          <RegistryContact />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="WhatsApp de atendimento" error={errors.contact?.whatsapp?.message}>
              <Input inputMode="tel" placeholder="(00) 00000-0000" {...register('contact.whatsapp')} />
            </Field>
            <Field label="Horário de atendimento" error={errors.contact?.hours?.message}>
              <Input placeholder="Segunda a sexta, das 8h às 18h" {...register('contact.hours')} />
            </Field>
            <Field label="CRC" error={errors.contact?.crc?.message}>
              <Input placeholder="SP-000000/O-0" {...register('contact.crc')} />
            </Field>
          </div>
        </Group>

        <Group title="E-mails por departamento" help="Para onde o cliente envia cada documento.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fiscal" error={errors.emails?.fiscal?.message}>
              <Input type="email" {...register('emails.fiscal')} />
            </Field>
            <Field label="Pessoal" error={errors.emails?.personnel?.message}>
              <Input type="email" {...register('emails.personnel')} />
            </Field>
            <Field label="Contabilidade" error={errors.emails?.accounting?.message}>
              <Input type="email" {...register('emails.accounting')} />
            </Field>
          </div>
        </Group>

        <Group
          title="Assuntos padrão dos e-mails"
          help={
            <>
              Use {'{{competencia}}'} (mês/ano) e {'{{razaoSocial}}'}. Nos textos, viram{' '}
              {'{{assuntos.extratos}}'}, {'{{assuntos.notas}}'} etc.
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {SUBJECTS.map((s) => (
              <Field
                key={s.key}
                label={s.label}
                aside={<Suggestion name={`subjects.${s.key}`} />}
                error={errors.subjects?.[s.key]?.message}
              >
                <Input className="font-mono text-[13px]" {...register(`subjects.${s.key}`)} />
              </Field>
            ))}
          </div>
        </Group>

        <Group title="Prazos internos" help="Dias do mês seguinte, salvo indicação. Aparecem como “dia 10”, “dia 1º”.">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Notas fiscais e extratos" hint="Dia do mês seguinte." error={d?.documentsDay?.message}>
              <Input type="number" min={1} max={31} {...register('deadlines.documentsDay', num)} />
            </Field>
            <Field label="Maquininhas e PIX" hint="Dia do relatório de vendas." error={d?.cardsDay?.message}>
              <Input type="number" min={1} max={31} {...register('deadlines.cardsDay', num)} />
            </Field>
            <Field
              label="Maquininhas: departamento"
              aside={<Suggestion name="deadlines.cardsDepartment" />}
              error={d?.cardsDepartment?.message}
            >
              <Select {...register('deadlines.cardsDepartment')}>
                {ONBOARDING_DEPARTMENTS.map((dep) => (
                  <option key={dep} value={dep}>
                    {ONBOARDING_DEPARTMENT_LABELS[dep]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Variáveis da folha" hint="Faltas, horas extras e comissões." error={d?.payrollVariablesDay?.message}>
              <Input type="number" min={1} max={31} {...register('deadlines.payrollVariablesDay', num)} />
            </Field>
            <Field label="Pró-labore" aside={<Suggestion name="deadlines.proLaboreDay" />} error={d?.proLaboreDay?.message}>
              <Input type="number" min={1} max={31} {...register('deadlines.proLaboreDay', num)} />
            </Field>
            <Field label="Admissão (dias úteis antes)" hint="Antes do 1º dia de trabalho." error={d?.admissionBusinessDays?.message}>
              <Input type="number" min={0} max={30} {...register('deadlines.admissionBusinessDays', num)} />
            </Field>
            <Field label="Férias (dias antes)" hint="Pedido ao escritório antes da saída." error={d?.vacationDaysBefore?.message}>
              <Input type="number" min={0} max={60} {...register('deadlines.vacationDaysBefore', num)} />
            </Field>
            <Field label="Validade do link (dias)" error={d?.linkDays?.message}>
              <Input type="number" min={1} max={90} {...register('deadlines.linkDays', num)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="DEFIS: dia" hint="Dados anuais do Simples Nacional." error={d?.defisDay?.message}>
                <Input type="number" min={1} max={31} {...register('deadlines.defisDay', num)} />
              </Field>
              <Field label="Mês" error={d?.defisMonth?.message}>
                <Input type="number" min={1} max={12} {...register('deadlines.defisMonth', num)} />
              </Field>
            </div>
          </div>
        </Group>

        <Group title="Regras" help="Escolhem a versão dos passos nos slides de Registro de empregado, Rescisão e Pessoal.">
          <ul className="grid gap-3 lg:grid-cols-2">
            {RULES.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-fg">
                  {r.label}
                  <HelpTip>{r.help}</HelpTip>
                  <Suggestion name={`rules.${r.key}`} />
                </span>
                <Controller
                  control={control}
                  name={`rules.${r.key}`}
                  render={({ field }) => (
                    <Switch
                      aria-label={r.label}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={readOnly}
                    />
                  )}
                />
              </li>
            ))}
          </ul>
        </Group>
      </fieldset>
    </Card>
  );
}
