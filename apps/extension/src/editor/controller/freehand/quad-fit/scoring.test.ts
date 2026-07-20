import { describe, expect, it } from 'vitest';

import { measureHalfTurnDelta } from './angles';
import { measureDiamondScore, measureRightAngleScore } from './scoring';

describe('editor-controller freehand quad scoring owner', () => {
  it('treats opposite edge angles as equivalent across half turns', () => {
    expect(measureHalfTurnDelta(0, Math.PI)).toBeCloseTo(0);
    expect(measureHalfTurnDelta(Math.PI / 2, -Math.PI / 2)).toBeCloseTo(0);
  });

  it('scores stable rectangle corners above distorted corners', () => {
    const rectangle = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 40 },
      { x: 0, y: 40 },
    ];
    const distorted = [
      { x: 0, y: 0 },
      { x: 80, y: 5 },
      { x: 62, y: 40 },
      { x: 4, y: 18 },
    ];

    expect(measureRightAngleScore(rectangle)).toBeGreaterThan(0.95);
    expect(measureRightAngleScore(distorted)).toBeLessThan(measureRightAngleScore(rectangle));
  });

  it('requires diamond sides and opposing edges to stay balanced', () => {
    const diamond = [
      { x: 30, y: 0 },
      { x: 60, y: 30 },
      { x: 30, y: 60 },
      { x: 0, y: 30 },
    ];
    const stretched = [
      { x: 30, y: 0 },
      { x: 90, y: 18 },
      { x: 30, y: 60 },
      { x: 0, y: 30 },
    ];

    expect(measureDiamondScore(diamond)).toBeGreaterThan(0.95);
    expect(measureDiamondScore(stretched)).toBeLessThan(measureDiamondScore(diamond));
  });
});
