import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { HelpTip } from './help-tip';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface', className)} {...props} />;
}

interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  info?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, info, action, icon, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="truncate text-title-sm font-semibold tracking-tight text-fg">{title}</h2>
          {info ? (
            <HelpTip label="Mais informações">{info}</HelpTip>
          ) : null}
        </div>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action ?? (icon ? <span className="text-muted [&_svg]:size-4">{icon}</span> : null)}
    </div>
  );
}

interface SectionLabelProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Element to render (a page section uses `h2`). */
  as?: 'p' | 'h2' | 'h3';
  /**
   * `group` (default): small label of a group inside a card or sheet (`eyebrow`, 12px).
   * `section`: label of a page section above a card grid, 13px/600 in the brand colour, sentence case
   * (the card titles stay the title level). The page gives it 40px above and 12px below.
   */
  level?: 'group' | 'section';
}

export function SectionLabel({ as: Tag = 'p', level = 'group', className, ...props }: SectionLabelProps) {
  return (
    <Tag
      className={cn(level === 'section' ? 'text-[13px] leading-[18px] font-semibold text-brand-text' : 'eyebrow text-brand-text', className)}
      {...props}
    />
  );
}
