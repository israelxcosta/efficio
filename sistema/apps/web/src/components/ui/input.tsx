import { Fragment, forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, cloneElement, isValidElement, type ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { HelpTip } from './help-tip';

export const inputClasses =
  'h-11 w-full rounded-md border border-border bg-surface px-3.5 text-body-sm text-fg shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-subtle hover:border-border-strong focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(inputClasses, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(inputClasses, 'h-auto resize-y py-2.5', className)} {...props} />;
  },
);

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-caption font-medium text-fg', className)} {...props} />;
}

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  className?: string;
  /** Rendered next to the label (e.g. a small action). */
  aside?: ReactNode;
  /** A single form control; it receives id / aria-invalid / aria-describedby. */
  children: ReactNode;
}

export function Field({ label, hint, error, className, aside, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const controlId = isValidElement(children) ? ((children.props as { id?: string }).id ?? id) : id;
  const wire = (el: ReactElement<Record<string, unknown>>) =>
    cloneElement(el, {
      id: (el.props as { id?: string }).id ?? controlId,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy,
    });
  // A react-hook-form <Controller render> (masked inputs, MoneyInput, Select…) gets the id on the
  // element it renders, so the label is associated with the real control and not with the Controller.
  const render = isValidElement(children) ? (children.props as { render?: unknown }).render : undefined;
  const control = !isValidElement(children)
    ? children
    : typeof render === 'function'
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          render: (...args: unknown[]) => {
            const rendered = (render as (...a: unknown[]) => ReactNode)(...args);
            return isValidElement(rendered) && rendered.type !== Fragment ? wire(rendered as ReactElement<Record<string, unknown>>) : rendered;
          },
        })
      : wire(children as ReactElement<Record<string, unknown>>);
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label || aside ? (
        <div className="flex items-center justify-between gap-2">
          {label ? (
            <span className="flex min-w-0 items-center gap-1">
              <Label htmlFor={controlId}>{label}</Label>
              {hint ? <HelpTip>{hint}</HelpTip> : null}
            </span>
          ) : (
            <span />
          )}
          {aside}
        </div>
      ) : null}
      {control}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-mini font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        // With a label the hint lives in the "?" balloon; screen readers still get it as the description.
        <p id={`${id}-hint`} className={label ? 'sr-only' : 'text-mini text-muted'}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
