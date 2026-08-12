import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

export type ToolbarPopoverMenu =
  | 'auto-blur'
  | 'annotations-export'
  | 'capture'
  | 'full-page'
  | 'frame-style'
  | 'future-callout'
  | 'future-step-badge'
  | 'mode'
  | 'recording-auto-hide'
  | 'recording-camera'
  | 'recording-microphone'
  | 'recording-spotlight'
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

let escapeOwner: (() => void) | null = null;

export function registerToolbarMenuEscapeOwner(owner: () => void): () => void {
  escapeOwner = owner;
  return () => {
    if (escapeOwner === owner) escapeOwner = null;
  };
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
  const activeMenuTypeRef = useRef(activeMenuType);
  activeMenuTypeRef.current = activeMenuType;

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      const menu = activeMenuTypeRef.current;
      if (event.key !== 'Escape' || menu === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (escapeOwner) {
        escapeOwner();
      } else {
        setActiveMenuType(null);
      }
    };

    window.addEventListener('keydown', handleEscape, { capture: true });
    return () => window.removeEventListener('keydown', handleEscape, { capture: true });
  }, []);

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
