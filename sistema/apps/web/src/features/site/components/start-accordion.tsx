import { useState, type CSSProperties } from 'react';
import { STEPS, type StepId } from '../site-content';
import { StepShot } from './portal-fragments';

/** Dark to light, one hue: the order of the stages is carried by the colour. */
const STEP_LOOK: Record<StepId, { bg: string; fg: string }> = {
  conversa: { bg: 'var(--site-navy)', fg: 'var(--site-on-dark)' },
  proposta: { bg: 'var(--site-navy-2)', fg: 'var(--site-on-dark)' },
  transicao: { bg: 'var(--site-blue)', fg: 'var(--site-on-dark)' },
  portal: { bg: 'var(--site-blue-2)', fg: 'var(--site-on-dark)' },
  rotina: { bg: 'var(--site-blue-3)', fg: 'var(--site-ink)' },
};

const FIRST_TALK = ['O CNPJ, ou a ideia do negócio', 'O regime tributário de hoje', 'Quantas pessoas trabalham na empresa', 'Faturamento e notas emitidas por mês'];

export function StartAccordion() {
  const [open, setOpen] = useState<StepId>('conversa');

  return (
    <section id="comecar" className="site-chapter site-comecar" aria-labelledby="comecar-title">
      <div className="site-wrap">
        <div className="site-grid site-comecar__intro">
          <h2 id="comecar-title" tabIndex={-1} data-section-heading data-reveal>
            Como começar
          </h2>
          <p data-reveal style={{ '--d': '90ms' } as CSSProperties}>
            Abrir uma empresa ou trocar de contador segue o mesmo caminho, em cinco etapas. Na primeira você só conversa; o resto o escritório
            conduz com você.
          </p>
        </div>

        <ol className="site-steps" data-reveal style={{ '--d': '160ms' } as CSSProperties}>
          {STEPS.map((step) => {
            const isOpen = open === step.id;
            const look = STEP_LOOK[step.id];
            return (
              <li key={step.id} className="site-step" data-open={isOpen} style={{ '--step-bg': look.bg, '--step-fg': look.fg } as CSSProperties}>
                <h3 className="site-step__heading">
                  <button
                    type="button"
                    className="site-step__button"
                    aria-expanded={isOpen}
                    aria-controls={`etapa-${step.id}`}
                    onClick={() => setOpen(step.id)}
                  >
                    <span className="site-step__label">{step.name}</span>
                  </button>
                </h3>
                <div id={`etapa-${step.id}`} className="site-step__panel" hidden={!isOpen}>
                  <p className="site-step__text">{step.text}</p>
                  <div className="site-step__aside">
                    {step.id === 'conversa' ? (
                      <div>
                        <p className="site-step__aside-title">Para a primeira conversa</p>
                        <ul className="site-step__list">
                          {FIRST_TALK.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <StepShot id={step.id} />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
