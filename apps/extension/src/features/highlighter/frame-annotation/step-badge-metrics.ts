import type {
  StepBadgeOffsetDirection,
  StepBadgeSettings,
  StepBadgeSizeLevel,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { resolveStepBadgeVisualStyle } from '../step-badge-presets/style';

const OFFSET_STEP_PX = 8;

function getEffectiveSizeLevel(settings: StepBadgeSettings): StepBadgeSizeLevel {
  if (settings.sizeLevel !== undefined && settings.sizeLevel >= 0 && settings.sizeLevel <= 6) {
    return settings.sizeLevel as StepBadgeSizeLevel;
  }
  if (settings.size === 'standard') return 0;
  if (settings.size === 'extra-large') return 6;
  return 3;
}

function sizeLevelToMultiplier(level: number): number {
  return level <= 3 ? 1 + (level / 3) * 0.35 : 1.35 + ((level - 3) / 3) * 0.45;
}

function getOffsetFromDirections(
  directions: StepBadgeOffsetDirection[] | undefined,
  badgeSize: number
) {
  if (!directions || directions.length === 0) return { x: 0, y: 0 };
  if (
    ['up', 'down', 'left', 'right'].every((item) =>
      directions.includes(item as StepBadgeOffsetDirection)
    )
  ) {
    return { x: 0, y: 0 };
  }
  const step = OFFSET_STEP_PX * Math.max(0.5, badgeSize / 24);
  return {
    x: (directions.includes('right') ? step : 0) - (directions.includes('left') ? step : 0),
    y: (directions.includes('down') ? step : 0) - (directions.includes('up') ? step : 0),
  };
}

export function getStepBadgeVisualMetrics(settings: StepBadgeSettings, borderWidth: number) {
  if (settings.style) {
    const badgeSize = resolveStepBadgeVisualStyle(settings, {
      borderColor: settings.style.backgroundColor,
      borderWidth,
    }).diameter;
    return {
      badgeSize,
      fontSize: badgeSize / 1.8,
      offset: getOffsetFromDirections(settings.offsetDirections, badgeSize),
    };
  }
  const fontSize =
    Math.max(12, borderWidth * 2.5) * sizeLevelToMultiplier(getEffectiveSizeLevel(settings));
  const badgeSize = fontSize * 1.8;
  return {
    badgeSize,
    fontSize,
    offset: getOffsetFromDirections(settings.offsetDirections, badgeSize),
  };
}
