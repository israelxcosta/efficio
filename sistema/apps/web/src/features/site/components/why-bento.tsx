import { useEffect, useState, type ComponentType, type CSSProperties, type ReactNode, type SVGProps } from 'react';
import { ArrowRight, CalendarDays, Calculator, CircleCheck, FolderOpen, Inbox, Paperclip, Receipt } from 'lucide-react';
import { portalFeature, whatsappHref } from '../site-content';
import { DocThumb, DOCUMENTS, PortalHome, StatusGlyph } from './portal-fragments';
import { ExternalLink, prefersReducedMotion, SectionLink, wipe } from './site-ui';

function Tag({ icon: Icon, children }: { icon: ComponentType<SVGProps<SVGSVGElement>>; children: ReactNode }) {
  return (
    <p className="site-tag">
      <Icon aria-hidden strokeWidth={1.6} />
      {children}
    </p>
  );
}

/** The month's papers fanned out, then the count of the month on a navy card. */
function DocumentsShot() {
  return (
    <div className="site-shot site-shot--docs" aria-hidden>
      <div className="site-shot__fan">
        {[DOCUMENTS[6]!, DOCUMENTS[3]!, DOCUMENTS[0]!].map((doc, i) => (
          <div key={doc.title} className="site-shot__fan-item" style={{ '--k': i } as CSSProperties}>
            <DocThumb doc={doc} />
          </div>
        ))}
      </div>
      <ArrowRight className="site-shot__arrow" strokeWidth={1.5} />
      <div className="site-shot__count">
        <span className="site-shot__count-figure">9</span>
        <span className="site-shot__count-label">documentos de setembro</span>
        <span className="site-shot__count-rule" />
        <span className="site-shot__count-chip">
          <CircleCheck strokeWidth={2} />
          tudo no mês
        </span>
      </div>
    </div>
  );
}

/** Sixteen tasks of the month, one waiting for the client, and that one opened beside them. */
function PendingShot() {
  return (
    <div className="site-shot site-shot--pending" aria-hidden>
      <div data-ui className="site-shot__grid">
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} className={i === 11 ? 'site-shot__cell site-shot__cell--wait' : 'site-shot__cell'}>
            <StatusGlyph status={i === 11 ? 'wait' : i === 14 ? 'doing' : 'done'} />
          </span>
        ))}
      </div>
      <span className="site-shot__beam" />
      <div data-ui className="site-shot__pending">
        <span className="ui-badge ui-badge--wait">Aguardando você</span>
        <span className="ui-row-title">Extratos bancários de setembro</span>
        <span className="ui-row-meta">pedidos em 06/10 · para o balancete</span>
        <span className="site-shot__drop">extrato-setembro.pdf</span>
        <span className="site-shot__pending-actions">
          <span className="ui-btn">Enviar arquivo</span>
          <span className="ui-btn ui-btn--outline">Falar com o escritório</span>
        </span>
      </div>
    </div>
  );
}

/** A guide's way through the month: worked out, sent to the client, paid by the due date. */
function DeadlineShot() {
  return (
    <div className="site-shot site-shot--flow" aria-hidden>
      <div className="site-shot__stage">
        <span className="site-shot__badge">
          <Calculator strokeWidth={1.6} />
        </span>
        <span className="site-shot__stage-name">Apurada</span>
        <div data-ui className="site-shot__mini">
          <span className="ui-row-title">PGDAS-D</span>
          <span className="ui-row-meta">competência 09/2026</span>
          <span className="site-shot__mini-row">
            <StatusGlyph status="done" /> Receita do mês conferida
          </span>
          <span className="site-shot__mini-row">
            <StatusGlyph status="done" /> Guia gerada
          </span>
        </div>
      </div>
      <span className="site-shot__link" />
      <div className="site-shot__stage site-shot__stage--on">
        <span className="site-shot__badge">
          <Paperclip strokeWidth={1.6} />
        </span>
        <span className="site-shot__stage-name">Enviada</span>
        <div className="site-shot__doc">
          <DocThumb doc={DOCUMENTS[0]!} />
        </div>
      </div>
      <span className="site-shot__link" />
      <div className="site-shot__stage">
        <span className="site-shot__badge">
          <CircleCheck strokeWidth={1.6} />
        </span>
        <span className="site-shot__stage-name">Paga</span>
        <div data-ui className="site-shot__mini site-shot__mini--paid">
          <span className="site-shot__paid">
            <StatusGlyph status="done" />
          </span>
          <span className="ui-row-title">Vence 20/10</span>
          <span className="ui-row-meta">anexada em 17/10</span>
        </div>
      </div>
    </div>
  );
}

const DELIVERIES = ['a guia', 'o holerite', 'o balancete', 'a certidão'];

/** "Você recebe [a guia]": the word in the pill takes turns (still with reduced motion). */
function Deliveries() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % DELIVERIES.length), 2200);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <h3 className="site-h2 site-bento__close-title">
      <span className="site-sr-only">Você recebe a guia, o holerite, o balancete e a certidão</span>
      <span aria-hidden>
        Você recebe{' '}
        <span className="site-swap">
          <span key={index} className="site-swap__word">
            {DELIVERIES[index]}
          </span>
        </span>
      </span>
    </h3>
  );
}

/** "Por que empresas escolhem a Efficio": the client portal (in preparation) in four cards and a closing line. */
export function WhyBento() {
  const guias = portalFeature('guias');
  const documentos = portalFeature('documentos');
  const pendencias = portalFeature('pendencias');
  const prazos = portalFeature('prazos');
  return (
    <section id="portal" className="site-why" aria-labelledby="portal-title">
      <p className="site-pill site-soon" data-reveal>
        Portal do cliente · em breve
      </p>
      <h2 id="portal-title" className="site-h2 site-why__title" tabIndex={-1} data-section-heading data-reveal>
        Por que empresas
        <br /> escolhem a Efficio
      </h2>
      <p className="site-why__lead" data-reveal>
        O portal do cliente está em preparação. Até ele abrir, as guias e os documentos chegam por e-mail e pelo WhatsApp do escritório,
        cada um com o seu prazo.
      </p>

      <div className="site-bento">
        <article className="site-bento__card site-bento__card--row" data-reveal>
          <div className="site-bento__copy">
            <Tag icon={Receipt}>Guias</Tag>
            <h3 className="site-h3 site-bento__title">{guias.sentence}</h3>
            <p className="site-bento__text">
              No portal, cada obrigação do mês vai aparecer com o prazo e a situação, e a guia anexada a ela. {guias.result}
            </p>
          </div>
          <div className="site-bento__shot site-bento__shot--home" aria-hidden>
            <div className="site-bento__home">
              <PortalHome />
            </div>
          </div>
        </article>

        <article className="site-bento__card site-bento__card--slate" data-reveal>
          <div className="site-bento__shot">
            <DocumentsShot />
          </div>
          <div className="site-bento__copy">
            <Tag icon={FolderOpen}>Documentos</Tag>
            <h3 className="site-h4 site-bento__title">{documentos.sentence}</h3>
            <p className="site-bento__text">
              No portal, guias, holerites, recibos e certidões vão ficar no mês a que pertencem, prontos para baixar. {documentos.result}
            </p>
          </div>
        </article>

        <article className="site-bento__card site-bento__card--light" data-reveal style={{ '--d': '80ms' } as CSSProperties}>
          <div className="site-bento__shot">
            <PendingShot />
          </div>
          <div className="site-bento__copy">
            <Tag icon={Inbox}>Pendências</Tag>
            <h3 className="site-h4 site-bento__title">{pendencias.sentence}</h3>
            <p className="site-bento__text">
              No portal, quando o escritório precisar de um extrato ou de uma nota, o pedido vai aparecer em destaque, com a data, até você enviar o arquivo.{' '}
              {pendencias.result}
            </p>
          </div>
        </article>

        <article className="site-bento__card site-bento__card--row" data-reveal>
          <div className="site-bento__copy">
            <Tag icon={CalendarDays}>Prazos</Tag>
            <h3 className="site-h3 site-bento__title">{prazos.sentence}</h3>
            <p className="site-bento__text">
              No portal, você vai ver a situação de cada entrega sem precisar perguntar: apurada, enviada, paga. {prazos.result}
            </p>
          </div>
          <div className="site-bento__shot">
            <DeadlineShot />
          </div>
        </article>

        <div className="site-bento__close" data-reveal>
          <div className="site-bento__close-copy">
            <Deliveries />
            <p className="site-bento__close-text">
              Hoje a Efficio entrega cada peça do mês pronta, por e-mail e pelo WhatsApp do escritório. Com o portal, ela vai ficar anexada ao mês, para você conferir e baixar sem procurar.
            </p>
          </div>
          <div className="site-actions site-bento__close-actions">
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
        </div>
      </div>
    </section>
  );
}
