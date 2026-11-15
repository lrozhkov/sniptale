import { expect, it } from 'vitest';
import { getTransitionProgress } from './runtime';

it.each(['LINEAR', 'EASE_IN_OUT'] as const)(
  'uses the retained half-open junction clock with %s easing',
  (easing) => {
    const segment = { start: 3, end: 4, transition: { easing } };
    expect(getTransitionProgress(segment, 2.5)).toBeNull();
    expect(getTransitionProgress(segment, 3)).toBe(0);
    expect(getTransitionProgress(segment, 3.25)).toBeCloseTo(easing === 'LINEAR' ? 0.25 : 0.0625);
    expect(getTransitionProgress(segment, 3.5)).toBeCloseTo(0.5);
    expect(getTransitionProgress(segment, 3.75)).toBeCloseTo(easing === 'LINEAR' ? 0.75 : 0.9375);
    expect(getTransitionProgress(segment, 4)).toBeNull();
    expect(getTransitionProgress(segment, 4.5)).toBeNull();
  }
);
