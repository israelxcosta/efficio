import type { ComponentType, SVGProps } from 'react';
import { CalendarDays, CircleCheck, CircleX, FolderOpen, Inbox, MessageCircle, Receipt, ShieldCheck } from 'lucide-react';
import { COMPARISON, whatsappHref } from '../site-content';
import { ExternalLink, SectionLink, wipe } from './site-ui';

const ROW_ICON: Record<(typeof COMPARISON)[number]['id'], ComponentType<SVGProps<SVGSVGElement>>> = {
  guias: Receipt,
  pendencias: Inbox,
  documentos: FolderOpen,
  prazos: CalendarDays,
  acesso: ShieldCheck,
  atendimento: MessageCircle,
};

/** "Contabilidade com portal" (coming soon): the same subjects with the client portal and without a portal. */
export function CompareTable() {
  return (
    <section id="comparar" className="site-compare" aria-labelledby="comparar-title">
      <div className="site-compare__head" data-reveal>
        <p className="site-pill site-soon">Em breve</p>
        <h2 id="comparar-title" className="site-h2">
          Contabilidade com portal
        </h2>
        <p className="site-compare__lead">
          O portal do cliente está em preparação. Até lá, as guias e os documentos chegam por e-mail e pelo WhatsApp do escritório.
        </p>
      </div>

      <div className="site-table" role="table" aria-label="Contabilidade com o portal do cliente, em preparação, e sem portal" data-reveal>
        <div className="site-table__row site-table__row--head" role="row">
          <span className="site-table__corner" role="columnheader">
            <span className="site-sr-only">Assunto</span>
          </span>
          <span className="site-table__head site-table__head--on" role="columnheader">
            Com o portal
          </span>
          <span className="site-table__head site-table__head--off" role="columnheader">
            Sem portal
          </span>
        </div>
        {COMPARISON.map((row) => {
          const Icon = ROW_ICON[row.id];
          return (
            <div key={row.id} className="site-table__row" role="row">
              <span className="site-table__label" role="rowheader">
                <Icon aria-hidden strokeWidth={1.6} />
                {row.label}
              </span>
              <span className="site-table__cell site-table__cell--on" role="cell">
                <CircleCheck aria-hidden strokeWidth={1.6} />
                <span>{row.with}</span>
              </span>
              <span className="site-table__cell site-table__cell--off" role="cell">
                <CircleX aria-hidden strokeWidth={1.4} />
                <span>{row.without}</span>
              </span>
            </div>
          );
        })}
        <div className="site-table__row site-table__row--foot" aria-hidden>
          <span />
          <span className="site-table__tail" />
          <span />
        </div>
      </div>

      <div className="site-actions site-actions--center">
        <ExternalLink href={whatsappHref('Olá! Quero uma proposta para a contabilidade da minha empresa.')} className="site-btn" {...wipe('Pedir proposta')}>
          Pedir proposta
        </ExternalLink>
        <SectionLink to="contato" className="site-btn site-btn--ghost" {...wipe('Fale conosco')}>
          Fale conosco
        </SectionLink>
      </div>
    </section>
  );
}
