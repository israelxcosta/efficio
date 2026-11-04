import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, FileSignature, Printer } from 'lucide-react';
import { formatBRL, formatDateBR } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/features/auth/permissions';
import { ApiRequestError } from '@/lib/api';
import { isUuid } from '@/lib/safe-url';
import { usePrintInLight } from '@/lib/print';
import { recordContractIssue, useClientContract } from '../api';
import { ContractPages, ContractPrintFlow } from '../components/contract-preview';
import { contractDocumentTitle } from '../contract-editor-logic';

/**
 * The contract of a client (spec §13.9, finance): generated on the fly with the current data, never
 * stored. "Imprimir ou salvar PDF" uses the browser; the issue is recorded (optional, silent).
 */
export default function ClientContractPage() {
  const { id: raw } = useParams();
  const id = isUuid(raw) ? raw : null;
  const navigate = useNavigate();
  const contract = useClientContract(id);
  const { subscriptionActive } = usePermissions();
  usePrintInLight();
  const data = contract.data;
  const name = data?.client.name ?? 'Cliente';

  useEffect(() => {
    if (!data) return;
    const previous = document.title;
    document.title = contractDocumentTitle(name);
    return () => {
      document.title = previous;
    };
  }, [data, name]);

  if (!id || (contract.isError && contract.error instanceof ApiRequestError && (contract.error.status === 404 || contract.error.status === 400))) {
    return (
      <EmptyState
        icon={<FileSignature />}
        title="Cliente não encontrado"
        description="Ele pode ter sido excluído."
        action={
          <Button variant="outline" asChild>
            <Link to="/clientes">Voltar a Clientes</Link>
          </Button>
        }
      />
    );
  }
  if (contract.isError) return <ErrorState error={contract.error} onRetry={() => contract.refetch()} />;

  const fee = data?.fee;
  const template = data?.template;
  const description = data
    ? [
        template?.source === 'custom' ? `Modelo próprio${template.updatedAt ? ` de ${formatDateBR(template.updatedAt.slice(0, 10))}` : ''}` : 'Modelo de fábrica',
        fee ? `honorário de ${formatBRL(fee.amount)} vigente desde ${formatDateBR(fee.startDate)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <PageHeader
          title={`Contrato · ${name}`}
          description={description}
          actions={
            <>
              <Button variant="ghost" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/clientes'))}>
                <ArrowLeft /> Voltar
              </Button>
              <Button
                disabled={!data || !data.ready}
                onClick={() => {
                  if (data && subscriptionActive) void recordContractIssue(data.client.id);
                  window.print();
                }}
              >
                <Printer /> Imprimir ou salvar PDF
              </Button>
            </>
          }
        />
      </div>
      {!data ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 print:hidden">
          <Skeleton className="aspect-[210/297] w-full rounded-none" />
        </div>
      ) : !data.ready ? (
        <EmptyState
          icon={<FileSignature />}
          title="Faltam dados para gerar o contrato"
          description={[...data.missing.client, ...data.missing.fee, ...data.missing.office].join(', ')}
          action={
            <Button variant="outline" asChild>
              <Link to={`/clientes?consultar=${data.client.id}`}>Abrir o cadastro</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ContractPages
            className="mx-auto w-full max-w-3xl print:hidden"
            blocks={data.blocks}
            watermark={data.watermark.enabled ? data.watermark.image : null}
            logo={data.office.logo}
            label={`Contrato de ${name}`}
          />
          <ContractPrintFlow blocks={data.blocks} watermark={data.watermark.enabled ? data.watermark.image : null} logo={data.office.logo} />
        </>
      )}
    </div>
  );
}
