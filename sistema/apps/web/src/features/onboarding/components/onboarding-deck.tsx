import type { CSSProperties, ReactNode } from 'react';
import type {
  OnboardingDocument,
  OnboardingObligationRow,
  OnboardingSlide,
  OnboardingSlideItem,
  OnboardingSlideKey,
} from '@effinance/shared';
import { useElementSize } from '@/lib/use-element-size';
import { cn } from '@/lib/utils';
import {
  DARK_SLIDES,
  SECTION_NAMES,
  SLIDE_SECTION,
  SUMMARY_TARGETS,
  WHITE_SLIDES,
  dayBlock,
  daysBeforeBlock,
  numberBlock,
  safeLogo,
  slideAnchor,
  whoBlock,
} from '../onboarding-logic';
import '../onboarding-deck.css';

const p2 = (n: number) => String(n).padStart(2, '0');
const DECK_WIDTH = 1920;

/** Scrolls to a slide (smooth unless the person prefers less motion). */
export function scrollToSlide(key: OnboardingSlideKey) {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document
    .getElementById(slideAnchor(key))
    ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

interface OnboardingDeckProps {
  doc: OnboardingDocument;
  /** The "Confirmar leitura" area of the last slide (form, confirmed state or the preview's note). */
  confirm?: ReactNode;
  className?: string;
}

/**
 * The client onboarding document in variation B: 18 slides of 1920×1080 scaled to the container's width
 * (stacked and readable on phones, one per page in print). Used by the public page and the preview.
 */
export function OnboardingDeck({ doc, confirm, className }: OnboardingDeckProps) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const zoom = width > 0 ? Math.min(1, width / DECK_WIDTH) : 1;
  return (
    <div ref={ref} className={cn('ob', className)} style={{ '--ob-z': zoom } as CSSProperties}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="ob-gl" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ob-p3)" />
            <stop offset="1" stopColor="var(--ob-p1)" />
          </linearGradient>
          <linearGradient id="ob-gd" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ob-p3)" stopOpacity=".55" />
            <stop offset="1" stopColor="var(--ob-p6)" stopOpacity=".15" />
          </linearGradient>
        </defs>
      </svg>
      <div className="ob-deck">
        {doc.slides.map((slide) => (
          <Slide key={slide.key} slide={slide} doc={doc} total={doc.slides.length}>
            <SlideBody slide={slide} doc={doc} confirm={confirm} />
          </Slide>
        ))}
      </div>
    </div>
  );
}

/**
 * The office's logo from its registry (Configurações › Escritório), straight on the slide (white on the
 * purple slides, its own colors on the light ones). Without one, the Efficio wordmark of the system (never a generic placeholder).
 */
export function Logo({ doc, size = 'md' }: { doc: OnboardingDocument; size?: 'lg' | 'md' | 'sm' }) {
  const logo = safeLogo(doc.office.logo);
  return (
    <div className={cn('ob-logo', `ob-logo-${size}`)}>
      {logo ? (
        <img src={logo} alt={doc.office.name} />
      ) : (
        <span className="ob-wordmark" role="img" aria-label="Efficio">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="var(--ob-brand)" />
            <text
              x="32"
              y="46"
              textAnchor="middle"
              fontFamily="'Plus Jakarta Sans Variable', Poppins, Arial, sans-serif"
              fontWeight="800"
              fontSize="44"
              fill="var(--ob-white)"
            >
              e
            </text>
          </svg>
          <b>efficio</b>
        </span>
      )}
    </div>
  );
}

const ESOCIAL_HEADS = ['Movimentação', 'Quando nos avisar', 'O que enviar'];
const SAFETY_HEADS = ['O que', 'Quem faz', 'Quando'];

const SPLIT: readonly OnboardingSlideKey[] = ['summary', 'howWeWork', 'termination', 'firstSteps'];

function Slide({
  slide,
  doc,
  total,
  children,
}: {
  slide: OnboardingSlide;
  doc: OnboardingDocument;
  total: number;
  children: ReactNode;
}) {
  const dark = DARK_SLIDES.includes(slide.key);
  const section = SLIDE_SECTION[slide.key];
  const rows = slide.table?.length ?? 0;
  return (
    <section
      id={slideAnchor(slide.key)}
      aria-label={`Slide ${slide.number} de ${total}: ${slide.title}`}
      className={cn(
        'ob-slide',
        `ob-${slide.key === 'cover' ? 'cover' : slide.key === 'confirm' ? 'confirm' : 's'}`,
        dark && 'ob-dk',
        WHITE_SLIDES.includes(slide.key) && 'ob-alt',
        SPLIT.includes(slide.key) && 'ob-split',
      )}
      style={rows > 9 ? { height: 'auto', minHeight: 1080 } : undefined}
    >
      {dark ? (
        <svg className="ob-deco ob-deco-d" viewBox="0 0 1000 1000" aria-hidden="true">
          <path
            d="M520 90c190-40 390 80 410 300s-110 420-330 470-430-50-500-250S330 130 520 90Z"
            fill="url(#ob-gd)"
          />
          <circle cx="820" cy="160" r="46" fill="var(--ob-p3)" />
        </svg>
      ) : (
        <svg className="ob-deco ob-deco-l" viewBox="0 0 520 520" aria-hidden="true">
          <circle cx="300" cy="200" r="210" fill="url(#ob-gl)" />
          <circle cx="120" cy="380" r="64" fill="none" stroke="var(--ob-p3)" strokeWidth="3" />
          <circle cx="96" cy="140" r="22" fill="var(--ob-p6)" opacity=".9" />
        </svg>
      )}
      <header className="ob-top">
        <Logo doc={doc} size={slide.key === 'cover' ? 'lg' : 'md'} />
        {section ? (
          <span className="ob-sec">
            <b>{p2(section)}</b>
            {SECTION_NAMES[section]}
          </span>
        ) : null}
      </header>
      <div className="ob-body">{children}</div>
      <footer className="ob-foot">
        <span className="ob-foot-id">
          {slide.key === 'cover' ? null : <Logo doc={doc} size="sm" />}
          <span>{doc.client.name} · Onboarding do cliente</span>
        </span>
        <span className="ob-pg">
          <b>{p2(slide.number)}</b> / {total}
        </span>
      </footer>
    </section>
  );
}

function Head({ slide, warn }: { slide: OnboardingSlide; warn?: boolean }) {
  return (
    <div className="ob-head">
      <h2>
        {warn ? <span className="ob-warn" aria-hidden="true" /> : null}
        {slide.title}
      </h2>
      {slide.subtitle ? <p className="ob-lead">{slide.subtitle}</p> : null}
    </div>
  );
}

function SplitHead({ slide }: { slide: OnboardingSlide }) {
  return (
    <div>
      <h2>{slide.title}</h2>
      {slide.subtitle ? <p className="ob-lead">{slide.subtitle}</p> : null}
    </div>
  );
}

function ItemList({ items }: { items: OnboardingSlideItem[] }) {
  return (
    <ul className="ob-items">
      {items.map((item, i) => (
        <li key={item.id}>
          <span className="ob-n">{i + 1}</span>
          <div>
            {item.label ? <b>{item.label}</b> : null}
            {item.text ? <span>{item.text}</span> : null}
            {item.detail ? <span>{item.detail}</span> : null}
            {item.code ? <code className="ob-code">{item.code}</code> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

const COVER_LABELS: Record<string, string> = {
  company: 'Empresa',
  regime: 'Regime',
  since: 'Início',
  employees: 'Equipe',
  updated: 'Versão',
};
const DEPT_KEYS = ['fiscal', 'accounting', 'personnel'];
const DEPT_INITIALS: Record<string, string> = { fiscal: 'FI', accounting: 'CO', personnel: 'DP' };

/** Obligation table (fiscal, accounting, personnel): what we do · what we need · until when (never legal deadlines). */
export function ObligationTable({ rows }: { rows: OnboardingObligationRow[] }) {
  if (rows.length === 0)
    return <p className="ob-empty">Nenhuma obrigação desta área para a sua empresa no momento.</p>;
  return (
    <div
      className={cn('ob-tbl ob-tobl', rows.length > 6 ? 'ob-dense' : rows.length > 4 && 'ob-mid')}
      role="table"
      aria-label="Obrigações"
    >
      <div className="ob-tr ob-th" role="row">
        <span />
        <span role="columnheader">O que fazemos</span>
        <span role="columnheader">O que precisamos de você</span>
        <span role="columnheader">Até quando</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.key} className="ob-tr" role="row">
          <span className="ob-n" aria-hidden="true">
            {i + 1}
          </span>
          <span className="ob-a" role="cell">
            {r.name}
          </span>
          <span className="ob-b" role="cell">
            {r.need}
          </span>
          <span className={cn('ob-c', !r.due && 'ob-none')} role="cell">
            {r.due ?? '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

function SlideBody({
  slide,
  doc,
  confirm,
}: {
  slide: OnboardingSlide;
  doc: OnboardingDocument;
  confirm: ReactNode;
}) {
  const items = slide.items;
  switch (slide.key) {
    case 'cover':
      return (
        <>
          <p className="ob-pill">{slide.kicker ?? 'Onboarding do cliente'}</p>
          <h1>{slide.title}</h1>
          <p className="ob-from">com a {doc.office.name}</p>
          {items.length ? (
            <dl className="ob-data">
              {items.map((item) => (
                <div key={item.id}>
                  <dt>{COVER_LABELS[item.id] ?? item.label ?? ''}</dt>
                  <dd>{item.text ?? item.label}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      );
    case 'summary':
      return (
        <>
          <SplitHead slide={slide} />
          <ol className="ob-sum">
            {items.map((item, i) => {
              const target = SUMMARY_TARGETS[item.id];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => target && scrollToSlide(target)}
                    disabled={!target}
                  >
                    <span className="ob-n">{p2(i + 1)}</span>
                    <span>{item.text ?? item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      );
    case 'howWeWork':
    case 'termination':
      return (
        <>
          <SplitHead slide={slide} />
          <ItemList items={items} />
        </>
      );
    case 'team': {
      const depts = items.filter((i) => DEPT_KEYS.includes(i.id));
      const contact = items.filter((i) => !DEPT_KEYS.includes(i.id));
      return (
        <>
          <Head slide={slide} />
          {depts.length ? (
            <ul className="ob-depts">
              {depts.map((item, i) => (
                <li key={item.id} className={`ob-c${i}`}>
                  <span className="ob-av" aria-hidden="true">
                    {DEPT_INITIALS[item.id]}
                  </span>
                  <b>{item.label}</b>
                  {item.text ? <span>{item.text}</span> : null}
                  {item.detail ? <span className="ob-mail">{item.detail}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {contact.length ? (
            <div className="ob-contact" style={depts.length ? undefined : { marginTop: 'auto' }}>
              {contact.map((item) => (
                <div key={item.id}>
                  <small>{item.label}</small>
                  <b>{item.text}</b>
                  {item.detail ? <span>{item.detail}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      );
    }
    case 'numbers':
      return (
        <>
          <Head slide={slide} />
          <ul className="ob-nums">
            {items.map((item, i) => {
              const n = numberBlock(item.id, item.label, item.text);
              return (
                <li key={item.id} className={`ob-c${i % 4}`}>
                  {n.big ? <span className="ob-big">{n.big}</span> : null}
                  <b>{n.label}</b>
                  {item.text ? <span>{item.text}</span> : null}
                </li>
              );
            })}
          </ul>
        </>
      );
    case 'fiscal':
    case 'accounting':
    case 'personnel':
      return (
        <>
          <Head slide={slide} />
          <ObligationTable rows={slide.table ?? []} />
        </>
      );
    case 'month':
      return (
        <>
          <Head slide={slide} />
          <ol
            className="ob-month"
            style={{ '--ob-cols': Math.min(Math.max(items.length, 1), 6) } as CSSProperties}
          >
            {items.map((item) => {
              const d = dayBlock(item.label ?? '');
              const w = whoBlock(item.text ?? '');
              return (
                <li key={item.id} className={w.office ? 'ob-us' : undefined}>
                  <small>{d.pre}</small>
                  <span className={cn('ob-day', !/\d/.test(d.big) && 'ob-day-word')}>
                    {d.big}
                    {d.post ? <i>{d.post}</i> : null}
                  </span>
                  {w.who ? <b className="ob-who">{w.who}</b> : null}
                  <span>{w.what}</span>
                </li>
              );
            })}
          </ol>
        </>
      );
    case 'documents':
      return (
        <>
          <Head slide={slide} />
          <div
            className={cn('ob-tbl ob-tdocs', items.length > 6 && 'ob-dense')}
            role="table"
            aria-label={slide.title}
          >
            <div className="ob-tr ob-th" role="row">
              <span />
              <span role="columnheader">Documento</span>
              <span role="columnheader">O que enviar</span>
              <span role="columnheader">Prazo</span>
            </div>
            {items.map((item, i) => (
              <div key={item.id} className="ob-tr" role="row">
                <span className="ob-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="ob-a" role="cell">
                  {item.label}
                </span>
                <span className="ob-b" role="cell">
                  {item.text}
                </span>
                <span className="ob-c" role="cell">
                  {item.detail}
                </span>
              </div>
            ))}
          </div>
        </>
      );
    case 'sending':
      return (
        <>
          <Head slide={slide} />
          <ul className={cn('ob-mails', items.length > 5 && 'ob-mails-dense')}>
            {items.map((item) => (
              <li key={item.id} className={item.code ? undefined : 'ob-note'}>
                {item.label ? <b>{item.label}</b> : null}
                {item.text ? <span>{item.text}</span> : null}
                {item.code ? <code className="ob-code">{item.code}</code> : null}
              </li>
            ))}
          </ul>
        </>
      );
    case 'admission':
      return (
        <>
          <Head slide={slide} />
          <ol className="ob-steps">
            {items.map((item, i) => (
              <li key={item.id}>
                <span className="ob-dot" aria-hidden="true">
                  {i + 1}
                </span>
                <b>{item.label}</b>
                {item.text ? <span>{item.text}</span> : null}
                {item.code ? <code className="ob-code">{item.code}</code> : null}
              </li>
            ))}
          </ol>
        </>
      );
    case 'vacation': {
      const trio = items.slice(0, 3);
      const rules = items.slice(3);
      return (
        <>
          <Head slide={slide} />
          <ol className="ob-trio">
            {trio.map((item) => {
              const d = daysBeforeBlock(item.label ?? '');
              return (
                <li key={item.id}>
                  <span className="ob-circ">
                    {d ? (
                      <>
                        <span className="ob-cbig">{d.big}</span>
                        <small>{d.small}</small>
                      </>
                    ) : (
                      <span className="ob-clabel">{item.label}</span>
                    )}
                  </span>
                  <span className="ob-trio-text">
                    <span>{item.text}</span>
                    {item.code ? <code className="ob-code">{item.code}</code> : null}
                  </span>
                </li>
              );
            })}
          </ol>
          {rules.length ? (
            <div className="ob-rules">
              {rules.map((item) => (
                <div key={item.id}>
                  <b>{item.label}</b>
                  {item.text ? <span>{item.text}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      );
    }
    case 'esocial':
    case 'safety': {
      const heads = slide.key === 'safety' ? SAFETY_HEADS : ESOCIAL_HEADS;
      return (
        <>
          <Head slide={slide} />
          <div
            className={cn('ob-tbl', slide.key === 'safety' ? 'ob-tsst' : 'ob-tes', items.length > 5 && 'ob-dense')}
            role="table"
            aria-label={slide.title}
          >
            <div className="ob-tr ob-th" role="row">
              <span />
              {heads.map((h) => (
                <span key={h} role="columnheader">
                  {h}
                </span>
              ))}
            </div>
            {items.map((item, i) => (
              <div key={item.id} className="ob-tr" role="row">
                <span className="ob-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="ob-a" role="cell">
                  {item.label}
                </span>
                <span className="ob-b" role="cell">
                  {item.text}
                </span>
                <span className="ob-c" role="cell">
                  {item.detail}
                </span>
              </div>
            ))}
          </div>
        </>
      );
    }
    case 'fines':
      return (
        <>
          <Head slide={slide} warn />
          <div className="ob-tbl ob-tmul" role="table" aria-label={slide.title}>
            {items.map((item, i) => (
              <div key={item.id} className="ob-tr" role="row">
                <span className="ob-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="ob-a" role="cell">
                  {item.label}
                </span>
                <span className="ob-b" role="cell">
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </>
      );
    case 'firstSteps':
      return (
        <>
          <SplitHead slide={slide} />
          <ul className="ob-chk">
            {items.map((item) => (
              <li key={item.id}>
                <label>
                  <input type="checkbox" />
                  <span className="ob-box" aria-hidden="true" />
                  <span>
                    {item.label ? <b>{item.label}</b> : null} {item.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      );
    case 'confirm':
      return (
        <>
          <p className="ob-pill">Bem-vindos!</p>
          <h2>{slide.title}</h2>
          {slide.subtitle ? <p className="ob-lead">{slide.subtitle}</p> : null}
          {confirm}
          {items.map((item) =>
            item.label ? (
              <p key={item.id} className="ob-ct">
                <b>{item.label}</b> {item.text}
              </p>
            ) : (
              <p key={item.id} className="ob-sig">
                {item.text}
              </p>
            ),
          )}
        </>
      );
    default:
      return (
        <>
          <Head slide={slide} />
          <ItemList items={items} />
        </>
      );
  }
}
