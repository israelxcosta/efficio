import type { ComponentType, CSSProperties, SVGProps } from 'react';
import { BadgeCheck, KeyRound, LockKeyhole, MessageCircle } from 'lucide-react';
import { GUARANTEES, OFFICE, whatsappHref } from '../site-content';
import { ExternalLink, PortalLink, wipe } from './site-ui';

const GUARANTEE_ICON: Record<(typeof GUARANTEES)[number]['id'], ComponentType<SVGProps<SVGSVGElement>>> = {
  'duas-etapas': KeyRound,
  lgpd: LockKeyhole,
  whatsapp: MessageCircle,
  crc: BadgeCheck,
};

/** A sheet of paper with the top-right corner folded (x, y = top-left; w × h). */
function sheet(x: number, y: number, w: number, h: number, fold = 22): string {
  return `M${x} ${y}H${x + w - fold}L${x + w} ${y + fold}V${y + h}H${x}Z`;
}

/**
 * The office's month as a drawing: the DAS (a document) goes through the portal (the navy panel with
 * the lime lines being filled) and the payslip comes out checked. Loops softly; still with reduced motion.
 */
function HeroFlow() {
  const lines = [104, 140, 224, 186, 30, 166, 120];
  return (
    <svg className="site-flow" viewBox="0 0 720 640" preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
      <defs>
        <linearGradient id="site-flow-beam" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" className="site-flow__stop site-flow__stop--clear" />
          <stop offset="1" className="site-flow__stop" />
        </linearGradient>
      </defs>

      <rect className="site-flow__beam" x="196" y="272" width="164" height="96" fill="url(#site-flow-beam)" />

      <g className="site-flow__doc site-flow__doc--das">
        <path className="site-flow__paper" d={sheet(70, 62, 190, 270)} />
        <path className="site-flow__fold" d="M238 62v22h22" />
        <text className="site-flow__name" x="165" y="140" textAnchor="middle">
          DAS
        </text>
        <rect className="site-flow__ink" x="94" y="172" width="138" height="5" rx="2.5" />
        <rect className="site-flow__ink site-flow__ink--soft" x="94" y="190" width="84" height="5" rx="2.5" />
        <rect className="site-flow__ink" x="94" y="208" width="112" height="5" rx="2.5" />
        <rect className="site-flow__ink site-flow__ink--soft" x="94" y="226" width="96" height="5" rx="2.5" />
        <rect className="site-flow__chip" x="94" y="262" width="104" height="26" rx="5" />
        <text className="site-flow__chip-text" x="146" y="280" textAnchor="middle">
          R$ 1.248,31
        </text>
      </g>

      <g className="site-flow__panel">
        <rect className="site-flow__screen" x="356" y="210" width="304" height="222" rx="6" />
        <rect className="site-flow__bar" x="356" y="210" width="304" height="10" rx="5" />
        {lines.map((w, i) => (
          <rect
            key={i}
            className="site-flow__line"
            style={{ '--i': i } as CSSProperties}
            x="386"
            y={240 + i * 23}
            width={w}
            height="4"
            rx="2"
          />
        ))}
      </g>

      <g className="site-flow__doc site-flow__doc--holerite">
        <path className="site-flow__paper" d={sheet(76, 402, 176, 300)} />
        <path className="site-flow__fold" d="M230 402v22h22" />
        <text className="site-flow__name" x="164" y="470" textAnchor="middle">
          Holerite
        </text>
        <g className="site-flow__check">
          <rect className="site-flow__check-box" x="130" y="530" width="68" height="46" rx="4" />
          <path className="site-flow__check-mark" d="M150 553l9 9 19-19" />
        </g>
      </g>
    </svg>
  );
}

export function SiteHero() {
  return (
    <section className="site-hero" aria-labelledby="hero-title">
      <div className="site-hero__top">
        <div className="site-hero__content">
          <div className="site-hero__text">
            <p className="site-badge">
              Escritório de contabilidade <span aria-hidden>·</span> {OFFICE.crc}
            </p>
            <h1 id="hero-title" className="site-h1 site-hero__title" tabIndex={-1} data-section-heading>
              Sua empresa em dia com o fisco, sem papel na mesa
            </h1>
            <p className="site-hero__lead">
              A Efficio cuida da contabilidade, dos impostos e da folha. Você acompanha guias, documentos e prazos do mês pelo portal do
              cliente.
            </p>
          </div>
          <div className="site-actions">
            <ExternalLink
              href={whatsappHref('Olá! Quero uma proposta para a contabilidade da minha empresa.')}
              className="site-btn site-btn--white"
              {...wipe('Pedir proposta')}
            >
              Pedir proposta
            </ExternalLink>
            <PortalLink className="site-btn--ghost-inverse" />
          </div>
        </div>
        <div className="site-hero__media">
          <HeroFlow />
        </div>
      </div>

      <div className="site-trust">
        <p className="site-trust__title">Feito para empresas que levam prazo e sigilo a sério</p>
        <ul className="site-trust__list">
          {GUARANTEES.map((g) => {
            const Icon = GUARANTEE_ICON[g.id];
            return (
              <li key={g.id} className="site-trust__item">
                <span className="site-trust__icon" aria-hidden>
                  <Icon strokeWidth={1.4} />
                </span>
                <span className="site-trust__name">{g.title}</span>
                <span className="site-trust__caption">{g.caption}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
