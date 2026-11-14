import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addMonthKey,
  FEE_ADJUSTMENT_INDEXES,
  FEE_ADJUSTMENT_INDEX_LABELS,
  formatBRL,
  formatMonthKey,
  type FeeAdjustmentIndex,
  type MonthKey,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Label } from '@/components/ui/input';
import { PercentInput } from '@/components/ui/percent-input';
import { Switch } from '@/components/ui/switch';
import { formatBps, type AdjustmentPlan, type IndexTexts } from '../logic';

/** Example of the calculation memory (one fee of R$ 1.000,00). */
const EXAMPLE_FEE = 100_000;

interface IndicesCardProps {
  month: MonthKey;
  /** The first month with the 30-day notice on time for every client. */
  defaultMonth: MonthKey;
  onMonthChange: (month: MonthKey) => void;
  texts: IndexTexts;
  errors: Partial<Record<FeeAdjustmentIndex, string>>;
  onTextChange: (index: FeeAdjustmentIndex, text: string) => void;
  /** What the percentage field shows (the suggestion while it was not typed). */
  appliedText: string;
  appliedError: string | null;
  onAppliedChange: (text: string) => void;
  /** Back to the largest index; null while the field follows it. */
  onAppliedReset: (() => void) | null;
  plan: AdjustmentPlan;
  /** Example amount adjusted by the plan (cents). */
  exampleAdjusted: number;
  adjustEmployeeFee: boolean;
  onAdjustEmployeeFeeChange: (value: boolean) => void;
}

/** Step 1: the month of the periods, the four indices, the percentage and the calculation memory. */
export function IndicesCard(props: IndicesCardProps) {
  const { month, defaultMonth, onMonthChange, plan } = props;
  const early = month < defaultMonth;
  return (
    <Card className="@container p-5">
      <h2 className="text-title-sm font-semibold tracking-tight text-fg">1. Mês e índices</h2>
      <p className="mt-0.5 text-xs text-muted">O mês em que as vigências começam, os índices e o percentual a aplicar.</p>

      <div className="mt-5 grid gap-6 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="@container flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span id="adjustment-month-label" className="text-[13px] font-medium text-fg">
              Vigências que começam em
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-labelledby="adjustment-month-label" className="flex items-center gap-1 rounded-md border border-border bg-surface p-1 shadow-xs">
                <Button variant="ghost" size="icon-sm" aria-label="Mês anterior" onClick={() => onMonthChange(addMonthKey(month, -1))}>
                  <ChevronLeft />
                </Button>
                <span className="min-w-[150px] px-1 text-center text-[13px] font-semibold text-fg tabular" aria-live="polite">
                  {formatMonthKey(month)}
                </span>
                <Button variant="ghost" size="icon-sm" aria-label="Próximo mês" onClick={() => onMonthChange(addMonthKey(month, 1))}>
                  <ChevronRight />
                </Button>
              </div>
              {month !== defaultMonth ? (
                <Button variant="ghost" size="sm" onClick={() => onMonthChange(defaultMonth)}>
                  Voltar ao mês sugerido
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted">
              {month === defaultMonth
                ? 'Mês sugerido: o primeiro com o aviso de 30 dias no prazo para todos os clientes.'
                : early
                  ? 'Neste mês o aviso de 30 dias pode já ter passado: confira o prazo de cada cliente.'
                  : `O mês sugerido é ${formatMonthKey(defaultMonth).toLowerCase()}.`}
            </p>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-[13px] font-medium text-fg">Índices acumulados em 12 meses (%)</legend>
            <p className="-mt-1 text-xs text-muted">Até a data-base do reajuste (cláusula 3.2). Deixe em branco o que não tiver; negativo é aceito.</p>
            <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
              {FEE_ADJUSTMENT_INDEXES.map((index) => {
                const chosen = plan.chosen === index;
                return (
                  <Field
                    key={index}
                    error={props.errors[index]}
                    label={
                      <span className="flex items-center gap-1.5">
                        {FEE_ADJUSTMENT_INDEX_LABELS[index]}
                        {chosen ? <Badge tone="brand">Maior</Badge> : null}
                      </span>
                    }
                  >
                    <PercentInput
                      // The text keyboard: the decimal one of iPhones has no minus sign.
                      inputMode="text"
                      placeholder="—"
                      value={props.texts[index]}
                      onChange={(e) => props.onTextChange(index, e.target.value)}
                    />
                  </Field>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-4">
          <Field
            label="Percentual aplicado"
            error={props.appliedError ?? undefined}
            hint={
              plan.manual
                ? 'Diferente do maior índice: vale como reajuste negociado (cláusula 3.6).'
                : plan.suggested.index
                  ? 'O maior índice positivo (cláusula 3.3). Pode ser alterado.'
                  : 'Sem índice positivo o contrato não reajusta. Pode ser alterado.'
            }
            aside={
              props.onAppliedReset ? (
                <Button variant="link" size="xs" className="h-auto px-0" onClick={props.onAppliedReset}>
                  Usar o maior índice
                </Button>
              ) : null
            }
          >
            <PercentInput value={props.appliedText} onChange={(e) => props.onAppliedChange(e.target.value)} placeholder="0,00" wrapperClassName="max-w-[180px]" />
          </Field>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <Label htmlFor="adjust-employee-fee">Reajustar também a taxa por empregado</Label>
              <p className="text-xs text-muted">Valor cobrado por empregado ativo (cláusula 2.1).</p>
            </div>
            <Switch id="adjust-employee-fee" checked={props.adjustEmployeeFee} onCheckedChange={props.onAdjustEmployeeFeeChange} />
          </div>

          <section aria-labelledby="calculation-memory" className="rounded-lg bg-surface-muted px-4 py-3">
            <h3 id="calculation-memory" className="text-xs font-medium text-muted">
              Memória de cálculo
            </h3>
            <p className="mt-1 text-sm font-semibold text-fg tabular" aria-live="polite">
              {plan.memory}
            </p>
            <p className="mt-0.5 text-xs text-muted tabular">
              Ex.: {formatBRL(EXAMPLE_FEE)} × {plan.factor} = {formatBRL(props.exampleAdjusted)}
              {plan.appliedBps > 0 ? ` (+${formatBps(plan.appliedBps)})` : ''}
            </p>
          </section>
        </div>
      </div>
    </Card>
  );
}
