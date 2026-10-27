import { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, UsersRound } from 'lucide-react';
import {
  FEE_CATEGORY,
  GENERATE_FEES_SKIP_LABELS,
  addMonthKey,
  formatBRL,
  formatDateBR,
  monthKey,
  type GenerateFeesResponse,
  type GenerateFeesSkipReason,
  type MonthKey,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { setActiveMonth, useActiveMonth } from '@/lib/active-month';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useGenerateFees, useGenerateFeesPreview, type GenerateFeesParams } from './api';
import { DEFAULT_DUE_DAY, competenceLabel, competenceLongLabel, feeDueDate, parseDueDay, plural } from './fee-charges';
import { useDebounced } from './use-debounced';

interface GenerateFeesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Gerar honorários": one receivable per client for a competence month, previewed with a dry run
 * before anything is created. Opens on the month active on the dashboard.
 */
export function GenerateFeesDialog({ open, onOpenChange }: GenerateFeesDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Gerar honorários"
      description="Um lançamento a receber por cliente, com o honorário vigente na competência."
      className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto"
    >
      {/* Mounted per opening, so it starts again from the active month and a fresh preview. */}
      {open ? <GenerateFeesForm onClose={() => onOpenChange(false)} /> : null}
    </Modal>
  );
}

function GenerateFeesForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [activeMonth] = useActiveMonth();
  const [competence, setCompetence] = useState<MonthKey>(activeMonth);
  const [dueDayInput, setDueDayInput] = useState(String(DEFAULT_DUE_DAY));
  const dueDay = parseDueDay(dueDayInput);

  const params = useMemo<GenerateFeesParams | null>(() => (dueDay === null ? null : { competence, dueDay }), [competence, dueDay]);
  const debounced = useDebounced(params, 350);
  const preview = useGenerateFeesPreview(debounced);
  const generate = useGenerateFees();

  // The plan on screen matches the inputs: not waiting for the debounce, nor a placeholder of other inputs.
  const settled = params !== null && debounced?.competence === params.competence && debounced.dueDay === params.dueDay;
  const current = settled && preview.isSuccess && !preview.isPlaceholderData && !preview.isFetching;
  const plan = preview.data;
  const count = plan?.created.length ?? 0;
  const dueDate = dueDay === null ? null : (current && plan ? plan.dueDate : feeDueDate(competence, dueDay));

  async function confirm() {
    if (!params || !current || count === 0) return;
    try {
      const result = await generate.mutateAsync(params);
      const created = result.created.length;
      if (created === 0) {
        toast.info('Nenhum honorário novo para gerar', {
          description: `Os clientes de ${competenceLabel(result.competence)} já tinham honorário lançado.`,
        });
      } else {
        const dueMonth = monthKey(result.dueDate);
        toast.success(created === 1 ? '1 honorário gerado' : `${created} honorários gerados`, {
          description: `Ref. ${competenceLabel(result.competence)} · vencimento ${formatDateBR(result.dueDate)} · ${formatBRL(result.total)}`,
          // The fees fall due in the following month: offer to jump there to see them (and add employees).
          action:
            dueMonth !== activeMonth
              ? {
                  label: 'Ver lançamentos',
                  onClick: () => {
                    setActiveMonth(dueMonth);
                    navigate('/contas-a-receber');
                  },
                }
              : undefined,
        });
      }
      onClose();
    } catch (error) {
      toastError(error);
      void preview.refetch();
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void confirm();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem]">
        <CompetenceField value={competence} activeMonth={activeMonth} onChange={setCompetence} />
        <Field label="Dia do vencimento" error={dueDay === null ? 'Informe um dia de 1 a 31' : undefined}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            step={1}
            value={dueDayInput}
            onChange={(e) => setDueDayInput(e.target.value)}
            className="tabular"
          />
        </Field>
      </div>

      <div className="flex items-start gap-2.5 rounded-md bg-primary-soft px-3 py-2.5 text-[13px] text-primary-soft-fg" aria-live="polite">
        <CalendarClock className="mt-px size-4 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">
            Vencimento: <span className="tabular">{dueDate ? formatDateBR(dueDate) : '—'}</span>
          </span>
          <span className="block text-caption opacity-80">
            Lançados como “Honorários ref. {competenceLabel(competence)} - Cliente” em {FEE_CATEGORY.name} › {FEE_CATEGORY.fee}.
          </span>
        </p>
      </div>

      <PreviewSection
        params={params}
        preview={preview}
        dimmed={!settled || preview.isPlaceholderData || (preview.isFetching && !preview.isPending)}
        competence={competence}
      />

      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={generate.isPending} disabled={!current || count === 0}>
          {plan && current && count > 0
            ? `Gerar ${plural(count, 'honorário', 'honorários')} · ${formatBRL(plan.total)}`
            : 'Gerar honorários'}
        </Button>
      </div>
    </form>
  );
}

/** ‹ Outubro de 2026 › — local to the dialog (the dashboard month is not changed). */
function CompetenceField({ value, activeMonth, onChange }: { value: MonthKey; activeMonth: MonthKey; onChange: (value: MonthKey) => void }) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-labelledby={labelId}>
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="text-[13px] font-medium text-fg">
          Competência
        </span>
        {value !== activeMonth ? (
          <button
            type="button"
            className="rounded-sm text-xs font-medium text-brand-text underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-brand-500/25"
            onClick={() => onChange(activeMonth)}
          >
            Voltar ao mês ativo
          </button>
        ) : null}
      </div>
      <div className="flex h-11 items-center justify-between gap-1 rounded-md border border-border bg-surface px-1 shadow-xs">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Competência anterior" onClick={() => onChange(addMonthKey(value, -1))}>
          <ChevronLeft />
        </Button>
        <span className="min-w-0 truncate text-center text-sm font-semibold text-fg" aria-live="polite">
          {competenceLongLabel(value)}
        </span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Próxima competência" onClick={() => onChange(addMonthKey(value, 1))}>
          <ChevronRight />
        </Button>
      </div>
      <p className="text-xs text-muted">{value === activeMonth ? 'Mês ativo no dashboard' : `Mês ativo: ${competenceLongLabel(activeMonth)}`}</p>
    </div>
  );
}

interface PreviewSectionProps {
  params: GenerateFeesParams | null;
  preview: ReturnType<typeof useGenerateFeesPreview>;
  dimmed: boolean;
  competence: MonthKey;
}

function PreviewSection({ params, preview, dimmed, competence }: PreviewSectionProps) {
  if (!preview.data) {
    if (preview.isError) return <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />;
    if (!params && !preview.isFetching) {
      return <p className="rounded-lg border border-dashed border-border-strong/80 px-4 py-6 text-center text-xs text-muted">Informe o dia do vencimento para ver os clientes.</p>;
    }
    return <PreviewSkeleton />;
  }
  if (preview.isError && !preview.isPlaceholderData) {
    return <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />;
  }

  const plan = preview.data;
  return (
    <section aria-label="Prévia da geração" aria-busy={dimmed} className={cn('flex flex-col gap-3 transition-opacity', dimmed && 'opacity-60')}>
      {plan.created.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-fg">
              A gerar <span className="font-medium text-muted">· {plan.created.length}</span>
            </h3>
            <span className="tabular text-[13px] font-semibold text-success">{formatBRL(plan.total)}</span>
          </div>
          <ul className="max-h-[min(15rem,34dvh)] divide-y divide-border overflow-y-auto rounded-lg border border-border" aria-label="Clientes a cobrar">
            {plan.created.map((c) => (
              <li key={c.clientId} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                <span className="min-w-0 truncate text-fg">{c.name}</span>
                <span className="tabular shrink-0 font-medium text-fg">{formatBRL(c.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyPlan plan={plan} competence={competence} />
      )}
      {plan.skipped.length > 0 ? <SkippedList skipped={plan.skipped} defaultOpen={plan.created.length === 0} /> : null}
    </section>
  );
}

function EmptyPlan({ plan, competence }: { plan: GenerateFeesResponse; competence: MonthKey }) {
  const ref = competenceLabel(competence);
  if (plan.skipped.length === 0) {
    return (
      <EmptyState
        compact
        icon={<UsersRound />}
        title="Nenhum cliente com honorário"
        description="Cadastre os clientes com a data de início do contrato e o honorário vigente."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/clientes">Ir para Clientes</Link>
          </Button>
        }
      />
    );
  }
  const allGenerated = plan.skipped.every((s) => s.reason === 'already_generated');
  return allGenerated ? (
    <EmptyState
      compact
      icon={<CircleCheck />}
      title={`Honorários de ${ref} já gerados`}
      description="Todos os clientes desta competência já têm o lançamento a receber. Use “+ Empregados” em cada honorário para lançar a folha."
    />
  ) : (
    <EmptyState
      compact
      icon={<UsersRound />}
      title={`Nenhum honorário a gerar em ${ref}`}
      description="Veja abaixo por que cada cliente ficou de fora."
    />
  );
}

const SKIP_TONE: Record<GenerateFeesSkipReason, 'neutral' | 'warning'> = {
  already_generated: 'neutral',
  no_current_fee: 'warning',
  not_started: 'neutral',
  inactive: 'neutral',
};

function SkippedList({ skipped, defaultOpen }: { skipped: GenerateFeesResponse['skipped']; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const listId = useId();
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] outline-none hover:bg-surface-muted focus-visible:ring-[3px] focus-visible:ring-brand-500/25"
      >
        <span className="font-semibold text-fg">
          Fora da geração <span className="font-medium text-muted">· {skipped.length}</span>
        </span>
        <ChevronDown className={cn('size-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <ul id={listId} className="max-h-[min(12rem,28dvh)] divide-y divide-border overflow-y-auto border-t border-border">
          {skipped.map((s) => (
            <li key={s.clientId} className="flex flex-col gap-1 px-3 py-2 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="min-w-0 truncate text-fg">{s.name}</span>
              <Badge tone={SKIP_TONE[s.reason]} className="self-start sm:self-auto">
                {GENERATE_FEES_SKIP_LABELS[s.reason]}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando prévia">
      <div className="flex justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex justify-between gap-3">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
