import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'size-8 rounded-[10px] [&_svg]:size-4',
  md: 'size-10 rounded-md [&_svg]:size-[18px]',
} as const;

/** A lucide icon in the neutral box of `CategoryIcon` (rows of recurring tasks, templates, processes). */
export function NeutralIcon({ icon: Icon, size = 'md', className }: { icon: LucideIcon; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center bg-bg-subtle text-muted', SIZES[size], className)}>
      <Icon />
    </span>
  );
}
