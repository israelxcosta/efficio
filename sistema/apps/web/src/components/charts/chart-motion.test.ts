import { describe, expect, it } from 'vitest';
import { chartMotion, CHART_MOTION_DURATION } from './chart-motion';

describe('chartMotion', () => {
  it("lets Recharts honour prefers-reduced-motion ('auto'), short and ease-out", () => {
    expect(chartMotion()).toEqual({ isAnimationActive: 'auto', animationDuration: CHART_MOTION_DURATION, animationEasing: 'ease-out' });
    expect(CHART_MOTION_DURATION).toBeLessThanOrEqual(400);
  });

  it('never animates while the card is being resized', () => {
    expect(chartMotion(true).isAnimationActive).toBe(false);
    expect(chartMotion(false).isAnimationActive).toBe('auto');
  });
});
