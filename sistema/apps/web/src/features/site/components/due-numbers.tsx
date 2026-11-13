import { DUE_NUMBERS } from '../site-content';

/** Two dates that organise every month (the routine of STEPS), each on its own navy field. */
export function DueNumbers() {
  return (
    <section className="site-due" aria-labelledby="prazos-title">
      <h2 id="prazos-title" className="site-sr-only">
        Os dois prazos que organizam o mês
      </h2>
      {DUE_NUMBERS.map((n, i) => (
        <article key={n.id} className={i === 0 ? 'site-due__panel' : 'site-due__panel site-due__panel--soft'} data-reveal>
          <p className="site-due__figure">{n.figure}</p>
          <div className="site-due__copy">
            <h3 className="site-due__label">{n.label}</h3>
            <p className="site-due__text">{n.text}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
