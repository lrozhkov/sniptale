import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioV3Id, DEFAULT_SCENARIO_V3_CANVAS, getScenarioV3Now } from './helpers';
import {
  createDefaultScenarioBackgroundTransition,
  createDefaultScenarioSlideLayout,
  createDefaultScenarioSlideClicks,
  createDefaultScenarioTransition,
  createManualScenarioSlideSource,
} from './presentation';

export function createScenarioSlide(overrides: Partial<ScenarioSlide> = {}): ScenarioSlide {
  const now = getScenarioV3Now();

  return {
    backgroundTransition:
      overrides.backgroundTransition === undefined
        ? createDefaultScenarioBackgroundTransition()
        : overrides.backgroundTransition,
    canvas: overrides.canvas ?? DEFAULT_SCENARIO_V3_CANVAS,
    clicks: createDefaultScenarioSlideClicks(overrides.clicks),
    createdAt: overrides.createdAt ?? now,
    elements: overrides.elements ?? [],
    guide: overrides.guide ?? null,
    id: overrides.id ?? createScenarioV3Id('slide'),
    layout: createDefaultScenarioSlideLayout(overrides.layout),
    notes: overrides.notes ?? '',
    source: overrides.source ?? createManualScenarioSlideSource(),
    templateId: overrides.templateId ?? null,
    title: overrides.title ?? '',
    transition:
      overrides.transition === undefined ? createDefaultScenarioTransition() : overrides.transition,
    updatedAt: overrides.updatedAt ?? now,
  };
}
