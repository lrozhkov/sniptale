import React from 'react';
import type {
  StepBadgeAnchor,
  StepBadgeSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { resolveBorderShadowVisual } from '../style';
import { resolveStepBadgeVisualStyle } from '../step-badge-presets/style';
import { getStepBadgeVisualMetrics } from './step-badge-metrics';
import { resolveStepBadgeCustomCss } from '../step-badge-custom-css';
import { translate } from '../../../platform/i18n';

const ANCHOR_POSITIONS: Record<StepBadgeAnchor, Record<string, number | string>> = {
  'top-left': { top: 0, left: 0 },
  'top-center': { top: 0, left: '50%' },
  'top-right': { top: 0, left: '100%' },
  'middle-left': { top: '50%', left: 0 },
  center: { top: '50%', left: '50%' },
  'middle-right': { top: '50%', left: '100%' },
  'bottom-left': { top: '100%', left: 0 },
  'bottom-center': { top: '100%', left: '50%' },
  'bottom-right': { top: '100%', left: '100%' },
};

function resolvePosition(settings: StepBadgeSettings) {
  const manual = settings.manualPlacement;
  if (manual) {
    const value = `${Math.max(0, Math.min(1, manual.position)) * 100}%`;
    if (manual.side === 'top') return { top: 0, left: value, translateX: -0.5, translateY: -0.5 };
    if (manual.side === 'right')
      return { top: value, left: '100%', translateX: -0.5, translateY: -0.5 };
    if (manual.side === 'bottom')
      return { top: '100%', left: value, translateX: -0.5, translateY: -0.5 };
    return { top: value, left: 0, translateX: -0.5, translateY: -0.5 };
  }
  const anchor = settings.anchor ?? settings.corner ?? 'top-left';
  const resolved = anchor in ANCHOR_POSITIONS ? (anchor as StepBadgeAnchor) : 'top-left';
  return {
    ...ANCHOR_POSITIONS[resolved],
    translateX: -0.5,
    translateY: -0.5,
  };
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
  visualScale?: number;
}): React.CSSProperties {
  const { badgeSize, fontSize, offset } = getStepBadgeVisualMetrics(
    props.settings,
    props.borderWidth
  );
  const visual = resolveStepBadgeVisualStyle(props.settings, {
    borderColor: props.borderColor,
    borderWidth: props.borderWidth,
    ...(props.fillColor ? { fillColor: props.fillColor } : {}),
    ...(props.fillOpacity === undefined ? {} : { fillOpacity: props.fillOpacity }),
  });
  const position = resolvePosition(props.settings);
  const visualScale = props.visualScale ?? 1;
  const shadow =
    props.shadow === undefined ? null : resolveBorderShadowVisual(props.shadow, props.borderColor);
  return {
    position: 'absolute',
    width: `${badgeSize}px`,
    height: `${badgeSize}px`,
    minWidth: `${badgeSize}px`,
    minHeight: `${badgeSize}px`,
    boxSizing: 'border-box',
    borderRadius: '50%',
    backgroundColor: visual.backgroundColor,
    color: visual.textColor,
    fontSize: `${fontSize}px`,
    fontWeight: 'bold',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: `translate(${(position.translateX * badgeSize + offset.x) * visualScale}px, ${
      (position.translateY * badgeSize + offset.y) * visualScale
    }px) scale(${visualScale})`,
    transformOrigin: 'top left',
    zIndex: props.zIndex,
    pointerEvents: 'auto',
    cursor: props.clickable ? 'pointer' : 'default',
    boxShadow: shadow?.stepBadgeBoxShadow,
    border: `2px solid ${visual.outlineColor}`,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    transition: props.isDragging ? 'none' : 'transform 0.1s ease-out, box-shadow 0.15s ease-out',
    top: position.top,
    left: position.left,
  };
}

export function StepBadgeValue(props: {
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
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 'inherit',
        fontWeight: 'inherit',
        lineHeight: 1,
        transform: 'translateY(-1px)',
        ...props.customStyle,
      }}
    >
      {props.value}
    </span>
  );
}

export function FrameStepBadgeSurface(props: {
  borderColor: string;
  borderWidth: number;
  fillColor?: string;
  fillOpacity?: number;
  elementRef?: React.Ref<HTMLDivElement>;
  isDragging?: boolean;
  visualScale?: number;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  settings: StepBadgeSettings;
  shadow?: number;
  zIndex: number;
}) {
  if (!props.settings.enabled) return null;
  const customStyles = resolveStepBadgeCustomCss(props.settings.style?.customCss ?? '').styles;
  return (
    <div
      ref={props.elementRef}
      className="sniptale-step-badge"
      onClick={(event) => {
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        props.onClick?.();
      }}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      style={{
        ...getStepBadgeStyle({
          settings: props.settings,
          borderColor: props.borderColor,
          borderWidth: props.borderWidth,
          ...(props.fillColor ? { fillColor: props.fillColor } : {}),
          ...(props.fillOpacity === undefined ? {} : { fillOpacity: props.fillOpacity }),
          zIndex: props.zIndex,
          clickable: Boolean(props.onClick),
          ...(props.isDragging === undefined ? {} : { isDragging: props.isDragging }),
          ...(props.visualScale === undefined ? {} : { visualScale: props.visualScale }),
          ...(props.shadow === undefined ? {} : { shadow: props.shadow }),
        }),
        ...customStyles.badge,
      }}
      title={[translateStepBadgePrefix(), props.settings.value].filter(Boolean).join(' ')}
    >
      <StepBadgeValue customStyle={customStyles.text} value={props.settings.value} />
    </div>
  );
}

function translateStepBadgePrefix(): string {
  return translate('content.stepBadge.tooltipPrefix');
}
