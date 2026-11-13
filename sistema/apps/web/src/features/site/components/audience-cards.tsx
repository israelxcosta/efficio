import { useRef, type ComponentType, type CSSProperties, type SVGProps } from 'react';
import { BriefcaseBusiness, Building, ChevronLeft, ChevronRight, Landmark, Laptop, Rocket, Store, UserRound } from 'lucide-react';
import { AUDIENCES, type AudienceId } from '../site-content';
import { prefersReducedMotion } from './site-ui';

const AUDIENCE_ICON: Record<AudienceId, ComponentType<SVGProps<SVGSVGElement>>> = {
  mei: Rocket,
  simples: Store,
  presumido: Building,
  real: Landmark,
  servicos: Laptop,
  comercio: BriefcaseBusiness,
  liberais: UserRound,
};

/** Colour of each card's top strip, in turns. */
const STRIPS = ['var(--s-accent)', 'var(--s-lime)', 'var(--s-ink)'];

/** "Para quem": one card per regime or kind of company, in a row that scrolls sideways. */
export function AudienceCards() {
  const rowRef = useRef<HTMLUListElement>(null);

  function scrollBy(direction: 1 | -1) {
    const row = rowRef.current;
    if (!row) return;
    const card = row.querySelector('li');
    const step = card ? card.getBoundingClientRect().width + 24 : row.clientWidth * 0.8;
    row.scrollBy({ left: direction * step, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  return (
    <section id="para-quem" className="site-fit" aria-labelledby="para-quem-title">
      <div className="site-fit__head" data-reveal>
        <h2 id="para-quem-title" className="site-h2">
          Para quem é a Efficio
        </h2>
        <div className="site-fit__arrows">
          <button type="button" className="site-round" aria-label="Ver os cartões anteriores" onClick={() => scrollBy(-1)}>
            <ChevronLeft aria-hidden />
          </button>
          <button type="button" className="site-round" aria-label="Ver os próximos cartões" onClick={() => scrollBy(1)}>
            <ChevronRight aria-hidden />
          </button>
        </div>
      </div>
      <ul ref={rowRef} className="site-fit__row" tabIndex={0} aria-label="Regimes e perfis atendidos (role para os lados)">
        {AUDIENCES.map((a, i) => {
          const Icon = AUDIENCE_ICON[a.id];
          return (
            <li key={a.id} className="site-fit__card" style={{ '--strip': STRIPS[i % STRIPS.length] } as CSSProperties}>
              <div className="site-fit__body">
                <span className="site-fit__icon" aria-hidden>
                  <Icon strokeWidth={1.4} />
                </span>
                <h3 className="site-fit__name">{a.name}</h3>
                <p className="site-fit__text">{a.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
