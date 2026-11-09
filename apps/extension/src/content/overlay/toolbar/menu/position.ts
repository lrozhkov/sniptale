import { resolveToolbarDropdownState } from './dropdown';

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

/** Resolves the shared end-aligned layout for recording toolbar menus. */
export function resolveRecordingToolbarMenuLayout(
  args: Pick<
    Parameters<typeof resolveToolbarDropdownState>[0],
    'anchorRef' | 'displayMode' | 'menuHeight' | 'menuWidth'
  >
) {
  const dropdown = resolveToolbarDropdownState({
    ...args,
    getMenuPosition: (ref, height = 280) => getToolbarMenuPosition(ref.current, height),
    preferredAlign: 'end',
  });
  return { placement: dropdown.menuPlacement, style: dropdown.style };
}
