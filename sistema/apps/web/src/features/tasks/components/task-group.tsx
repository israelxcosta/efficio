import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORE = 'effinance.tasks.collapsed.v1';

function readCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(STORE) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function writeCollapsed(set: Set<string>) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

interface TaskGroupProps {
  /** Stable id of the group (collapsed state lasts the browser session). */
  id: string;
  title: string;
  count: number;
  tone?: 'danger' | 'warning';
  children: ReactNode;
}

/** Due-date group of the list ("Atrasadas", "Hoje"…): a section with a collapsible 36px header. */
export function TaskGroup({ id, title, count, tone, children }: TaskGroupProps) {
  const headingId = useId();
  const bodyId = useId();
  const [collapsed, setCollapsed] = useState(() => readCollapsed().has(id));

  function toggle() {
    const set = readCollapsed();
    if (collapsed) set.delete(id);
    else set.add(id);
    writeCollapsed(set);
    setCollapsed(!collapsed);
  }

  return (
    <section aria-labelledby={headingId} className="[&+&]:mt-1">
      <h2 id={headingId} className="m-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-body-sm font-semibold transition-colors hover:bg-surface-muted"
        >
          <ChevronDown className={cn('size-4 text-muted transition-transform duration-150', collapsed && '-rotate-90')} aria-hidden />
          <span className={cn(tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-fg')}>{title}</span>
          <span className="tabular font-medium text-muted">{count}</span>
        </button>
      </h2>
      <div id={bodyId} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
