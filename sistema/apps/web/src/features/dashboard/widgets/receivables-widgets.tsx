import type { WidgetProps } from '../layout/types';
import { WidgetCard } from '../layout/widget-card';

// Placeholder: replaced by the real widgets.
export function OverdueWidget({ alert }: WidgetProps) {
  return (
    <WidgetCard alert={alert}>
      <p className="text-caption text-muted">Em construção</p>
    </WidgetCard>
  );
}

export function DebtorsWidget({ alert }: WidgetProps) {
  return (
    <WidgetCard alert={alert}>
      <p className="text-caption text-muted">Em construção</p>
    </WidgetCard>
  );
}

export function UpcomingWidget({ alert }: WidgetProps) {
  return (
    <WidgetCard alert={alert}>
      <p className="text-caption text-muted">Em construção</p>
    </WidgetCard>
  );
}

export function CardsWidget({ alert }: WidgetProps) {
  return (
    <WidgetCard alert={alert}>
      <p className="text-caption text-muted">Em construção</p>
    </WidgetCard>
  );
}
