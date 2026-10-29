import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inputClasses } from './input';

export interface SearchSelectOption {
  value: string;
  label: string;
  /** Second text on the right (`text-muted`): regime, department… */
  hint?: string;
  leading?: ReactNode;
  /** Group heading (options of the same group must be adjacent). */
  group?: string;
  /** Extra text the search matches (CNPJ, legal name). */
  keywords?: string;
}

interface SearchSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  size_?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  /** Custom trigger (e.g. a table cell button); receives the open state through Radix. */
  trigger?: ReactElement;
  align?: 'start' | 'end';
  onOpenChange?: (open: boolean) => void;
  // Injected by <Field>
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-label'?: string;
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Select with a search field on top (clients, members): the look of the design-system Select (list
 * with radius xl and shadow lg) plus the search of the CategoryPicker. Arrow keys move, Enter picks.
 */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione',
  searchPlaceholder = 'Buscar…',
  emptyText = 'Nada encontrado',
  size_ = 'md',
  disabled,
  className,
  trigger,
  align = 'start',
  onOpenChange,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-label': ariaLabel,
}: SearchSelectProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return options;
    return options.filter((o) => normalize(`${o.label} ${o.hint ?? ''} ${o.keywords ?? ''}`).includes(q));
  }, [options, query]);
  const selected = options.find((o) => o.value === value);

  function setOpenState(o: boolean) {
    setOpen(o);
    onOpenChange?.(o);
    if (o) {
      setQuery('');
      const current = options.findIndex((opt) => opt.value === value);
      setActive(current >= 0 ? current : 0);
    }
  }

  function choose(option: SearchSelectOption) {
    onChange(option.value);
    setOpenState(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!filtered.length) return;
      const next = e.key === 'ArrowDown' ? (active + 1) % filtered.length : (active - 1 + filtered.length) % filtered.length;
      setActive(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = filtered[active];
      if (option) choose(option);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpenState}>
      {trigger ? (
        <Popover.Trigger asChild disabled={disabled}>
          {trigger}
        </Popover.Trigger>
      ) : (
        <Popover.Trigger
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          aria-haspopup="listbox"
          className={cn(
            inputClasses,
            'group/ss flex cursor-pointer items-center gap-2 text-left data-[state=open]:border-brand-500 data-[state=open]:ring-[3px] data-[state=open]:ring-brand-500/15',
            size_ === 'sm' && 'h-9 rounded-[10px] text-[13px]',
            size_ === 'md' && 'h-10',
            className,
          )}
        >
          {selected?.leading}
          <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-subtle')}>{selected?.label ?? placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-muted transition-transform duration-150 group-data-[state=open]/ss:rotate-180" />
        </Popover.Trigger>
      )}
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          className="z-50 flex w-[min(max(var(--radix-popover-trigger-width),280px),calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg data-[state=open]:animate-fade-in"
        >
          <label className="flex items-center gap-2 border-b border-border px-3.5">
            <Search className="size-4 shrink-0 text-subtle" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              aria-label={searchPlaceholder}
              className="h-11 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
            />
          </label>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel ?? placeholder}
            className="scrollbar-thin max-h-[min(320px,var(--radix-popover-content-available-height))] overflow-y-auto p-1.5"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">{emptyText}</p>
            ) : (
              filtered.map((o, i) => {
                const checked = o.value === value;
                const heading = o.group && o.group !== filtered[i - 1]?.group ? o.group : null;
                return (
                  <div key={o.value} role="presentation">
                    {heading ? (
                      <p className={cn('px-3 pt-2 pb-1 text-xs font-semibold text-subtle', i > 0 && 'mt-1 border-t border-border pt-2.5')}>{heading}</p>
                    ) : null}
                    <div
                      id={`${listId}-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={checked}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(o)}
                      className={cn(
                        'relative flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pr-9 pl-3 text-sm text-fg transition-colors',
                        i === active && 'bg-bg-subtle',
                      )}
                    >
                      {o.leading}
                      <span className={cn('min-w-0 flex-1 truncate', checked && 'font-semibold')}>{o.label}</span>
                      {o.hint ? <span className="max-w-[45%] shrink-0 truncate text-xs text-muted">{o.hint}</span> : null}
                      {checked ? <Check className="absolute right-3 size-4 text-primary" aria-hidden /> : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
