import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { CircleCheck, Printer, TriangleAlert, X } from 'lucide-react';
import { FEE_ADJUSTMENT_SKIP_LABELS, formatBRL, formatMonthKey, type FeeAdjustmentApplyResponse } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { pluralize } from '@/lib/utils';
import { batchIndexLabel, formatBps, monthInSentence } from '../logic';

export const lettersPath = (id: string) => `/clientes/reajuste/${id}/cartas`;

/** After "Aplicar reajuste": who got the new period, who was left out and why, and the letters. */
export function ApplyResult({ result, onClose }: { result: FeeAdjustmentApplyResponse; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [result]);

  const { adjustment, created, skipped } = result;
  const before = created.reduce((sum, c) => sum + c.previous.amount, 0);
  const after = created.reduce((sum, c) => sum + c.adjusted.amount, 0);
  const title = adjustment ? `Reajuste aplicado a ${pluralize(created.length, 'cliente', 'clientes')}` : 'Nenhum cliente foi reajustado';

  return (
    <Card className="p-5" role="region" aria-label="Resultado do reajuste">
      <div className="flex items-start gap-3">
        {adjustment ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> : <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />}
        <div className="min-w-0 flex-1">
          <h2 ref={heading} tabIndex={-1} className="text-title-sm font-semibold tracking-tight text-fg outline-none">
            {title}
          </h2>
          {adjustment ? (
            <p className="mt-0.5 text-sm text-muted tabular">
              {formatBps(adjustment.appliedBps)} ({batchIndexLabel(adjustment)}) · vigências de {monthInSentence(formatMonthKey(adjustment.month))} · honorários de {formatBRL(before)} → {formatBRL(after)} por mês
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted">Nada foi gravado. Veja abaixo o motivo de cada cliente.</p>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Fechar o resultado" onClick={onClose}>
          <X />
        </Button>
      </div>

      {skipped.length ? (
        <div className="mt-4 rounded-lg border border-border p-3 sm:ml-8">
          <p className="text-[13px] font-medium text-fg">{pluralize(skipped.length, 'cliente ficou de fora', 'clientes ficaram de fora')}</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-[13px]">
            {skipped.map((s) => (
              <li key={s.clientId} className="flex flex-wrap gap-x-2">
                <span className="font-medium text-fg">{s.name ?? 'Cliente não encontrado'}</span>
                <span className="text-muted">{FEE_ADJUSTMENT_SKIP_LABELS[s.reason]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {adjustment ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:ml-8">
          <Button asChild>
            <Link to={lettersPath(adjustment.id)}>
              <Printer /> Imprimir cartas
            </Link>
          </Button>
          <p className="text-xs text-muted">Uma carta por cliente, com a memória de cálculo, para o aviso de 30 dias (cláusula 3.5).</p>
        </div>
      ) : null}
    </Card>
  );
}
