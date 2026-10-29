import { useNavigate } from 'react-router';
import { HandCoins, Pencil, ReceiptText } from 'lucide-react';
import { TAX_REGIME_LABELS, formatBRL, formatBps, formatCNPJ, formatDateBR, type Client } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { WriteGate } from '@/features/auth/permissions';
import { pluralize } from '@/lib/utils';
import { ClientProfile, ProfileItem } from './client-profile';

/** Read-only view of a client ("Consultar"). */
export function ClientDetailsDialog({
  client,
  onClose,
  onEdit,
  onFees,
}: {
  client: Client | null;
  onClose: () => void;
  onEdit: (c: Client) => void;
  onFees: (c: Client) => void;
}) {
  const navigate = useNavigate();
  const c = client;
  const fee = c?.currentFee ?? null;

  return (
    <Modal
      open={Boolean(c)}
      onOpenChange={(o) => !o && onClose()}
      title={c?.tradeName || c?.name || 'Cliente'}
      description={c ? `${c.name} · CNPJ ${formatCNPJ(c.document)}` : undefined}
      className="max-w-2xl"
      footer={
        c ? (
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/contas-a-receber?contato=${c.id}&modo=year`)}
            >
              <ReceiptText /> Contas a receber
            </Button>
            <Button variant="outline" onClick={() => onFees(c)}>
              <HandCoins /> Honorários
            </Button>
            <WriteGate>
              <Button onClick={() => onEdit(c)}>
                <Pencil /> Editar
              </Button>
            </WriteGate>
          </div>
        ) : null
      }
    >
      {c ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={c.status === 'active' ? 'success' : 'neutral'} size="md">
              {c.status === 'active' ? 'Ativo' : 'Inativo'}
            </Badge>
            <Badge tone="brand" size="md">
              {TAX_REGIME_LABELS[c.taxRegime]}
              {c.simplesAnnex ? ` · Anexo ${c.simplesAnnex}` : ''}
            </Badge>
            <span className="text-xs text-muted">
              {pluralize(c.transactionCount, 'lançamento vinculado', 'lançamentos vinculados')}
            </span>
          </div>

          <ClientProfile
            client={c}
            contractExtra={
              <>
                <ProfileItem label="Vencimento do honorário">Dia {c.feeDueDay} do mês seguinte à competência</ProfileItem>
                <ProfileItem label="Honorário vigente">
                  {fee ? (
                    <span>
                      <span className="tabular font-semibold">{formatBRL(fee.amount)}</span>/mês ·{' '}
                      <span className="tabular">{formatBRL(fee.employeeFee)}</span> por empregado
                      {fee.discountBps > 0 ? (
                        <span className="block text-xs text-muted">
                          {formatBps(fee.discountBps)} de desconto para pagamento até o vencimento
                        </span>
                      ) : null}
                      <span className="block text-xs text-muted">até {formatDateBR(fee.endDate)}</span>
                    </span>
                  ) : c.latestFee ? (
                    <span className="text-warning">Vigência encerrada em {formatDateBR(c.latestFee.endDate)}</span>
                  ) : null}
                </ProfileItem>
              </>
            }
          />
        </div>
      ) : null}
    </Modal>
  );
}
