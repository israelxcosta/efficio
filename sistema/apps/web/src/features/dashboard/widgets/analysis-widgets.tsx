import type { WidgetProps } from '../layout/types';
import { WidgetCard } from '../layout/widget-card';

// Placeholder: replaced by the real widgets.
export function SummaryWidget({ alert }: WidgetProps) {
  return (
    <WidgetCard alert={alert}>
      <p className="text-caption text-muted">Em construção</p>
    </WidgetCard>
  );
}

export function ExpenseCategoryWidget({ alert }: WidgetProps) {
  return (
    <WidgetCard alert={alert}>
      <p className="text-caption text-muted">Em construção</p>
    </WidgetCard>
  );
}

export function IncomeCategoryWidget({ alert }: WidgetProps) {
  return (
    <WidgetCard alert={alert}>
      <p className="text-caption text-muted">Em construção</p>
    </WidgetCard>
  );
}

export function MonthlyResultWidget({ alert }: WidgetProps) {
  return (
    <WidgetCard alert={alert}>
      <p className="text-caption text-muted">Em construção</p>
    </WidgetCard>
  );
}
