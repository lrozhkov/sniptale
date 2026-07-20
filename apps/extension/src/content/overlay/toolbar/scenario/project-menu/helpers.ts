import type { CSSProperties, RefObject } from 'react';
import { useEffect, useLayoutEffect, useState } from 'react';
import type { ContentToolbarDisplayMode } from '../../../../../contracts/settings';
import { isContentEventWithinElement } from '../../../../platform/dom-host';
import {
  getThemedPortalStyle,
  useContentPortalTheme,
  Z_INDEX_FLOATING_UI,
} from '../../../../selection/interactive-frame/layout/portal';

const SCENARIO_PROJECT_MENU_WIDTH = 352;
const MENU_VIEWPORT_PADDING = 16;
const MENU_SIDE_GAP = 10;
const MENU_VERTICAL_GAP = 12;
const MENU_MAX_HEIGHT_PADDING = 24;
const SIDEBAR_RESERVED_WIDTH = 348;
const MENU_HEIGHT_ESTIMATE = 420;

export function useScenarioProjectMenuDismissal(params: {
  isOpen: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const { isOpen, menuRef, onClose, triggerRef } = params;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const isWithinMenu = (event: Event) =>
      isContentEventWithinElement(event, menuRef.current) ||
      isContentEventWithinElement(event, triggerRef.current);

    const handlePointerDown = (event: PointerEvent) => {
      if (!isWithinMenu(event)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleResize = () => {
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape, true);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, menuRef, onClose, triggerRef]);
}

function resolveScenarioProjectMenuTop(anchorRect: DOMRect): number {
  const preferredTop = anchorRect.bottom + MENU_VERTICAL_GAP;
  const maxTop = window.innerHeight - MENU_HEIGHT_ESTIMATE - MENU_VIEWPORT_PADDING;

  if (preferredTop <= maxTop) {
    return preferredTop;
  }

  return Math.max(MENU_VIEWPORT_PADDING, anchorRect.top - MENU_HEIGHT_ESTIMATE - MENU_VERTICAL_GAP);
}

function resolveScenarioProjectMenuLeft(anchorRect: DOMRect, sidebarVisible: boolean): number {
  const reservedRight = sidebarVisible ? SIDEBAR_RESERVED_WIDTH : 0;
  const minLeft = MENU_VIEWPORT_PADDING;
  const maxLeft = Math.max(
    minLeft,
    window.innerWidth - reservedRight - SCENARIO_PROJECT_MENU_WIDTH - MENU_VIEWPORT_PADDING
  );
  const preferredLeft = anchorRect.right - SCENARIO_PROJECT_MENU_WIDTH;

  return Math.min(Math.max(preferredLeft, minLeft), maxLeft);
}

function clampValue(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function resolveVerticalScenarioProjectMenuTop(anchorRect: DOMRect): number {
  return clampValue(
    anchorRect.top,
    MENU_VIEWPORT_PADDING,
    window.innerHeight - MENU_HEIGHT_ESTIMATE - MENU_VIEWPORT_PADDING
  );
}

function resolveVerticalScenarioProjectMenuLeft(
  anchorRect: DOMRect,
  sidebarVisible: boolean
): number {
  const reservedRight = sidebarVisible ? SIDEBAR_RESERVED_WIDTH : 0;
  const minLeft = MENU_VIEWPORT_PADDING;
  const maxLeft = Math.max(
    minLeft,
    window.innerWidth - reservedRight - SCENARIO_PROJECT_MENU_WIDTH - MENU_VIEWPORT_PADDING
  );
  const preferredRightLeft = anchorRect.right + MENU_SIDE_GAP;
  const preferredLeftLeft = anchorRect.left - SCENARIO_PROJECT_MENU_WIDTH - MENU_SIDE_GAP;
  const spaceRight = window.innerWidth - reservedRight - anchorRect.right - MENU_VIEWPORT_PADDING;
  const spaceLeft = anchorRect.left - MENU_VIEWPORT_PADDING;

  if (spaceRight >= SCENARIO_PROJECT_MENU_WIDTH || spaceRight >= spaceLeft) {
    return clampValue(preferredRightLeft, minLeft, maxLeft);
  }

  return clampValue(preferredLeftLeft, minLeft, maxLeft);
}

function resolveScenarioProjectMenuPosition(params: {
  anchorRect: DOMRect;
  displayMode: ContentToolbarDisplayMode;
  sidebarVisible: boolean;
}) {
  if (params.displayMode === 'vertical') {
    return {
      left: resolveVerticalScenarioProjectMenuLeft(params.anchorRect, params.sidebarVisible),
      top: resolveVerticalScenarioProjectMenuTop(params.anchorRect),
    };
  }

  return {
    left: resolveScenarioProjectMenuLeft(params.anchorRect, params.sidebarVisible),
    top: resolveScenarioProjectMenuTop(params.anchorRect),
  };
}

export function useScenarioProjectMenuStyle(params: {
  anchorEl: HTMLButtonElement | null;
  displayMode: ContentToolbarDisplayMode;
  isOpen: boolean;
  sidebarVisible: boolean;
}) {
  const { anchorEl, displayMode, isOpen, sidebarVisible } = params;
  const theme = useContentPortalTheme(anchorEl);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !anchorEl) {
      setMenuStyle(null);
      return;
    }

    const updateMenuStyle = () => {
      const anchorRect = anchorEl.getBoundingClientRect();
      const position = resolveScenarioProjectMenuPosition({
        anchorRect,
        displayMode,
        sidebarVisible,
      });
      const nextStyle = getThemedPortalStyle(theme, {
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: SCENARIO_PROJECT_MENU_WIDTH,
        maxHeight: `calc(100vh - ${MENU_MAX_HEIGHT_PADDING * 2}px)`,
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: Z_INDEX_FLOATING_UI,
      });

      setMenuStyle(nextStyle ?? null);
    };

    updateMenuStyle();

    window.addEventListener('resize', updateMenuStyle);
    document.addEventListener('scroll', updateMenuStyle, true);

    return () => {
      window.removeEventListener('resize', updateMenuStyle);
      document.removeEventListener('scroll', updateMenuStyle, true);
    };
  }, [anchorEl, displayMode, isOpen, sidebarVisible, theme]);

  return menuStyle;
}
