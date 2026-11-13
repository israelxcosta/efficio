import { useLayoutEffect, useRef, type ComponentType, type CSSProperties, type SVGProps } from 'react';
import { Building2, Calculator, FileCheck2, Receipt, Scale, Users, Wallet } from 'lucide-react';
import { SERVICES, whatsappHref, type Service, type ServiceId } from '../site-content';
import { ExternalLink, prefersReducedMotion, SectionLink, wipe } from './site-ui';

const SERVICE_ICON: Record<ServiceId, ComponentType<SVGProps<SVGSVGElement>>> = {
  contabil: Calculator,
  fiscal: Receipt,
  folha: Users,
  abertura: Building2,
  planejamento: Scale,
  financeiro: Wallet,
  certidoes: FileCheck2,
};

/**
 * Where each card rests around the centre (desktop), and where it flies in from (dx, dy: the offset
 * towards the centre at the start of the scroll). Left column, bottom row, right column.
 */
const ORBIT: { x: string; y: string; dx: number; dy: number }[] = [
  { x: 'var(--orbit-left)', y: '6%', dx: 110, dy: 70 },
  { x: 'var(--orbit-left)', y: '38%', dx: 130, dy: 0 },
  { x: 'var(--orbit-bl)', y: '70%', dx: 80, dy: -70 },
  { x: 'var(--orbit-center)', y: '73%', dx: 0, dy: -90 },
  { x: 'var(--orbit-br)', y: '70%', dx: -80, dy: -70 },
  { x: 'var(--orbit-right)', y: '38%', dx: -130, dy: 0 },
  { x: 'var(--orbit-right)', y: '6%', dx: -110, dy: 70 },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);

/**
 * "A Efficio cuida de…": on wide screens the heading arrives huge and settles in the centre while the
 * seven services gather around it (driven by the scroll, sticky stage). Elsewhere, and with reduced
 * motion, the finished arrangement (a grid on phones). Choosing a card opens the contact with it.
 */
export function ServicesOrbit({ onPick }: { onPick: (service: Service) => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    const stage = stageRef.current;
    if (!section || !track || !stage || prefersReducedMotion()) return;
    const wide = window.matchMedia('(min-width: 1024px)');
    let frame = 0;
    const apply = () => {
      frame = 0;
      if (!wide.matches) {
        section.classList.remove('is-scrolly');
        section.removeAttribute('data-settled');
        return;
      }
      section.classList.add('is-scrolly');
      const top = parseFloat(getComputedStyle(stage).top) || 0;
      const box = track.getBoundingClientRect();
      const span = Math.max(1, box.height - stage.offsetHeight);
      const p = clamp01((top - box.top) / span);
      section.style.setProperty('--t', smooth(clamp01(p / 0.45)).toFixed(3));
      section.style.setProperty('--c', clamp01((p - 0.18) / 0.62).toFixed(3));
      const b = clamp01((p - 0.62) / 0.3);
      section.style.setProperty('--b', b.toFixed(3));
      section.toggleAttribute('data-settled', b >= 0.99);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
      section.classList.remove('is-scrolly');
      section.removeAttribute('data-settled');
    };
  }, []);

  /** Keyboard focus inside a stage still gathering: jump to its finished state so nothing is invisible. */
  function settle() {
    const section = sectionRef.current;
    const track = trackRef.current;
    const stage = stageRef.current;
    if (!section?.classList.contains('is-scrolly') || !track || !stage) return;
    if (section.hasAttribute('data-settled')) return;
    const top = parseFloat(getComputedStyle(stage).top) || 0;
    const box = track.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + box.top - top + (box.height - stage.offsetHeight), behavior: 'auto' });
  }

  return (
    <section ref={sectionRef} id="servicos" className="site-orbit" aria-labelledby="servicos-title" onFocus={settle}>
      <div ref={trackRef} className="site-orbit__track">
        <div ref={stageRef} className="site-orbit__stage">
          <h2 id="servicos-title" className="site-h2 site-orbit__title" tabIndex={-1} data-section-heading>
            A Efficio
            <br /> cuida de…
          </h2>

          <ul className="site-orbit__cards">
            {SERVICES.map((s, i) => {
              const Icon = SERVICE_ICON[s.id];
              const spot = ORBIT[i]!;
              return (
                <li
                  key={s.id}
                  className="site-orbit__spot"
                  style={{ '--i': i, '--x': spot.x, '--y': spot.y, '--dx': `${spot.dx}px`, '--dy': `${spot.dy}px` } as CSSProperties}
                >
                  <button type="button" className="site-service" onClick={() => onPick(s)}>
                    <Icon className="site-service__icon" strokeWidth={1.5} aria-hidden />
                    <span className="site-service__name">{s.name}</span>
                    <span className="site-service__detail">{s.detail}</span>
                    <span className="site-sr-only"> Falar sobre {s.name.toLowerCase()}.</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="site-orbit__cta">
            <div className="site-actions">
              <ExternalLink
                href={whatsappHref('Olá! Quero uma proposta para a contabilidade da minha empresa.')}
                className="site-btn"
                {...wipe('Pedir proposta')}
              >
                Pedir proposta
              </ExternalLink>
              <SectionLink to="contato" className="site-btn site-btn--ghost" {...wipe('Fale conosco')}>
                Fale conosco
              </SectionLink>
            </div>
            <p className="site-orbit__note">Escolha um serviço para falar sobre ele. Uma equipe, sete frentes, um portal.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
