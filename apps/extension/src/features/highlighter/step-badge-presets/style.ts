import type {
  StepBadgeColorSource,
  StepBadgeOutlineColorSource,
  StepBadgeSettings,
  StepBadgeVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { DEFAULT_STEP_BADGE_VISUAL_STYLE } from './catalog';
import { hasVisibleColor } from '@sniptale/foundation/color';

interface StepBadgeFrameVisuals {
  borderColor: string;
  borderWidth: number;
  fillColor?: string;
}

interface ResolvedStepBadgeVisualStyle {
  backgroundColor: string;
  diameter: number;
  outlineColor: string;
  outlineWidth: number;
  textColor: string;
}

const CLASSIC_SIZE_MULTIPLIER = 1.35;

export function getLinkedStepBadgeDiameter(borderWidth: number): number {
  return Math.max(12, borderWidth * 2.5) * CLASSIC_SIZE_MULTIPLIER * 1.8;
}

export function getEffectiveStepBadgeVisualStyle(
  settings: Pick<StepBadgeSettings, 'style'>
): StepBadgeVisualStyle {
  return settings.style
    ? { ...DEFAULT_STEP_BADGE_VISUAL_STYLE, ...settings.style }
    : { ...DEFAULT_STEP_BADGE_VISUAL_STYLE };
}

function resolveColor(
  source: StepBadgeColorSource | StepBadgeOutlineColorSource,
  fallback: string,
  frame: StepBadgeFrameVisuals
): string {
  if (source === 'frame-border') return frame.borderColor;
  if (source === 'frame-fill') {
    return hasVisibleColor(frame.fillColor) ? frame.fillColor! : fallback;
  }
  if (source === 'surface') return 'var(--sniptale-color-surface-base)';
  return fallback;
}

export function resolveStepBadgeVisualStyle(
  settings: Pick<StepBadgeSettings, 'style'>,
  frame: StepBadgeFrameVisuals
): ResolvedStepBadgeVisualStyle {
  const style = getEffectiveStepBadgeVisualStyle(settings);
  return {
    diameter:
      style.sizeSource === 'frame-border'
        ? getLinkedStepBadgeDiameter(frame.borderWidth)
        : style.diameter,
    backgroundColor: resolveColor(style.backgroundColorSource, style.backgroundColor, frame),
    textColor: resolveColor(style.textColorSource, style.textColor, frame),
    outlineColor: resolveColor(style.outlineColorSource, style.outlineColor, frame),
    outlineWidth: Math.max(0, Math.min(20, style.outlineWidth ?? 2)),
  };
}
