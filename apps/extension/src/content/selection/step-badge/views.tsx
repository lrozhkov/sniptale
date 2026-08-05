import React from 'react';
import type { StepBadgeAnchor, StepBadgeSettings } from '../../../features/highlighter/contracts';
import { resolveBorderShadowVisual } from '../../../features/highlighter/style';
import { resolveStepBadgeVisualStyle } from '../../../features/highlighter/step-badge-presets/style';
import { getStepBadgeVisualMetrics } from './placement';

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

function getManualPosition(settings: StepBadgeSettings) {
  const placement = settings.manualPlacement;
  if (!placement) return null;
  const normalizedPosition = Math.max(0, Math.min(1, placement.position));
  const position = `${normalizedPosition * 100}%`;
  if (placement.side === 'top') {
    return { top: 0, left: position, translate: 'translate(-50%, -50%)' };
  }
  if (placement.side === 'right') {
    return { top: position, right: 0, translate: 'translate(50%, -50%)' };
  }
  if (placement.side === 'bottom') {
    return { bottom: 0, left: position, translate: 'translate(-50%, 50%)' };
  }
  return { top: position, left: 0, translate: 'translate(-50%, -50%)' };
}

export function getStepBadgeStyle(props: {
  borderColor: string;
  borderWidth: number;
  fillColor?: string;
  fillOpacity?: number;
  settings: StepBadgeSettings;
  shadow?: number;
  zIndex: number;
  clickable: boolean;
  isDragging?: boolean;
}): React.CSSProperties {
  const anchor = getEffectiveAnchor(props.settings);
  const { badgeSize, fontSize, offset } = getStepBadgeVisualMetrics(
    props.settings,
    props.borderWidth
  );
  const visualStyle = resolveStepBadgeVisualStyle(props.settings, {
    borderColor: props.borderColor,
    borderWidth: props.borderWidth,
    ...(props.fillColor ? { fillColor: props.fillColor } : {}),
    ...(props.fillOpacity === undefined ? {} : { fillOpacity: props.fillOpacity }),
  });
  const manualPosition = getManualPosition(props.settings);
  const position = manualPosition ?? ANCHOR_POSITIONS[anchor];
  const shadowVisual =
    props.shadow === undefined ? null : resolveBorderShadowVisual(props.shadow, props.borderColor);

  return {
    position: 'absolute',
    width: `${badgeSize}px`,
    height: `${badgeSize}px`,
    minWidth: `${badgeSize}px`,
    minHeight: `${badgeSize}px`,
    borderRadius: '50%',
    backgroundColor: visualStyle.backgroundColor,
    color: visualStyle.textColor,
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
    border: `2px solid ${visualStyle.outlineColor}`,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    transition: props.isDragging ? 'none' : 'transform 0.1s ease-out, box-shadow 0.15s ease-out',
    top: position.top,
    bottom: position.bottom,
    left: position.left,
    right: position.right,
  };
}

export function StepBadgeValue({
  customStyle,
  value,
}: {
  customStyle?: React.CSSProperties;
  value: string | number;
}) {
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
        ...customStyle,
      }}
    >
      {value}
    </span>
  );
}
