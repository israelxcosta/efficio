import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Menu, X } from 'lucide-react';
import { NAV, whatsappHref } from '../site-content';
import { ExternalLink, goToSection, PORTAL_PATH, PortalLink, SectionLink, wipe } from './site-ui';

const ANNOUNCE_KEY = 'efficio-site-announce-closed';

function readClosed(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(ANNOUNCE_KEY) === '1';
  } catch {
    return false;
  }
}

/** The lime bar on top of the page: one line about the portal, closed for the rest of the visit. */
export function AnnouncementBar() {
  const [closed, setClosed] = useState(readClosed);
  if (closed) return null;
  return (
    <div className="site-announce" role="region" aria-label="Aviso">
      <p className="site-announce__inner">
        <span className="site-announce__text">
          <span className="site-announce__long">Portal do cliente: guias, documentos e prazos do mês num só lugar</span>
          <span className="site-announce__short">Guias e prazos do mês no portal</span>
        </span>
        <Link to={PORTAL_PATH} className="site-announce__link">
          <span>
            Entrar<span className="site-announce__more"> no portal</span>
          </span>
          <ArrowRight aria-hidden />
        </Link>
      </p>
      <button
        type="button"
        className="site-announce__close"
        aria-label="Fechar aviso"
        onClick={() => {
          try {
            window.sessionStorage.setItem(ANNOUNCE_KEY, '1');
          } catch {
            // Private mode without storage: the bar just closes for this page view.
          }
          setClosed(true);
        }}
      >
        <X aria-hidden />
      </button>
    </div>
  );
}

/** The white bar that stays on top: the wordmark, the sections and the two ways in. */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onResize = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <header className="site-header" data-scrolled={scrolled || open}>
      <div className="site-header__inner">
        <a
          href="#topo"
          className="site-logo"
          aria-label="Efficio Contabilidade, voltar ao topo"
          onClick={(event) => {
            event.preventDefault();
            setOpen(false);
            window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          }}
        >
          efficio
        </a>

        <nav className="site-nav" aria-label="Seções do site">
          <ul>
            {NAV.map((item) => (
              <li key={item.id}>
                <SectionLink to={item.id}>{item.label}</SectionLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="site-header__actions">
          <PortalLink className="site-btn--sm" />
          <ExternalLink
            href={whatsappHref('Olá! Vim pelo site e quero falar com o escritório.')}
            className="site-btn site-btn--ghost site-btn--sm site-header__contact"
            {...wipe('Fale conosco')}
          >
            Fale conosco
          </ExternalLink>
          <button
            ref={buttonRef}
            type="button"
            className="site-menu-button"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </div>
      </div>

      <div id={menuId} className="site-menu" hidden={!open}>
        <nav aria-label="Seções do site (menu)">
          <ul>
            {NAV.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    setOpen(false);
                    // The panel closes first, so the section lands under the bar and not under the menu.
                    requestAnimationFrame(() => goToSection(item.id));
                  }}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="site-menu__actions">
          <ExternalLink href={whatsappHref('Olá! Vim pelo site e quero falar com o escritório.')} className="site-btn site-btn--ghost">
            Fale conosco pelo WhatsApp
          </ExternalLink>
        </div>
      </div>
    </header>
  );
}
