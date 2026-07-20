import { useCallback, useEffect } from 'react';
import { useToolbarMenuDismissal } from '../menu/dismissal';
import { getToolbarMenuPosition } from '../menu/position';
import { useToolbarMenuRefs } from '../menu/refs';
import type { ToolbarCapturePopoverMenu, ToolbarMenuState } from '../state/menu';

function closeToolbarMenus(
  except: ToolbarCapturePopoverMenu | null,
  state: ToolbarMenuState,
  refs: ReturnType<typeof useToolbarMenuRefs>
) {
  if (except !== 'capture') {
    state.setShowCaptureMenu(false);
  }
  if (except !== 'timer') {
    state.setShowTimerMenu(false);
  }
  if (except !== 'viewport') {
    refs.viewportSelectorRef.current?.closeMenu();
    state.setViewportMenuOpen(false);
  }
  state.setActiveMenuType(except);
}

function useViewportMenuSync(state: ToolbarMenuState, refs: ReturnType<typeof useToolbarMenuRefs>) {
  useEffect(() => {
    if (state.activeMenuType !== 'viewport') {
      refs.viewportSelectorRef.current?.closeMenu();
    }
  }, [refs.viewportSelectorRef, state.activeMenuType]);
}

function useCaptureMenuDismissal(
  state: ToolbarMenuState,
  refs: ReturnType<typeof useToolbarMenuRefs>,
  closeMenus: (except?: ToolbarCapturePopoverMenu | null) => void
) {
  useToolbarMenuDismissal({
    activeMenuType: state.activeMenuType,
    closeMenus,
    viewportWrapperRef: refs.viewportWrapperRef,
    showCaptureMenu: state.showCaptureMenu,
    showTimerMenu: state.showTimerMenu,
    viewportMenuOpen: state.viewportMenuOpen,
    captureDropdownMenuRef: refs.captureDropdownMenuRef,
    timerDropdownMenuRef: refs.timerDropdownMenuRef,
    viewportSelectorRef: refs.viewportSelectorRef,
    timerMenuRef: refs.timerMenuRef,
    captureMenuRef: refs.captureMenuRef,
  });
}

export function useToolbarCaptureMenus(state: ToolbarMenuState) {
  const refs = useToolbarMenuRefs();

  const getMenuPosition = useCallback(
    (buttonRef: React.RefObject<HTMLButtonElement | null>, menuHeight = 280): 'up' | 'down' => {
      return getToolbarMenuPosition(buttonRef.current, menuHeight);
    },
    []
  );

  const getViewportMenuPosition = useCallback(
    (menuHeight = 320): 'up' | 'down' => {
      return getToolbarMenuPosition(refs.viewportWrapperRef.current, menuHeight);
    },
    [refs.viewportWrapperRef]
  );

  const closeMenus = useCallback(
    (except: ToolbarCapturePopoverMenu | null = null) => {
      closeToolbarMenus(except, state, refs);
    },
    [refs, state]
  );

  useViewportMenuSync(state, refs);
  useCaptureMenuDismissal(state, refs, closeMenus);

  return {
    ...state,
    ...refs,
    getMenuPosition,
    getViewportMenuPosition,
    closeMenus,
  };
}
