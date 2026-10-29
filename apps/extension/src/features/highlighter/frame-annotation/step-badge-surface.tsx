import React, { useLayoutEffect, useRef, useState } from 'react';
import type {
  StepBadgeAnchor,
  StepBadgeSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  STEP_BADGE_NORMAL_OFFSET_LIMIT,
  STEP_BADGE_TANGENTIAL_OFFSET_LIMIT,
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
    const normalOffset = Math.max(
      -STEP_BADGE_NORMAL_OFFSET_LIMIT,
      Math.min(STEP_BADGE_NORMAL_OFFSET_LIMIT, manual.normalOffset ?? 0)
    );
    const tangentialOffset = Math.max(
      -STEP_BADGE_TANGENTIAL_OFFSET_LIMIT,
      Math.min(STEP_BADGE_TANGENTIAL_OFFSET_LIMIT, manual.tangentialOffset ?? 0)
    );
    if (manual.side === 'top')
      return {
        top: 0,
        left: value,
        translateX: -0.5,
        translateY: -0.5,
        normalX: tangentialOffset,
        normalY: -normalOffset,
      };
    if (manual.side === 'right')
      return {
        top: value,
        left: '100%',
        translateX: -0.5,
        translateY: -0.5,
        normalX: normalOffset,
        normalY: tangentialOffset,
      };
    if (manual.side === 'bottom')
      return {
        top: '100%',
        left: value,
        translateX: -0.5,
        translateY: -0.5,
        normalX: tangentialOffset,
        normalY: normalOffset,
      };
    return {
      top: value,
      left: 0,
      translateX: -0.5,
      translateY: -0.5,
      normalX: -normalOffset,
      normalY: tangentialOffset,
    };
  }
  const anchor = settings.anchor ?? settings.corner ?? 'top-left';
  const resolved = anchor in ANCHOR_POSITIONS ? (anchor as StepBadgeAnchor) : 'top-left';
  return {
    ...ANCHOR_POSITIONS[resolved],
    translateX: -0.5,
    translateY: -0.5,
    normalX: 0,
    normalY: 0,
  };
}

export function getStepBadgeStyle(props: {
  borderColor: string;
  borderWidth: number;
  fillColor?: string;
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
    fontFamily: 'var(--sniptale-font-interface, system-ui, sans-serif)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: `translate(${
      (position.translateX * badgeSize + offset.x) * visualScale + position.normalX
    }px, ${
      (position.translateY * badgeSize + offset.y) * visualScale + position.normalY
    }px) scale(${visualScale}) translateZ(0)`,
    // Keep the circle and glyph in one raster layer through fractional scene scaling.
    willChange: 'transform',
    transformOrigin: 'top left',
    zIndex: props.zIndex,
    pointerEvents: 'auto',
    cursor: props.clickable ? 'pointer' : 'default',
    boxShadow: shadow?.stepBadgeBoxShadow,
    border: `${visual.outlineWidth}px solid ${visual.outlineColor}`,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    transition: props.isDragging ? 'none' : 'transform 0.1s ease-out, box-shadow 0.15s ease-out',
    top: position.top,
    left: position.left,
  };
}

function measureBadgeInkOffset(value: HTMLSpanElement): number {
  const style = getComputedStyle(value);
  // A fixed-size glyph sample captures stroke balance without small-font quantization.
  const scale = 64 / Number.parseFloat(style.fontSize);
  if (!Number.isFinite(scale) || scale <= 0) return 0;
  const canvas = value.ownerDocument.createElement('canvas');
  canvas.width = canvas.height = 0;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return 0;
  const font = `${style.fontStyle} ${style.fontWeight} 64px ${style.fontFamily}`;
  const letterSpacing = `${(Number.parseFloat(style.letterSpacing) || 0) * scale}px`;
  context.font = font;
  context.letterSpacing = letterSpacing;
  const text = value.innerText || value.textContent || '';
  const metrics = context.measureText(text);
  const left = Math.min(0, -metrics.actualBoundingBoxLeft);
  const width = Math.ceil(Math.max(metrics.width, metrics.actualBoundingBoxRight) - left + 16);
  const height = Math.ceil(metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent + 16);
  // Custom CSS must not cause an unbounded measurement allocation.
  if (
    !Number.isFinite(width + height) ||
    width <= 0 ||
    height <= 0 ||
    width > 1024 ||
    height > 256
  ) {
    return 0;
  }
  canvas.width = width;
  canvas.height = height;
  context.font = font;
  context.letterSpacing = letterSpacing;
  const origin = 8 - left;
  context.fillText(text, origin, 8 + metrics.fontBoundingBoxAscent);
  const pixels = context.getImageData(0, 0, width, height).data;
  let coverage = 0;
  let moment = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    const alpha = pixels[index]!;
    coverage += alpha;
    moment += ((((index - 3) / 4) % width) + 0.5 - origin) * alpha;
  }
  // Center the stroke coverage, rather than the bounding box of an asymmetric glyph.
  const next = Number.parseFloat(style.width) / 2 - moment / coverage / scale;
  return Number.isFinite(next) ? next : 0;
}

function useBadgeInkOffset(element: React.RefObject<HTMLSpanElement | null>) {
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => {
    const value = element.current;
    if (!value || typeof CanvasRenderingContext2D === 'undefined') return;
    const measure = () => setOffset(measureBadgeInkOffset(value));
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(value);
    const fonts = value.ownerDocument.fonts;
    fonts?.addEventListener('loadingdone', measure);
    return () => {
      observer?.disconnect();
      fonts?.removeEventListener('loadingdone', measure);
    };
  });
  return offset;
}

export function StepBadgeValue(props: {
  customStyle?: React.CSSProperties;
  value: string | number;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const inkOffset = useBadgeInkOffset(element);
  return (
    <span
      ref={element}
      style={{
        display: 'block',
        fontFamily: 'var(--sniptale-font-interface, system-ui, sans-serif)',
        fontSize: 'inherit',
        fontWeight: 'inherit',
        lineHeight: 1,
        textBoxTrim: 'trim-both',
        textBoxEdge: 'cap alphabetic',
        textRendering: 'geometricPrecision',
        translate: `${inkOffset}px 0`,
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
  elementRef?: React.Ref<HTMLDivElement>;
  valueEditor?: React.ReactNode;
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
      {props.valueEditor ?? (
        <StepBadgeValue customStyle={customStyles.text} value={props.settings.value} />
      )}
    </div>
  );
}

function translateStepBadgePrefix(): string {
  return translate('content.stepBadge.tooltipPrefix');
}
