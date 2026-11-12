import type { CSSProperties } from 'react';
import { FAQ } from '../site-content';

/** "Dúvidas": the heading band on the accent, then one band per question, every answer visible. */
export function FaqBands() {
  return (
    <section id="duvidas" className="site-chapter" aria-labelledby="duvidas-title">
      <div className="site-duvidas__head">
        <h2 id="duvidas-title" tabIndex={-1} data-section-heading data-reveal>
          Dúvidas
        </h2>
      </div>
      <div>
        {FAQ.map((item, i) => (
          <div key={item.q} className="site-faq site-grid">
            <h3 data-reveal style={{ '--d': `${(i % 2) * 40}ms` } as CSSProperties}>
              {item.q}
            </h3>
            <p data-reveal style={{ '--d': `${80 + (i % 2) * 40}ms` } as CSSProperties}>
              {item.a}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
