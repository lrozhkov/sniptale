import React from 'react';
import type {
  StepBadgeAnchor,
  StepBadgeOffsetDirection,
  StepBadgeSettings,
  StepBadgeSizeLevel,
} from '../../../features/highlighter/contracts';
import { resolveBorderShadowVisual } from '../../../features/highlighter/style';

const ANCHOR_POSITIONS: Record<
  StepBadgeAnchor,
  {
    top?: number | string;
    bottom?: number | string;
    left?: number | string;
    right?: number | string;
    translate: string;
  }
> = {
  'top-left': { top: 0, left: 0, translate: 'translate(-50%, -50%)' },
  'top-center': { top: 0, left: '50%', translate: 'translate(-50%, -50%)' },
  'top-right': { top: 0, right: 0, translate: 'translate(50%, -50%)' },
  'middle-left': { top: '50%', left: 0, translate: 'translate(-50%, -50%)' },
  center: { top: '50%', left: '50%', translate: 'translate(-50%, -50%)' },
  'middle-right': { top: '50%', right: 0, translate: 'translate(50%, -50%)' },
  'bottom-left': { bottom: 0, left: 0, translate: 'translate(-50%, 50%)' },
  'bottom-center': { bottom: 0, left: '50%', translate: 'translate(-50%, 50%)' },
  'bottom-right': { bottom: 0, right: 0, translate: 'translate(50%, 50%)' },
};

const CORNER_TO_ANCHOR: Record<string, StepBadgeAnchor> = {
  'top-left': 'top-left',
  'top-right': 'top-right',
  'bottom-left': 'bottom-left',
  'bottom-right': 'bottom-right',
};

const SIZE_LEVEL_MIN = 0;
const SIZE_LEVEL_MAX = 6;
const SIZE_MULTIPLIER_AT_0 = 1.0;
const SIZE_MULTIPLIER_AT_3 = 1.35;
const SIZE_MULTIPLIER_AT_6 = 1.8;
const OFFSET_STEP_PX = 8;

function getEffectiveAnchor(settings: StepBadgeSettings): StepBadgeAnchor {
  if (settings.anchor) {
    return settings.anchor;
  }

  const fallbackAnchor = settings.corner ? CORNER_TO_ANCHOR[settings.corner] : undefined;
  if (fallbackAnchor) {
    return fallbackAnchor;
  }

  return 'top-left';
}

function getEffectiveSizeLevel(settings: StepBadgeSettings): StepBadgeSizeLevel {
  if (
    settings.sizeLevel !== undefined &&
    settings.sizeLevel >= SIZE_LEVEL_MIN &&
    settings.sizeLevel <= SIZE_LEVEL_MAX
  ) {
    return settings.sizeLevel as StepBadgeSizeLevel;
  }

  if (settings.size === 'standard') {
    return 0;
  }

  if (settings.size === 'extra-large') {
    return 6;
  }

  return 3;
}

function sizeLevelToMultiplier(level: number): number {
  if (level <= 3) {
    return SIZE_MULTIPLIER_AT_0 + (level / 3) * (SIZE_MULTIPLIER_AT_3 - SIZE_MULTIPLIER_AT_0);
  }

  return SIZE_MULTIPLIER_AT_3 + ((level - 3) / 3) * (SIZE_MULTIPLIER_AT_6 - SIZE_MULTIPLIER_AT_3);
}

function getOffsetFromDirections(
  directions: StepBadgeOffsetDirection[] | undefined,
  badgeSize: number
): { x: number; y: number } {
  if (!directions || directions.length === 0) {
    return { x: 0, y: 0 };
  }

  const allDirections: StepBadgeOffsetDirection[] = ['up', 'down', 'left', 'right'];
  if (allDirections.every((direction) => directions.includes(direction))) {
    return { x: 0, y: 0 };
  }

  const step = OFFSET_STEP_PX * Math.max(0.5, badgeSize / 24);
  let x = 0;
  let y = 0;

  if (directions.includes('up')) {
    y -= step;
  }
  if (directions.includes('down')) {
    y += step;
  }
  if (directions.includes('left')) {
    x -= step;
  }
  if (directions.includes('right')) {
    x += step;
  }

  return { x, y };
}

export function getStepBadgeStyle(props: {
  borderColor: string;
  borderWidth: number;
  settings: StepBadgeSettings;
  shadow?: number;
  zIndex: number;
  clickable: boolean;
}): React.CSSProperties {
  const anchor = getEffectiveAnchor(props.settings);
  const sizeLevel = getEffectiveSizeLevel(props.settings);
  const fontSize = Math.max(12, props.borderWidth * 2.5) * sizeLevelToMultiplier(sizeLevel);
  const badgeSize = fontSize * 1.8;
  const offset = getOffsetFromDirections(props.settings.offsetDirections, badgeSize);
  const position = ANCHOR_POSITIONS[anchor];
  const shadowVisual =
    props.shadow === undefined ? null : resolveBorderShadowVisual(props.shadow, props.borderColor);

  return {
    position: 'absolute',
    width: `${badgeSize}px`,
    height: `${badgeSize}px`,
    minWidth: `${badgeSize}px`,
    minHeight: `${badgeSize}px`,
    borderRadius: '50%',
    backgroundColor: props.borderColor,
    color: 'var(--sniptale-color-text-inverse)',
    fontSize: `${fontSize}px`,
    fontWeight: 'bold',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: `${position.translate} translate(${offset.x}px, ${offset.y}px)`,
    zIndex: props.zIndex,
    pointerEvents: 'auto',
    cursor: props.clickable ? 'pointer' : 'default',
    boxShadow: shadowVisual?.stepBadgeBoxShadow,
    border: '2px solid var(--sniptale-color-surface-base)',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    transition: 'transform 0.1s ease-out, box-shadow 0.15s ease-out',
    top: position.top,
    bottom: position.bottom,
    left: position.left,
    right: position.right,
  };
}

export function StepBadgeValue({ value }: { value: string | number }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        lineHeight: 1,
        transform: 'translateY(-1px)',
      }}
    >
      {value}
    </span>
  );
}
