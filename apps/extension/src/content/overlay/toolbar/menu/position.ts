import {
  projectClientRectToContentUi,
  readContentUiScaleCompensation,
  resolveContentUiViewport,
} from '@sniptale/ui/floating-interactions/scale';

const TOOLBAR_MENU_VERTICAL_CLEARANCE_PX = 18;

export function getToolbarMenuPosition(
  anchor: HTMLElement | null,
  menuHeight: number,
  fallback: 'up' | 'down' = 'down'
): 'up' | 'down' {
  if (!anchor) {
    return fallback;
  }

  const uiScale = readContentUiScaleCompensation(anchor);
  const clientRect = anchor.getBoundingClientRect();
  const rect = projectClientRectToContentUi(
    { x: clientRect.left, y: clientRect.top, width: clientRect.width, height: clientRect.height },
    uiScale
  );
  const viewport = resolveContentUiViewport({
    clientHeight: window.innerHeight,
    clientWidth: window.innerWidth,
    scale: uiScale,
  });
  const spaceBelow = viewport.height - rect.y - rect.height;
  const spaceAbove = rect.y;
  return spaceBelow < menuHeight + TOOLBAR_MENU_VERTICAL_CLEARANCE_PX && spaceAbove > spaceBelow
    ? 'up'
    : 'down';
}
