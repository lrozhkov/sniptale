import type { ScenarioTextElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioElementBase } from './base';

export function createScenarioTextElement(
  overrides: Partial<ScenarioTextElement> = {}
): ScenarioTextElement {
  return {
    ...createScenarioElementBase({
      animation: overrides.animation,
      build: overrides.build,
      frame: overrides.frame,
      kind: 'text',
      name: overrides.name ?? 'Text',
      role: overrides.role,
      stylePresetId: overrides.stylePresetId,
    }),
    style: overrides.style ?? {
      align: 'left',
      color: '#2f2a24',
      fontSize: 44,
      fontWeight: 700,
    },
    text: overrides.text ?? '',
  };
}
