import type { ReactNode } from 'react';
import {
  INACTIVATION_REASON_LABELS,
  SIMPLES_ANNEX_LABELS,
  TAX_REGIME_LABELS,
  formatCEP,
  formatCNPJ,
  formatDateBR,
  formatPhone,
  type Client,
} from '@effinance/shared';

export function ProfileItem({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-fg">{children || <span className="text-subtle">—</span>}</dd>
    </div>
  );
}

export function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
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

interface ClientProfileProps {
  client: Client;
  /** Extra items of "Contrato e tributação" (the finance dialog adds the fees here). */
  contractExtra?: ReactNode;
  /** The Gestão sheet shows the contacts in its own section. */
  showContacts?: boolean;
  showNotes?: boolean;
}

/**
 * Registration data of a client without fees: company, contract and taxation, the person at the
 * company and the inactivation. Used by the read-only client sheet of the Gestão and, with the fees,
 * by the "Consultar" dialog of the finances.
 */
export function ClientProfile({ client: c, contractExtra, showContacts = true, showNotes = true }: ClientProfileProps) {
  return (
    <div className="flex flex-col gap-6">
      {c.inactivation ? (
        <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm">
          <p className="font-semibold text-fg">
            Inativado em {formatDateBR(c.inactivation.date)} — {INACTIVATION_REASON_LABELS[c.inactivation.reason]}
          </p>
          {c.inactivation.notes ? <p className="mt-1 text-muted">{c.inactivation.notes}</p> : null}
        </div>
      ) : null}

      <ProfileSection title="Empresa">
        <ProfileItem label="Razão social" wide>
          {c.name}
        </ProfileItem>
        <ProfileItem label="Nome fantasia">{c.tradeName}</ProfileItem>
        <ProfileItem label="CNPJ">
          <span className="tabular">{formatCNPJ(c.document)}</span>
        </ProfileItem>
        <ProfileItem label="Data de abertura">{formatDateBR(c.openedAt)}</ProfileItem>
        <ProfileItem label="Atividade principal (CNAE)">{c.mainActivity}</ProfileItem>
        {showContacts ? (
          <>
            <ProfileItem label="E-mail">{c.email}</ProfileItem>
            <ProfileItem label="Telefone">{c.phone ? formatPhone(c.phone) : null}</ProfileItem>
          </>
        ) : null}
        <ProfileItem label="Endereço" wide>
          {addressLine(c)}
        </ProfileItem>
      </ProfileSection>

      <ProfileSection title="Contrato e tributação">
        <ProfileItem label="Regime tributário">{TAX_REGIME_LABELS[c.taxRegime]}</ProfileItem>
        <ProfileItem label="Anexo do Simples">{c.simplesAnnex ? SIMPLES_ANNEX_LABELS[c.simplesAnnex] : null}</ProfileItem>
        <ProfileItem label="Cliente desde">{formatDateBR(c.contractStartDate)}</ProfileItem>
        {contractExtra}
      </ProfileSection>

      {showContacts ? (
        <ProfileSection title="Responsável na empresa">
          <ProfileItem label="Nome">{c.responsibleName}</ProfileItem>
          <ProfileItem label="E-mail">{c.responsibleEmail}</ProfileItem>
          <ProfileItem label="Telefone / WhatsApp">{c.responsiblePhone ? formatPhone(c.responsiblePhone) : null}</ProfileItem>
        </ProfileSection>
      ) : null}

      {showNotes && c.notes ? (
        <section className="flex flex-col gap-2">
          <p className="eyebrow text-brand-text">Observações</p>
          <p className="text-sm whitespace-pre-line text-fg">{c.notes}</p>
        </section>
      ) : null}
    </div>
  );
}
