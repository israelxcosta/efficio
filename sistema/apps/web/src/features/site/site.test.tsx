// Public site of the office: who sees it (visitors at `/`, everyone at `/site`), the portal button
// (the app's login), the WhatsApp links and the month of obligations shown by its calendar.
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from '@/app/routes';
import { AppShell } from '@/components/layout/app-shell';
import { SiteFooter } from './components/site-footer';
import { SiteHero } from './components/site-hero';
import { PORTAL_PATH } from './components/site-ui';
import { calendarCells, easter, lastBusinessDay, monthAgenda, nationalHolidays } from './obligations';
import { contactMessage, OFFICE, whatsappHref } from './site-content';
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

  it('puts the DAS and the FGTS on the 20th and the DCTFWeb on the 15th (Simples, with employees)', () => {
    const { byDay, floating } = ids(2026, 11, 'simples', true);
    expect(byDay[20]).toEqual(expect.arrayContaining(['das', 'inss', 'fgts']));
    expect(byDay[15]).toEqual(expect.arrayContaining(['dctfweb', 'esocial']));
    expect(byDay[25]).toEqual(['balancete']);
    expect(floating).toEqual(['salarios']);
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
    expect(ids(2027, 2, 'presumido', false).byDay[26]).toBeUndefined();
  });

  it('knows the national holidays, Good Friday included', () => {
    expect(easter(2026)).toEqual([4, 5]);
    expect(nationalHolidays(2026).get('04-03')).toBe('Sexta-feira Santa');
    expect(nationalHolidays(2026).get('11-20')).toBe('Consciência Negra');
  });

  it('lays the month out in whole weeks, Monday first', () => {
    const cells = calendarCells(2026, 11);
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 7).map((c) => c.inMonth)).toEqual([false, false, false, false, false, false, true]);
    expect(cells.find((c) => c.inMonth && c.day === 2)!.holiday).toBe('Finados');
  });
});
