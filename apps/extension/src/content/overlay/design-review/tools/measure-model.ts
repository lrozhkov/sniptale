import { getAbsolutePosition } from '../../../platform/frame';
import {
  measureBorderBoxes,
  type DesignReviewMeasureState,
} from '../../../selection/design-review/measure';

const GROUPS = {
  text: [
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'color',
    'text-align',
  ],
  size: ['width', 'height'],
  fill: ['background-color', 'opacity'],
  border: [
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-top-color',
    'border-top-style',
    'border-radius',
  ],
} as const;

export function measureTargetLabel(element: Element | null): string {
  return element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}` : '';
}

export function readMeasurePair(state: DesignReviewMeasureState) {
  const a = state.slot === 'a' && state.preview ? state.preview : state.a;
  const b = state.slot === 'b' && state.preview ? state.preview : state.b;
  const rect = (target: Element | null) => {
    try {
      if (!target?.isConnected || !target.getClientRects().length) return null;
      const value = getAbsolutePosition(target);
      return [value.x, value.y, value.width, value.height].every(Number.isFinite) ? value : null;
    } catch {
      return null;
    }
  };
  const rectA = rect(a),
    rectB = rect(b);
  if ((a && !rectA) || (b && !rectB)) return { kind: 'unavailable' as const, a, b, rectA, rectB };
  if (!a || !b || !rectA || !rectB) return { kind: 'incomplete' as const, a, b, rectA, rectB };
  try {
    const styleA = a.ownerDocument.defaultView?.getComputedStyle(a),
      styleB = b.ownerDocument.defaultView?.getComputedStyle(b);
    if (!styleA || !styleB) return { kind: 'unavailable' as const, a, b, rectA, rectB };
    const differences = Object.entries(GROUPS).map(([group, properties]) => ({
      group,
      values: properties.flatMap((property) => {
        const left = styleA.getPropertyValue(property).trim(),
          right = styleB.getPropertyValue(property).trim();
        return left === right ? [] : [{ property, a: left, b: right }];
      }),
    }));
    return {
      kind: 'ready' as const,
      a,
      b,
      rectA,
      rectB,
      geometry: measureBorderBoxes(rectA, rectB),
      differences,
    };
  } catch {
    return { kind: 'unavailable' as const, a, b, rectA, rectB };
  }
}

export function formatMeasureNumber(value: number): string {
  return String(Math.round(value * 10) / 10);
}

interface MeasureGuide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  value: number;
  axis?: 'x' | 'y';
}

/** Keeps small-gap labels outside measured boxes; the panel retains values if no free space exists. */
export function placeMeasureGuideLabel(
  line: MeasureGuide,
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
  viewport: { width: number; height: number }
) {
  const text = `${line.axis ? `${line.axis.toUpperCase()} ` : ''}${formatMeasureNumber(line.value)} px`;
  const width = Math.max(42, text.length * 7 + 12),
    height = 20;
  const x = (line.x1 + line.x2) / 2,
    y = (line.y1 + line.y2) / 2;
  const candidates = [
    { left: x - width / 2, top: y - height / 2 },
    { left: x - width / 2, top: y - height - 18 },
    { left: x - width / 2, top: y + 18 },
    { left: x - width - 18, top: y - height / 2 },
    { left: x + 18, top: y - height / 2 },
    { left: x - width / 2, top: Math.min(...boxes.map((box) => box.y)) - height - 8 },
    { left: x - width / 2, top: Math.max(...boxes.map((box) => box.y + box.height)) + 8 },
    { left: Math.max(...boxes.map((box) => box.x + box.width)) + 8, top: y - height / 2 },
    { left: Math.min(...boxes.map((box) => box.x)) - width - 8, top: y - height / 2 },
  ];
  for (const candidate of candidates) {
    const left = Math.max(4, Math.min(candidate.left, viewport.width - width - 4));
    const top = Math.max(68, Math.min(candidate.top, viewport.height - height - 4));
    if (width > viewport.width - 8 || top + height > viewport.height - 4) continue;
    if (
      boxes.some(
        (box) =>
          left < box.x + box.width + 4 &&
          left + width + 4 > box.x &&
          top < box.y + box.height + 4 &&
          top + height + 4 > box.y
      )
    )
      continue;
    return { left, top, width, height, text, anchorX: x, anchorY: y };
  }
  return null;
}
