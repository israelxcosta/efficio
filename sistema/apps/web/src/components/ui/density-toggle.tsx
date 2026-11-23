import { Rows2, Rows4 } from 'lucide-react';
import { useListDensity, type ListDensity } from '@/lib/list-density';
import { cn } from '@/lib/utils';
import { Tooltip } from './tooltip';

/** "Confortável · Compacta" for the long lists: two icon buttons, the choice shared by every list. */
export function DensityToggle({ className }: { className?: string }) {
  const [density, setDensity] = useListDensity();
  const option = (value: ListDensity, label: string, Icon: typeof Rows2) => (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={`Linhas: ${label.toLowerCase()}`}
        aria-pressed={density === value}
        onClick={() => setDensity(value)}
        className={cn(
          'flex size-7 items-center justify-center rounded-md transition-colors [&_svg]:size-3.5',
          density === value ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg',
        )}
      >
        <Icon aria-hidden />
      </button>
    </Tooltip>
  );
  return (
    <div role="group" aria-label="Densidade da lista" className={cn('inline-flex items-center gap-0.5 rounded-lg bg-bg-subtle p-0.5', className)}>
      {option('comfortable', 'Confortável', Rows2)}
      {option('compact', 'Compacta', Rows4)}
    </div>
  );
}
