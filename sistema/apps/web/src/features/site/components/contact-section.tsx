import { useState, type FormEvent } from 'react';
import { contactMessage, mailtoHref, OFFICE, whatsappHref } from '../site-content';
import { ExternalLink, PortalLink } from './site-ui';

/**
 * "Fale com o escritório" on the lime card: the form writes the WhatsApp message (name + subject) and
 * opens it, so nothing is sent without the visitor confirming. The office's details on the white panel.
 */
export function ContactSection({ subject, onSubjectChange }: { subject: string; onSubjectChange: (subject: string) => void }) {
  const [name, setName] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    window.open(whatsappHref(contactMessage(name, subject)), '_blank', 'noopener,noreferrer');
  }

  return (
    <section id="contato" className="site-contact" aria-labelledby="contato-title">
      <div className="site-contact__card" data-reveal>
        <div className="site-contact__copy">
          <p className="site-contact__label">Contato</p>
          <h2 id="contato-title" className="site-h2 site-contact__title" tabIndex={-1} data-section-heading>
            Fale com o escritório
          </h2>
          <p className="site-contact__lead">
            Diga o seu nome e o assunto: o WhatsApp abre com a mensagem escrita, e você confere antes de enviar.
          </p>

          <form className="site-form" onSubmit={submit}>
            <div className="site-field">
              <label htmlFor="contato-nome">Seu nome</label>
              <input id="contato-nome" name="nome" autoComplete="name" placeholder="Como podemos chamar você" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="site-field">
              <label htmlFor="contato-assunto">Assunto</label>
              <input
                id="contato-assunto"
                name="assunto"
                placeholder="Abrir empresa, folha, troca de contador…"
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
              />
            </div>
            <button type="submit" className="site-btn site-form__submit" data-label="Enviar pelo WhatsApp">
              Enviar pelo WhatsApp
            </button>
          </form>
          <p className="site-contact__note">
            Prefere e-mail?{' '}
            <ExternalLink href={mailtoHref(subject || 'Contato pelo site')} className="site-inline-link">
              {OFFICE.email}
            </ExternalLink>
            . Nada é enviado antes de você confirmar no aplicativo.
          </p>
        </div>

        <aside className="site-contact__aside" aria-label="Dados do escritório">
          <dl className="site-contact__list">
            <div>
              <dt>WhatsApp</dt>
              <dd>
                <ExternalLink href={whatsappHref('Olá! Vim pelo site do escritório.')} className="site-inline-link">
                  {OFFICE.whatsappLabel}
                </ExternalLink>
              </dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>
                <ExternalLink href={mailtoHref('Contato pelo site')} className="site-inline-link">
                  {OFFICE.email}
                </ExternalLink>
              </dd>
            </div>
            <div>
              <dt>Atendimento</dt>
              <dd>{OFFICE.hours}</dd>
            </div>
            <div>
              <dt>Endereço</dt>
              <dd>{OFFICE.address}</dd>
            </div>
          </dl>
          <div className="site-contact__portal">
            <p>
              <strong>Já é cliente?</strong> Guias, documentos e pendências do mês estão no portal.
            </p>
            <PortalLink className="site-btn--sm">Entrar no portal</PortalLink>
          </div>
        </aside>
      </div>
    </section>
  );
}
