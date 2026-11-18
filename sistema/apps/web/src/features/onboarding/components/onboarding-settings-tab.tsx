import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  onboardingFactoryText,
  onboardingOfficeSchema,
  type OnboardingOfficeData,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { HelpTip } from '@/components/ui/help-tip';
import { Field, Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/misc';
import { SkeletonRows } from '@/components/ui/skeleton';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { formatDateTime } from '@/lib/datetime';
import { toastError } from '@/lib/notify';
import { useOnboardingTemplate, useSaveOnboardingTemplate } from '../api';
import { changedTexts } from '../onboarding-logic';
import { OnboardingTextsEditor, PlaceholdersHelp } from './onboarding-texts-editor';

type OfficeIn = z.input<typeof onboardingOfficeSchema>;
type OfficeOut = z.output<typeof onboardingOfficeSchema>;

const factory = (key: string) => onboardingFactoryText(key) ?? '';

function officeDefaults(o: OnboardingOfficeData): OfficeIn {
  return {
    ...o,
    name: o.name ?? '',
    whatsapp: o.whatsapp ?? '',
    email: o.email ?? '',
    hours: o.hours ?? '',
    crc: o.crc ?? '',
  };
}

/** Configurações › Onboarding (`office`): the office's data used by the document and the template's texts. */
export function OnboardingSettingsTab() {
  const template = useOnboardingTemplate();
  const save = useSaveOnboardingTemplate();
  const { can } = usePermissions();
  const readOnly = !can('office');
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const form = useForm<OfficeIn, unknown, OfficeOut>({
    resolver: zodResolver(onboardingOfficeSchema),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = form;

  useEffect(() => {
    if (!template.data) return;
    reset(officeDefaults(template.data.office));
    setTexts(template.data.texts);
    setHidden(template.data.hidden);
  }, [template.data, reset]);

  if (template.isError)
    return <ErrorState error={template.error} onRetry={() => template.refetch()} />;
  if (!template.data) {
    return (
      <Card className="p-5 sm:p-6">
        <SkeletonRows rows={8} />
      </Card>
    );
  }

  const submit = handleSubmit(async (office) => {
    try {
      await save.mutateAsync({ office, texts: changedTexts(texts, factory), hidden });
      toast.success('Modelo de onboarding salvo.');
    } catch (error) {
      toastError(error);
    }
  });
  const num = { setValueAs: (v: string) => (v === '' ? undefined : Number(v)) };

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => void submit(e)} noValidate>
      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <CardHeader
          title="Dados do escritório no onboarding"
          info="Aparecem em todos os documentos: canais de atendimento, e-mails de cada departamento e os prazos internos para o cliente enviar documentos."
        />
        <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Nome do escritório" error={errors.name?.message}>
            <Input placeholder="Nome do cadastro do escritório" {...register('name')} />
          </Field>
          <Field label="WhatsApp" error={errors.whatsapp?.message}>
            <Input inputMode="tel" placeholder="(00) 00000-0000" {...register('whatsapp')} />
          </Field>
          <Field label="E-mail geral" error={errors.email?.message}>
            <Input type="email" {...register('email')} />
          </Field>
          <Field label="Horário de atendimento" error={errors.hours?.message}>
            <Input placeholder="Segunda a sexta, das 8h às 18h" {...register('hours')} />
          </Field>
          <Field label="CRC" error={errors.crc?.message}>
            <Input {...register('crc')} />
          </Field>
          <span className="max-xl:hidden" />
          <Field label="E-mail do fiscal" error={errors.emails?.fiscal?.message}>
            <Input type="email" {...register('emails.fiscal')} />
          </Field>
          <Field label="E-mail do pessoal" error={errors.emails?.personnel?.message}>
            <Input type="email" {...register('emails.personnel')} />
          </Field>
          <Field label="E-mail da contabilidade" error={errors.emails?.accounting?.message}>
            <Input type="email" {...register('emails.accounting')} />
          </Field>
        </fieldset>
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="inline-flex items-center gap-1 text-sm font-semibold text-fg">
            Prazos internos
            <HelpTip>
              Viram os marcadores {'{{prazo.documentos}}'}, {'{{prazo.variaveisFolha}}'},{' '}
              {'{{prazo.admissao}}'} e {'{{prazo.ferias}}'}.
            </HelpTip>
          </p>
          <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field
              label="Notas e extratos (dia do mês seguinte)"
              error={errors.deadlines?.documentsDay?.message}
            >
              <Input type="number" min={1} max={31} {...register('deadlines.documentsDay', num)} />
            </Field>
            <Field
              label="Variáveis da folha (dia)"
              error={errors.deadlines?.payrollVariablesDay?.message}
            >
              <Input
                type="number"
                min={1}
                max={31}
                {...register('deadlines.payrollVariablesDay', num)}
              />
            </Field>
            <Field
              label="Admissão (dias úteis antes)"
              error={errors.deadlines?.admissionBusinessDays?.message}
            >
              <Input
                type="number"
                min={1}
                max={30}
                {...register('deadlines.admissionBusinessDays', num)}
              />
            </Field>
            <Field
              label="Pedido de férias (dias antes)"
              error={errors.deadlines?.vacationDaysBefore?.message}
            >
              <Input
                type="number"
                min={1}
                max={60}
                {...register('deadlines.vacationDaysBefore', num)}
              />
            </Field>
          </fieldset>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <CardHeader
          title="Textos do modelo"
          action={
            <span className="inline-flex shrink-0 items-center gap-1 text-caption text-muted">
              Marcadores <PlaceholdersHelp />
            </span>
          }
          info="O modelo vale para todos os clientes; cada cliente pode ter ajustes próprios na ficha (Ver onboarding › Ajustar textos deste cliente). Itens com condição só aparecem para o regime ou a situação indicada."
        />
        <OnboardingTextsEditor
          base={factory}
          factory={factory}
          texts={texts}
          onTextsChange={setTexts}
          hidden={hidden}
          onHiddenChange={setHidden}
          readOnly={readOnly}
        />
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <p className="mr-auto text-caption text-muted">
          {template.data.updatedAt
            ? `Salvo em ${formatDateTime(template.data.updatedAt)}${template.data.updatedByName ? ` por ${template.data.updatedByName}` : ''}`
            : 'Modelo de fábrica'}
        </p>
        <WriteGate scope="tasks" permission="office">
          <Button type="submit" loading={save.isPending}>
            <Save /> Salvar modelo
          </Button>
        </WriteGate>
      </div>
    </form>
  );
}
