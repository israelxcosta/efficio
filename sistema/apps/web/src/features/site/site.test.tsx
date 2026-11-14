// Public site of the office: who sees it (visitors at `/`, everyone at `/site`), the portal button
// (the app's login), the WhatsApp links and the month of obligations shown by its calendar.
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from '@/app/routes';
import { AppShell } from '@/components/layout/app-shell';
import { FaqSection } from './components/faq-section';
import { monthFigures } from './components/month-showcase';
import { ServicesOrbit } from './components/services-orbit';
import { AnnouncementBar } from './components/site-header';
import { SiteFooter } from './components/site-footer';
import { SiteHero } from './components/site-hero';
import { PORTAL_PATH } from './components/site-ui';
import { calendarCells, easter, lastBusinessDay, monthAgenda, nationalHolidays } from './obligations';
import { contactMessage, FAQ, FAQ_TOPICS, OFFICE, SERVICES, whatsappHref } from './site-content';
import { shellEntry, SITE_PATH, SitePage } from './site-entry';

const elementType = (el: unknown) => (isValidElement(el) ? (el as ReactElement).type : null);

describe('who sees the site', () => {
  it('shows the site to a visitor who is not signed in at /', () => {
    expect(shellEntry({ loading: false, signedIn: false, pathname: '/' })).toBe('site');
  });

  it('asks a visitor for the login at any other app address', () => {
    for (const pathname of ['/tarefas', '/financeiro', '/minha-area', '/configuracoes']) {
      expect(shellEntry({ loading: false, signedIn: false, pathname })).toBe('login');
    }
  });

  it('keeps sending signed-in users at / to the app, whose start page is the Gestão', () => {
    expect(shellEntry({ loading: false, signedIn: true, pathname: '/' })).toBe('app');
    const shell = routes.find((r) => r.path === '/')!;
    expect(elementType(shell.element)).toBe(AppShell);
    const gestao = (shell.children ?? []).find((r) => (r.children ?? []).some((c) => c.index));
    expect(gestao).toBeDefined();
  });

  it('waits for the session before deciding', () => {
    expect(shellEntry({ loading: true, signedIn: false, pathname: '/' })).toBe('loading');
  });

  it('serves the site at /site outside the app shell, signed in or not', () => {
    const site = routes.find((r) => r.path === SITE_PATH);
    expect(site).toBeDefined();
    expect(elementType(site!.element)).toBe(SitePage);
    const shellChildren = routes.find((r) => r.path === '/')!.children ?? [];
    expect(shellChildren.some((r) => r.path === 'site' || r.path === SITE_PATH)).toBe(false);
  });
});

describe('portal button', () => {
  const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

  it('leads from the top of the page to the login', () => {
    const html = render(<SiteHero />);
    expect(PORTAL_PATH).toBe('/login');
    expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>.*Portal do cliente<\/a>/);
  });

  it('is repeated at the end of the page', () => {
    const html = render(<SiteFooter />);
    expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>.*Entrar no portal<\/a>/);
  });

  it('opens WhatsApp in a new tab without handing it this page', () => {
    const html = render(<SiteHero />);
    expect(html).toContain(`href="https://wa.me/${OFFICE.whatsapp.replace(/\D/g, '')}?text=`);
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('is offered by the bar on top of the page, which can be closed', () => {
    const html = render(<AnnouncementBar />);
    // "Entrar no portal" (the "no portal" part hides on phones, where the bar has one line).
    expect(html).toMatch(/<a[^>]*href="\/login"[^>]*><span>Entrar<span[^>]*> no portal<\/span><\/span>/);
    expect(html).toContain('aria-label="Fechar aviso"');
  });
});

describe('the services', () => {
  it('turns every service into a button that leads to the contact', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ServicesOrbit onPick={() => {}} />
      </MemoryRouter>,
    );
    const buttons = html.match(/<button type="button" class="site-service"/g) ?? [];
    expect(buttons).toHaveLength(SERVICES.length);
    for (const s of SERVICES) expect(html).toContain(`Falar sobre ${s.name.toLowerCase()}.`);
  });
});

describe('the questions', () => {
  it('files every question under a topic, and no topic is empty', () => {
    const topics = new Set(FAQ_TOPICS.map((t) => t.id));
    for (const item of FAQ) expect(topics.has(item.topic)).toBe(true);
    for (const t of FAQ_TOPICS) expect(FAQ.some((item) => item.topic === t.id)).toBe(true);
  });

  it('shows all topics first, with the answers closed and tied to their questions', () => {
    const html = renderToStaticMarkup(<FaqSection />);
    expect(html).toMatch(/<button type="button" class="site-chip" aria-pressed="true">Todas<\/button>/);
    for (const t of FAQ_TOPICS) expect(html).toContain(`aria-pressed="false">${t.label}</button>`);
    const questions = [...html.matchAll(/aria-expanded="false" aria-controls="([^"]+)"/g)].map((m) => m[1]);
    expect(questions).toHaveLength(FAQ.length);
    for (const id of questions) expect(html).toMatch(new RegExp(`id="${id}"[^>]*hidden`));
  });
});

describe('contact links', () => {
  it('keeps only the digits of the number and encodes the message', () => {
    expect(whatsappHref('Olá & até', '+55 (11) 91234-5678')).toBe('https://wa.me/5511912345678?text=Ol%C3%A1%20%26%20at%C3%A9');
  });

  it('writes the message from the name and the subject', () => {
    expect(contactMessage(' Ana ', 'Folha')).toBe('Olá! Sou Ana. Quero falar sobre: Folha.');
    expect(contactMessage('', '')).toBe('Olá! Quero falar com o escritório.');
  });
});

describe('the month of a company', () => {
  const ids = (year: number, month: number, regime: Parameters<typeof monthAgenda>[2], employees: boolean) => {
    const agenda = monthAgenda(year, month, regime, employees);
    return {
      agenda,
      byDay: Object.fromEntries(agenda.days.map((d) => [d.day, d.items.map((o) => o.id)])),
      floating: agenda.floating.map((o) => o.id),
    };
  };

  it('puts the DAS and the FGTS on the 20th, the eSocial on the 15th and the DCTFWeb on the last business day (Simples, with employees)', () => {
    const { byDay, floating } = ids(2026, 11, 'simples', true);
    expect(byDay[20]).toEqual(expect.arrayContaining(['das', 'inss', 'fgts']));
    expect(byDay[15]).toEqual(['esocial']);
    expect(byDay[25]).toEqual(['balancete']);
    // 30/11/2026 is a Monday: the last business day of November.
    expect(byDay[30]).toEqual(['dctfweb']);
    expect(floating).toEqual(['salarios']);
  });

  it('moves the DCTFWeb with the last business day of each month (IN RFB 2.248/2025)', () => {
    expect(lastBusinessDay(2026, 12)).toBe(31);
    expect(ids(2026, 12, 'presumido', false).byDay[31]).toContain('dctfweb');
    // 28/02/2027 is a Sunday: Friday the 26th.
    expect(lastBusinessDay(2027, 2)).toBe(26);
    expect(ids(2027, 2, 'simples', false).byDay[26]).toEqual(['dctfweb']);
    expect(ids(2027, 2, 'simples', false).agenda.days.find((d) => d.items.some((o) => o.id === 'dctfweb'))).toMatchObject({ businessDay: true });
  });

  it('marks due days that are not business days (15 and 20 of November 2026)', () => {
    const { agenda } = ids(2026, 11, 'simples', true);
    const day = (n: number) => agenda.days.find((d) => d.day === n)!;
    expect(day(15)).toMatchObject({ businessDay: false, holiday: 'Proclamação da República', weekday: 0 });
    expect(day(20)).toMatchObject({ businessDay: false, holiday: 'Consciência Negra' });
    expect(day(25)).toMatchObject({ businessDay: true, holiday: null });
  });

  it('leaves the payroll out without employees and the DCTFWeb out of the MEI', () => {
    expect(ids(2026, 11, 'simples', false).byDay[20]).toEqual(['das', 'inss']);
    const mei = ids(2026, 11, 'mei', false);
    expect(mei.byDay).toEqual({ 20: ['das-mei'] });
    expect(mei.floating).toEqual([]);
  });

  it('shows the yearly and quarterly ones in their months', () => {
    expect(ids(2027, 3, 'simples', false).byDay[31]).toContain('defis');
    expect(ids(2027, 5, 'mei', false).byDay[31]).toContain('dasn-simei');
    expect(lastBusinessDay(2027, 1)).toBe(29);
    expect(ids(2027, 1, 'presumido', false).byDay[29]).toContain('irpj-tri');
    expect(ids(2027, 2, 'presumido', false).byDay[26]).toEqual(['dctfweb']);
  });

  it('knows the national holidays, Good Friday included', () => {
    expect(easter(2026)).toEqual([4, 5]);
    expect(nationalHolidays(2026).get('04-03')).toBe('Sexta-feira Santa');
    expect(nationalHolidays(2026).get('11-20')).toBe('Consciência Negra');
  });

  it('counts the figures beside the calendar from the agenda on screen', () => {
    const agenda = monthAgenda(2026, 11, 'simples', true);
    const today = new Date(2026, 10, 13);
    const figures = monthFigures(agenda, today);
    expect(agenda.total).toBe(7);
    expect(figures).toMatchObject({ isCurrent: true, dated: 6, floating: 1, offDays: [15, 20] });
    expect(figures.next?.day).toBe(15);
    // Another month: its first due day; after the 25th, the DCTFWeb on the 30th; after the last due day: none.
    expect(monthFigures(monthAgenda(2026, 12, 'simples', true), today).next?.day).toBe(15);
    expect(monthFigures(agenda, new Date(2026, 10, 27)).next?.day).toBe(30);
    expect(monthFigures(monthAgenda(2026, 11, 'mei', false), new Date(2026, 10, 27)).next).toBeNull();
  });

  it('lays the month out in whole weeks, Monday first', () => {
    const cells = calendarCells(2026, 11);
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 7).map((c) => c.inMonth)).toEqual([false, false, false, false, false, false, true]);
    expect(cells.find((c) => c.inMonth && c.day === 2)!.holiday).toBe('Finados');
  });
});
