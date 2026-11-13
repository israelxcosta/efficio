import { useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type SVGProps } from 'react';
import { ArrowLeftRight, CalendarCheck, FileText, LockKeyhole, MessagesSquare } from 'lucide-react';
import { STEPS, type StepId } from '../site-content';
import { StepShot } from './portal-fragments';
import { prefersReducedMotion } from './site-ui';

const STEP_ICON: Record<StepId, ComponentType<SVGProps<SVGSVGElement>>> = {
  conversa: MessagesSquare,
  proposta: FileText,
  transicao: ArrowLeftRight,
  portal: LockKeyhole,
  rotina: CalendarCheck,
};

/** Desktop drawing (px): the nodes wind left and right of the centre line, the cards sit beside them. */
const NODE_X = [0, -150, 140, -120, 0];
const NODE_Y0 = 80;
const NODE_GAP = 400;
const STRAIGHT = 110;
const SVG_W = 400;
const nodeY = (i: number) => NODE_Y0 + i * NODE_GAP;
const STAGE_H = nodeY(STEPS.length - 1) + 600;

type Side = 'left' | 'right' | 'below';
const sideOf = (i: number): Side => (i === STEPS.length - 1 ? 'below' : i % 2 === 0 ? 'left' : 'right');

/** A polyline through `points` with its corners rounded (radius `r`), as an SVG path. */
function roundedPath(points: [number, number][], r: number): string {
  const [first, ...rest] = points;
  let d = `M${first![0]} ${first![1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1]!;
    const [cx, cy] = points[i]!;
    const [nx, ny] = points[i + 1]!;
    const l1 = Math.hypot(px - cx, py - cy);
    const l2 = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = cx + ((px - cx) / l1) * rr;
    const ay = cy + ((py - cy) / l1) * rr;
    const bx = cx + ((nx - cx) / l2) * rr;
    const by = cy + ((ny - cy) / l2) * rr;
    d += ` L${ax.toFixed(1)} ${ay.toFixed(1)} Q${cx} ${cy} ${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  const last = rest[rest.length - 1]!;
  return `${d} L${last[0]} ${last[1]}`;
}

function journeyPath(): string {
  const cx = (x: number) => x + SVG_W / 2;
  const points: [number, number][] = [[cx(NODE_X[0]!), nodeY(0)]];
  for (let i = 0; i < STEPS.length - 1; i++) {
    points.push([cx(NODE_X[i]!), nodeY(i) + STRAIGHT]);
    points.push([cx(NODE_X[i + 1]!), nodeY(i + 1) - STRAIGHT]);
    points.push([cx(NODE_X[i + 1]!), nodeY(i + 1)]);
  }
  return roundedPath(points, 44);
}

const PATH = journeyPath();

/**
 * "Como começar": five steps along a winding path. The lime line draws itself as the page scrolls
 * (once, never backwards); the nodes it has reached turn navy and the last one reached wears rings.
 * With reduced motion (or without IntersectionObserver) the whole path is drawn from the start.
 */
export function StartJourney() {
  const stageRef = useRef<HTMLOListElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [reached, setReached] = useState(STEPS.length - 1);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    const path = pathRef.current;
    let total = 0;
    try {
      total = path?.getTotalLength() ?? 0;
    } catch {
      total = 0;
    }
    if (path && total) {
      path.style.strokeDasharray = `${total}`;
      path.style.strokeDashoffset = `${total}`;
    }
    stage.style.setProperty('--fill', '0px');
    setReached(-1);

    /** Length along the path where it reaches the depth `y` (the path always goes down). */
    const lengthAtY = (y: number) => {
      if (!path || !total) return 0;
      let lo = 0;
      let hi = total;
      for (let k = 0; k < 22; k++) {
        const mid = (lo + hi) / 2;
        if (path.getPointAtLength(mid).y < y) lo = mid;
        else hi = mid;
      }
      return lo;
    };

    let depth = -Infinity;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = stage.getBoundingClientRect();
      const y = window.innerHeight * 0.62 - box.top;
      if (y <= depth) return;
      depth = y;
      let last = -1;
      stage.querySelectorAll<HTMLElement>('[data-node]').forEach((node, i) => {
        const r = node.getBoundingClientRect();
        if (r.top + r.height / 2 - box.top <= depth) last = i;
      });
      setReached((prev) => (last > prev ? last : prev));
      stage.style.setProperty('--fill', `${Math.max(0, Math.min(depth, stage.offsetHeight))}px`);
      if (path && total) path.style.strokeDashoffset = `${total - lengthAtY(depth)}`;
      if (last === STEPS.length - 1 && depth >= stage.offsetHeight) window.removeEventListener('scroll', onScroll);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section id="comecar" className="site-journey" aria-labelledby="comecar-title">
      <div className="site-journey__head" data-reveal>
        <h2 id="comecar-title" className="site-h2" tabIndex={-1} data-section-heading>
          Comece com uma conversa
        </h2>
        <p className="site-journey__lead">
          Abrir uma empresa ou trocar de contador segue o mesmo caminho, em cinco passos. Na primeira você só conversa; o resto o escritório
          conduz com você.
        </p>
      </div>

      <ol ref={stageRef} className="site-journey__stage" style={{ '--stage-h': `${STAGE_H}px` } as CSSProperties}>
        <svg className="site-journey__svg" width={SVG_W} height={STAGE_H} viewBox={`0 0 ${SVG_W} ${STAGE_H}`} aria-hidden focusable="false">
          <path className="site-journey__dots" d={PATH} />
          <path ref={pathRef} className="site-journey__line" d={PATH} />
        </svg>
        {STEPS.map((step, i) => {
          const Icon = STEP_ICON[step.id];
          const state = i < reached ? 'done' : i === reached ? 'current' : 'todo';
          return (
            <li
              key={step.id}
              className="site-jstep"
              data-side={sideOf(i)}
              data-state={state}
              style={{ '--x': `${NODE_X[i]}px`, '--y': `${nodeY(i)}px` } as CSSProperties}
            >
              <span className="site-node" data-node aria-hidden>
                <Icon strokeWidth={1.6} />
              </span>
              <article className="site-step-card" aria-labelledby={`passo-${step.id}`}>
                <div className="site-step-card__shot" aria-hidden>
                  <div className="site-step-card__shot-inner">
                    <StepShot id={step.id} />
                  </div>
                </div>
                <div className="site-step-card__body">
                  <p className="site-step-card__count">Passo {i + 1}</p>
                  <h3 id={`passo-${step.id}`} className="site-step-card__title">
                    {step.name}
                  </h3>
                  <p className="site-step-card__text">{step.text}</p>
                </div>
                {step.note ? <p className="site-step-card__note">{step.note}</p> : null}
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
