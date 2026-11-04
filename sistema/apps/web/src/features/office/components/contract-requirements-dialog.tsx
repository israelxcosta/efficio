import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Client, ClientContractResponse, ContractRequirements } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { usePermissions } from '@/features/auth/permissions';
import { api } from '@/lib/api';
import { toastError } from '@/lib/notify';
import { qk } from '@/lib/query-keys';

/** Path of the contract page of a client. */
export const contractHref = (clientId: string) => `/clientes/${clientId}/contrato`;

/**
 * "Gerar contrato" (spec §13.9): checks what is missing first; with everything in place, opens the
 * print page. Returns the action and the dialog to render.
 */
export function useGenerateContract({ onEdit, onFees }: { onEdit: (c: Client) => void; onFees: (c: Client) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [missing, setMissing] = useState<{ client: Client; missing: ContractRequirements } | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  async function start(client: Client) {
    setChecking(client.id);
    try {
      const data = await qc.fetchQuery({
        queryKey: qk.clientContract(client.id),
        queryFn: () => api<ClientContractResponse>(`/clients/${client.id}/contract`),
        staleTime: 0,
      });
      if (data.ready) navigate(contractHref(client.id));
      else setMissing({ client, missing: data.missing });
    } catch (error) {
      toastError(error);
    } finally {
      setChecking(null);
    }
  }

  const dialog = (
    <ContractRequirementsDialog
      state={missing}
      onClose={() => setMissing(null)}
      onEdit={(c) => {
        setMissing(null);
        onEdit(c);
      }}
      onFees={(c) => {
        setMissing(null);
        onFees(c);
      }}
    />
  );
  return { start, checking, dialog };
}

function ContractRequirementsDialog({
  state,
  onClose,
  onEdit,
  onFees,
}: {
  state: { client: Client; missing: ContractRequirements } | null;
  onClose: () => void;
  onEdit: (c: Client) => void;
  onFees: (c: Client) => void;
}) {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const m = state?.missing;
  const group = (title: string, items: string[], action: React.ReactNode) =>
    items.length ? (
      <section className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
        <h3 className="text-body-sm font-semibold text-fg">{title}</h3>
        <p className="text-body-sm text-muted">{items.join(', ')}</p>
        <div>{action}</div>
      </section>
    ) : null;
  return (
    <Modal
      open={state !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Faltam dados para gerar o contrato"
      description={state ? `${state.client.tradeName || state.client.name}: complete o que falta e gere de novo.` : undefined}
      footer={
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {state && m ? (
        <div className="flex flex-col gap-3">
          {group(
            'Cadastro do cliente',
            m.client,
            <Button variant="outline" size="sm" onClick={() => onEdit(state.client)}>
              Editar cliente
            </Button>,
          )}
          {group(
            'Honorário',
            m.fee,
            <Button variant="outline" size="sm" onClick={() => onFees(state.client)}>
              Cadastrar honorário
            </Button>,
          )}
          {group(
            'Escritório',
            m.office,
            can('office') ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  navigate('/configuracoes?aba=escritorio');
                }}
              >
                Abrir Escritório
              </Button>
            ) : (
              <p className="text-caption text-muted">Peça a quem cuida do escritório para completar.</p>
            ),
          )}
        </div>
      ) : null}
    </Modal>
  );
}
