import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, BadgePercent, Clock, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  addMonthKey,
  adjustByBps,
  applyFeeAdjustmentSchema,
  formatBRL,
  formatMonthKey,
  todayISO,
  type ApplyFeeAdjustmentInput,
  type FeeAdjustmentApplyResponse,
  type MonthKey,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { toastError } from '@/lib/notify';
import { pluralize } from '@/lib/utils';
import { useApplyFeeAdjustment, useFeeAdjustmentPreview } from '../api';
import { ApplyResult } from '../components/apply-result';
import { ClientsCard } from '../components/clients-card';
import { HistoryList } from '../components/history-list';
import { IndicesCard } from '../components/indices-card';
import {
  adjustmentPlan,
  bpsToInput,
  defaultAdjustmentMonth,
  EMPTY_INDEX_TEXTS,
  formatBps,
  monthInSentence,
  monthParam,
  parseAppliedPercent,
  parseIndices,
  readyIds,
  selectionTotals,
  type IndexTexts,
} from '../logic';

type Tab = 'new' | 'history';

const DESCRIPTIONS: Record<Tab, string> = {
  new: 'Contrato, cláusula 3: reajuste anual pelo maior índice entre IGP-M, IPCA, INPC e CCT, com aviso 30 dias antes.',
  history: 'Reajustes já aplicados, com as cartas para reimprimir.',
};

/**
 * Reajuste em lote (finance): the clients whose period renews in a month get the next period with the
 * fee × the largest index accumulated in 12 months (contract clause 3). The values are computed on
 * screen while the indices are typed; "Aplicar reajuste" registers them and leads to the letters.
 * `?mes=YYYY-MM` keeps the month (absent = the suggested one) and `?aba=historico` the history.
 */
export default function FeeAdjustmentPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('aba') === 'historico' ? 'history' : 'new';
  const defaultMonth = defaultAdjustmentMonth(todayISO());
  const month = monthParam(params.get('mes')) ?? defaultMonth;

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };
  const setMonth = (m: MonthKey) => update({ mes: m === defaultMonth ? null : m });

  const [texts, setTexts] = useState<IndexTexts>(EMPTY_INDEX_TEXTS);
  // null = the field follows the largest index; text = typed by hand (negotiated).
  const [appliedText, setAppliedText] = useState<string | null>(null);
  const [adjustEmployeeFee, setAdjustEmployeeFee] = useState(true);
  // The checked clients of a month (absent: the ones ready when the month opens).
  const [picked, setPicked] = useState<{ month: MonthKey; ids: Set<string> } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<FeeAdjustmentApplyResponse | null>(null);

  const indices = useMemo(() => parseIndices(texts), [texts]);
  const applied = appliedText === null ? null : parseAppliedPercent(appliedText);
  const plan = adjustmentPlan(indices.values, applied?.ok ? applied.bps : null);
  const blockedReason = !indices.valid ? 'Corrija os índices do passo 1.' : applied && !applied.ok ? 'Corrija o percentual aplicado no passo 1.' : null;

  const preview = useFeeAdjustmentPreview(month);
  const data = preview.data;
  const selected = useMemo(() => (data ? (picked?.month === data.month ? picked.ids : readyIds(data.items)) : new Set<string>()), [data, picked]);
  const totals = selectionTotals(data?.items ?? [], selected, plan.appliedBps);
  const apply = useApplyFeeAdjustment();
  const monthLabel = monthInSentence(formatMonthKey(month));
  const clientsText = pluralize(totals.count, 'cliente', 'clientes');

  const confirm = () => {
    if (!data) return;
    const input: ApplyFeeAdjustmentInput = {
      month: data.month,
      igpmBps: indices.values.igpm,
      ipcaBps: indices.values.ipca,
      inpcBps: indices.values.inpc,
      cctBps: indices.values.cct,
      appliedBps: plan.appliedBps,
      adjustEmployeeFee,
      clientIds: data.items.filter((i) => i.status === 'ready' && selected.has(i.clientId)).map((i) => i.clientId),
    };
    const check = applyFeeAdjustmentSchema.safeParse(input);
    if (!check.success) {
      toast.error(check.error.issues[0]?.message ?? 'Confira os dados do reajuste.');
      return;
    }
    apply.mutate(input, {
      onSuccess: (response) => {
        setConfirming(false);
        setResult(response);
        if (response.adjustment) toast.success(`Reajuste aplicado a ${pluralize(response.created.length, 'cliente', 'clientes')}`);
        else toast.info('Nenhum cliente pôde ser reajustado');
      },
      onError: (error) => toastError(error),
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reajuste em lote"
        description={DESCRIPTIONS[tab]}
        actions={
          <Button variant="ghost" asChild>
            <Link to="/clientes">
              <ArrowLeft /> Clientes
            </Link>
          </Button>
        }
      />

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <SegmentedControl<Tab>
          ariaLabel="Reajuste em lote"
          value={tab}
          onChange={(t) => update({ aba: t === 'history' ? 'historico' : null })}
          options={[
            { value: 'new', label: 'Novo reajuste', icon: <BadgePercent /> },
            { value: 'history', label: 'Histórico', icon: <Clock /> },
          ]}
        />
      </div>

      {tab === 'history' ? (
        <HistoryList onStart={() => update({ aba: null })} />
      ) : (
        <>
          {result ? <ApplyResult result={result} onClose={() => setResult(null)} /> : null}
          <IndicesCard
            month={month}
            defaultMonth={defaultMonth}
            onMonthChange={setMonth}
            texts={texts}
            errors={indices.errors}
            onTextChange={(index, text) => setTexts((t) => ({ ...t, [index]: text }))}
            appliedText={appliedText ?? bpsToInput(plan.suggested.bps)}
            appliedError={applied && !applied.ok ? applied.error : null}
            onAppliedChange={setAppliedText}
            onAppliedReset={appliedText !== null && (plan.manual || !applied?.ok) ? () => setAppliedText(null) : null}
            plan={plan}
            exampleAdjusted={adjustByBps(100_000, plan.appliedBps)}
            adjustEmployeeFee={adjustEmployeeFee}
            onAdjustEmployeeFeeChange={setAdjustEmployeeFee}
          />
          <ClientsCard
            month={month}
            preview={preview}
            selected={selected}
            onSelectedChange={(ids) => data && setPicked({ month: data.month, ids })}
            appliedBps={plan.appliedBps}
            adjustEmployeeFee={adjustEmployeeFee}
            totals={totals}
            blockedReason={blockedReason}
            onApply={() => setConfirming(true)}
            onMonthChange={setMonth}
            nextMonth={addMonthKey(month, 1)}
          />
        </>
      )}

      <Modal
        open={confirming}
        onOpenChange={(open) => {
          if (!apply.isPending) setConfirming(open);
        }}
        title={`Aplicar reajuste de ${formatBps(plan.appliedBps)} a ${clientsText}?`}
        description={`Cada um ganha a vigência de ${monthLabel} com os valores reajustados.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={apply.isPending}>
              Cancelar
            </Button>
            <Button onClick={confirm} loading={apply.isPending}>
              Aplicar a {clientsText}
            </Button>
          </>
        }
      >
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Cálculo</dt>
          <dd className="font-medium text-fg tabular">{plan.memory}</dd>
          <dt className="text-muted">Honorários</dt>
          <dd className="text-fg tabular">
            {formatBRL(totals.current)} → <strong className="font-semibold">{formatBRL(totals.proposed)}</strong> por mês
          </dd>
          <dt className="text-muted">Por empregado</dt>
          <dd className="text-fg">{adjustEmployeeFee ? 'Reajustada também' : 'Mantida'}</dd>
        </dl>
        {totals.late ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-danger-soft/60 p-3 text-[13px] text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {totals.late === 1 ? '1 cliente já passou do prazo do aviso de 30 dias.' : `${totals.late} clientes já passaram do prazo do aviso de 30 dias.`}
          </p>
        ) : null}
        <p className="mt-4 text-xs text-muted">Para desfazer, exclua a nova vigência no cadastro do cliente.</p>
      </Modal>
    </div>
  );
}
