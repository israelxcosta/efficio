import { Percent, RotateCcw } from 'lucide-react';
import { DELINQUENCY_RISK_LABELS, formatBRL, formatDateBR, type DelinquencyClient, type DelinquencyRisk, type ISODate, type ReworkCounts } from '@effinance/shared';
import { StackBar } from '@/components/charts/stack-bar';
import { Card, CardHeader } from '@/components/ui/card';
import { cn, pluralize } from '@/lib/utils';
import { bandNames, formatChance, reworkSummary, riskBands } from '../delinquency-view';

/**
 * Colours of each risk band (tokens only, spec §5.3): low risk is neutral (colour only on the clients
 * at risk), Atenção yellow, Risco alto orange, Crítico red. No green: it is not a change.
 */
export const RISK_TONE: Record<DelinquencyRisk, { text: string; bg: string; soft: string; color: string }> = {
  baixo: { text: 'text-fg', bg: 'bg-[var(--app-chart-neutral)]', soft: 'bg-bg-subtle text-muted', color: 'var(--app-chart-neutral)' },
  moderado: { text: 'text-warning', bg: 'bg-[var(--app-chart-yellow)]', soft: 'bg-warning-soft text-warning', color: 'var(--app-chart-yellow)' },
  alto: { text: 'text-aging-3', bg: 'bg-[var(--app-chart-orange)]', soft: 'bg-aging-2/15 text-aging-3', color: 'var(--app-chart-orange)' },
  critico: { text: 'text-danger', bg: 'bg-danger', soft: 'bg-danger-soft text-danger', color: 'var(--app-danger)' },
};

/** Worst first: the order of the bar and of the bands of "Carteira por risco". */
const WORST_FIRST: DelinquencyRisk[] = ['critico', 'alto', 'moderado', 'baixo'];

export function RiskBadge({ risk, className }: { risk: DelinquencyRisk; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-mini font-semibold whitespace-nowrap', RISK_TONE[risk].soft, className)}>
      {DELINQUENCY_RISK_LABELS[risk]}
    </span>
  );
}

const PORTFOLIO_HELP =
  'Clientes do relatório pela faixa do score (sempre sobre os últimos 12 meses, com o desconto do retrabalho), com o valor vencido em aberto de cada faixa. A chance média de atraso pondera cada cliente pelo número de mensalidades e não considera o retrabalho.';

/**
 * Carteira por risco (spec §5.3), in place of the thermometer: how many clients are at high or
 * critical risk, the bar of the bands (worst first), each band with its clients and open amount,
 * the average chance of paying late and the rework of the last 90 days.
 */
export function PortfolioRiskCardView({
  clients,
  probability,
  from,
  to,
  className,
}: {
  clients: readonly DelinquencyClient[];
  probability: number;
  from: ISODate;
  to: ISODate;
  className?: string;
}) {
  const bands = riskBands(clients);
  const atRisk = bands.critico.count + bands.alto.count;
  const rework = reworkSummary(clients);
  const oneIn = probability > 0 ? Math.max(1, Math.round(1 / probability)) : null;
  return (
    <Card className={cn('flex min-w-0 flex-col p-4 sm:p-5', className)}>
      <CardHeader title="Carteira por risco" subtitle={`Score de 12 meses · vencimentos de ${formatDateBR(from)} a ${formatDateBR(to)}`} info={PORTFOLIO_HELP} />
      <div className="mt-4 flex flex-1 flex-col">
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className={cn('tabular text-kpi font-semibold tracking-tight whitespace-nowrap', atRisk > 0 ? 'text-danger' : 'text-fg')}>
            {`${atRisk} de ${clients.length}`}
          </span>
          <span className="text-caption text-muted">clientes em risco alto ou crítico</span>
        </p>
        <StackBar className="mt-3" segments={WORST_FIRST.map((risk) => ({ value: bands[risk].count, className: RISK_TONE[risk].bg, label: DELINQUENCY_RISK_LABELS[risk] }))} />
        <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Clientes por faixa de risco">
          {WORST_FIRST.map((risk) => {
            const band = bands[risk];
            const names = bandNames([...clients], risk);
            return (
              <li key={risk} className="flex min-w-0 flex-col justify-center py-2">
                <span className="flex items-center gap-2">
                  <span className={cn('size-2.5 shrink-0 rounded-[3px]', RISK_TONE[risk].bg)} aria-hidden />
                  <span className={cn('min-w-0 flex-1 truncate text-body-sm font-medium', band.count === 0 ? 'text-subtle' : 'text-fg')}>
                    {DELINQUENCY_RISK_LABELS[risk]} <span className="font-normal text-muted">{`· ${band.count}`}</span>
                  </span>
                  <span
                    className={cn(
                      'tabular shrink-0 text-body-sm font-semibold',
                      band.openAmount > 0 ? (risk === 'baixo' ? 'text-fg' : 'text-danger') : 'font-normal text-subtle',
                    )}
                  >
                    {band.openAmount > 0 ? formatBRL(band.openAmount) : band.count === 0 ? '—' : 'em dia'}
                  </span>
                </span>
                <span className="mt-0.5 block truncate pl-[18px] text-micro text-muted">
                  {band.openAmount > 0 ? `${names} · em aberto` : names}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3 text-caption text-muted">
          <p className="flex items-start gap-1.5">
            <Percent className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
            <span>
              {oneIn === null ? (
                'Nenhum atraso no histórico recente da carteira.'
              ) : (
                <>
                  Chance média de atraso: <b className="font-semibold text-fg">{formatChance(probability)}</b>{' '}
                  {oneIn <= 1 ? '(praticamente toda mensalidade)' : `(cerca de 1 em cada ${oneIn} mensalidades)`}
                </>
              )}
            </span>
          </p>
          <p className="flex items-start gap-1.5">
            <RotateCcw className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
            <span>
              {rework.clients === 0 ? (
                'Nenhum cliente com retrabalho nos últimos 90 dias.'
              ) : (
                <>
                  <b className="font-semibold text-fg">{`${pluralize(rework.clients, 'cliente', 'clientes')} com retrabalho`}</b>
                  {` (${pluralize(rework.tasks, 'tarefa', 'tarefas')} em 90 dias)`}
                </>
              )}
            </span>
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Small horizontal gauge of a client's score (0..1000), filled in the colour of its risk band (grey for low risk). */
export function ScoreBar({ score, risk, className }: { score: number; risk: DelinquencyRisk; className?: string }) {
  const pct = Math.max(0, Math.min(1000, score)) / 10;
  return (
    <span className={cn('block h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle', className)} aria-hidden>
      <span className={cn('block h-full min-w-1 rounded-full', RISK_TONE[risk].bg)} style={{ width: `${pct}%` }} />
    </span>
  );
}

export interface ScoreCompositionInput {
  punctuality: number;
  openPenalty: number;
  /** Open past-due receivables behind `openPenalty`. */
  openCount: number;
  reworkPenalty: number;
  rework: ReworkCounts;
  score: number;
}

/** "(2 + 1 antiga)" / "(2)" / "(1 antiga)": the rework behind the penalty. */
export function reworkPartsLabel(rework: ReworkCounts): string {
  const older = Math.max(0, rework.last12Months - rework.last90Days);
  const olderText = `${older} ${older === 1 ? 'antiga' : 'antigas'}`;
  if (rework.last90Days > 0 && older > 0) return `${rework.last90Days} + ${olderText}`;
  return rework.last90Days > 0 ? String(rework.last90Days) : olderText;
}

/**
 * The parts of the score, one per line with the value on the right (spec §5.4): punctuality, the open
 * penalty and the rework penalty (each only when it takes something), then "= score". `tone="inverse"`
 * for the dark tooltip.
 */
export function ScoreComposition({
  s,
  tone = 'default',
  full = false,
  className,
}: {
  s: ScoreCompositionInput;
  tone?: 'default' | 'inverse';
  /** Client report: every part (also the zero ones) with the longer labels. */
  full?: boolean;
  className?: string;
}) {
  const inverse = tone === 'inverse';
  const older = Math.max(0, s.rework.last12Months - s.rework.last90Days);
  const rows: { label: string; value: string; danger?: boolean }[] = [{ label: 'Pontualidade', value: String(s.punctuality) }];
  if (full || s.openPenalty > 0) {
    rows.push({
      label: full ? `Em aberto (${s.openCount} ${s.openCount === 1 ? 'vencida' : 'vencidas'})` : `Em aberto (${s.openCount})`,
      value: s.openPenalty > 0 ? `−${s.openPenalty}` : '0',
      danger: s.openPenalty > 0,
    });
  }
  if (full || s.reworkPenalty > 0) {
    rows.push({
      label: full ? `Retrabalho (${s.rework.last90Days} em 90 dias${older > 0 ? ` + ${older}` : ''})` : `Retrabalho (${reworkPartsLabel(s.rework)})`,
      value: s.reworkPenalty > 0 ? `−${s.reworkPenalty}` : '0',
      danger: s.reworkPenalty > 0,
    });
  }
  return (
    <dl className={cn('tabular flex flex-col gap-0.5', className)}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4">
          <dt className={inverse ? undefined : 'text-muted'}>{r.label}</dt>
          <dd className={cn('font-semibold whitespace-nowrap', !inverse && (r.danger ? 'text-danger' : 'text-fg'))}>{r.value}</dd>
        </div>
      ))}
      <div className={cn('mt-0.5 flex items-baseline justify-between gap-4 border-t pt-1 font-semibold', inverse ? 'border-bg/30' : 'border-border text-fg')}>
        <dt>Score</dt>
        <dd className="whitespace-nowrap">{`= ${s.score}`}</dd>
      </div>
    </dl>
  );
}
