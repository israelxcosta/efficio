/**
 * One motion policy for every Recharts series (bars, lines, areas, pies).
 *
 * - `'auto'`: Recharts 3 animates only when the user does not ask for reduced motion
 *   (`prefers-reduced-motion: reduce` turns the animation off). Passing `true` would override it.
 * - Never animates while the dashboard card is being resized (the bars would chase the pointer).
 * - Short and ease-out: the user is reading this data, it must settle fast (≤ --dur-chart, 300ms).
 *
 * Print screens (client report, evolution report) keep `isAnimationActive={false}`: the page is
 * captured as soon as it renders.
 */
export const CHART_MOTION_DURATION = 300;

export interface ChartMotionProps {
  isAnimationActive: boolean | 'auto';
  animationDuration: number;
  animationEasing: 'ease-out';
}

export function chartMotion(resizing = false): ChartMotionProps {
  return {
    isAnimationActive: resizing ? false : 'auto',
    animationDuration: CHART_MOTION_DURATION,
    animationEasing: 'ease-out',
  };
}
