import type { ArrowCenterline } from './types';

export function buildEmptyCenterline(): ArrowCenterline {
  return {
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    startAngle: 0,
    endAngle: 0,
  };
}
