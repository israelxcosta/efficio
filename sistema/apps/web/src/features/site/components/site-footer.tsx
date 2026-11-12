import { Link } from 'react-router';
import { mailtoHref, OFFICE, whatsappHref } from '../site-content';
import { ExternalLink, PortalLink, SectionLink } from './site-ui';

/** The wordmark built from blocks: each letter knocked out of its own rectangle, bottoms aligned. */
const BLOCKS = [
  { letter: 'e', h: 1, fill: 'var(--site-sky)' },
  { letter: 'f', h: 0.74, fill: 'var(--site-blue-3)' },
  { letter: 'f', h: 0.9, fill: 'var(--site-white)' },
  { letter: 'i', h: 0.82, fill: 'var(--site-accent)' },
  { letter: 'c', h: 0.64, fill: 'var(--site-blue-2)' },
  { letter: 'i', h: 0.78, fill: 'var(--site-paper)' },
  { letter: 'o', h: 0.96, fill: 'var(--site-sky)' },
];

/**
 * The mark as one drawing: `rows` splits the seven blocks (one row on wide screens, "effi" over "cio"
 * on a phone). Each row is `rowH` tall, blocks share the width with 8-unit gaps.
 */
function BlockMark({ rows, width, rowH, fontSize, className }: { rows: number[]; width: number; rowH: number; fontSize: number; className: string }) {
  const gap = 8;
  let index = 0;
  const shapes = rows.flatMap((count, row) => {
    const w = (width - gap * (count - 1)) / count;
    const bottom = rowH * (row + 1) + gap * row;
    return Array.from({ length: count }, (_, i) => {
      const b = BLOCKS[index++]!;
      const x = i * (w + gap);
      const h = rowH * b.h;
      const id = `site-mark-${className}-${index}`;
      return (
        <g key={id}>
          <clipPath id={id}>
            <rect x={x} y={bottom - h} width={w} height={h} />
          </clipPath>
          <rect x={x} y={bottom - h} width={w} height={h} style={{ fill: b.fill }} />
          <text
            x={x + w / 2}
            y={bottom - fontSize * 0.06}
            textAnchor="middle"
            clipPath={`url(#${id})`}
            style={{ fill: 'var(--site-navy)', fontSize, fontWeight: 800, letterSpacing: '-0.04em' }}
          >
            {b.letter}
          </text>
        </g>
      );
    });
  });
  const height = rowH * rows.length + gap * (rows.length - 1);
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="efficio">
      {shapes}
    </svg>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <BlockMark className="site-mark site-mark--wide" rows={[7]} width={1400} rowH={330} fontSize={270} />
      <BlockMark className="site-mark site-mark--phone" rows={[4, 3]} width={400} rowH={190} fontSize={170} />

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
