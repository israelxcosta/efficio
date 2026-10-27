import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Plus, Repeat, Target } from 'lucide-react';
import { formatBRL, formatDateBR, todayISO, type Goal, type Transaction } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { WriteGate } from '@/features/auth/permissions';
import { GoalProgress } from '@/features/goals/goal-card';
import { useTransactionActions } from '@/features/transactions/transaction-actions';
import { useElementSize } from '@/lib/use-element-size';
import { cn, pluralize } from '@/lib/utils';
import { fitCount } from '../layout/layout';
import type { WidgetProps } from '../layout/types';
import { FitList, WidgetCard } from '../layout/widget-card';
import { BodyEmpty, CompactTransactionRow, ListSkeleton } from './shared';

const headerLink = 'text-caption font-medium whitespace-nowrap text-brand-text hover:underline';

// ---------------------------------------------------------------------------
// Gastos fixos / Receitas fixas
// ---------------------------------------------------------------------------

const FIXED = {
  expense: {
    list: '/contas-a-pagar',
    settled: 'Pago',
    emptyTitle: 'Nenhum gasto fixo cadastrado',
    emptyText: 'Cadastre aluguel, assinaturas e contas mensais para prever o mês com precisão.',
    cta: 'Adicionar gasto fixo',
  },
  income: {
    list: '/contas-a-receber',
    settled: 'Recebido',
    emptyTitle: 'Nenhuma receita fixa cadastrada',
    emptyText: 'Cadastre salário, aluguéis recebidos e outras entradas recorrentes.',
    cta: 'Adicionar receita fixa',
  },
} as const;

/** Open entries first (what still needs action), each group by due date. */
function openFirst(items: readonly Transaction[]): Transaction[] {
  return [...items].sort((a, b) => Number(a.paid) - Number(b.paid) || a.date.localeCompare(b.date));
}

function FixedWidget({ type, d, loading, month, size, alert }: WidgetProps & { type: 'expense' | 'income' }) {
  const actions = useTransactionActions();
  const copy = FIXED[type];
  const source = type === 'expense' ? d?.fixedExpenses : d?.fixedIncome;
  const items = useMemo(() => openFirst(source ?? []), [source]);
  const total = items.reduce((a, t) => a + t.amount, 0);
  const settled = items.reduce((a, t) => a + (t.paid ? t.amount : 0), 0);
  const today = todayISO();
  const href = `${copy.list}?data=${month}-01`;
  const showProgress = size.r >= 4 && total > 0;

  let body;
  if (loading || !d) {
    body = <ListSkeleton />;
  } else if (items.length === 0) {
    body = (
      <BodyEmpty
        icon={<Repeat />}
        title={copy.emptyTitle}
        description={copy.emptyText}
        action={
          <WriteGate>
            <Button variant="outline" size="sm" onClick={() => actions.openTransaction({ type })}>
              <Plus /> {copy.cta}
            </Button>
          </WriteGate>
        }
      />
    );
  } else {
    const share = total > 0 ? settled / total : 0;
    body = (
      <>
        {showProgress ? (
          <div className="mb-2 shrink-0 px-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-caption text-muted">
                {copy.settled} <span className="font-semibold text-fg tabular">{formatBRL(settled)}</span> de {formatBRL(total)}
              </span>
              <span className="shrink-0 text-caption font-semibold text-fg tabular">{Math.round(share * 100)}%</span>
            </div>
            <ProgressBar
              value={share}
              size="sm"
              tone="success"
              className="mt-1"
              label={`${copy.settled} ${Math.round(share * 100)}% dos lançamentos fixos do mês`}
            />
          </div>
        ) : null}
        <FitList
          items={items}
          getKey={(t) => t.id}
          moreLabel="lançamento(s)"
          moreHref={href}
          className="flex flex-col"
          renderItem={(tx) => <CompactTransactionRow tx={tx} today={today} />}
        />
      </>
    );
  }

  return (
    <WidgetCard
      alert={alert}
      subtitle={items.length ? `${pluralize(items.length, 'lançamento', 'lançamentos')} · ${formatBRL(total)}/mês` : 'Lançamentos fixos do mês'}
      action={
        <Link to={href} className={headerLink}>
          Ver todos →
        </Link>
      }
    >
      {body}
    </WidgetCard>
  );
}

/** Fixed (recurring) expenses of the month. */
export function FixedExpensesWidget(props: WidgetProps) {
  return <FixedWidget {...props} type="expense" />;
}

/** Fixed (recurring) income of the month. */
export function FixedIncomeWidget(props: WidgetProps) {
  return <FixedWidget {...props} type="income" />;
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

/** Height of the "+ N meta(s)" line (same as FitList's). */
const MORE_LINE_PX = 20;

/** Goals per row from the list width (px). */
const goalColumns = (width: number) => (width >= 960 ? 3 : width >= 600 ? 2 : 1);

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function goalDetail(goal: Goal): { text: string; tone: string } {
  if (goal.completed) return { text: 'Meta atingida', tone: 'font-medium text-success' };
  if (!goal.deadline) return { text: 'Sem prazo definido', tone: 'text-muted' };
  if (goal.deadline < todayISO()) return { text: `Prazo encerrado em ${formatDateBR(goal.deadline)}`, tone: 'font-medium text-danger' };
  const monthly = goal.monthlyNeeded ? ` · ${formatBRL(goal.monthlyNeeded)}/mês` : '';
  return { text: `Até ${formatDateBR(goal.deadline)}${monthly}`, tone: 'text-muted' };
}

/**
 * Goals in a grid of 1–3 columns, cut to the rows that fit. FitList counts its rows, and here a row
 * holds several goals, so the "+ N meta(s)" count is done locally.
 */
function GoalGrid({ goals, detail }: { goals: Goal[]; detail: boolean }) {
  const box = useElementSize();
  const listRef = useRef<HTMLDivElement>(null);
  const cols = goalColumns(box.width);
  const rows = useMemo(() => chunk(goals, cols), [goals, cols]);
  const [count, setCount] = useState(rows.length);
  const signature = `${rows.length}:${cols}:${box.width}:${box.height}:${detail}`;

  // Size or content changed: render every row again, then measure them below.
  useLayoutEffect(() => {
    setCount(rows.length);
  }, [signature, rows.length]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || box.height === 0) return;
    const children = Array.from(list.children) as HTMLElement[];
    if (children.length !== rows.length) return;
    const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
    const next = fitCount(
      children.map((row) => row.offsetHeight),
      box.height,
      MORE_LINE_PX,
      gap,
    );
    if (next !== count) setCount(next);
  });

  const shown = rows.slice(0, count);
  const hidden = goals.length - shown.reduce((a, row) => a + row.length, 0);
  return (
    <div ref={box.ref} className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={listRef} className="flex flex-col gap-1">
        {shown.map((row) => (
          <div key={row[0]!.id} className="grid gap-x-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {row.map((goal) => {
              const extra = detail ? goalDetail(goal) : null;
              return (
                <Link key={goal.id} to="/metas" className="block min-w-0 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-muted">
                  <GoalProgress goal={goal} />
                  {extra ? <p className={cn('mt-0.5 truncate pl-11 text-micro', extra.tone)}>{extra.text}</p> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      {hidden > 0 ? (
        <p className="absolute inset-x-0 bottom-0 flex h-5 items-end px-1 text-caption text-muted">
          <Link to="/metas" className="font-medium text-brand-text hover:underline">
            {`+ ${hidden} meta(s)`}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/** Progress of the active goals. */
export function GoalsWidget({ d, loading, size, alert }: WidgetProps) {
  const goals = useMemo(() => (d?.goals ?? []).filter((g) => !g.archived), [d]);
  const saved = goals.reduce((a, g) => a + g.currentAmount, 0);
  const target = goals.reduce((a, g) => a + g.targetAmount, 0);

  let body;
  if (loading || !d) {
    body = <ListSkeleton rowClassName="h-12" />;
  } else if (goals.length === 0) {
    body = (
      <BodyEmpty
        icon={<Target />}
        title="Você ainda não tem metas ativas"
        description="Metas ajudam a priorizar seu plano financeiro e acompanhar o progresso."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link to="/metas">Criar meta</Link>
          </Button>
        }
      />
    );
  } else {
    body = <GoalGrid goals={goals} detail={size.r >= 4} />;
  }

  return (
    <WidgetCard
      alert={alert}
      subtitle={
        goals.length
          ? `${pluralize(goals.length, 'meta ativa', 'metas ativas')} · ${formatBRL(saved)} de ${formatBRL(target)}`
          : 'Progresso das metas ativas'
      }
      action={
        <Link to="/metas" className={headerLink}>
          Ver todas →
        </Link>
      }
    >
      {body}
    </WidgetCard>
  );
}
