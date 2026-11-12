import type { CSSProperties } from 'react';
import { MessageCircle } from 'lucide-react';
import { monthAgenda, MONTHS } from '../obligations';
import { CHAPTERS, OFFICE, whatsappHref } from '../site-content';
import { ExternalLink, PortalLink, SectionLink } from './site-ui';

/** Colour of each folder = ground of its section; tab positions on desktop and on the phone. */
const FOLDER_LOOK: Record<(typeof CHAPTERS)[number]['id'], { bg: string; fg: string; x: string; xPhone: string }> = {
  mes: { bg: 'var(--site-paper)', fg: 'var(--site-ink)', x: '0%', xPhone: '0%' },
  servicos: { bg: 'var(--site-blue)', fg: 'var(--site-on-dark)', x: '17%', xPhone: '52%' },
  portal: { bg: 'var(--site-sky)', fg: 'var(--site-ink)', x: '36%', xPhone: '34%' },
  comecar: { bg: 'var(--site-white)', fg: 'var(--site-ink)', x: '55%', xPhone: '4%' },
  contato: { bg: 'var(--site-navy)', fg: 'var(--site-on-dark)', x: '76%', xPhone: '62%' },
};

/** "Em novembro, uma empresa do Simples com funcionários tem 7 entregas; a próxima vence no dia 15." */
export function monthLine(today: Date): string {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const agenda = monthAgenda(year, month, 'simples', true);
  const next = agenda.days.find((d) => d.day >= today.getDate());
  const when = next ? `a próxima vence no dia ${next.day}` : 'as datas do mês já passaram';
  return `Em ${MONTHS[month - 1]}, uma empresa do Simples com funcionários tem ${agenda.total} entregas; ${when}.`;
}

export function SiteHero({ today = new Date() }: { today?: Date }) {
  // Back to front: the last chapter is the folder at the back, "O seu mês" is the open one in front.
  const stack = [...CHAPTERS].reverse();
  return (
    <header className="site-hero">
      <div className="site-topbar">
        <SectionLink to="contato" className="site-topbar__left site-link">
          Fale com o escritório
        </SectionLink>
        <span className="site-topbar__name">{OFFICE.name}</span>
        <div className="site-topbar__right">
          <PortalLink className="site-button--light site-button--small" />
        </div>
      </div>

      <div className="site-hero__head">
        <h1 className="site-hero__title">
          <span className="site-line">
            <span>efficio</span>
          </span>
          <span className="site-sr-only"> Contabilidade</span>
        </h1>
        <p className="site-hero__lead">
          Escritório de contabilidade para empresas. Do latim efficio, “eu concluo”: cada guia,
          folha e declaração do mês, no prazo.
        </p>
      </div>

      <nav className="site-folders" aria-label="Seções do site">
        {stack.map((chapter, i) => {
          const look = FOLDER_LOOK[chapter.id];
          const front = chapter.id === 'mes';
          const style = { '--i': i, '--folder-bg': look.bg, '--folder-fg': look.fg, '--x': look.x, '--x-phone': look.xPhone } as CSSProperties;
          return (
            <div key={chapter.id} className={front ? 'site-folder site-folder--front' : 'site-folder'} style={style}>
              <SectionLink to={chapter.id} className="site-folder__tab">
                {chapter.label}
              </SectionLink>
              {front ? (
                <div className="site-folder__body">
                  <ExternalLink href={whatsappHref('Olá! Quero conversar sobre a contabilidade da minha empresa.')} className="site-button">
                    <MessageCircle aria-hidden />
                    Falar com o escritório
                  </ExternalLink>
                  <p className="site-folder__note">{monthLine(today)}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </header>
  );
}
