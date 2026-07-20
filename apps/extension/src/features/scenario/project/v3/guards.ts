import type {
  ScenarioProjectV3,
  ScenarioSlide,
  ScenarioTrashedSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { isScenarioElementV3 } from './element-guards';
import {
  isBackgroundTransition,
  isPresentation,
  isSlideClicks,
  isSlideGuide,
  isSlideLayout,
  isTransition,
} from './guards.presentation.ts';
import { isCanvas, isSlideSource } from './guards.source.ts';
import { SCENARIO_V3_LIMITS } from './limits';
import {
  isBoundedString,
  isFiniteNumber,
  isIntegerInRange,
  isNullableBoundedString,
  isRecord,
  isScenarioV3Id,
} from './value-guards';

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= SCENARIO_V3_LIMITS.maxTags &&
    value.every((item) => isBoundedString(item, SCENARIO_V3_LIMITS.maxNameLength))
  );
}

export function isScenarioSlideV3(value: unknown): value is ScenarioSlide {
  return (
    isRecord(value) &&
    (value['backgroundTransition'] === null ||
      isBackgroundTransition(value['backgroundTransition'])) &&
    isSlideClicks(value['clicks']) &&
    isScenarioV3Id(value['id']) &&
    isBoundedString(value['title'], SCENARIO_V3_LIMITS.maxLabelLength) &&
    isBoundedString(value['notes'], SCENARIO_V3_LIMITS.maxNotesLength) &&
    isSlideGuide(value['guide']) &&
    (value['layout'] === undefined || isSlideLayout(value['layout'])) &&
    isSlideSource(value['source']) &&
    isNullableBoundedString(value['templateId'], SCENARIO_V3_LIMITS.maxIdLength) &&
    (value['transition'] === null || isTransition(value['transition'])) &&
    isCanvas(value['canvas']) &&
    Array.isArray(value['elements']) &&
    value['elements'].length <= SCENARIO_V3_LIMITS.maxElementsPerSlide &&
    value['elements'].every(isScenarioElementV3) &&
    isFiniteNumber(value['createdAt']) &&
    isFiniteNumber(value['updatedAt'])
  );
}

function isScenarioTrashedSlideV3(value: unknown): value is ScenarioTrashedSlide {
  return (
    isRecord(value) &&
    isFiniteNumber(value['deletedAt']) &&
    isIntegerInRange(value['originalIndex'], 0, SCENARIO_V3_LIMITS.maxSlides) &&
    isScenarioSlideV3(value['slide'])
  );
}

export function isScenarioProjectV3(value: unknown): value is ScenarioProjectV3 {
  return (
    isRecord(value) &&
    value['version'] === 3 &&
    isScenarioV3Id(value['id']) &&
    isBoundedString(value['name'], SCENARIO_V3_LIMITS.maxNameLength) &&
    isPresentation(value['presentation']) &&
    isFiniteNumber(value['createdAt']) &&
    isFiniteNumber(value['updatedAt']) &&
    isStringArray(value['tags']) &&
    Array.isArray(value['slides']) &&
    value['slides'].length <= SCENARIO_V3_LIMITS.maxSlides &&
    value['slides'].every(isScenarioSlideV3) &&
    Array.isArray(value['trash']) &&
    value['trash'].length <= SCENARIO_V3_LIMITS.maxTrashSlides &&
    value['trash'].every(isScenarioTrashedSlideV3) &&
    Array.isArray(value['templateLibraries']) &&
    value['templateLibraries'].length <= SCENARIO_V3_LIMITS.maxTemplateLibraries &&
    value['templateLibraries'].every(isTemplateLibraryRef)
  );
}

function isTemplateLibraryRef(value: unknown): boolean {
  return (
    isRecord(value) && typeof value['enabled'] === 'boolean' && isScenarioV3Id(value['libraryId'])
  );
}
