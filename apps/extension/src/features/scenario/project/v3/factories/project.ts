import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioV3Id, getScenarioV3Now } from './helpers';
import { createDefaultScenarioProjectPresentation } from './presentation';
import { createScenarioSlide } from './slide';

export function createScenarioProjectV3(name: string): ScenarioProjectV3 {
  const now = getScenarioV3Now();

  return {
    createdAt: now,
    id: createScenarioV3Id('scenario'),
    name,
    presentation: createDefaultScenarioProjectPresentation(),
    slides: [createScenarioSlide({ title: name || 'Untitled scenario' })],
    tags: [],
    templateLibraries: [],
    trash: [],
    updatedAt: now,
    version: 3,
  };
}
