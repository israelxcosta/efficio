import { useState } from 'react';
import { Plus } from 'lucide-react';
import { FAQ, FAQ_TOPICS, type FaqTopic } from '../site-content';

type Filter = 'todas' | FaqTopic;

/** "Mais perguntas? Mais respostas.": filter pills, then the questions grouped by topic (accordion). */
export function FaqSection() {
  const [filter, setFilter] = useState<Filter>('todas');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const topics = FAQ_TOPICS.filter((t) => filter === 'todas' || t.id === filter);

  function toggle(q: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });
  }

  return (
    <section id="duvidas" className="site-faq" aria-labelledby="duvidas-title">
      <h2 id="duvidas-title" className="site-h2" tabIndex={-1} data-section-heading data-reveal>
        Mais perguntas?
        <br /> Mais respostas.
      </h2>

      <div className="site-chips site-faq__filters" role="group" aria-label="Filtrar as dúvidas por assunto">
        {[{ id: 'todas' as const, label: 'Todas' }, ...FAQ_TOPICS].map((t) => (
          <button key={t.id} type="button" className="site-chip" aria-pressed={filter === t.id} onClick={() => setFilter(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {topics.map((topic) => (
        <div key={topic.id} className="site-faq__group">
          <h3 className="site-faq__topic">{topic.label}</h3>
          <ul>
            {FAQ.filter((item) => item.topic === topic.id).map((item, i) => {
              const id = `duvida-${topic.id}-${i}`;
              const isOpen = open.has(item.q);
              return (
                <li key={item.q} className="site-faq__item" data-open={isOpen}>
                  <h4 className="site-faq__heading">
                    <button type="button" className="site-faq__question" aria-expanded={isOpen} aria-controls={`${id}-resposta`} id={`${id}-pergunta`} onClick={() => toggle(item.q)}>
                      <span>{item.q}</span>
                      <span className="site-faq__plus" aria-hidden>
                        <Plus strokeWidth={1.6} />
                      </span>
                    </button>
                  </h4>
                  <div id={`${id}-resposta`} role="region" aria-labelledby={`${id}-pergunta`} className="site-faq__answer" hidden={!isOpen}>
                    <p>{item.a}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
