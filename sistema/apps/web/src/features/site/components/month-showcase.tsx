import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { calendarCells, dayLabel, monthAgenda, MONTHS, nonBusinessDueDays, REGIMES, shiftMonth, type Regime } from '../obligations';
import { whatsappHref } from '../site-content';
import { ExternalLink } from './site-ui';

const WEEKDAY_INITIALS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

function joinDays(days: number[]): string {
  if (days.length <= 1) return `o dia ${days[0]} não é útil`;
  return `os dias ${days.slice(0, -1).join(', ')} e ${days[days.length - 1]} não são úteis`;
}

/** "O mês da sua empresa": pick the regime (and employees) and read the month's obligations. */
export function MonthShowcase({ today = new Date() }: { today?: Date }) {
  const [regime, setRegime] = useState<Regime>('simples');
  const [employees, setEmployees] = useState(true);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const tabsRef = useRef<HTMLDivElement>(null);

  const agenda = useMemo(() => monthAgenda(view.year, view.month, regime, employees), [view, regime, employees]);
  const cells = useMemo(() => calendarCells(view.year, view.month), [view]);
  const byDay = new Map(agenda.days.map((d) => [d.day, d]));
  const monthName = MONTHS[view.month - 1]!;
  const isCurrentMonth = view.year === today.getFullYear() && view.month === today.getMonth() + 1;
  const offDays = nonBusinessDueDays(agenda);
  const regimeLong = REGIMES.find((r) => r.id === regime)!.long;
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

  return (
    <section id="mes" className="site-chapter site-mes" aria-labelledby="mes-title">
      <div className="site-wrap site-mes__grid">
        <div className="site-mes__plate" data-reveal="open">
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
                  isCurrentMonth && cell.inMonth && cell.day === today.getDate() ? 'ui-cal__cell--today' : '',
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
                {offDays.length
                  ? `Em ${monthName}, ${joinDays(offDays)}: cada obrigação antecipa ou adia conforme a sua regra.`
                  : `Em ${monthName}, todos os vencimentos caem em dias úteis.`}
              </span>
            </div>
          </div>
        </div>

        <div className="site-mes__side">
          <div ref={tabsRef} role="tablist" aria-label="Regime da empresa" className="site-tabs" data-reveal style={{ '--d': '0ms' } as React.CSSProperties}>
            {REGIMES.map((r, i) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                id={`regime-${r.id}`}
                aria-selected={regime === r.id}
                aria-controls="mes-agenda"
                tabIndex={regime === r.id ? 0 : -1}
                className="site-tab"
                onClick={() => setRegime(r.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {r.long}
              </button>
            ))}
          </div>

          <div data-reveal style={{ '--d': '80ms' } as React.CSSProperties}>
            <h2 id="mes-title" className="site-mes__title" tabIndex={-1} data-section-heading>
              O mês da sua empresa
            </h2>
            <p className="site-mes__intro">
              Escolha o regime e veja o que vence em {monthName}. É essa agenda que o escritório cumpre por você, e que você acompanha no
              portal.
            </p>
            <div id="mes-agenda" role="tabpanel" aria-labelledby={`regime-${regime}`} className="site-agenda">
              {agenda.days.map((d) => (
                <div key={d.day} className="site-agenda__day">
                  <span className="site-agenda__num" aria-hidden>
                    {d.day}
                  </span>
                  <div>
                    <p className="site-agenda__when">
                      <span className="site-sr-only">{dayLabel(d)}</span>
                      <span aria-hidden>
                        {d.holiday ? `${d.holiday} · feriado nacional` : d.businessDay ? 'dia útil' : 'fim de semana'}
                      </span>
                    </p>
                    <ul className="site-agenda__items">
                      {d.items.map((o) => (
                        <li key={o.id}>
                          {o.name} <span>· {o.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
              {agenda.floating.length ? (
                <div className="site-agenda__day">
                  <span className="site-agenda__num" aria-hidden>
                    +
                  </span>
                  <div>
                    <p className="site-agenda__when">sem dia fixo no calendário</p>
                    <ul className="site-agenda__items">
                      {agenda.floating.map((o) => (
                        <li key={o.id}>
                          {o.name} <span>· {o.due.kind === 'floating' ? o.due.label : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div data-reveal style={{ '--d': '160ms' } as React.CSSProperties}>
            <div className="site-mes__cells">
              <ExternalLink href={whatsappHref(message)} className="site-cell site-cell--ink">
                <span>Conversar sobre o meu caso</span>
                <MessageCircle size={20} aria-hidden />
              </ExternalLink>
              <button type="button" role="switch" aria-checked={employees} className="site-cell site-cell--tone" onClick={() => setEmployees((v) => !v)}>
                <span>Com funcionários</span>
                <span className="site-switch" aria-hidden />
              </button>
            </div>
            <p className="site-mes__foot site-small">
              Datas de referência das regras federais. Estados e municípios têm prazos próprios, e o escritório confere cada mês.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
