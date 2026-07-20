import type { ScenarioCalloutElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioElementBase } from './base';

export function createScenarioCalloutElement(
  overrides: Partial<ScenarioCalloutElement> = {}
): ScenarioCalloutElement {
  return {
    ...createScenarioElementBase({
      animation: overrides.animation,
      build: overrides.build,
      frame: overrides.frame ?? { height: 160, width: 360, x: 760, y: 160 },
      kind: 'callout',
      name: overrides.name ?? 'Callout',
      role: overrides.role,
      stylePresetId: overrides.stylePresetId,
    }),
    connector: overrides.connector ?? null,
    panel: overrides.panel ?? {
      backgroundColor: '#fff8ed',
      borderColor: '#d6a15b',
      borderWidth: 1,
      textColor: '#2f2a24',
    },
    text: overrides.text ?? '',
  };
}
