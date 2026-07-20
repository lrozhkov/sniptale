import type {
  ScenarioElement,
  ScenarioTemplateDefinition,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  SCENARIO_SLIDE_COMPOSITION_PRESETS,
  SCENARIO_SLIDE_LAYOUTS,
  SCENARIO_TEMPLATE_CATALOG_STATUS,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { isStringEnumValue } from '@sniptale/runtime-contracts/validation/string-literals';
import { isScenarioColorToken } from '../color-token';
import { isScenarioElementV3 } from '../element-guards';
import { SCENARIO_V3_LIMITS } from '../limits';
import { hasValidSlideSafeAreaBounds } from '../slide-safe-area';
import { isBoundedString, isNumberInRange, isRecord, isScenarioV3Id } from '../value-guards';

function isSlideCanvas(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyFields(value, ['background', 'height', 'width']) &&
    isNumberInRange(value['height'], 1, SCENARIO_V3_LIMITS.maxCanvasDimension) &&
    value['height'] > 0 &&
    isNumberInRange(value['width'], 1, SCENARIO_V3_LIMITS.maxCanvasDimension) &&
    value['width'] > 0 &&
    isCanvasBackground(value['background'])
  );
}

function isCanvasBackground(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (value['kind'] === 'transparent') {
    return hasOnlyFields(value, ['kind']);
  }

  return (
    value['kind'] === 'solid' &&
    hasOnlyFields(value, ['color', 'kind']) &&
    isScenarioColorToken(value['color'])
  );
}

function hasOnlyFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const allowed = new Set(fields);
  return Object.keys(value).every((field) => allowed.has(field));
}

const BASE_ELEMENT_FIELDS = [
  'animation',
  'build',
  'createdAt',
  'frame',
  'id',
  'kind',
  'locked',
  'name',
  'opacity',
  'role',
  'stylePresetId',
  'updatedAt',
  'visible',
] as const;

const ELEMENT_FIELDS_BY_KIND = {
  arrow: ['dash', 'end', 'head', 'start', 'strokeColor', 'strokeWidth'],
  callout: ['connector', 'panel', 'text'],
  code: ['code', 'language', 'style'],
  image: ['assetRef', 'captureContext', 'contentTransform', 'editDocumentId', 'fit'],
  line: ['dash', 'end', 'start', 'strokeColor', 'strokeWidth'],
  shape: ['cornerRadius', 'fillColor', 'shape', 'strokeColor', 'strokeWidth'],
  text: ['style', 'text'],
} as const satisfies Record<ScenarioElement['kind'], readonly string[]>;

function hasRepresentableElementFields(value: ScenarioElement): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return hasOnlyFields(value, [...BASE_ELEMENT_FIELDS, ...ELEMENT_FIELDS_BY_KIND[value.kind]]);
}

function isSlideSafeArea(value: unknown): boolean {
  return (
    hasValidSlideSafeAreaBounds(value) && hasOnlyFields(value, ['bottom', 'left', 'right', 'top'])
  );
}

function isThemeOverrides(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      hasOnlyFields(value, ['accentColor', 'backgroundColor', 'panelColor', 'textColor']) &&
      Object.values(value).every(isScenarioColorToken))
  );
}

function isSlideLayout(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      hasOnlyFields(value, ['compositionPreset', 'layoutId', 'safeArea', 'themeOverrides']) &&
      isStringEnumValue(value['layoutId'], SCENARIO_SLIDE_LAYOUTS) &&
      isStringEnumValue(value['compositionPreset'], SCENARIO_SLIDE_COMPOSITION_PRESETS) &&
      isSlideSafeArea(value['safeArea']) &&
      isThemeOverrides(value['themeOverrides']))
  );
}

function isElementLike(value: unknown): value is ScenarioElement {
  return isScenarioElementV3(value) && hasRepresentableElementFields(value);
}

function hasUniqueElementRoles(elements: ScenarioElement[]): boolean {
  const roles = elements
    .map((element) => element.role)
    .filter((role): role is string => typeof role === 'string' && role.length > 0);

  return new Set(roles).size === roles.length;
}

export function isScenarioTemplateDefinitionLike(
  value: unknown
): value is ScenarioTemplateDefinition {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      'catalogRank',
      'catalogStatus',
      'description',
      'group',
      'label',
      'slide',
      'source',
      'templateId',
      'version',
    ]) ||
    value['version'] !== 1 ||
    !isScenarioV3Id(value['templateId']) ||
    !isBoundedString(value['label'], SCENARIO_V3_LIMITS.maxLabelLength) ||
    !isBoundedString(value['description'], SCENARIO_V3_LIMITS.maxDescriptionLength) ||
    !isBoundedString(value['group'], SCENARIO_V3_LIMITS.maxNameLength) ||
    !isNumberInRange(value['catalogRank'], 0, SCENARIO_V3_LIMITS.maxCatalogRank) ||
    !isStringEnumValue(value['catalogStatus'], SCENARIO_TEMPLATE_CATALOG_STATUS) ||
    (value['source'] !== 'bundled' && value['source'] !== 'imported') ||
    !isRecord(value['slide'])
  ) {
    return false;
  }

  const elements = value['slide']['elements'];
  return (
    hasOnlyFields(value['slide'], ['canvas', 'elements', 'layout', 'notes', 'title']) &&
    Array.isArray(elements) &&
    elements.length <= SCENARIO_V3_LIMITS.maxElementsPerSlide &&
    elements.every(isElementLike) &&
    hasUniqueElementRoles(elements) &&
    isSlideCanvas(value['slide']['canvas']) &&
    isSlideLayout(value['slide']['layout']) &&
    isBoundedString(value['slide']['notes'], SCENARIO_V3_LIMITS.maxNotesLength) &&
    isBoundedString(value['slide']['title'], SCENARIO_V3_LIMITS.maxLabelLength)
  );
}
