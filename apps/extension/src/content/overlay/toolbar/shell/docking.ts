import { resolveContentUiViewport } from '@sniptale/ui/floating-interactions/scale';
import type {
  ContentToolbarDockEdge,
  ContentToolbarPosition,
} from '../../../../contracts/settings';

export const TOOLBAR_DOCK_INSET = 8;
export const TOOLBAR_DOCK_ZONE_SIZE = 64;
export const TOOLBAR_DOCK_SCROLLBAR_GAP = 12;
export const TOOLBAR_DOCK_EDGES = ['top', 'bottom', 'left', 'right'] as const;
type ToolbarDockSide = (typeof TOOLBAR_DOCK_EDGES)[number];

export function getToolbarDockDisplayMode(edge: ContentToolbarDockEdge) {
  return edge.startsWith('left') || edge.startsWith('right') ? 'vertical' : 'horizontal';
}

/** The content viewport excludes classic scrollbars before applying UI zoom. */
export function resolveToolbarDockViewport(uiScale: number) {
  return resolveContentUiViewport({
    clientWidth: Math.min(
      window.innerWidth,
      document.documentElement.clientWidth || window.innerWidth
    ),
    clientHeight: Math.min(
      window.innerHeight,
      document.documentElement.clientHeight || window.innerHeight
    ),
    scale: uiScale,
  });
}

export function resolveToolbarDockEdge(
  pointer: ContentToolbarPosition,
  viewport: { width: number; height: number }
): ContentToolbarDockEdge | null {
  const distances = {
    top: Math.abs(pointer.y),
    bottom: Math.abs(viewport.height - pointer.y),
    left: Math.abs(pointer.x),
    right: Math.abs(viewport.width - pointer.x),
  };
  const cornerLimit = TOOLBAR_DOCK_ZONE_SIZE + TOOLBAR_DOCK_INSET;
  if (distances.left <= cornerLimit && distances.top <= cornerLimit)
    return distances.left < distances.top ? 'left-top' : 'top-left';
  if (distances.right <= cornerLimit && distances.top <= cornerLimit)
    return distances.right < distances.top ? 'right-top' : 'top-right';
  if (distances.left <= cornerLimit && distances.bottom <= cornerLimit)
    return distances.left < distances.bottom ? 'left-bottom' : 'bottom-left';
  if (distances.right <= cornerLimit && distances.bottom <= cornerLimit)
    return distances.right < distances.bottom ? 'right-bottom' : 'bottom-right';
  const withinHorizontalZone =
    pointer.x >= viewport.width / 3 && pointer.x <= (viewport.width * 2) / 3;
  const withinVerticalZone =
    pointer.y >= viewport.height / 3 && pointer.y <= (viewport.height * 2) / 3;
  const eligible = TOOLBAR_DOCK_EDGES.filter(
    (edge) =>
      (edge === 'top' || edge === 'bottom' ? withinHorizontalZone : withinVerticalZone) &&
      distances[edge] <= TOOLBAR_DOCK_ZONE_SIZE + TOOLBAR_DOCK_INSET
  );
  return eligible.reduce<ToolbarDockSide | null>(
    (nearest, candidate) =>
      nearest === null || distances[candidate] < distances[nearest] ? candidate : nearest,
    null
  );
}

export function resolveToolbarDockPosition(
  edge: ContentToolbarDockEdge,
  toolbar: { width: number; height: number },
  viewport: { width: number; height: number }
): ContentToolbarPosition {
  const maxX = Math.max(0, viewport.width - toolbar.width);
  const maxY = Math.max(0, viewport.height - toolbar.height);
  const insetX = Math.min(TOOLBAR_DOCK_INSET, maxX / 2);
  const rightInset = Math.min(TOOLBAR_DOCK_INSET + TOOLBAR_DOCK_SCROLLBAR_GAP, maxX / 2);
  const insetY = Math.min(TOOLBAR_DOCK_INSET, maxY / 2);
  const left = edge === 'left' || edge.startsWith('left-') || edge.endsWith('-left');
  const right = edge === 'right' || edge.startsWith('right-') || edge.endsWith('-right');
  const top = edge === 'top' || edge.startsWith('top-') || edge.endsWith('-top');
  const bottom = edge === 'bottom' || edge.startsWith('bottom-') || edge.endsWith('-bottom');
  return {
    x: left ? insetX : right ? maxX - rightInset : maxX / 2,
    y: top ? insetY : bottom ? maxY - insetY : maxY / 2,
  };
}
