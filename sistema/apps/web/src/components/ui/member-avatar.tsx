import { UserRound } from 'lucide-react';
import { cn, initials } from '@/lib/utils';

const SIZES = {
  sm: 'size-6 text-[11px] [&_svg]:size-3.5',
  md: 'size-8 text-xs [&_svg]:size-4',
  lg: 'size-10 text-[13px] [&_svg]:size-5',
} as const;

interface MemberAvatarProps {
  name?: string | null;
  size?: keyof typeof SIZES;
  /** Nobody: a dashed circle (the "Sem responsável" of lists and cells). */
  unassigned?: boolean;
  className?: string;
}

/** Initials of a member in a circle, like the account avatar of the rail and the client circles. */
export function MemberAvatar({ name, size = 'sm', unassigned, className }: MemberAvatarProps) {
  if (unassigned || !name) {
    return (
      <span
        aria-hidden
        className={cn('inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-subtle', SIZES[size], className)}
      >
        <UserRound />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary-soft-fg', SIZES[size], className)}
    >
      {initials(name)}
    </span>
  );
}

/** Up to `max` avatars overlapped, then "+N". */
export function AvatarStack({ names, max = 4, className }: { names: string[]; max?: number; className?: string }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className={cn('flex items-center -space-x-1.5', className)} aria-hidden>
      {shown.map((n, i) => (
        <MemberAvatar key={`${n}-${i}`} name={n} className="ring-2 ring-surface" />
      ))}
      {rest > 0 ? (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-bg-subtle text-[11px] font-semibold text-muted ring-2 ring-surface">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
