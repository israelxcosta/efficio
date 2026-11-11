import { useSearchParams } from 'react-router';
import { SegmentedControl } from '@/components/ui/segmented-control';

export const REPORT_MONTH_OPTIONS = [6, 12, 24] as const;
export type ReportMonths = (typeof REPORT_MONTH_OPTIONS)[number];
const DEFAULT_MONTHS: ReportMonths = 12;

/**
 * Window of the month-based reports (Evolução, Inadimplência), kept in the URL (`?meses=6|24`; 12 is
 * the default and stays out).
 */
export function useReportMonths(): [ReportMonths, (months: ReportMonths) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('meses'));
  const months = (REPORT_MONTH_OPTIONS as readonly number[]).includes(raw) ? (raw as ReportMonths) : DEFAULT_MONTHS;
  const set = (next: ReportMonths) => {
    const p = new URLSearchParams(params);
    if (next === DEFAULT_MONTHS) p.delete('meses');
    else p.set('meses', String(next));
    setParams(p, { replace: true });
  };
  return [months, set];
}

/** Header control of those tabs (in place of the reports' period filter). */
export function ReportMonthsControl({ ariaLabel }: { ariaLabel: string }) {
  const [months, setMonths] = useReportMonths();
  return (
    <SegmentedControl<`${ReportMonths}`>
      ariaLabel={ariaLabel}
      value={`${months}`}
      onChange={(v) => setMonths(Number(v) as ReportMonths)}
      options={REPORT_MONTH_OPTIONS.map((m) => ({ value: `${m}`, label: `${m} meses` }))}
    />
  );
}
