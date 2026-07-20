import type {
  ScenarioArrowElement,
  ScenarioLineElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioElementBase } from './base';

const DEFAULT_START = { x: 120, y: 120 };
const DEFAULT_END = { x: 360, y: 180 };

export function createScenarioLineElement(
  overrides: Partial<ScenarioLineElement> = {}
): ScenarioLineElement {
  return {
    ...createScenarioElementBase({
      animation: overrides.animation,
      build: overrides.build,
      frame: overrides.frame ?? { height: 120, width: 280, x: 120, y: 120 },
      kind: 'line',
      name: overrides.name ?? 'Line',
      role: overrides.role,
      stylePresetId: overrides.stylePresetId,
    }),
    dash: overrides.dash ?? 'solid',
    end: overrides.end ?? DEFAULT_END,
    start: overrides.start ?? DEFAULT_START,
    strokeColor: overrides.strokeColor ?? '#2f5f89',
    strokeWidth: overrides.strokeWidth ?? 4,
  };
}

export function createScenarioArrowElement(
  overrides: Partial<ScenarioArrowElement> = {}
): ScenarioArrowElement {
  return {
    ...createScenarioElementBase({
      animation: overrides.animation,
      build: overrides.build,
      frame: overrides.frame ?? { height: 120, width: 280, x: 120, y: 120 },
      kind: 'arrow',
      name: overrides.name ?? 'Arrow',
      role: overrides.role,
      stylePresetId: overrides.stylePresetId,
    }),
    dash: overrides.dash ?? 'solid',
    end: overrides.end ?? DEFAULT_END,
    head: overrides.head ?? 'end',
    start: overrides.start ?? DEFAULT_START,
    strokeColor: overrides.strokeColor ?? '#b86024',
    strokeWidth: overrides.strokeWidth ?? 4,
  };
}
