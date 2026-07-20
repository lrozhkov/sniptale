import type { CSSProperties } from 'react';
import type { TranslationKey } from '../../../platform/i18n';
import type {
  StepBadgeAnchor,
  StepBadgeAlphabet,
  StepBadgeOffsetDirection,
  StepBadgeSettings,
  StepBadgeSizeLevel,
  StepBadgeType,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  DEFAULT_POPOVER_ANCHOR_GRID,
  getAnchorDotPosition as getSharedAnchorDotPosition,
} from '../popover-sync/anchor-grid';

export type AutoStepBadgeType = Extract<StepBadgeType, 'number' | 'letter'>;

export const ANCHOR_GRID = DEFAULT_POPOVER_ANCHOR_GRID as StepBadgeAnchor[][];

export const SIZE_LEVEL_MIN = 0;
export const SIZE_LEVEL_MAX = 6;
export const SIZE_LEVEL_DEFAULT: StepBadgeSizeLevel = 3;
export const POPOVER_WIDTH = 280;
export const POPOVER_HEIGHT = 420;

export function getAnchorDotPosition(anchor: StepBadgeAnchor): CSSProperties {
  return getSharedAnchorDotPosition(anchor);
}

export const DEFAULT_STEP_BADGE_SETTINGS: StepBadgeSettings = {
  enabled: false,
  anchor: 'top-left',
  offsetDirections: [],
  type: 'number',
  alphabet: 'cyrillic',
  value: '',
  sizeLevel: SIZE_LEVEL_DEFAULT,
  auto: true,
};

export function normalizeStepBadgeFromProp(
  stepBadge: StepBadgeSettings | undefined
): StepBadgeSettings {
  if (!stepBadge) {
    return { ...DEFAULT_STEP_BADGE_SETTINGS };
  }

  const anchor: StepBadgeAnchor =
    stepBadge.anchor ??
    (stepBadge.corner === 'top-left'
      ? 'top-left'
      : stepBadge.corner === 'top-right'
        ? 'top-right'
        : stepBadge.corner === 'bottom-left'
          ? 'bottom-left'
          : stepBadge.corner === 'bottom-right'
            ? 'bottom-right'
            : 'top-left');

  let sizeLevel: StepBadgeSizeLevel = SIZE_LEVEL_DEFAULT;
  if (
    stepBadge.sizeLevel !== undefined &&
    stepBadge.sizeLevel >= SIZE_LEVEL_MIN &&
    stepBadge.sizeLevel <= SIZE_LEVEL_MAX
  ) {
    sizeLevel = stepBadge.sizeLevel as StepBadgeSizeLevel;
  } else if (stepBadge.size === 'standard') {
    sizeLevel = 0;
  } else if (stepBadge.size === 'extra-large') {
    sizeLevel = 6;
  }

  return {
    ...stepBadge,
    enabled: stepBadge.enabled ?? true,
    anchor,
    offsetDirections: Array.isArray(stepBadge.offsetDirections) ? stepBadge.offsetDirections : [],
    sizeLevel,
  };
}

export function toggleStepBadgeOffset(
  currentOffsets: StepBadgeOffsetDirection[],
  direction: StepBadgeOffsetDirection
): StepBadgeOffsetDirection[] {
  if (currentOffsets.includes(direction)) {
    return currentOffsets.filter((item) => item !== direction);
  }

  const next = [...currentOffsets, direction];
  return next.length === 4 ? [] : next;
}

export function filterStepBadgeValue(props: {
  auto: boolean;
  type: StepBadgeType | undefined;
  value: string;
}): string {
  const maxLength = props.auto ? 1 : 2;
  if (props.auto) {
    return props.type === 'number'
      ? props.value.replace(/\D/g, '').slice(0, 2)
      : props.value.slice(0, maxLength);
  }

  return props.value.slice(0, maxLength);
}

export function buildStepBadgeTypeOptions() {
  return [
    { value: 'number' as AutoStepBadgeType, key: 'content.stepBadge.typeNumber' as TranslationKey },
    { value: 'letter' as AutoStepBadgeType, key: 'content.stepBadge.typeLetter' as TranslationKey },
  ];
}

export function buildStepBadgeAlphabetOptions() {
  return [
    {
      value: 'cyrillic' as StepBadgeAlphabet,
      key: 'content.stepBadge.alphabetCyrillic' as TranslationKey,
    },
    {
      value: 'latin' as StepBadgeAlphabet,
      key: 'content.stepBadge.alphabetLatin' as TranslationKey,
    },
  ];
}
