import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Popover } from 'radix-ui';
import { cn } from '@/lib/utils';

interface HelpTipProps {
  /** The explanation shown in the balloon. */
  children: ReactNode;
  /** Accessible name of the "?" button (defaults to "Ajuda"). */
  label?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

const CLOSE_DELAY = 120;

/**
 * Small "?" next to a label that opens a balloon with the explanation, on hover (mouse) and on
 * click/tap (touch, keyboard). Replaces caption text under fields and cards.
 */
export function HelpTip({ children, label = 'Ajuda', side = 'top', className }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  useEffect(() => () => clearTimeout(timer.current), []);

  const hoverOpen = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(timer.current);
    setOpen(true);
  };
  const hoverClose = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || pinned.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) pinned.current = false;
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-describedby={open ? id : undefined}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          onClick={(e) => {
            // A click pins the balloon open (or closes a pinned one); hover alone does not pin.
            e.preventDefault();
            pinned.current = !pinned.current || !open;
            setOpen(pinned.current);
          }}
          className={cn(
            'inline-flex size-4 shrink-0 items-center justify-center rounded-full text-subtle transition-colors hover:text-muted focus-visible:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
            className,
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          id={id}
          role="tooltip"
          side={side}
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          className="z-[60] max-w-[280px] rounded-md bg-fg px-2.5 py-1.5 text-mini leading-snug font-medium text-bg shadow-lg data-[state=open]:animate-fade-in"
        >
          {children}
          <Popover.Arrow className="fill-fg" width={10} height={5} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
