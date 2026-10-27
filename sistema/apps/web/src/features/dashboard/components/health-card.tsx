import type { HealthScore } from '@effinance/shared';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Gauge } from '@/components/charts/gauge';
import { ProgressBar } from '@/components/ui/progress-bar';

/** Badge tone of each health label. */
export const HEALTH_TONE = { Crítica: 'danger', Atenção: 'warning', Saudável: 'success', Excelente: 'success' } as const;

/** What the score adds up (computeHealth in apps/api/src/modules/dashboard/service.ts). */
export const HEALTH_INFO =
  'Pontuação de 0 a 1000 que soma cinco fatores: taxa de economia dos últimos 3 meses, reserva de emergência, contas em dia, uso do limite dos cartões e progresso das metas.';

export function HealthCard({ health, loading }: { health: HealthScore | undefined; loading: boolean }) {
  return (
    <Card className="flex flex-col p-5">
      <CardHeader
        title="Saúde financeira"
        info={HEALTH_INFO}
        action={health ? <Badge tone={HEALTH_TONE[health.label]}>{health.label}</Badge> : null}
      />
      {loading || !health ? (
        <Skeleton className="mx-auto mt-4 h-28 w-48" />
      ) : (
        <>
          <div className="mt-3 flex justify-center">
            <Gauge score={health.score} size={190} />
          </div>
          <details className="group mt-1">
            <summary className="cursor-pointer list-none text-center text-xs font-semibold text-brand-text hover:underline">
              Ver fatores
            </summary>
            <ul className="mt-3 flex flex-col gap-2.5">
              {health.factors.map((f) => (
                <li key={f.label}>
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{f.label}</span>
                    <span className="tabular text-muted">
                      {f.score}/{f.max}
                    </span>
                  </div>
                  <ProgressBar value={f.max ? f.score / f.max : 0} size="sm" className="mt-1" tone={f.score / (f.max || 1) < 0.4 ? 'danger' : 'brand'} />
                  <p className="mt-1 text-[11px] text-muted">{f.hint}</p>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </Card>
  );
}
