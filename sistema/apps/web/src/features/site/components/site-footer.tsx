import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { mailtoHref, OFFICE, whatsappHref } from '../site-content';
import { ExternalLink, PortalLink, SectionLink } from './site-ui';

/** The wordmark built from blocks: each letter knocked out of its own rectangle, bottoms aligned. */
const BLOCKS = [
  { letter: 'e', h: '100%', bg: 'var(--site-sky)' },
  { letter: 'f', h: '78%', bg: 'var(--site-blue-3)' },
  { letter: 'f', h: '90%', bg: 'var(--site-white)' },
  { letter: 'i', h: '64%', bg: 'var(--site-accent)' },
  { letter: 'c', h: '84%', bg: 'var(--site-blue-2)' },
  { letter: 'i', h: '70%', bg: 'var(--site-paper)' },
  { letter: 'o', h: '96%', bg: 'var(--site-sky)' },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="site-mark" role="img" aria-label="efficio">
        {BLOCKS.map((b, i) => (
          <span key={i} className="site-mark__block" style={{ '--h': b.h, '--block-bg': b.bg } as CSSProperties}>
            <span aria-hidden>{b.letter}</span>
          </span>
        ))}
      </div>

      <div className="site-grid site-footer__cols">
        <nav className="site-footer__links" aria-label="Rodapé">
          <div>
            <h2>Escritório</h2>
            <ul>
              <li>
                <SectionLink to="mes" className="site-link">
                  O seu mês
                </SectionLink>
              </li>
              <li>
                <SectionLink to="servicos" className="site-link">
                  Serviços
                </SectionLink>
              </li>
              <li>
                <SectionLink to="comecar" className="site-link">
                  Como começar
                </SectionLink>
              </li>
              <li>
                <SectionLink to="duvidas" className="site-link">
                  Dúvidas
                </SectionLink>
              </li>
            </ul>
          </div>
          <div>
            <h2>Portal</h2>
            <ul>
              <li>
                <Link to="/login" className="site-link">
                  Entrar no portal
                </Link>
              </li>
              <li>
                <Link to="/esqueci-senha" className="site-link">
                  Esqueci minha senha
                </Link>
              </li>
              <li>
                <SectionLink to="portal" className="site-link">
                  O que tem no portal
                </SectionLink>
              </li>
            </ul>
          </div>
          <div>
            <h2>Contato</h2>
            <ul>
              <li>
                <ExternalLink href={whatsappHref('Olá! Vim pelo site do escritório.')} className="site-link">
                  WhatsApp
                </ExternalLink>
              </li>
              <li>
                <ExternalLink href={mailtoHref('Contato pelo site')} className="site-link">
                  E-mail
                </ExternalLink>
              </li>
            </ul>
          </div>
          <div>
            <h2>Legal</h2>
            <ul>
              <li>
                <Link to="/termos" className="site-link">
                  Termos de uso
                </Link>
              </li>
              <li>
                <Link to="/privacidade" className="site-link">
                  Privacidade
                </Link>
              </li>
            </ul>
          </div>
        </nav>
        <address className="site-footer__contact not-italic">
          <span>{OFFICE.address}</span>
          <span>{OFFICE.hours}</span>
          <span>
            WhatsApp {OFFICE.whatsappLabel} · {OFFICE.email}
          </span>
          <span>Registro {OFFICE.crc}</span>
        </address>
      </div>

      <div className="site-footer__last">
        <p>
          © {year} {OFFICE.name}. Telas do portal com dados de exemplo.
        </p>
        <PortalLink className="site-button--light site-button--small">Entrar no portal</PortalLink>
      </div>
    </footer>
  );
}
