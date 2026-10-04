import { useCallback, useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createToolbarMenuFocusOwner } from './menu-focus';

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
  | 'reset-confirm'
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

export function useToolbarMenuState(): ToolbarMenuState {
  const [activeMenuType, setMenuState] = useState<ToolbarPopoverMenu | null>(null);
  const activeMenuTypeRef = useRef(activeMenuType);
  const focusOwnerRef = useRef<ReturnType<typeof createToolbarMenuFocusOwner> | null>(null);
  if (!focusOwnerRef.current) focusOwnerRef.current = createToolbarMenuFocusOwner();
  const focusOwner = focusOwnerRef.current;
  const pendingRestore = useRef<ReturnType<typeof focusOwner.snapshot>>(null);
  const setActiveMenuType = useCallback(
    (next: ToolbarPopoverMenu | null) => {
      activeMenuTypeRef.current = next;
      focusOwner.setMenu(next);
      setMenuState(next);
    },
    [focusOwner]
  );
  useEffect(() => focusOwner.bind(), [focusOwner]);
  useLayoutEffect(() => {
    const snapshot = pendingRestore.current;
    pendingRestore.current = null;
    focusOwner.restore(snapshot);
  });

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      const menu = activeMenuTypeRef.current;
      if (event.key !== 'Escape' || menu === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const snapshot = focusOwner.snapshot();
      if (escapeOwner) escapeOwner();
      if (activeMenuTypeRef.current === menu) setActiveMenuType(null);
      pendingRestore.current = snapshot;
    };

    window.addEventListener('keydown', handleEscape, { capture: true });
    return () => window.removeEventListener('keydown', handleEscape, { capture: true });
  }, [focusOwner, setActiveMenuType]);

  const closeMenu = useCallback(
    (menu: ToolbarPopoverMenu) => {
      if (activeMenuTypeRef.current === menu) setActiveMenuType(null);
    },
    [setActiveMenuType]
  );
  const closeMenus = useCallback(
    (except: ToolbarPopoverMenu | null = null) => {
      setActiveMenuType(except);
    },
    [setActiveMenuType]
  );
  const toggleMenu = useCallback(
    (menu: ToolbarPopoverMenu) => {
      setActiveMenuType(activeMenuTypeRef.current === menu ? null : menu);
    },
    [setActiveMenuType]
  );
  const setShowCaptureMenu = useCallback(
    (next: boolean) => {
      if (next || activeMenuTypeRef.current === 'capture')
        setActiveMenuType(next ? 'capture' : null);
    },
    [setActiveMenuType]
  );
  const setShowTimerMenu = useCallback(
    (next: boolean) => {
      if (next || activeMenuTypeRef.current === 'timer') setActiveMenuType(next ? 'timer' : null);
    },
    [setActiveMenuType]
  );
  const setViewportMenuOpen = useCallback(
    (next: boolean) => {
      if (next || activeMenuTypeRef.current === 'viewport')
        setActiveMenuType(next ? 'viewport' : null);
    },
    [setActiveMenuType]
  );

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
