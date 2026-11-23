import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { Copy, QrCode, TriangleAlert } from 'lucide-react';
import { buildPixPayload, formatBRL, formatDateBR, type PixReceiver, type Transaction } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { usePixReceiver } from '@/features/office/api';
import { copyText } from '@/lib/clipboard';
import { competenceLabel, isMonthKey } from './fee-charges';

// Static Pix with the amount inside (BR Code): the client's bank app opens with the value filled in.
// The code is built in the browser from the office's key (GET /office/pix-receiver); it does not settle
// the receivable: the payment is confirmed on the statement (Relatórios → Recebimentos) as today.
// Ready for the future client portal: the same code can be shown to the client next to the charge.

export interface PixCharge {
  /** Cents. */
  amount: number;
  /** Shown to the payer by some banks ("Honorários 10/2026"). */
  description: string;
  /** Identifier on the statement when the bank supports it (letters and digits). */
  txid?: string | null;
}

/** The code for a charge, or null when the office is missing data (see `receiver.missing`). */
export function pixCodeFor(receiver: PixReceiver | undefined, charge: PixCharge): string | null {
  if (!receiver?.available || !receiver.key || !receiver.merchantName || !receiver.merchantCity || charge.amount <= 0) return null;
  try {
    return buildPixPayload({
      key: receiver.key,
      merchantName: receiver.merchantName,
      merchantCity: receiver.merchantCity,
      amount: charge.amount,
      txid: charge.txid,
      description: charge.description,
    });
  } catch {
    return null;
  }
}

/** "Honorários 10/2026" for a generated fee, else the description; the txid from the row id. */
export function pixChargeOf(tx: Pick<Transaction, 'id' | 'amount' | 'description' | 'feeKind' | 'feeCompetence'>): PixCharge {
  const fee = tx.feeKind && isMonthKey(tx.feeCompetence) ? `Honorarios ${competenceLabel(tx.feeCompetence)}` : tx.description;
  return { amount: tx.amount, description: fee, txid: tx.id.replace(/-/g, '').slice(0, 25) };
}

/** Text to paste in a message: how to pay and the code. */
export function pixMessageBlock(code: string, amount: number): string {
  return `Para pagar por Pix, copie o código abaixo e cole em "Pix Copia e Cola" no aplicativo do seu banco (o valor de ${formatBRL(amount)} já está incluso):\n\n${code}`;
}

/** Open/close state of the Pix dialog of one receivable; mounted only while open. */
export function usePixChargeDialog(tx: Transaction): { show: () => void; element: ReactNode } {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const charge = useMemo(() => pixChargeOf(tx), [tx]);
  return {
    show,
    element: open ? <PixChargeDialog open onOpenChange={setOpen} charge={charge} subtitle={`${tx.description} · venc. ${formatDateBR(tx.date)}`} /> : null,
  };
}

interface PixChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charge: PixCharge;
  subtitle?: ReactNode;
}

/** QR Code and "copia e cola" with the amount, to send to the client or show on the screen. */
export function PixChargeDialog({ open, onOpenChange, charge, subtitle }: PixChargeDialogProps) {
  const receiver = usePixReceiver(open);
  const code = pixCodeFor(receiver.data, charge);

  async function copy(text: string, what: string) {
    if (await copyText(text)) toast.success(`${what} copiado`);
    else toast.error('Não consegui copiar. Selecione o texto e copie manualmente.');
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Cobrar por Pix"
      description={subtitle}
      className="max-w-md"
      footer={
        code ? (
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => copy(pixMessageBlock(code, charge.amount), 'Texto')}>
              Copiar com instruções
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={() => copy(code, 'Código Pix')}>
              <Copy /> Copiar código
            </Button>
          </div>
        ) : null
      }
    >
      {receiver.isPending ? (
        <Skeleton className="mx-auto size-52" />
      ) : receiver.isError ? (
        <p className="text-body-sm text-danger">Não foi possível ler a chave Pix do escritório. Tente de novo.</p>
      ) : !code ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-bg-subtle p-4">
          <p className="flex items-center gap-2 text-body-sm font-semibold text-fg">
            <TriangleAlert className="size-4 text-warning" aria-hidden /> Falta completar o cadastro do escritório
          </p>
          <p className="text-body-sm text-muted">
            {charge.amount <= 0 ? 'O valor da cobrança precisa ser maior que zero.' : `Para gerar o Pix: ${receiver.data?.missing.join(', ') || 'dados do recebedor'}.`}
          </p>
          {receiver.data?.missing.length ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/configuracoes?aba=escritorio">Abrir dados do escritório</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-xl border border-border bg-white p-3">
            <QRCodeSVG value={code} size={208} level="M" title={`QR Code Pix de ${formatBRL(charge.amount)}`} />
          </div>
          <div className="text-center">
            <p className="tabular text-2xl font-semibold text-fg">{formatBRL(charge.amount)}</p>
            <p className="text-caption text-muted">
              Para {receiver.data?.merchantName} · chave {receiver.data?.key}
            </p>
          </div>
          <button
            type="button"
            onClick={() => copy(code, 'Código Pix')}
            className="w-full break-all rounded-md border border-border bg-bg-subtle px-3 py-2 text-left font-mono text-[11px] leading-relaxed text-muted hover:text-fg"
            aria-label="Copiar o código Pix copia e cola"
          >
            {code}
          </button>
          <p className="flex items-start gap-1.5 text-caption text-muted">
            <QrCode className="mt-0.5 size-3.5 shrink-0" aria-hidden />O valor já vai no código: o cliente lê o QR Code ou cola o código e só confirma. A baixa continua
            sendo feita por você, ao conferir o extrato.
          </p>
        </div>
      )}
    </Modal>
  );
}
