import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { calendarCells, dayLabel, monthAgenda, MONTHS, nonBusinessDueDays, REGIMES, shiftMonth, type MonthAgenda, type Regime } from '../obligations';
import { whatsappHref } from '../site-content';
import { ExternalLink, wipe } from './site-ui';

const WEEKDAY_INITIALS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

function joinDays(days: number[]): string {
  if (days.length <= 1) return `o dia ${days[0]} não é útil`;
  return `os dias ${days.slice(0, -1).join(', ')} e ${days[days.length - 1]} não são úteis`;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** The three figures beside the heading, all counted from the agenda on screen. */
export function monthFigures(agenda: MonthAgenda, today: Date) {
  const isCurrent = agenda.year === today.getFullYear() && agenda.month === today.getMonth() + 1;
  const dated = agenda.days.reduce((n, d) => n + d.items.length, 0);
  const upcoming = isCurrent ? agenda.days.find((d) => d.day >= today.getDate()) : agenda.days[0];
  const offDays = nonBusinessDueDays(agenda);
  return { isCurrent, dated, floating: agenda.floating.length, next: upcoming ?? null, offDays };
}

/** "O seu mês": pick the regime (and employees) and read the month's obligations. */
export function MonthShowcase({ today = new Date() }: { today?: Date }) {
  const [regime, setRegime] = useState<Regime>('simples');
  const [employees, setEmployees] = useState(true);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const tabsRef = useRef<HTMLDivElement>(null);

  const agenda = useMemo(() => monthAgenda(view.year, view.month, regime, employees), [view, regime, employees]);
  const cells = useMemo(() => calendarCells(view.year, view.month), [view]);
  const byDay = new Map(agenda.days.map((d) => [d.day, d]));
  const monthName = MONTHS[view.month - 1]!;
  const figures = monthFigures(agenda, today);
  const regimeLong = REGIMES.find((r) => r.id === regime)!.long;
  const who = `${regimeLong}, ${employees ? 'com funcionários' : 'sem funcionários'}`;
  const message = `Olá! Minha empresa é do ${regimeLong}${employees ? ', com funcionários' : ', sem funcionários'}. Quero conversar sobre a contabilidade.`;

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    let next: number | null = null;
    if (event.key in keys) next = (index + keys[event.key]! + REGIMES.length) % REGIMES.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = REGIMES.length - 1;
    if (next === null) return;
    event.preventDefault();
    setRegime(REGIMES[next]!.id);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  const next = figures.next;
  const nextNames = next ? [...new Set(next.items.map((o) => o.short))] : [];

  return (
    <section id="mes" className="site-mes" aria-labelledby="mes-title">
      <div className="site-mes__head">
        <div className="site-mes__copy" data-reveal>
          <p className="site-pill">
            Calendário · {monthName} de {view.year}
          </p>
          <h2 id="mes-title" className="site-h2 site-mes__title" tabIndex={-1} data-section-heading>
            As obrigações do seu mês, dia a dia
          </h2>
          <p className="site-mes__lead">
            Escolha o regime e veja o que vence em {monthName}. É essa agenda que o escritório cumpre por você, com as guias enviadas por e-mail e pelo WhatsApp do escritório.
          </p>

          <div className="site-mes__controls">
            <div ref={tabsRef} role="tablist" aria-label="Regime da empresa" className="site-chips">
              {REGIMES.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  id={`regime-${r.id}`}
                  aria-selected={regime === r.id}
                  aria-controls="mes-agenda"
                  tabIndex={regime === r.id ? 0 : -1}
                  className="site-chip"
                  onClick={() => setRegime(r.id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                >
                  {r.long}
                </button>
              ))}
            </div>
            <button type="button" role="switch" aria-checked={employees} className="site-toggle" onClick={() => setEmployees((v) => !v)}>
              <span className="site-toggle__track" aria-hidden />
              Com funcionários
            </button>
          </div>

          <div className="site-actions">
            <ExternalLink href={whatsappHref(message)} className="site-btn" {...wipe('Conversar sobre o meu caso')}>
              Conversar sobre o meu caso
            </ExternalLink>
          </div>
        </div>

        <div className="site-stats" aria-live="polite" data-reveal style={{ '--d': '120ms' } as CSSProperties}>
          <div className="site-stat site-stat--big">
            <p className="site-stat__figure">{agenda.total}</p>
            <p className="site-stat__label">
              entregas em {monthName} para uma empresa do {who}
            </p>
            <p className="site-stat__note">
              {figures.dated} com dia marcado no calendário
              {figures.floating
                ? ` e ${figures.floating} ${figures.floating === 1 ? 'contada' : 'contadas'} em dias úteis ou no prazo do estado`
                : ''}
            </p>
          </div>
          <div className="site-stat">
            <p className="site-stat__figure">{next ? next.day : '–'}</p>
            <p className="site-stat__label">{figures.isCurrent ? 'é o dia do próximo vencimento' : `é o primeiro vencimento de ${monthName}`}</p>
            <p className="site-stat__note">{next ? listNames(nextNames) : 'As datas deste mês já passaram.'}</p>
          </div>
          <div className="site-stat">
            <p className="site-stat__figure">{figures.offDays.length}</p>
            <p className="site-stat__label">{figures.offDays.length === 1 ? 'vencimento cai em dia não útil' : 'vencimentos caem em dia não útil'}</p>
            <p className="site-stat__note">
              {figures.offDays.length ? `Dia${figures.offDays.length > 1 ? 's' : ''} ${listNames(figures.offDays.map(String))}: o prazo antecipa ou adia conforme a regra.` : 'Todos os vencimentos caem em dias úteis.'}
            </p>
          </div>
        </div>
      </div>

      <div id="mes-agenda" role="tabpanel" aria-labelledby={`regime-${regime}`} className="site-mes__board">
        <div className="site-mes__plate">
          <div data-ui className="ui-cal">
            <div className="ui-head">
              <div className="min-w-0">
                <p className="ui-title" aria-live="polite">
                  {monthName} de {view.year}
                </p>
                <p className="ui-sub">
                  {regimeLong} · {employees ? 'com funcionários' : 'sem funcionários'} · {agenda.total} entregas
                </p>
              </div>
              <div className="ui-cal__nav">
                <button type="button" aria-label="Mês anterior" onClick={() => setView(shiftMonth(view.year, view.month, -1))}>
                  <ChevronLeft aria-hidden />
                </button>
                <button type="button" aria-label="Próximo mês" onClick={() => setView(shiftMonth(view.year, view.month, 1))}>
                  <ChevronRight aria-hidden />
                </button>
              </div>
            </div>
            <div className="ui-cal__wd" aria-hidden>
              {WEEKDAY_INITIALS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="ui-cal__grid" aria-hidden>
              {cells.map((cell, i) => {
                const due = cell.inMonth ? byDay.get(cell.day) : undefined;
                const off = cell.weekday === 0 || cell.weekday === 6 || cell.holiday !== null;
                const shorts = due ? [...new Set(due.items.map((o) => o.short))] : [];
                const classes = [
                  'ui-cal__cell',
                  cell.inMonth ? '' : 'ui-cal__cell--out',
                  cell.inMonth && off ? 'ui-cal__cell--off' : '',
                  due ? 'ui-cal__cell--due' : '',
                  figures.isCurrent && cell.inMonth && cell.day === today.getDate() ? 'ui-cal__cell--today' : '',
                ];
                return (
                  <div key={i} className={classes.filter(Boolean).join(' ')}>
                    <span className="ui-cal__day">{cell.day}</span>
                    {cell.inMonth && cell.holiday ? <span className="ui-cal__holiday">feriado</span> : null}
                    {shorts.slice(0, shorts.length > 3 ? 2 : 3).map((s) => (
                      <span key={s} className="ui-cal__chip">
                        {s}
                      </span>
                    ))}
                    {shorts.length > 3 ? <span className="ui-cal__chip">+{shorts.length - 2}</span> : null}
                    {due ? <span className="ui-cal__dot" /> : null}
                  </div>
                );
              })}
            </div>
            <div className="ui-foot">
              <span>
                {figures.offDays.length
                  ? `Em ${monthName}, ${joinDays(figures.offDays)}: cada obrigação antecipa ou adia conforme a sua regra.`
                  : `Em ${monthName}, todos os vencimentos caem em dias úteis.`}
              </span>
            </div>
          </div>
        </div>

        <div className="site-agenda">
          <p className="site-agenda__title">Agenda de {monthName}</p>
          <ol className="site-agenda__list">
            {agenda.days.map((d) => (
              <li key={d.day} className="site-agenda__day">
                <span className="site-agenda__num" aria-hidden>
                  {d.day}
                </span>
                <div className="min-w-0">
                  <p className="site-agenda__when">
                    <span className="site-sr-only">{dayLabel(d)}</span>
                    <span aria-hidden>{d.holiday ? `${d.holiday} · feriado nacional` : d.businessDay ? 'dia útil' : 'fim de semana'}</span>
                  </p>
                  <ul className="site-agenda__items">
                    {d.items.map((o) => (
                      <li key={o.id}>
                        {o.name} <span>· {o.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
            {agenda.floating.length ? (
              <li className="site-agenda__day">
                <span className="site-agenda__num" aria-hidden>
                  +
                </span>
                <div className="min-w-0">
                  <p className="site-agenda__when">sem dia fixo no calendário</p>
                  <ul className="site-agenda__items">
                    {agenda.floating.map((o) => (
                      <li key={o.id}>
                        {o.name} <span>· {o.due.kind === 'floating' ? o.due.label : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ) : null}
          </ol>
          <p className="site-agenda__foot">
            Datas de referência das regras federais. Estados e municípios têm prazos próprios, e o escritório confere cada mês.
          </p>
        </div>
      </div>
    </section>
  );
}
