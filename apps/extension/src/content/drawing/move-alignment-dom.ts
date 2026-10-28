import type { DrawingBounds } from '../../features/drawing/public';
import { isContentOwnedElement } from '../platform/dom-host';
import type { PageScrollRoot } from '../platform/page-scroll';
import { getDrawingViewportProjection } from './interaction';

function readDrawingDomAlignmentBounds(
  bounds: DrawingBounds,
  root: PageScrollRoot
): DrawingBounds[] {
  if (typeof document.elementsFromPoint !== 'function') return [];
  const projection = getDrawingViewportProjection(root);
  const viewport =
    root.kind === 'element'
      ? root.element.getBoundingClientRect()
      : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const width = window.innerWidth;
  const height = window.innerHeight;
  const found = new Set<Element>();
  const result: DrawingBounds[] = [];
  const xs = [bounds.x - 32, bounds.x + bounds.width / 2, bounds.x + bounds.width + 32];
  const ys = [bounds.y - 32, bounds.y + bounds.height / 2, bounds.y + bounds.height + 32];
  for (const x of xs)
    for (const y of ys) {
      const clientX = x - projection.x;
      const clientY = y - projection.y;
      if (
        clientX < Math.max(0, viewport.left) ||
        clientX >= Math.min(width, viewport.right) ||
        clientY < Math.max(0, viewport.top) ||
        clientY >= Math.min(height, viewport.bottom)
      )
        continue;
      const hit = document
        .elementsFromPoint(clientX, clientY)
        .find(
          (element) =>
            !isContentOwnedElement(element) &&
            (root.kind !== 'element' || root.element.contains(element))
        );
      let element = hit ?? null;
      for (let depth = 0; element && depth < 3; depth++, element = element.parentElement) {
        if (found.has(element)) continue;
        found.add(element);
        if (
          element === document.body ||
          element === document.documentElement ||
          isContentOwnedElement(element)
        )
          continue;
        const style = getComputedStyle(element);
        if (style.opacity === '0' || style.visibility === 'hidden') continue;
        const rect = element.getBoundingClientRect();
        if (
          ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
          rect.width < 24 ||
          rect.height < 24 ||
          rect.width * rect.height > width * height * 0.85
        )
          continue;
        result.push({
          x: rect.x + projection.x,
          y: rect.y + projection.y,
          width: rect.width,
          height: rect.height,
        });
      }
    }
  return result;
}

/** Reads nearby page geometry with bounded hit tests, without traversing the document. */
export function collectDrawingDomAlignmentBounds(
  bounds: DrawingBounds,
  root: PageScrollRoot
): DrawingBounds[] {
  try {
    return readDrawingDomAlignmentBounds(bounds, root);
  } catch {
    return [];
  }
}
