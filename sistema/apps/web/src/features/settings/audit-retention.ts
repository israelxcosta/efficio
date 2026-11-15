// Retention of the audit trail (24 months by default): the wording of the notice shown in the bell and
// in Configurações › Privacidade before the daily clean-up deletes records. Pure, tested.
import { formatDateBR, type AuditRetentionResponse } from '@effinance/shared';
import { pluralize } from '@/lib/utils';

type Pending = NonNullable<AuditRetentionResponse['pending']>;

/** "Registros com mais de 24 meses são apagados automaticamente." */
export function retentionRuleText(months: number): string {
  return `Registros com mais de ${pluralize(months, 'mês', 'meses')} são apagados automaticamente.`;
}

/** "01/11/2024 a 30/11/2024" (one day: "01/11/2024"). */
export function pendingPeriodText(pending: Pick<Pending, 'from' | 'to'>): string {
  return pending.from === pending.to ? formatDateBR(pending.from) : `${formatDateBR(pending.from)} a ${formatDateBR(pending.to)}`;
}

/** "12 registros (01/11/2024 a 30/11/2024) serão apagados a partir de 20/11/2026." */
export function pendingNoticeText(pending: Pending): string {
  const what = pending.count === 1 ? '1 registro' : `${pending.count} registros`;
  const verb = pending.count === 1 ? 'será apagado' : 'serão apagados';
  return `${what} (${pendingPeriodText(pending)}) ${verb} a partir de ${formatDateBR(pending.purgeDate)}.`;
}

/** Problem of a download period, or null when it can be sent (both days, in order). */
export function periodError(from: string, to: string): string | null {
  if (!from || !to) return 'Informe o início e o fim do período.';
  return from > to ? 'O início deve ser antes do fim.' : null;
}
