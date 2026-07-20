import type { ScenarioPoint } from '@sniptale/runtime-contracts/scenario/types/geometry';

export const SCENARIO_ARROW_HEAD_MARKER = {
  fill: '#0f8f8a',
  height: 16,
  minRenderedLength: 14,
  path: 'M0 0 L16 8 L0 16 Z',
  refX: 14,
  refY: 8,
  width: 16,
} as const;

export function shouldRenderScenarioArrowHead(start: ScenarioPoint, end: ScenarioPoint): boolean {
  return (
    Math.hypot(end.x - start.x, end.y - start.y) >= SCENARIO_ARROW_HEAD_MARKER.minRenderedLength
  );
}
