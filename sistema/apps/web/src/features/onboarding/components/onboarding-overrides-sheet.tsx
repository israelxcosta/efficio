import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { onboardingFactoryText, type Client } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { HelpTip } from '@/components/ui/help-tip';
import { Field, Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/datetime';
import { toastError } from '@/lib/notify';
import { useOnboardingOverrides, useOnboardingTemplate, useSaveOnboardingOverrides } from '../api';
import { changedTexts } from '../onboarding-logic';
import { OnboardingTextsEditor, PlaceholdersHelp } from './onboarding-texts-editor';

const factory = (key: string) => onboardingFactoryText(key) ?? '';

/** "Ajustar textos deste cliente" (`office`): texts and hidden items over the office's template, and the number of employees. */
export function OnboardingOverridesSheet({
  client,
  open,
  onOpenChange,
}: {
  client: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const template = useOnboardingTemplate(open);
  const overrides = useOnboardingOverrides(client.id, open);
  const save = useSaveOnboardingOverrides(client.id);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const [employees, setEmployees] = useState('');

  useEffect(() => {
    if (!open || !overrides.data) return;
    setTexts(overrides.data.texts);
    setHidden(overrides.data.hidden);
    setEmployees(overrides.data.employees === null ? '' : String(overrides.data.employees));
  }, [open, overrides.data]);

  const templateTexts = template.data?.texts ?? {};
  const base = (key: string) => templateTexts[key] ?? factory(key);
  const lockedHidden = new Set(template.data?.hidden ?? []);
  const employeesValue = employees.trim() === '' ? null : Number(employees);
  const employeesInvalid =
    employeesValue !== null &&
    (!Number.isInteger(employeesValue) || employeesValue < 0 || employeesValue > 100_000);

  async function submit() {
    if (employeesInvalid) return;
    try {
      await save.mutateAsync({
        texts: changedTexts(texts, base),
        hidden: hidden.filter((h) => !lockedHidden.has(h)),
        employees: employeesValue,
      });
      toast.success('Ajustes do onboarding salvos.');
      onOpenChange(false);
    } catch (error) {
      toastError(error);
    }
  }

  const error = template.error ?? overrides.error;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      width="xl"
      title="Ajustar textos deste cliente"
      description={client.tradeName || client.name}
      footer={
        <>
          <p className="mr-auto text-caption text-muted">
            {overrides.data?.updatedAt
              ? `Salvo em ${formatDateTime(overrides.data.updatedAt)}${overrides.data.updatedByName ? ` por ${overrides.data.updatedByName}` : ''}`
              : null}
          </p>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submit()}
            loading={save.isPending}
            disabled={!overrides.data || !template.data}
          >
            Salvar ajustes
          </Button>
        </>
      }
    >
      {error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void template.refetch();
            void overrides.refetch();
          }}
        />
      ) : !overrides.data || !template.data ? (
        <SkeletonRows rows={8} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Field
              className="w-56"
              label={
                <span className="inline-flex items-center gap-1">
                  Nº de empregados
                  <HelpTip>
                    Vazio: o número da última cobrança de "+ Empregados" (ou nenhum).
                  </HelpTip>
                </span>
              }
              error={employeesInvalid ? 'Informe um número de 0 a 100.000' : undefined}
            >
              <Input
                type="number"
                min={0}
                value={employees}
                onChange={(e) => setEmployees(e.target.value)}
              />
            </Field>
            <span className="inline-flex items-center gap-1 text-caption text-muted">
              Marcadores <PlaceholdersHelp />
            </span>
          </div>
          <OnboardingTextsEditor
            base={base}
            factory={factory}
            texts={texts}
            onTextsChange={setTexts}
            hidden={hidden}
            onHiddenChange={setHidden}
            lockedHidden={lockedHidden}
            restoreLabel="Usar o texto do modelo"
          />
        </div>
      )}
    </Sheet>
  );
}
