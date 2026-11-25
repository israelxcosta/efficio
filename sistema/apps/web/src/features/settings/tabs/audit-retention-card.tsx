import { useState } from 'react';
import { Archive, Download, TriangleAlert } from 'lucide-react';
import { addMonths, startOfMonth, todayISO } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { useAuditRetention } from '@/features/workspaces/api';
import { pendingNoticeText, periodError, retentionRuleText } from '../audit-retention';
import { useAuditDownload } from '../use-audit-download';

const DEFAULT_MONTHS = 24;

/**
 * Configurações › Privacidade (`members` permission): how long the audit trail is kept, the notice of
 * the records about to be deleted and the download of any period as CSV.
 */
export function AuditRetentionCard() {
  const retention = useAuditRetention(true);
  const pendingDownload = useAuditDownload();
  const periodDownload = useAuditDownload();
  const today = todayISO();
  const [from, setFrom] = useState(() => startOfMonth(addMonths(today, -1)));
  const [to, setTo] = useState(today);
  const [touched, setTouched] = useState(false);
  const error = periodError(from, to);
  const pending = retention.data?.pending ?? null;

  return (
    <Card className="p-6">
      <CardHeader
        title="Guarda do registro de auditoria"
        subtitle={`${retentionRuleText(retention.data?.retentionMonths ?? DEFAULT_MONTHS)} Avisamos 30 dias antes, para você baixar o arquivo.`}
        icon={<Archive />}
      />
      {pending ? (
        <div role="status" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-warning-soft px-4 py-3">
          <p className="flex max-w-lg items-start gap-2 text-caption text-fg">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              <strong className="font-semibold">{pendingNoticeText(pending)}</strong> Baixe o arquivo antes, se precisar guardá-los.
            </span>
          </p>
          <Button variant="outline" onClick={() => void pendingDownload.download()} loading={pendingDownload.downloading}>
            <Download /> Baixar registro (CSV)
          </Button>
        </div>
      ) : null}
      <form
        className="mt-5 flex flex-wrap items-end gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!error) void periodDownload.download({ from, to });
        }}
      >
        <Field label="De" className="w-40">
          <Input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Até" className="w-40" error={touched && error ? error : undefined}>
          <Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button type="submit" variant="outline" loading={periodDownload.downloading}>
          <Download /> Baixar registro de auditoria
        </Button>
      </form>
      <p className="mt-3 text-mini text-muted">O arquivo CSV traz data, ação, quem fez e o IP de cada registro do período. O download também fica registrado.</p>
    </Card>
  );
}
