import type { ScenarioPoint } from '@sniptale/runtime-contracts/scenario/types/geometry';

export function didScenarioDragMove(origin: ScenarioPoint, event: PointerEvent) {
  return origin.x !== event.clientX || origin.y !== event.clientY;
}
