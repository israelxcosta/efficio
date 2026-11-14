import { adjustmentFactorText, formatBRL, formatDateBR, indexValuesOf, type FeeAdjustment, type FeeAdjustmentLetter, type FeeAdjustmentLetterOffice, type ISODate } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatBps, indexRows } from '../logic';
import { batchBasis, dateLine, letterheadLines, noticeOnTime, recipientLines } from '../letter-text';

interface AdjustmentLetterProps {
  letter: FeeAdjustmentLetter;
  adjustment: FeeAdjustment;
  office: FeeAdjustmentLetterOffice;
  /** Date of the letter (the day the batch was applied). */
  date: ISODate;
}

const cell = 'border border-border-strong px-2.5 py-1.5';
const figure = 'text-right whitespace-nowrap tabular';

/**
 * One letter on an A4 sheet (screen) and on its own printed page: letterhead, addressee, the formal text
 * citing clause 3, the calculation table (the four indices, the chosen one, the factor), the old and new
 * values, the start of the new period and the date. Above it, on screen only, the marks the office should
 * see before sending: period edited after the batch, notice out of the 30 days.
 */
export function AdjustmentLetter({ letter, adjustment, office, date }: AdjustmentLetterProps) {
  const head = letterheadLines(office);
  const basis = batchBasis(adjustment);
  const factor = adjustmentFactorText(adjustment.appliedBps);
  const indices = indexRows(indexValuesOf(adjustment.indices), adjustment.chosenIndex);
  const start = formatDateBR(letter.period.startDate);
  const onTime = noticeOnTime(letter, date);
  const showEmployee = letter.previous.employeeFee > 0 || letter.adjusted.employeeFee > 0;
  const logo = office.logo?.startsWith('data:image/') ? office.logo : null;
  const signer = office.responsibleName ?? head.name;
  const addressee = letter.client.tradeName || letter.client.name;

  return (
    <div className="flex w-full max-w-[794px] flex-col gap-2 print:block print:max-w-none print:break-after-page print:last:break-after-auto">
      {letter.edited || !onTime ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted print:hidden">
          {letter.edited ? (
            <span className="flex items-center gap-1.5">
              <Badge tone="warning">Vigência alterada depois</Badge>
              os valores abaixo são os aplicados pelo lote
            </span>
          ) : null}
          {!onTime ? (
            <span className="flex items-center gap-1.5">
              <Badge tone="danger">Aviso fora do prazo</Badge>
              deveria sair até {formatDateBR(letter.noticeDeadline)}
            </span>
          ) : null}
        </div>
      ) : null}

      <article
        aria-label={`Carta para ${addressee}`}
        className="flex flex-col gap-4 bg-surface px-6 py-8 text-[13px] leading-[1.55] text-fg print:gap-2.5 print:text-[12.5px] print:leading-[1.45] shadow-xs ring-1 ring-border sm:px-12 sm:py-12 lg:px-[76px] lg:py-[68px] print:bg-white print:p-0 print:text-black print:shadow-none print:ring-0"
      >
        <header className="flex flex-col items-start gap-3 border-b border-border pb-4 sm:flex-row sm:gap-4 print:flex-row print:gap-4">
          {logo ? <img src={logo} alt="" className="h-14 max-w-[160px] shrink-0 object-contain object-left" /> : null}
          <div className="min-w-0">
            {head.name ? <p className="text-[15px] font-bold tracking-tight">{head.name}</p> : null}
            {head.lines.map((line) => (
              <p key={line} className="text-[11.5px] text-muted print:text-black/70">
                {line.split(' · ').map((part, i) => (
                  <span key={i}>
                    {i > 0 ? ' · ' : ''}
                    <span className="whitespace-nowrap">{part}</span>
                  </span>
                ))}
              </p>
            ))}
          </div>
        </header>

        <p className="text-right">{dateLine(office.city, date)}</p>

        <address className="not-italic">
          <span className="block">À</span>
          {recipientLines(letter.client).map((line, i) => (
            <span key={`${i}-${line}`} className={cn('block', i === 0 && 'font-semibold')}>
              {line}
            </span>
          ))}
        </address>

        <p className="font-semibold">Assunto: reajuste anual dos honorários contábeis a partir de {start}</p>

        <p>Prezados(as),</p>
        <p className="sm:text-justify print:text-justify">
          Em cumprimento à cláusula 3 do Contrato de Prestação de Serviços Contábeis firmado entre as partes, comunicamos o reajuste anual dos
          honorários, aplicado a cada período de 12 (doze) meses pela maior variação positiva acumulada nos 12 meses anteriores à data-base entre o
          IGP-M (FGV), o IPCA (IBGE), o INPC (IBGE) e o reajuste salarial da convenção coletiva (CCT), conforme a cláusula 3.3.
          {basis === 'negotiated' ? ` O percentual aplicado, de ${formatBps(adjustment.appliedBps)}, foi negociado entre as partes, nos termos da cláusula 3.6.` : ''}
          {basis === 'none' ? ' Nenhum dos índices teve variação positiva no período; por isso, os valores permanecem os mesmos.' : ''}
        </p>

        <div className="flex flex-col gap-4 print:gap-3">
          {/* Phones: one index per row. */}
          <table className="w-full border-collapse text-[12.5px] sm:hidden print:hidden">
            <caption className="pb-1 text-left text-[12.5px] font-semibold">Memória de cálculo</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(cell, 'w-3/5 text-left font-semibold')}>
                  Índice
                </th>
                <th scope="col" className={cn(cell, 'text-right font-semibold')}>
                  Acumulado em 12 meses
                </th>
              </tr>
            </thead>
            <tbody>
              {indices.map((row) => (
                <tr key={row.index}>
                  <th scope="row" className={cn(cell, 'text-left', row.chosen ? 'font-semibold' : 'font-normal')}>
                    {row.label}
                    {row.chosen ? ' (aplicado)' : ''}
                  </th>
                  <td className={cn(cell, figure, row.chosen && 'font-semibold')}>{row.value}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className={cn(cell, 'text-left font-semibold')}>
                  Percentual aplicado
                </th>
                <td className={cn(cell, figure, 'font-semibold')}>{formatBps(adjustment.appliedBps)}</td>
              </tr>
              <tr>
                <th scope="row" className={cn(cell, 'text-left font-semibold')}>
                  Fator de reajuste
                </th>
                <td className={cn(cell, figure, 'font-semibold')}>{factor}</td>
              </tr>
            </tbody>
          </table>
          {/* Wider screens and paper: the four indices side by side, then the percentage and the factor (one page per letter). */}
          <table className="hidden w-full table-fixed border-collapse text-[12.5px] sm:table print:table">
            <caption className="pb-1 text-left text-[12.5px] font-semibold">Memória de cálculo (variação acumulada em 12 meses)</caption>
            <thead>
              <tr>
                {indices.map((row) => (
                  <th key={row.index} scope="col" className={cn(cell, 'text-right align-bottom', row.chosen ? 'font-semibold' : 'font-normal')}>
                    {row.label}
                  </th>
                ))}
                <th scope="col" className={cn(cell, 'text-right align-bottom font-semibold')}>
                  Percentual aplicado
                </th>
                <th scope="col" className={cn(cell, 'text-right align-bottom font-semibold')}>
                  Fator de reajuste
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {indices.map((row) => (
                  <td key={row.index} className={cn(cell, figure, row.chosen && 'font-semibold')}>
                    {row.value}
                    {row.chosen ? <span className="block text-[11px] font-normal text-muted print:text-black/70">aplicado</span> : null}
                  </td>
                ))}
                <td className={cn(cell, figure, 'font-semibold')}>{formatBps(adjustment.appliedBps)}</td>
                <td className={cn(cell, figure, 'font-semibold')}>{factor}</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse text-[12.5px]">
            <caption className="pb-1 text-left text-[12.5px] font-semibold">Valores do contrato</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(cell, 'w-2/5 text-left font-semibold')}>
                  <span className="sr-only">Item</span>
                </th>
                <th scope="col" className={cn(cell, 'text-right font-semibold')}>
                  Atual
                </th>
                <th scope="col" className={cn(cell, 'text-right font-semibold')}>
                  A partir de {start}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className={cn(cell, 'text-left font-normal')}>
                  Honorário mensal
                </th>
                <td className={cn(cell, figure)}>{formatBRL(letter.previous.amount)}</td>
                <td className={cn(cell, figure, 'font-semibold')}>{formatBRL(letter.adjusted.amount)}</td>
              </tr>
              {showEmployee ? (
                <tr>
                  <th scope="row" className={cn(cell, 'text-left font-normal')}>
                    Por empregado ativo
                    {!adjustment.adjustEmployeeFee ? <span className="block text-[11px] text-muted print:text-black/70">sem reajuste</span> : null}
                  </th>
                  <td className={cn(cell, figure)}>{formatBRL(letter.previous.employeeFee)}</td>
                  <td className={cn(cell, figure, 'font-semibold')}>{formatBRL(letter.adjusted.employeeFee)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <p className="tabular">
          Cálculo do honorário: <span className="whitespace-nowrap">{formatBRL(letter.previous.amount)}</span> × {factor} ={' '}
          <span className="whitespace-nowrap">{formatBRL(letter.adjusted.amount)}</span>.
        </p>

        <p className="sm:text-justify print:text-justify">
          Os novos valores vigoram de {start} a {formatDateBR(letter.period.endDate)} e se aplicam automaticamente, nos termos da cláusula 3.6;
          as demais condições do contrato permanecem inalteradas.
          {letter.discountBps > 0 ? ` Continua valendo o desconto de ${formatBps(letter.discountBps)} para pagamento até o vencimento.` : ''}
          {onTime ? ' Esta comunicação respeita a antecedência mínima de 30 (trinta) dias prevista na cláusula 3.5.' : ''}
        </p>
        <p>Permanecemos à disposição para quaisquer esclarecimentos.</p>
        <p>Atenciosamente,</p>

        <div className="mt-8 w-80 max-w-full border-t border-fg/60 pt-1.5 print:mt-5 print:border-black">
          {signer ? <p className="font-semibold">{signer}</p> : null}
          {head.name && head.name !== signer ? <p className="text-[12px]">{head.name}</p> : null}
        </div>
      </article>
    </div>
  );
}
