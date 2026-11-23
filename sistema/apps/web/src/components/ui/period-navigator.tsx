import { ChevronLeft, ChevronRight } from 'lucide-react';
import { todayISO } from '@effinance/shared';
import { cn } from '@/lib/utils';
import { PERIOD_MODE_LABELS, periodLabel, shiftPeriod, type PeriodMode, type PeriodValue } from '@/lib/period';
import { SegmentedControl } from './segmented-control';
import { Button, HIT_44 } from './button';

interface PeriodNavigatorProps {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  modes?: PeriodMode[];
  className?: string;
  /** Classes of the mode selector, e.g. `max-sm:hidden` when a filter panel carries it on phones. */
  modesClassName?: string;
}

/** Mode selector (Dia/Semana/Mês/Ano) + ‹ label › navigation. */
export function PeriodNavigator({ value, onChange, modes = ['day', 'week', 'month'], className, modesClassName }: PeriodNavigatorProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {modes.length > 1 ? (
        <SegmentedControl
          ariaLabel="Tipo de período"
          className={modesClassName}
          value={value.mode}
          onChange={(mode) => onChange({ mode, anchor: value.anchor })}
          options={modes.map((m) => ({ value: m, label: PERIOD_MODE_LABELS[m] }))}
        />
      ) : null}
      <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1 shadow-xs">
        <Button variant="ghost" size="icon-sm" className={HIT_44} aria-label="Período anterior" onClick={() => onChange(shiftPeriod(value, -1))}>
          <ChevronLeft />
        </Button>
        <span className="min-w-[150px] px-1 text-center text-[13px] font-semibold text-fg tabular" aria-live="polite">
          {periodLabel(value)}
        </span>
        <Button variant="ghost" size="icon-sm" className={HIT_44} aria-label="Próximo período" onClick={() => onChange(shiftPeriod(value, 1))}>
          <ChevronRight />
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onChange({ mode: value.mode, anchor: todayISO() })}>
        Hoje
      </Button>
    </div>
  );
}
