import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, FileText, Printer, TriangleAlert } from 'lucide-react';
import { formatMonthKey } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import { usePrintInLight } from '@/lib/print';
import { isUuid } from '@/lib/safe-url';
import { pluralize } from '@/lib/utils';
import { useFeeAdjustmentLetters } from '../api';
import { AdjustmentLetter } from '../components/adjustment-letter';
import { letterDate, noticeOnTime } from '../letter-text';
import { batchIndexLabel, formatBps } from '../logic';

const HISTORY_PATH = '/clientes/reajuste?aba=historico';
/** A4 at real size (the letters are laid out for 170 mm of text), one letter per page. */
const PRINT_CSS = '@media print { @page { size: A4 portrait; margin: 15mm 20mm; } html { zoom: 1 !important; } [data-sonner-toaster] { display: none !important; } }';

/**
 * The letters of a batch (contract clause 3.5): one per client, printed one per page with "Imprimir ou
 * salvar PDF" (the browser), like the client contract. Reprints show the values the batch applied.
 */
export default function FeeAdjustmentLettersPage() {
  const { id: raw } = useParams();
  const id = isUuid(raw) ? raw : null;
  const navigate = useNavigate();
  const query = useFeeAdjustmentLetters(id);
  usePrintInLight();
  const data = query.data;
  const title = data ? `Cartas do reajuste · ${formatMonthKey(data.adjustment.month)}` : 'Cartas do reajuste';

  useEffect(() => {
    if (!data) return;
    const previous = document.title;
    // The suggested file name of "Salvar como PDF".
    document.title = `Reajuste ${formatMonthKey(data.adjustment.month)} · cartas`;
    return () => {
      document.title = previous;
    };
  }, [data]);

  if (!id || (query.isError && query.error instanceof ApiRequestError && (query.error.status === 404 || query.error.status === 400))) {
    return (
      <EmptyState
        icon={<FileText />}
        title="Reajuste não encontrado"
        description="Ele pode ter sido de outro espaço ou o endereço está incompleto."
        action={
          <Button variant="outline" asChild>
            <Link to={HISTORY_PATH}>Ver o histórico de reajustes</Link>
          </Button>
        }
      />
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const date = data ? letterDate(data.adjustment.createdAt) : null;
  const edited = data?.letters.filter((l) => l.edited).length ?? 0;
  const late = data && date ? data.letters.filter((l) => !noticeOnTime(l, date)).length : 0;
  const a = data?.adjustment;

  return (
    <div className="flex flex-col gap-5">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-col gap-4 print:hidden">
        <PageHeader
          title={title}
          description={
            a && data
              ? `${pluralize(data.letters.length, 'carta', 'cartas')} · ${formatBps(a.appliedBps)} (${batchIndexLabel(a)}) · aplicado por ${a.appliedBy.name} em ${formatDateTime(a.createdAt)}`
              : undefined
          }
          actions={
            <>
              <Button variant="ghost" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(HISTORY_PATH))}>
                <ArrowLeft /> Voltar
              </Button>
              <Button disabled={!data || data.letters.length === 0} onClick={() => window.print()}>
                <Printer /> Imprimir ou salvar PDF
              </Button>
            </>
          }
        />
        {data && data.missingOffice.length ? (
          <div role="note" className="flex flex-wrap items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-fg">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="min-w-0 flex-1">
              <span className="font-semibold">Faltam dados do escritório no cabeçalho:</span> {data.missingOffice.join(', ')}.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/configuracoes?aba=escritorio">Completar o cadastro</Link>
            </Button>
          </div>
        ) : null}
        {edited || late ? (
          <p className="text-[13px] text-muted">
            {[
              edited ? `${pluralize(edited, 'carta com a vigência alterada', 'cartas com a vigência alterada')} depois do reajuste (marcadas; mostram os valores do lote)` : '',
              late ? `${pluralize(late, 'aviso', 'avisos')} fora do prazo de 30 dias` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
            .
          </p>
        ) : null}
      </div>

      {!data || !date || !a ? (
        <div className="mx-auto flex w-full max-w-[794px] flex-col gap-4 print:hidden">
          <Skeleton className="aspect-[210/297] w-full rounded-none" />
        </div>
      ) : data.letters.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Nenhuma carta neste reajuste"
          description="As vigências criadas por ele foram excluídas dos clientes."
          action={
            <Button variant="outline" asChild>
              <Link to={HISTORY_PATH}>Ver o histórico de reajustes</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col items-center gap-8 print:block" role="region" aria-label="Cartas para imprimir">
          {data.letters.map((letter) => (
            <AdjustmentLetter key={letter.feeId} letter={letter} adjustment={a} office={data.office} date={date} />
          ))}
        </div>
      )}
    </div>
  );
}
