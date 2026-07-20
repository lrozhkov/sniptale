import type { TextCalloutFrame } from './frame';
import { getTextCalloutTailMetrics } from './geometry';

export const PANEL_RADIUS_RATIO = 8 / 60;
const BUBBLE_RADIUS_RATIO = 12 / 50;
const ARROW_BUBBLE_RADIUS_RATIO = 12 / 48;

export interface BubbleLayout {
  bodyBottom: number;
  bottom: number;
  centerX: number;
  left: number;
  radius: number;
  right: number;
  tailHalfWidth: number;
  top: number;
}

export interface ArrowBubbleLayout extends BubbleLayout {
  shoulderY: number;
}

export function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export function resolveClampedRadius(ratio: number, width: number, height: number): number {
  return Math.min(Math.min(width, height) / 2, Math.max(0, Math.min(width, height) * ratio));
}

function resolveBubbleLayout(
  frame: TextCalloutFrame,
  options: {
    tailHeight: number;
    radiusRatio: number;
    tailHalfWidth: number;
  }
): BubbleLayout {
  const left = frame.left;
  const top = frame.top;
  const right = left + frame.width;
  const bottom = top + frame.height;
  const bodyBottom = bottom - options.tailHeight;
  const radius = resolveClampedRadius(options.radiusRatio, frame.width, bodyBottom - top);
  return {
    bodyBottom,
    bottom,
    centerX: left + frame.width / 2,
    left,
    radius,
    right,
    tailHalfWidth: Math.max(1, options.tailHalfWidth),
    top,
  };
}

export function resolveBubbleLayoutForFrame(
  frame: TextCalloutFrame,
  format: 'arrow-bubble' | 'bubble'
): BubbleLayout | ArrowBubbleLayout {
  const radiusRatio = format === 'arrow-bubble' ? ARROW_BUBBLE_RADIUS_RATIO : BUBBLE_RADIUS_RATIO;
  const tailMetrics = getTextCalloutTailMetrics(frame, format);
  const layout = resolveBubbleLayout(frame, {
    radiusRatio,
    tailHalfWidth: tailMetrics.halfWidth ?? 1,
    tailHeight: tailMetrics.height ?? 1,
  });

  if (format === 'bubble') {
    return layout;
  }

  return {
    ...layout,
    shoulderY:
      frame.top + frame.height - (tailMetrics.height ?? 1) + (tailMetrics.shoulderOffset ?? 0),
  };
}
