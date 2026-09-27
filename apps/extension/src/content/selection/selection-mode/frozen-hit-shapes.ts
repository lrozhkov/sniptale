import type { Selection } from './types';

type Radius = { x: number; y: number };

export type FrozenHitShape = {
  boxes: Selection[];
  containsPoint?: (x: number, y: number) => boolean | null;
};

function isAxisAligned(transform: string): boolean {
  if (!transform || transform === 'none') return true;
  const match = /^matrix(3d)?\(([^)]+)\)$/.exec(transform);
  if (!match) return false;
  const values = match[2]?.split(',').map(Number) ?? [];
  const zeros = match[1] ? [1, 2, 3, 4, 6, 7, 8, 9, 11] : [1, 2];
  return (
    values.length === (match[1] ? 16 : 6) &&
    (values[0] ?? 0) > 0 &&
    (values[match[1] ? 5 : 3] ?? 0) > 0 &&
    zeros.every((index) => Math.abs(values[index] ?? 1) < 1e-8)
  );
}

function isQuarterTurn(transform: string): boolean {
  const match = /^matrix\(([^)]+)\)$/.exec(transform);
  if (!match) return false;
  const values = match[1]?.split(',').map(Number) ?? [];
  const [a, b, c, d] = values;
  return (
    values.length === 6 &&
    Math.abs(a ?? 1) < 1e-8 &&
    Math.abs(d ?? 1) < 1e-8 &&
    (b ?? 0) * (c ?? 0) < 0 &&
    Math.abs(Math.abs(b ?? 0) - Math.abs(c ?? 0)) < 1e-8
  );
}

function hasUnsupportedTransform(element: HTMLElement, allowQuarterTurn: boolean): boolean {
  let current: Element | null = element;
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      style &&
      ((!isAxisAligned(style.transform) && !(allowQuarterTurn && isQuarterTurn(style.transform))) ||
        (style.rotate !== 'none' &&
          style.rotate !== '0deg' &&
          !(allowQuarterTurn && /^(90|270)deg$/.test(style.rotate))) ||
        (style.scale !== 'none' && style.scale.split(/\s+/).some((value) => Number(value) <= 0)))
    )
      return true;
    const root = current.getRootNode();
    current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return false;
}

function radiusLength(value: string, length: number, zoom: number): number | null {
  const match = /^([\d.]+)(px|%)?$/.exec(value);
  if (!match) return null;
  const number = Number(match[1]);
  return match[2] === '%' ? (number * length) / 100 : number * zoom;
}

function readRadius(value: string, rect: Selection, zoomX: number, zoomY: number): Radius | null {
  const [horizontal = '0', vertical = horizontal] = value.trim().split(/\s+/);
  const x = radiusLength(horizontal, rect.width, zoomX);
  const y = radiusLength(vertical, rect.height, zoomY);
  return x === null || y === null ? null : { x, y };
}

function normalizedRadii(rect: Selection, radii: Radius[]): Radius[] {
  const [tl, tr, br, bl] = radii;
  if (!tl || !tr || !br || !bl) return radii;
  const ratio = Math.min(
    1,
    rect.width / (tl.x + tr.x),
    rect.width / (bl.x + br.x),
    rect.height / (tl.y + bl.y),
    rect.height / (tr.y + br.y)
  );
  return radii.map((radius) => ({ x: radius.x * ratio, y: radius.y * ratio }));
}

function roundedBoundaryBands(rect: Selection, radii: Radius[], scale: number): Selection[] {
  const result: Selection[] = [];
  radii.forEach((radius, index) => {
    const rx = radius.x;
    const ry = radius.y;
    if (rx <= 0 || ry <= 0) return;
    const right = index === 1 || index === 2;
    const bottom = index >= 2;
    const centerX = right ? rect.x + rect.width - rx : rect.x + rx;
    const centerY = bottom ? rect.y + rect.height - ry : rect.y + ry;
    const top = bottom ? centerY : rect.y;
    const end = bottom ? rect.y + rect.height : centerY;
    const boundary = (y: number) =>
      centerX + (right ? 1 : -1) * rx * Math.sqrt(Math.max(0, 1 - ((y - centerY) / ry) ** 2));
    for (let row = Math.floor(top * scale); row < Math.ceil(end * scale); row += 1) {
      const y = Math.max(top, row / scale);
      const next = Math.min(end, (row + 1) / scale);
      const x1 = boundary(y);
      const x2 = boundary(next);
      const left = Math.min(x1, x2) - 1 / scale;
      result.push({ x: left, y, width: Math.abs(x2 - x1) + 2 / scale, height: next - y });
    }
  });
  return result;
}

function roundedRectContains(
  rect: Selection,
  radii: Radius[],
  x: number,
  y: number,
  scale: number
): boolean | null {
  const [tl, tr, br, bl] = radii;
  if (!tl || !tr || !br || !bl) return false;
  const corners = [
    { radius: tl, cx: rect.x + tl.x, cy: rect.y + tl.y, xSide: -1, ySide: -1 },
    { radius: tr, cx: rect.x + rect.width - tr.x, cy: rect.y + tr.y, xSide: 1, ySide: -1 },
    {
      radius: br,
      cx: rect.x + rect.width - br.x,
      cy: rect.y + rect.height - br.y,
      xSide: 1,
      ySide: 1,
    },
    { radius: bl, cx: rect.x + bl.x, cy: rect.y + rect.height - bl.y, xSide: -1, ySide: 1 },
  ];
  for (const { radius, cx, cy, xSide, ySide } of corners) {
    if (radius.x <= 0 || radius.y <= 0) continue;
    if ((x - cx) * xSide > 0 && (y - cy) * ySide > 0) {
      const normalizedDistance = Math.hypot((x - cx) / radius.x, (y - cy) / radius.y);
      // Browser hit testing rounds the curved edge to device pixels. Keep that edge
      // uncached so a sampled result cannot stand in for a different edge cell.
      if (Math.abs(normalizedDistance - 1) * Math.min(radius.x, radius.y) <= 1 / scale) return null;
      return normalizedDistance < 1;
    }
  }
  return true;
}

/** Limits pixel hit probes to CSS shape boundaries; ordinary axis-aligned boxes stay coarse. */
export function getFrozenHitSamplingBoxes(
  element: HTMLElement,
  rect: Selection,
  scale: number
): Selection[] {
  return getFrozenHitShape(element, rect, scale).boxes;
}

/** Gives the retained hit map an exact rounded-box classifier and bounds unknown shapes. */
export function getFrozenHitShape(
  element: HTMLElement,
  rect: Selection,
  scale: number
): FrozenHitShape {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return { boxes: [] };
  const zoomX = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
  const zoomY = element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1;
  const radii = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ].map((radius) => readRadius(radius || style.borderRadius || '0', rect, zoomX, zoomY));
  if (radii.some((radius) => radius === null)) return { boxes: [rect] };
  const parsedRadii = radii.filter((radius) => radius !== null);
  const zeroCorners = parsedRadii.every((radius) => radius.x === 0 && radius.y === 0);
  const first = parsedRadii[0];
  const uniformCorners = Boolean(
    first &&
    parsedRadii.every((radius) => radius.x === first.x && radius.y === first.y) &&
    first.x === first.y
  );
  const square =
    element.offsetWidth === element.offsetHeight && Math.abs(rect.width - rect.height) < 1e-8;
  if (
    hasUnsupportedTransform(element, zeroCorners || (uniformCorners && square)) ||
    [style.clipPath, style.clip].some((value) => value && value !== 'none' && value !== 'auto')
  )
    return { boxes: [rect] };
  if (zeroCorners) return { boxes: [] };
  const effectiveRadii = normalizedRadii(rect, parsedRadii);
  return {
    boxes: roundedBoundaryBands(rect, effectiveRadii, scale),
    containsPoint: (x, y) => roundedRectContains(rect, effectiveRadii, x, y, scale),
  };
}
