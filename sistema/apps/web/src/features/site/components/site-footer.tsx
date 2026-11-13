import { Link } from 'react-router';
import { ArrowUp } from 'lucide-react';
import { mailtoHref, OFFICE, whatsappHref } from '../site-content';
import { ExternalLink, PortalLink, prefersReducedMotion, SectionLink, wipe } from './site-ui';

const BIG_LINKS: { id: string; label: string }[][] = [
  [
    { id: 'mes', label: 'O seu mês' },
    { id: 'servicos', label: 'Serviços' },
    { id: 'portal', label: 'Portal' },
    { id: 'comecar', label: 'Como começar' },
  ],
  [
    { id: 'comparar', label: 'Com portal' },
    { id: 'para-quem', label: 'Para quem' },
    { id: 'duvidas', label: 'Dúvidas' },
    { id: 'contato', label: 'Contato' },
  ],
];

/** The wordmark row under the panel: "efficio" repeated, drifting sideways (still with reduced motion). */
function Wordmark() {
  const group = (
    <span className="site-mark__group">
      <span>efficio</span>
      <span>efficio</span>
      <span>efficio</span>
    </span>
  );
  return (
    <div className="site-mark" aria-hidden>
      <div className="site-mark__track">
        {group}
        {group}
      </div>
    </div>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="site-footer__panel">
        <nav className="site-footer__nav" aria-label="Rodapé">
          {BIG_LINKS.map((column, i) => (
            <ul key={i} className="site-footer__big">
              {column.map((link) => (
                <li key={link.id}>
                  <SectionLink to={link.id}>{link.label}</SectionLink>
                </li>
              ))}
            </ul>
          ))}
          <ul className="site-footer__small">
            <li>
              <Link to="/login">Entrar no portal</Link>
            </li>
            <li>
              <Link to="/esqueci-senha">Esqueci minha senha</Link>
            </li>
            <li>
              <ExternalLink href={whatsappHref('Olá! Vim pelo site do escritório.')}>WhatsApp</ExternalLink>
            </li>
            <li>
              <ExternalLink href={mailtoHref('Contato pelo site')}>E-mail</ExternalLink>
            </li>
            <li className="site-footer__legal">
              <Link to="/termos">Termos de uso</Link>
            </li>
            <li className="site-footer__legal">
              <Link to="/privacidade">Privacidade</Link>
            </li>
          </ul>
        </nav>

        <div className="site-footer__about">
          <p className="site-footer__tagline">Do latim efficio, “eu concluo”: cada guia, folha e declaração do mês, no prazo.</p>
          <address className="site-footer__address">
            <span>{OFFICE.address}</span>
            <span>{OFFICE.hours}</span>
            <span>WhatsApp {OFFICE.whatsappLabel}</span>
            <span>{OFFICE.email}</span>
          </address>
        </div>

        <div className="site-footer__base">
          <p className="site-footer__fine">
            {OFFICE.name} · Registro {OFFICE.crc}. Telas do portal com dados de exemplo.
          </p>
          <p className="site-footer__fine">
            © {year} {OFFICE.name}. Todos os direitos reservados.
          </p>
          <PortalLink className="site-btn--white site-btn--sm site-footer__portal">Entrar no portal</PortalLink>
        </div>
      </div>

      <div className="site-footer__end">
        <Wordmark />
        <div className="site-footer__cta">
          <ExternalLink
            href={whatsappHref('Olá! Quero uma proposta para a contabilidade da minha empresa.')}
            className="site-btn site-btn--lime site-btn--xl"
            {...wipe('Pedir proposta')}
          >
            Pedir proposta
          </ExternalLink>
          <PortalLink className="site-btn--paper site-btn--xl" />
        </div>
        <button
          type="button"
          className="site-top"
          aria-label="Voltar ao topo"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
            document.querySelector<HTMLElement>('.site-logo')?.focus({ preventScroll: true });
          }}
        >
          <ArrowUp aria-hidden strokeWidth={1.6} />
        </button>
      </div>
    </footer>
  );
}
