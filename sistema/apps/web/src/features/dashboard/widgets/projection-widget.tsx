import type { WidgetProps } from '../layout/types';
import { WidgetCard } from '../layout/widget-card';

// Placeholder: replaced by the real widgets.
export function ProjectionWidget({ alert }: WidgetProps) {
  return (
    <WidgetCard alert={alert}>
      <p className="text-caption text-muted">Em construção</p>
    </WidgetCard>
  );
}
