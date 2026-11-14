import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { inputClasses } from './input';

/**
 * Text field for a percentage, with the "%" suffix muted inside it. The props (id, aria-*) reach the
 * input itself, so `Field` associates its label, hint and error with it.
 */
export const PercentInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { wrapperClassName?: string }>(
  function PercentInput({ className, wrapperClassName, ...props }, ref) {
    return (
      <div className={cn('relative', wrapperClassName)}>
        <input ref={ref} type="text" inputMode="decimal" autoComplete="off" className={cn(inputClasses, 'tabular pr-8 text-right', className)} {...props} />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted" aria-hidden>
          %
        </span>
      </div>
    );
  },
);
