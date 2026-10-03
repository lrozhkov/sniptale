import type {
  ContentToolbarDockEdge,
  ContentToolbarPosition,
} from '../../../../contracts/settings';

export const TOOLBAR_DOCK_INSET = 8;
export const TOOLBAR_DOCK_ZONE_SIZE = 64;
export const TOOLBAR_DOCK_EDGES: readonly ContentToolbarDockEdge[] = [
  'top',
  'bottom',
  'left',
  'right',
];

export function getToolbarDockDisplayMode(edge: ContentToolbarDockEdge) {
  return edge === 'left' || edge === 'right' ? 'vertical' : 'horizontal';
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
  const withinHorizontalZone =
    pointer.x >= viewport.width / 3 && pointer.x <= (viewport.width * 2) / 3;
  const withinVerticalZone =
    pointer.y >= viewport.height / 3 && pointer.y <= (viewport.height * 2) / 3;
  const eligible = TOOLBAR_DOCK_EDGES.filter(
    (edge) =>
      (edge === 'top' || edge === 'bottom' ? withinHorizontalZone : withinVerticalZone) &&
      distances[edge] <= TOOLBAR_DOCK_ZONE_SIZE + TOOLBAR_DOCK_INSET
  );
  return eligible.reduce<ContentToolbarDockEdge | null>(
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
  const insetY = Math.min(TOOLBAR_DOCK_INSET, maxY / 2);
  return {
    x: edge === 'left' ? insetX : edge === 'right' ? maxX - insetX : maxX / 2,
    y: edge === 'top' ? insetY : edge === 'bottom' ? maxY - insetY : maxY / 2,
  };
}
