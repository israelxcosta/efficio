import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { HandCoins, Pencil, ReceiptText } from 'lucide-react';
import {
  INACTIVATION_REASON_LABELS,
  SIMPLES_ANNEX_LABELS,
  TAX_REGIME_LABELS,
  formatBRL,
  formatCEP,
  formatCNPJ,
  formatDateBR,
  formatPhone,
  type Client,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { WriteGate } from '@/features/auth/permissions';
import { pluralize } from '@/lib/utils';

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-fg">
        {children || <span className="text-subtle">—</span>}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <p className="eyebrow text-brand-text">{title}</p>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function addressLine(
  c: Pick<Client, 'street' | 'number' | 'complement' | 'district' | 'city' | 'state' | 'zipCode'>,
) {
  const street = [c.street, c.number].filter(Boolean).join(', ');
  const city = [c.city, c.state].filter(Boolean).join(' / ');
  return [street, c.complement, c.district, city, c.zipCode ? `CEP ${formatCEP(c.zipCode)}` : null]
    .filter(Boolean)
    .join(' · ');
}

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
      className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto"
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

          {c.inactivation ? (
            <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm">
              <p className="font-semibold text-fg">
                Inativado em {formatDateBR(c.inactivation.date)} —{' '}
                {INACTIVATION_REASON_LABELS[c.inactivation.reason]}
              </p>
              {c.inactivation.notes ? (
                <p className="mt-1 text-muted">{c.inactivation.notes}</p>
              ) : null}
            </div>
          ) : null}

          <Section title="Empresa">
            <Item label="Razão social" wide>
              {c.name}
            </Item>
            <Item label="Nome fantasia">{c.tradeName}</Item>
            <Item label="CNPJ">
              <span className="tabular">{formatCNPJ(c.document)}</span>
            </Item>
            <Item label="Data de abertura">{formatDateBR(c.openedAt)}</Item>
            <Item label="Atividade principal (CNAE)">{c.mainActivity}</Item>
            <Item label="E-mail">{c.email}</Item>
            <Item label="Telefone">{c.phone ? formatPhone(c.phone) : null}</Item>
            <Item label="Endereço" wide>
              {addressLine(c)}
            </Item>
          </Section>

          <Section title="Contrato e tributação">
            <Item label="Regime tributário">{TAX_REGIME_LABELS[c.taxRegime]}</Item>
            <Item label="Anexo do Simples">
              {c.simplesAnnex ? SIMPLES_ANNEX_LABELS[c.simplesAnnex] : null}
            </Item>
            <Item label="Início do contrato">{formatDateBR(c.contractStartDate)}</Item>
            <Item label="Honorário vigente">
              {fee ? (
                <span>
                  <span className="tabular font-semibold">{formatBRL(fee.amount)}</span>/mês ·{' '}
                  <span className="tabular">{formatBRL(fee.employeeFee)}</span> por empregado
                  <span className="block text-xs text-muted">até {formatDateBR(fee.endDate)}</span>
                </span>
              ) : c.latestFee ? (
                <span className="text-warning">
                  Vigência encerrada em {formatDateBR(c.latestFee.endDate)}
                </span>
              ) : null}
            </Item>
          </Section>

          <Section title="Responsável">
            <Item label="Nome">{c.responsibleName}</Item>
            <Item label="E-mail">{c.responsibleEmail}</Item>
            <Item label="Telefone / WhatsApp">
              {c.responsiblePhone ? formatPhone(c.responsiblePhone) : null}
            </Item>
          </Section>

          {c.notes ? (
            <section className="flex flex-col gap-2">
              <p className="eyebrow text-brand-text">Observações</p>
              <p className="text-sm whitespace-pre-line text-fg">{c.notes}</p>
            </section>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
