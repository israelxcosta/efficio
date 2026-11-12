import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { PORTAL_FEATURES } from '../site-content';
import { PortalHome } from './portal-fragments';
import { PortalLink } from './site-ui';

/** Fill of each band when it is switched on (with its text colour). */
const BAND_LOOK: Record<(typeof PORTAL_FEATURES)[number]['id'], { bg: string; fg: string }> = {
  guias: { bg: 'var(--site-navy)', fg: 'var(--site-on-dark)' },
  pendencias: { bg: 'var(--site-white)', fg: 'var(--site-ink)' },
  documentos: { bg: 'var(--site-blue)', fg: 'var(--site-on-dark)' },
  prazos: { bg: 'var(--site-paper)', fg: 'var(--site-ink)' },
  seguranca: { bg: 'var(--site-night)', fg: 'var(--site-on-dark)' },
};

export function PortalSection() {
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(PORTAL_FEATURES.map((f) => [f.id, f.on])));

  return (
    <section id="portal" className="site-chapter site-portal" aria-labelledby="portal-title">
      <div className="site-wrap site-grid site-portal__head">
        <div className="site-portal__copy">
          <h2 id="portal-title" tabIndex={-1} data-section-heading data-reveal>
            O portal do cliente
          </h2>
          <p data-reveal style={{ '--d': '80ms' } as CSSProperties}>
            No portal você acompanha o mês da sua empresa como o escritório vê: cada obrigação com o prazo e a situação, as guias e os holerites
            anexados, e o que ainda depende de você.
          </p>
          <div className="site-portal__actions" data-reveal style={{ '--d': '160ms' } as CSSProperties}>
            <PortalLink className="site-button--ink">Entrar no portal</PortalLink>
            <Link to="/esqueci-senha" className="site-link site-small">
              Esqueci minha senha
            </Link>
          </div>
        </div>
        <div className="site-portal__shot" data-reveal="open" style={{ '--d': '120ms' } as CSSProperties}>
          <PortalHome />
        </div>
      </div>

      <div role="group" aria-label="O que o portal faz por você">
        {PORTAL_FEATURES.map((f) => {
          const checked = on[f.id] ?? false;
          const look = BAND_LOOK[f.id];
          return (
            <button
              key={f.id}
              type="button"
              role="switch"
              aria-checked={checked}
              aria-labelledby={`portal-${f.id}-sentence`}
              aria-describedby={`portal-${f.id}-result`}
              className="site-band"
              style={{ '--band-bg': look.bg, '--band-fg': look.fg } as CSSProperties}
              onClick={() => setOn((s) => ({ ...s, [f.id]: !checked }))}
            >
              <span className="site-band__inner">
                <span className="site-band__text">
                  <span className="site-band__sentence" id={`portal-${f.id}-sentence`}>
                    {f.sentence}
                  </span>
                  <span className="site-band__result" id={`portal-${f.id}-result`}>
                    <span>
                      <span>{f.result}</span>
                    </span>
                  </span>
                </span>
                <span className="site-band__toggle">
                  <span className="site-switch" aria-hidden />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
