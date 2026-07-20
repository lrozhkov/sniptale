import { describe, expect, it } from 'vitest';

import {
  TAPERED_HEAD_OUTLINE_POINT_COUNT,
  resolveTaperedDimensions,
  TAPERED_SHAFT_SAMPLE_COUNT,
} from './tapered-template';

describe('arrow visual tapered template', () => {
  it('keeps the head outline as a rigid shoulder-tip-shoulder module', () => {
    expect(TAPERED_HEAD_OUTLINE_POINT_COUNT).toBe(3);
  });

  it('keeps the shaft sampling count stable for outline composition', () => {
    expect(TAPERED_SHAFT_SAMPLE_COUNT).toBe(8);
  });

  it('caps head length from width and lets only the shaft keep growing afterwards', () => {
    const medium = resolveTaperedDimensions(120, 18);
    const long = resolveTaperedDimensions(320, 18);
    const thick = resolveTaperedDimensions(320, 24);

    expect(Math.abs(long.headLength - medium.headLength)).toBeLessThan(2);
    expect(thick.headLength).toBeGreaterThan(long.headLength);
    expect(long.shaftLength).toBeGreaterThan(medium.shaftLength);
  });
});
