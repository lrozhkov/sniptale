import type { Selection } from './types';

type Radius = { x: number; y: number };

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

function hasUnsupportedTransform(element: HTMLElement): boolean {
  let current: Element | null = element;
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      style &&
      (!isAxisAligned(style.transform) ||
        (style.rotate && style.rotate !== 'none' && style.rotate !== '0deg') ||
        (style.scale &&
          style.scale !== 'none' &&
          style.scale.split(/\s+/).some((value) => Number(value) <= 0)))
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

function roundedBoundaryBands(rect: Selection, radii: Radius[], scale: number): Selection[] {
  const [tl, tr, br, bl] = radii;
  if (!tl || !tr || !br || !bl) return [rect];
  const ratio = Math.min(
    1,
    rect.width / (tl.x + tr.x),
    rect.width / (bl.x + br.x),
    rect.height / (tl.y + bl.y),
    rect.height / (tr.y + br.y)
  );
  const result: Selection[] = [];
  radii.forEach((radius, index) => {
    const rx = radius.x * ratio;
    const ry = radius.y * ratio;
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

/** Limits pixel hit probes to CSS shape boundaries; ordinary axis-aligned boxes stay coarse. */
export function getFrozenHitSamplingBoxes(
  element: HTMLElement,
  rect: Selection,
  scale: number
): Selection[] {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return [];
  if (
    hasUnsupportedTransform(element) ||
    [style.clipPath, style.clip].some((value) => value && value !== 'none' && value !== 'auto')
  )
    return [rect];
  const zoomX = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
  const zoomY = element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1;
  const radii = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ].map((radius) => readRadius(radius || style.borderRadius || '0', rect, zoomX, zoomY));
  if (radii.some((radius) => radius === null)) return [rect];
  return roundedBoundaryBands(
    rect,
    radii.filter((radius) => radius !== null),
    scale
  );
}
