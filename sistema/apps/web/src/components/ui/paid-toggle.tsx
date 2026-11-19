import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHasChanged } from '@/lib/use-has-changed';
import { Tooltip } from './tooltip';

interface PaidToggleProps {
  paid: boolean;
  onToggle: (paid: boolean) => void;
  /** 'expense' → Pago/Pendente; 'income' → Recebido/A receber. */
  kind?: 'expense' | 'income' | 'transfer';
  disabled?: boolean;
  disabledReason?: string;
  size?: 'sm' | 'md';
  loading?: boolean;
}

/**
 * 👍 paid / 👎 pending (default). Motion: the button presses to .97 and, when the state changes, the
 * new icon crossfades in (`.icon-in`, keyed so it remounts); nothing replays on first render.
 */
export function PaidToggle({ paid, onToggle, kind = 'expense', disabled, disabledReason, size = 'md', loading }: PaidToggleProps) {
  const changed = useHasChanged(paid);

  const paidLabel = kind === 'income' ? 'Recebido' : kind === 'transfer' ? 'Efetivada' : 'Pago';
  const pendingLabel = kind === 'income' ? 'A receber' : kind === 'transfer' ? 'Agendada' : 'Pendente';
  const label = paid ? `${paidLabel} — clique para marcar como ${pendingLabel.toLowerCase()}` : `${pendingLabel} — clique para marcar como ${paidLabel.toLowerCase()}`;
  const Icon = paid ? ThumbsUp : ThumbsDown;

  return (
    <Tooltip content={disabled ? disabledReason : paid ? paidLabel : pendingLabel}>
      <button
        type="button"
        aria-pressed={paid}
        aria-label={disabled ? (disabledReason ?? label) : label}
        disabled={disabled || loading}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(!paid);
        }}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,scale] duration-(--dur-press) ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60',
          size === 'sm' ? 'size-8' : 'size-9',
          paid ? 'bg-success-soft text-success hover:brightness-95' : 'bg-danger-soft text-danger hover:brightness-95',
          loading && 'opacity-70',
        )}
      >
        <Icon
          key={paid ? 'paid' : 'pending'}
          className={cn(size === 'sm' ? 'size-3.5' : 'size-4', changed && 'icon-in')}
          aria-hidden fill={paid ? 'currentColor' : 'none'} fillOpacity={0.15} />
      </button>
    </Tooltip>
  );
}
