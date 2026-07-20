import {
  SCENARIO_BACKGROUND_TRANSITIONS,
  SCENARIO_PRESENTATION_THEMES,
  SCENARIO_SLIDE_COMPOSITION_PRESETS,
  SCENARIO_SLIDE_LAYOUTS,
  SCENARIO_SLIDE_TRANSITIONS,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { isStringEnumValue } from '@sniptale/runtime-contracts/validation/string-literals';
import { SCENARIO_V3_LIMITS } from './limits';
import { hasValidSlideSafeAreaBounds } from './slide-safe-area';
import {
  isBoundedString,
  isIntegerInRange,
  isNullableBoundedString,
  isNumberInRange,
  isRecord,
} from './value-guards';

export function isTransition(value: unknown): boolean {
  return (
    isRecord(value) &&
    isStringEnumValue(value['kind'], SCENARIO_SLIDE_TRANSITIONS) &&
    isNumberInRange(value['durationMs'], 0, SCENARIO_V3_LIMITS.maxAnimationDurationMs) &&
    isBoundedString(value['easing'], SCENARIO_V3_LIMITS.maxEasingLength)
  );
}

export function isBackgroundTransition(value: unknown): boolean {
  return (
    isRecord(value) &&
    isStringEnumValue(value['kind'], SCENARIO_BACKGROUND_TRANSITIONS) &&
    isNumberInRange(value['durationMs'], 0, SCENARIO_V3_LIMITS.maxAnimationDurationMs) &&
    isBoundedString(value['easing'], SCENARIO_V3_LIMITS.maxEasingLength)
  );
}

export function isSlideClicks(value: unknown): boolean {
  return (
    isRecord(value) &&
    isIntegerInRange(value['count'], 0, SCENARIO_V3_LIMITS.maxClickCount) &&
    isIntegerInRange(value['initialIndex'], 0, SCENARIO_V3_LIMITS.maxClickCount)
  );
}

export function isSlideGuide(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      isBoundedString(value['body'], SCENARIO_V3_LIMITS.maxTextLength) &&
      (value['stepNumber'] === null ||
        isIntegerInRange(value['stepNumber'], 0, SCENARIO_V3_LIMITS.maxClickCount)) &&
      isNullableBoundedString(value['targetSummary'], SCENARIO_V3_LIMITS.maxDescriptionLength))
  );
}

export function isPresentation(value: unknown): boolean {
  return (
    isRecord(value) &&
    isTransition(value['transition']) &&
    isBackgroundTransition(value['backgroundTransition']) &&
    isRecord(value['controls']) &&
    typeof value['controls']['loop'] === 'boolean' &&
    typeof value['controls']['showControls'] === 'boolean' &&
    typeof value['controls']['showProgress'] === 'boolean' &&
    (value['themeId'] === undefined ||
      isStringEnumValue(value['themeId'], SCENARIO_PRESENTATION_THEMES)) &&
    (value['defaultLayoutId'] === undefined ||
      isStringEnumValue(value['defaultLayoutId'], SCENARIO_SLIDE_LAYOUTS)) &&
    (value['grid'] === undefined || isSlideGrid(value['grid']))
  );
}

function isSlideGrid(value: unknown): boolean {
  return (
    isRecord(value) &&
    isIntegerInRange(value['columns'], 1, SCENARIO_V3_LIMITS.maxGridColumns) &&
    isIntegerInRange(value['rows'], 1, SCENARIO_V3_LIMITS.maxGridRows) &&
    isNumberInRange(value['gutter'], 0, SCENARIO_V3_LIMITS.maxSafeAreaInset) &&
    isNumberInRange(value['margin'], 0, SCENARIO_V3_LIMITS.maxSafeAreaInset)
  );
}

export function isSlideLayout(value: unknown): boolean {
  return (
    isRecord(value) &&
    isStringEnumValue(value['layoutId'], SCENARIO_SLIDE_LAYOUTS) &&
    isStringEnumValue(value['compositionPreset'], SCENARIO_SLIDE_COMPOSITION_PRESETS) &&
    hasValidSlideSafeAreaBounds(value['safeArea']) &&
    (value['themeOverrides'] === null || isRecord(value['themeOverrides']))
  );
}
