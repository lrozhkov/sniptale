import { PAGE_CORNERS, type PageCorner } from '../../../contracts/page-launch';
interface CornerViewport {
  width: number;
  height: number;
}
export interface CornerPoint {
  x: number;
  y: number;
}
export function nearestPageCorner(point: CornerPoint, viewport: CornerViewport): PageCorner {
  return `${point.y < viewport.height / 2 ? 'top' : 'bottom'}-${point.x < viewport.width / 2 ? 'left' : 'right'}`;
}
export function nextPageCorner(corner: PageCorner): PageCorner {
  return PAGE_CORNERS[(PAGE_CORNERS.indexOf(corner) + 1) % PAGE_CORNERS.length]!;
}
export function pageCornerForKey(corner: PageCorner, key: string): PageCorner | null {
  const vertical = corner.startsWith('top') ? 'top' : 'bottom';
  const horizontal = corner.endsWith('left') ? 'left' : 'right';
  switch (key) {
    case 'ArrowLeft':
      return `${vertical}-left`;
    case 'ArrowRight':
      return `${vertical}-right`;
    case 'ArrowUp':
      return `top-${horizontal}`;
    case 'ArrowDown':
      return `bottom-${horizontal}`;
    default:
      return null;
  }
}
export function clampCornerDragPosition(
  point: CornerPoint,
  bounds: CornerViewport,
  viewport: CornerViewport
): CornerPoint {
  return {
    x: Math.max(0, Math.min(point.x, viewport.width - bounds.width)),
    y: Math.max(0, Math.min(point.y, viewport.height - bounds.height)),
  };
}
export function pageCornerOffsets(corner: PageCorner, scale = 1, scrollbarWidth = 0) {
  const left = corner.endsWith('left'),
    top = corner.startsWith('top');
  return {
    ...(left ? { left: 20 * scale } : { right: 20 * scale + scrollbarWidth }),
    ...(top ? { top: 20 * scale } : { bottom: 20 * scale }),
    transformOrigin: `${left ? 'left' : 'right'} ${top ? 'top' : 'bottom'}`,
  };
}
