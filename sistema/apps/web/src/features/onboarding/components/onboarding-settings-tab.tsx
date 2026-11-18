import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { onboardingFactoryText, onboardingParamsSchema, type OnboardingParams } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/misc';
import { SkeletonRows } from '@/components/ui/skeleton';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { formatDateTime } from '@/lib/datetime';
import { toastError } from '@/lib/notify';
import { useOnboardingTemplate, useSaveOnboardingTemplate } from '../api';
import { changedTexts } from '../onboarding-logic';
import { OnboardingParamsCard, type ParamsIn, type ParamsOut } from './onboarding-params-card';
import { OnboardingTextsEditor, PlaceholdersHelp } from './onboarding-texts-editor';

const factory = (key: string) => onboardingFactoryText(key) ?? '';

/** The form values of the parameters (empty strings in the optional text fields). */
export function paramsDefaults(p: OnboardingParams): ParamsIn {
  return {
    ...p,
    contact: { whatsapp: p.contact.whatsapp ?? '', hours: p.contact.hours ?? '', crc: p.contact.crc ?? '' },
  };
}

/** Configurações › Onboarding (`office`): the onboarding parameters on top, then the template's texts. */
export function OnboardingSettingsTab() {
  const template = useOnboardingTemplate();
  const save = useSaveOnboardingTemplate();
  const { can } = usePermissions();
  const readOnly = !can('office');
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const form = useForm<ParamsIn, unknown, ParamsOut>({
    resolver: zodResolver(onboardingParamsSchema),
  });
  const { handleSubmit, reset } = form;

  useEffect(() => {
    if (!template.data) return;
    reset(paramsDefaults(template.data.params));
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

  const submit = handleSubmit(async (params) => {
    try {
      await save.mutateAsync({ params, texts: changedTexts(texts, factory), hidden });
      toast.success('Modelo de onboarding salvo.');
    } catch (error) {
      toastError(error);
    }
  });
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => void submit(e)} noValidate>
      <OnboardingParamsCard form={form} readOnly={readOnly} />

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
