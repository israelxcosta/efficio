import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, ChevronLeft, ChevronRight, Landmark, Sparkles } from 'lucide-react';
import { ACCOUNT_TYPE_LABELS, formatBRL, type Account, type HealthScore, type Insight } from '@effinance/shared';
import { Gauge } from '@/components/charts/gauge';
import { Badge } from '@/components/ui/badge';
import { BankLogo } from '@/components/ui/bank-logo';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { useElementSize } from '@/lib/use-element-size';
import { cn, pluralize } from '@/lib/utils';
import { HEALTH_INFO, HEALTH_TONE } from '../components/health-card';
import { INSIGHT_ICONS, INSIGHT_LABELS } from '../components/insight-card';
import type { WidgetProps } from '../layout/types';
import { FitList, WidgetCard } from '../layout/widget-card';
import { BodyEmpty, ListSkeleton } from './shared';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// ---------------------------------------------------------------------------
// Saúde financeira
// ---------------------------------------------------------------------------

type Factor = HealthScore['factors'][number];

const factorShare = (f: Factor) => (f.max > 0 ? f.score / f.max : 0);
const factorTone = (f: Factor) => (factorShare(f) < 0.4 ? 'danger' : factorShare(f) < 0.7 ? 'warning' : 'success');

/** Body width (px) from which the factors sit beside the gauge. */
const FACTORS_BESIDE_PX = 440;
/** Body height (px) from which the factors fit under the gauge (narrow cards). */
const FACTORS_BELOW_PX = 360;
/** Height the five factors need with their hint line. */
const FACTORS_WITH_HINTS_PX = 250;
/** Body height (px) from which the factors beside the gauge get more air between them. */
const FACTORS_SPREAD_PX = 400;
/** Gauge plus its label row when the factors sit below it. */
const GAUGE_BLOCK_PX = 200;
/** Label row under the gauge (badge and "Ver fatores"). */
const LABEL_ROW_PX = 28;

function FactorList({ factors, hints, className }: { factors: Factor[]; hints: 'none' | 'line' | 'full'; className?: string }) {
  return (
    <ul className={cn('flex flex-col', className)}>
      {factors.map((f) => (
        <li key={f.label} className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-caption font-medium text-fg">{f.label}</span>
            <span className="shrink-0 text-micro text-muted tabular">
              {f.score}/{f.max}
            </span>
          </div>
          <ProgressBar value={factorShare(f)} size="sm" tone={factorTone(f)} className="mt-1" label={`${f.label}: ${f.score} de ${f.max}`} />
          {hints === 'none' ? null : (
            <p className={cn('mt-1 text-micro text-muted', hints === 'line' && 'truncate')} title={hints === 'line' ? f.hint : undefined}>
              {f.hint}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Saúde financeira": gauge sized to the card; the factors sit beside it on wide cards, below it on
 * tall ones, otherwise behind a "Ver fatores" dialog.
 */
export function HealthWidget({ d, loading, alert }: WidgetProps) {
  const body = useElementSize();
  const gaugeBox = useElementSize();
  const [open, setOpen] = useState(false);
  const health = loading ? undefined : d?.health;
  const weakest = health?.factors.reduce<Factor | undefined>((w, f) => (!w || factorShare(f) < factorShare(w) ? f : w), undefined);

  const beside = body.width >= FACTORS_BESIDE_PX;
  const below = !beside && body.height >= FACTORS_BELOW_PX;
  const hints = beside ? body.height >= FACTORS_WITH_HINTS_PX : below && body.height - GAUGE_BLOCK_PX >= FACTORS_WITH_HINTS_PX;
  const gaugeSize = Math.round(clamp(Math.min(gaugeBox.width - 8, (gaugeBox.height - LABEL_ROW_PX) / 0.55), 140, 280));

  let content;
  if (!health) {
    content = (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3" aria-busy="true" aria-label="Carregando">
        <Skeleton className="aspect-[2/1] max-h-[150px] min-h-0 w-full max-w-[260px] shrink rounded-t-full rounded-b-md" />
        <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
      </div>
    );
  } else {
    content = (
      <div ref={body.ref} className={cn('flex min-h-0 flex-1', beside ? 'flex-row gap-6' : 'flex-col')}>
        <div ref={gaugeBox.ref} className={cn('flex min-h-0 flex-col items-center justify-center', beside ? 'w-[46%] shrink-0' : 'flex-1')}>
          {gaugeBox.width > 0 ? <Gauge score={health.score} size={gaugeSize} /> : null}
          <div className="mt-2 flex h-5 shrink-0 items-center gap-3">
            <Badge tone={HEALTH_TONE[health.label]}>{health.label}</Badge>
            {beside || below ? null : (
              <button type="button" onClick={() => setOpen(true)} className="text-caption font-medium text-brand-text hover:underline">
                Ver fatores
              </button>
            )}
          </div>
        </div>
        {beside || below ? (
          <FactorList
            factors={health.factors}
            hints={hints ? 'line' : 'none'}
            className={beside ? cn('min-w-0 flex-1 justify-center', body.height >= FACTORS_SPREAD_PX ? 'gap-5' : 'gap-3') : cn('mt-3 shrink-0', hints ? 'gap-3' : 'gap-2')}
          />
        ) : null}
        <Modal
          open={open}
          onOpenChange={setOpen}
          title="Fatores da saúde financeira"
          description={`Pontuação ${health.score} de 1000 · ${health.label}`}
        >
          <FactorList factors={health.factors} hints="full" className="gap-3.5" />
        </Modal>
      </div>
    );
  }

  return (
    <WidgetCard
      alert={alert}
      info={HEALTH_INFO}
      subtitle={weakest && factorShare(weakest) < 0.5 ? `Ponto fraco: ${weakest.label}` : 'Pontuação de 0 a 1000'}
    >
      {content}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Saldo em contas
// ---------------------------------------------------------------------------

/** Overlapping logos of the first accounts. */
function LogoStack({ accounts }: { accounts: Account[] }) {
  return (
    <span className="flex shrink-0 -space-x-1.5" aria-hidden>
      {accounts.slice(0, 4).map((a) => (
        <BankLogo key={a.id} bank={a.bank} color={a.color} size="xs" className="ring-2 ring-surface-muted" />
      ))}
    </span>
  );
}

/** Balance of each account, the total available, what is invested and the net worth. */
export function BalancesWidget({ d, loading, size, alert }: WidgetProps) {
  const accounts = useMemo(() => (d?.accounts ?? []).filter((a) => !a.archived), [d]);
  // Short cards keep one-line rows and drop the logos so two accounts still fit.
  const roomy = size.r >= 4;

  let body;
  if (loading || !d) {
    body = (
      <div className="flex min-h-0 flex-1 flex-col gap-2" aria-busy="true" aria-label="Carregando">
        <Skeleton className="h-[72px] w-full shrink-0 rounded-lg" />
        <ListSkeleton rowClassName="h-9" />
      </div>
    );
  } else if (accounts.length === 0) {
    body = (
      <BodyEmpty
        icon={<Landmark />}
        title="Nenhuma conta"
        description="Cadastre suas contas e carteiras."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link to="/contas">Adicionar conta</Link>
          </Button>
        }
      />
    );
  } else {
    const available = d.balances.accounts;
    body = (
      <>
        <div className="shrink-0 rounded-lg bg-surface-muted px-3 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-caption text-muted">Saldo disponível</span>
            <span className={cn('ml-auto text-kpi font-semibold tracking-tight tabular', available < 0 ? 'text-danger' : 'text-fg')}>
              {formatBRL(available)}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            {roomy ? <LogoStack accounts={accounts} /> : null}
            <span className="min-w-0 truncate text-mini text-muted">
              {pluralize(accounts.length, 'conta', 'contas')} · investido{' '}
              <span className="font-semibold text-brand-text tabular">{formatBRL(d.balances.investments)}</span>
            </span>
          </div>
          <p className="mt-0.5 truncate text-mini text-muted" title="Contas e investimentos menos o que está em aberto nos cartões">
            Patrimônio{' '}
            <span className={cn('font-semibold tabular', d.balances.netWorth < 0 ? 'text-danger' : 'text-fg')}>{formatBRL(d.balances.netWorth)}</span>
          </p>
        </div>
        <div className="mt-2 flex min-h-0 flex-1 flex-col">
          <FitList
            items={accounts}
            getKey={(a) => a.id}
            moreLabel="conta(s)"
            moreHref="/contas"
            className="flex flex-col"
            contentKey={String(roomy)}
            renderItem={(a) => (
              <Link
                to={`/extrato?conta=${a.id}`}
                className="flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-muted"
              >
                <BankLogo bank={a.bank} color={a.color} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-fg">{a.name}</span>
                  {roomy ? <span className="block truncate text-micro text-muted">{ACCOUNT_TYPE_LABELS[a.type]}</span> : null}
                </span>
                <span className="hidden w-28 shrink-0 text-right @md:block">
                  <span className="block text-micro text-muted">fim do mês</span>
                  <span className={cn('block text-caption tabular', a.projectedBalance < 0 ? 'text-danger' : 'text-muted')}>
                    {formatBRL(a.projectedBalance)}
                  </span>
                </span>
                <span className={cn('shrink-0 text-right text-body-sm font-semibold tabular @md:w-28', a.balance < 0 ? 'text-danger' : 'text-fg')}>
                  {formatBRL(a.balance)}
                </span>
              </Link>
            )}
          />
        </div>
      </>
    );
  }

  return (
    <WidgetCard
      alert={alert}
      subtitle="Saldo de hoje em cada conta"
      footer={
        // At 3 rows the "+ N conta(s)" line already leads to /contas: the room goes to a second account.
        roomy && accounts.length > 0 && !loading ? (
          <Link to="/contas" className="text-caption font-medium text-brand-text hover:underline">
            Gerenciar contas →
          </Link>
        ) : undefined
      }
    >
      {body}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

/** Line height (px) of `text-caption`: the description shows as many lines as its box holds. */
const CAPTION_LINE_PX = 16;

const heroButton =
  'flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white [&_svg]:size-3.5';

function KindChip({ insight }: { insight: Insight }) {
  const Icon = INSIGHT_ICONS[insight.kind];
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 text-micro font-medium text-white/90">
      <Icon className="size-3" aria-hidden /> {INSIGHT_LABELS[insight.kind]}
    </span>
  );
}

/** One insight at a time with previous/next buttons; the description fills the remaining height. */
function InsightCarousel({ insights, index, onStep, dots }: { insights: Insight[]; index: number; onStep: (step: number) => void; dots: boolean }) {
  const desc = useElementSize<HTMLParagraphElement>();
  const current = insights[index]!;
  const lines = Math.max(1, Math.floor(desc.height / CAPTION_LINE_PX));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-white/12 bg-white/8 px-3 py-2.5" aria-live="polite">
        <div className="flex shrink-0 items-center gap-1.5">
          <KindChip insight={current} />
          {current.href ? (
            <Link to={current.href} className="text-white/65 hover:text-white" aria-label="Abrir análise">
              <ArrowUpRight className="size-3.5" />
            </Link>
          ) : null}
          {insights.length > 1 ? (
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => onStep(-1)} className={heroButton} aria-label="Insight anterior">
                <ChevronLeft />
              </button>
              <span className="min-w-7 text-center text-micro text-white/70 tabular">
                {index + 1}/{insights.length}
              </span>
              <button type="button" onClick={() => onStep(1)} className={heroButton} aria-label="Próximo insight">
                <ChevronRight />
              </button>
            </div>
          ) : null}
        </div>
        <p className="mt-1.5 shrink-0 truncate text-body-sm font-semibold text-white" title={current.title}>
          {current.title}
        </p>
        <p
          ref={desc.ref}
          className="mt-0.5 min-h-0 flex-1 overflow-hidden text-caption text-white/70"
          style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines }}
        >
          {current.description}
        </p>
      </div>
      {dots && insights.length > 1 ? (
        <div className="mt-2 flex shrink-0 justify-center gap-1.5" aria-hidden>
          {insights.map((_, i) => (
            <span key={i} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/30')} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Every insight as a row, cut to the card's height ("+ N" opens the "Dashboard inteligente" tab). */
function InsightRows({ insights }: { insights: Insight[] }) {
  return (
    // FitList's "+ N" line is styled for light cards: repaint it for the navy gradient.
    <div className="flex min-h-0 flex-1 flex-col [&>div>p]:text-white/70 [&>div>p_a]:text-white">
      <FitList
        items={insights}
        getKey={(ins) => `${ins.kind}:${ins.title}`}
        moreLabel="insight(s)"
        moreHref="/?aba=insights"
        className="flex flex-col gap-2"
        renderItem={(ins) => {
          const Icon = INSIGHT_ICONS[ins.kind];
          return (
            <div className="flex items-start gap-2.5 rounded-lg border border-white/12 bg-white/8 px-2.5 py-2">
              <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-md bg-white/15 text-white" title={INSIGHT_LABELS[ins.kind]}>
                <Icon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-semibold text-white" title={ins.title}>
                  <span className="sr-only">{INSIGHT_LABELS[ins.kind]}: </span>
                  {ins.title}
                </p>
                <p className="line-clamp-2 text-caption text-white/70">{ins.description}</p>
              </div>
              {ins.href ? (
                <Link to={ins.href} className="mt-0.5 shrink-0 text-white/60 hover:text-white" aria-label={`Abrir análise: ${ins.title}`}>
                  <ArrowUpRight className="size-3.5" />
                </Link>
              ) : null}
            </div>
          );
        }}
      />
    </div>
  );
}

/**
 * "Insights" (navy card): a carousel on small cards (at 2 rows without subtitle and dots so it fits);
 * on tall or wide cards every insight is listed.
 */
export function InsightsWidget({ d, loading, size, month, alert }: WidgetProps) {
  const insights = d?.insights ?? [];
  const [pos, setPos] = useState({ month, index: 0 });
  const index = pos.month === month ? Math.min(pos.index, Math.max(0, insights.length - 1)) : 0;
  const compact = size.r <= 2;
  const asList = !compact && (size.r >= 4 || size.c >= 2) && insights.length > 1;

  let body;
  if (loading || !d) {
    body = <Skeleton className="min-h-0 flex-1 rounded-lg bg-white/10" />;
  } else if (insights.length === 0) {
    body = (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed border-white/20 px-3 text-center">
        <Sparkles className="size-4 shrink-0 text-white/60" aria-hidden />
        <p className="text-body-sm font-semibold text-white">Sem insights neste mês</p>
        {compact ? null : <p className="text-caption text-white/65">Assim que houver movimentações, trago análises e recomendações do mês.</p>}
      </div>
    );
  } else if (asList) {
    body = <InsightRows insights={insights} />;
  } else {
    body = (
      <InsightCarousel
        insights={insights}
        index={index}
        dots={!compact}
        onStep={(step) => setPos({ month, index: (index + step + insights.length) % insights.length })}
      />
    );
  }

  return (
    <WidgetCard
      variant="hero"
      alert={alert}
      subtitle={compact ? undefined : insights.length ? `${pluralize(insights.length, 'análise', 'análises')} do mês` : 'Análises automáticas do mês'}
    >
      {body}
    </WidgetCard>
  );
}
