import type { ScenarioCodeElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioElementBase } from './base';

export function createScenarioCodeElement(
  overrides: Partial<ScenarioCodeElement> = {}
): ScenarioCodeElement {
  return {
    ...createScenarioElementBase({
      animation: overrides.animation,
      build: overrides.build,
      frame: overrides.frame ?? { height: 360, width: 720, x: 120, y: 180 },
      kind: 'code',
      name: overrides.name ?? 'Code',
      role: overrides.role,
      stylePresetId: overrides.stylePresetId,
    }),
    code: overrides.code ?? '',
    language: overrides.language ?? 'text',
    style: overrides.style ?? {
      backgroundColor: '#171513',
      fontSize: 24,
      textColor: '#f6ead9',
    },
  };
}
