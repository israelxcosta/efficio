import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { SERVICES, type Service, type ServiceId } from '../site-content';
import { ServicePreview } from './portal-fragments';

/**
 * "O que o escritório faz": one service per poster line. Pointing at a line (or tabbing to it) shows
 * the service as it appears in the portal, in one frame level with the line; on touch screens each
 * line carries its own picture. Choosing a line opens the contact with the service as the subject.
 */
export function ServicesIndex({ onPick }: { onPick: (service: Service) => void }) {
  const [active, setActive] = useState<ServiceId>(SERVICES[0]!.id);
  const [offset, setOffset] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // The frame follows the active line (centred on it, kept inside the list), never the pointer.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const frame = frameRef.current;
    if (!root || !frame) return;
    const place = () => {
      const row = root.querySelector<HTMLElement>(`[data-service="${active}"]`);
      if (!row) return;
      const y = row.offsetTop + row.offsetHeight / 2 - frame.offsetHeight / 2;
      setOffset(Math.max(0, Math.min(root.offsetHeight - frame.offsetHeight, y)));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [active]);

  return (
    <section id="servicos" className="site-chapter site-servicos" aria-labelledby="servicos-title">
      <div className="site-wrap">
        <div className="site-grid site-servicos__intro">
          <h2 id="servicos-title" tabIndex={-1} data-section-heading data-reveal>
            O que o escritório faz
          </h2>
          <p data-reveal style={{ '--d': '90ms' } as CSSProperties}>
            Sete frentes, uma equipe. Cada entrega vira uma tarefa com prazo e responsável, e aparece no portal quando fica pronta. Escolha um
            serviço para falar sobre ele.
          </p>
        </div>

        <div className="site-index" ref={rootRef}>
          <ul className="site-index__list">
            {SERVICES.map((s, i) => (
              <li key={s.id} data-reveal="left" style={{ '--d': `${i * 60}ms` } as CSSProperties}>
                <a
                  href="#contato"
                  className="site-index__row"
                  data-service={s.id}
                  data-active={active === s.id}
                  onPointerEnter={() => setActive(s.id)}
                  onFocus={() => setActive(s.id)}
                  onClick={(event) => {
                    event.preventDefault();
                    onPick(s);
                  }}
                >
                  <span className="site-index__thumb" aria-hidden>
                    <ServicePreview id={s.id} />
                  </span>
                  <span className="site-index__word">{s.word}</span>
                  <span className="site-index__detail">{s.detail}</span>
                  <span className="site-sr-only"> Falar sobre {s.name.toLowerCase()}.</span>
                </a>
              </li>
            ))}
          </ul>
          <div ref={frameRef} className="site-index__frame" style={{ transform: `translateY(${offset}px)` }} aria-hidden>
            <div key={active} className="site-index__frame-inner">
              <ServicePreview id={active} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
