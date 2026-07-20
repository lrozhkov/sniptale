import type { ScenarioShapeElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioElementBase } from './base';

export function createScenarioShapeElement(
  overrides: Partial<ScenarioShapeElement> = {}
): ScenarioShapeElement {
  return {
    ...createScenarioElementBase({
      animation: overrides.animation,
      build: overrides.build,
      frame: overrides.frame,
      kind: 'shape',
      name: overrides.name ?? 'Shape',
      role: overrides.role,
      stylePresetId: overrides.stylePresetId,
    }),
    cornerRadius: overrides.cornerRadius ?? 16,
    fillColor: overrides.fillColor ?? 'rgba(255,255,255,0.78)',
    shape: overrides.shape ?? 'rect',
    strokeColor: overrides.strokeColor ?? '#d6c8b8',
    strokeWidth: overrides.strokeWidth ?? 1,
  };
}
