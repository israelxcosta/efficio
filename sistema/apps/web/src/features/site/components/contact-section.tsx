import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { contactMessage, mailtoHref, OFFICE, whatsappHref } from '../site-content';
import { DOCUMENTS, DocThumb } from './portal-fragments';
import { ExternalLink } from './site-ui';

/**
 * "Fale com o escritório": the papers of a client's month drift across the top; the bar writes the
 * WhatsApp message (name + subject) and opens it, so nothing is sent without the visitor confirming.
 */
export function ContactSection({ subject, onSubjectChange }: { subject: string; onSubjectChange: (subject: string) => void }) {
  const [name, setName] = useState('');
  const stripRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  // The drifting strip stops while it is off screen.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setPaused(!entry?.isIntersecting));
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    window.open(whatsappHref(contactMessage(name, subject)), '_blank', 'noopener,noreferrer');
  }

  return (
    <section id="contato" className="site-chapter site-contato" aria-labelledby="contato-title">
      <div ref={stripRef} className="site-strip" data-paused={paused} aria-hidden>
        <div className="site-strip__track">
          {[...DOCUMENTS, ...DOCUMENTS].map((doc, i) => (
            <DocThumb key={i} doc={doc} />
          ))}
        </div>
      </div>

      <div className="site-wrap site-contato__body">
        <h2 id="contato-title" tabIndex={-1} data-section-heading data-reveal>
          Fale com o escritório
        </h2>
        <p className="site-contato__lead" data-reveal style={{ '--d': '80ms' } as CSSProperties}>
          Diga o seu nome e o assunto: o WhatsApp abre com a mensagem escrita. Atendimento: {OFFICE.hours.toLowerCase()}.
        </p>

        <form className="site-contact-bar" onSubmit={submit} data-reveal style={{ '--d': '160ms' } as CSSProperties}>
          <label className="site-sr-only" htmlFor="contato-nome">
            Seu nome
          </label>
          <input id="contato-nome" name="nome" autoComplete="name" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="site-sr-only" htmlFor="contato-assunto">
            Assunto
          </label>
          <input
            id="contato-assunto"
            name="assunto"
            placeholder="Assunto: abrir empresa, folha…"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
          />
          <button type="submit">
            <MessageCircle size={20} aria-hidden />
            Enviar pelo WhatsApp
          </button>
        </form>
        <div className="site-contact-bar__notes site-small">
          <p>
            Prefere e-mail?{' '}
            <ExternalLink href={mailtoHref(subject || 'Contato pelo site')} className="site-link font-semibold text-site-on-dark">
              {OFFICE.email}
            </ExternalLink>
          </p>
          <p>
            WhatsApp {OFFICE.whatsappLabel}. Nada é enviado antes de você confirmar no aplicativo.
          </p>
        </div>
      </div>
    </section>
  );
}
