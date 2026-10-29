import type { ComponentProps, ReactNode } from 'react';
import { DropdownMenu as DM } from 'radix-ui';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;

export function DropdownMenuContent({ className, align = 'end', sideOffset = 6, ...props }: ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[200px] overflow-hidden rounded-lg border border-border bg-surface p-1.5 shadow-lg data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

interface ItemProps extends ComponentProps<typeof DM.Item> {
  icon?: ReactNode;
  tone?: 'default' | 'danger';
}

export function DropdownMenuItem({ className, icon, tone = 'default', children, ...props }: ItemProps) {
  return (
    <DM.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-bg-subtle [&_svg]:size-4',
        tone === 'danger' ? 'text-danger data-[highlighted]:bg-danger-soft' : 'text-fg',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </DM.Item>
  );
}

export const DropdownMenuSub = DM.Sub;
export const DropdownMenuRadioGroup = DM.RadioGroup;

const itemBase =
  'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-fg outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-bg-subtle data-[state=open]:bg-bg-subtle [&_svg]:size-4';

/** Item that opens a submenu ("Mudar situação ›"). */
export function DropdownMenuSubTrigger({ className, icon, children, ...props }: ComponentProps<typeof DM.SubTrigger> & { icon?: ReactNode }) {
  return (
    <DM.SubTrigger className={cn(itemBase, className)} {...props}>
      {icon}
      <span className="flex-1">{children}</span>
      <ChevronRight className="!size-3.5 text-muted" aria-hidden />
    </DM.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof DM.SubContent>) {
  return (
    <DM.Portal>
      <DM.SubContent
        sideOffset={6}
        collisionPadding={8}
        className={cn('z-50 min-w-[200px] overflow-hidden rounded-lg border border-border bg-surface p-1.5 shadow-lg data-[state=open]:animate-fade-in', className)}
        {...props}
      />
    </DM.Portal>
  );
}

/** One choice of a radio group (`menuitemradio`): the chosen one in bold with a check. */
export function DropdownMenuRadioItem({ className, icon, children, ...props }: ComponentProps<typeof DM.RadioItem> & { icon?: ReactNode }) {
  return (
    <DM.RadioItem className={cn(itemBase, 'relative pr-8 data-[state=checked]:font-semibold', className)} {...props}>
      {icon}
      {children}
      <DM.ItemIndicator className="absolute right-2.5 inline-flex text-primary">
        <Check aria-hidden />
      </DM.ItemIndicator>
    </DM.RadioItem>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <DM.Separator className={cn('my-1 h-px bg-border', className)} />;
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn('eyebrow px-2.5 pt-1.5 pb-1 text-subtle', className)} {...props} />;
}
