import { createQuickEditSpotlight } from '../../project/scene/focus-appearance';
import { expect, it } from 'vitest';
import { evaluateQuickEditSpotlightsAtTime } from './focus';
import { createQuickEditZoomRegion } from './zoom';

it.each(['dim', 'blur'] as const)(
  'expands an off-center %s opening equally without translating its center',
  (effect) => {
    const region = {
      ...createQuickEditZoomRegion({ id: 's', at: 0, duration: 4 }),
      spotlight: {
        ...createQuickEditSpotlight(),
        effect,
        reveal: 'contract' as const,
        exitReveal: 'contract' as const,
        area: { x: 0.02, y: 0.4, width: 0.1, height: 0.1 },
      },
      enter: { type: 'linear' as const, duration: 1 },
      exit: { type: 'linear' as const, duration: 1 },
    };
    const sample = (time: number) =>
      evaluateQuickEditSpotlightsAtTime({
        regions: [region],
        time,
        output: { width: 200, height: 100 },
        video: { x: 0, y: 0, width: 200, height: 100 },
        scale: 1,
      })[0]!;
    const target = sample(2).opening;
    for (const time of [0, 0.25, 0.5, 0.75, 3.25, 3.5, 3.75, 3.999]) {
      const frame = sample(time);
      expect(frame.opening.x + frame.opening.width / 2).toBeCloseTo(target.x + target.width / 2);
      expect(frame.opening.y + frame.opening.height / 2).toBeCloseTo(target.y + target.height / 2);
      expect(target.x - frame.opening.x).toBeCloseTo(target.y - frame.opening.y);
    }
    expect(sample(0).opening.x).toBeLessThan(0);
    expect(sample(0).opening.x + sample(0).opening.width).toBeGreaterThan(200);
  }
);
