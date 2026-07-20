import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

export type ToolbarPopoverMenu =
  | 'auto-blur'
  | 'capture'
  | 'mode'
  | 'scenario-mode'
  | 'scenario-project'
  | 'settings'
  | 'timer'
  | 'viewport';
export type ToolbarCapturePopoverMenu = Extract<
  ToolbarPopoverMenu,
  'capture' | 'timer' | 'viewport'
>;

export interface ToolbarMenuState {
  activeMenuType: ToolbarPopoverMenu | null;
  showCaptureMenu: boolean;
  showTimerMenu: boolean;
  viewportMenuOpen: boolean;
  closeMenu: (menu: ToolbarPopoverMenu) => void;
  closeMenus: (except?: ToolbarPopoverMenu | null) => void;
  setActiveMenuType: (menu: ToolbarPopoverMenu | null) => void;
  setShowCaptureMenu: (next: boolean) => void;
  setShowTimerMenu: (next: boolean) => void;
  setViewportMenuOpen: (next: boolean) => void;
  toggleMenu: (menu: ToolbarPopoverMenu) => void;
}

function setMenuOpen(
  setActiveMenuType: Dispatch<SetStateAction<ToolbarPopoverMenu | null>>,
  menu: ToolbarPopoverMenu,
  next: boolean
) {
  setActiveMenuType((current) => {
    if (next) {
      return menu;
    }

    return current === menu ? null : current;
  });
}

export function useToolbarMenuState(): ToolbarMenuState {
  const [activeMenuType, setActiveMenuType] = useState<ToolbarPopoverMenu | null>(null);
  const closeMenu = useCallback((menu: ToolbarPopoverMenu) => {
    setMenuOpen(setActiveMenuType, menu, false);
  }, []);
  const closeMenus = useCallback((except: ToolbarPopoverMenu | null = null) => {
    setActiveMenuType(except);
  }, []);
  const toggleMenu = useCallback((menu: ToolbarPopoverMenu) => {
    setActiveMenuType((current) => (current === menu ? null : menu));
  }, []);
  const setShowCaptureMenu = useCallback((next: boolean) => {
    setMenuOpen(setActiveMenuType, 'capture', next);
  }, []);
  const setShowTimerMenu = useCallback((next: boolean) => {
    setMenuOpen(setActiveMenuType, 'timer', next);
  }, []);
  const setViewportMenuOpen = useCallback((next: boolean) => {
    setMenuOpen(setActiveMenuType, 'viewport', next);
  }, []);

  return {
    activeMenuType,
    showCaptureMenu: activeMenuType === 'capture',
    showTimerMenu: activeMenuType === 'timer',
    viewportMenuOpen: activeMenuType === 'viewport',
    closeMenu,
    closeMenus,
    setActiveMenuType,
    setShowCaptureMenu,
    setShowTimerMenu,
    setViewportMenuOpen,
    toggleMenu,
  };
}
