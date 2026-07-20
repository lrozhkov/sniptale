import React from 'react';

import { ViewportSelector, type ViewportSelectorRef } from '../../viewport-selector';
import { CaptureActionDropdown, TimerDropdown } from './dropdowns';
import { ToolbarTimerToggle } from './timer-toggle';
import { ToolbarCaptureActionToggle } from './toggle';
import type { ToolbarCapturePopoverMenu, ToolbarPopoverMenu } from '../state/menu';

type ToolbarCaptureActionMenuProps = {
  showCaptureMenu: boolean;
  captureMenuRef: React.RefObject<HTMLDivElement | null>;
  captureDropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  captureButtonRef: React.RefObject<HTMLButtonElement | null>;
  captureAction: string;
  compactMenus: boolean;
  captureActionOptions: Array<{
    value: string;
    label: string;
    hint: string;
    icon: React.ReactNode;
  }>;
  closeMenus: (except?: ToolbarCapturePopoverMenu | null) => void;
  displayMode: 'horizontal' | 'vertical';
  setShowCaptureMenu: (next: boolean) => void;
  getMenuPosition: (
    buttonRef: React.RefObject<HTMLButtonElement | null>,
    menuHeight?: number
  ) => 'up' | 'down';
  getCaptureActionIcon: () => React.ReactNode;
  onSelect: (value: string) => void;
  viewportRightInset?: number;
};

export function ToolbarCaptureActionMenu(props: ToolbarCaptureActionMenuProps) {
  const {
    showCaptureMenu,
    captureMenuRef,
    captureDropdownMenuRef,
    captureButtonRef,
    captureAction,
    compactMenus,
    captureActionOptions,
    closeMenus,
    displayMode,
    setShowCaptureMenu,
    getMenuPosition,
    getCaptureActionIcon,
    onSelect,
  } = props;

  return (
    <div
      className="sniptale-capture-action-wrapper"
      ref={captureMenuRef as React.Ref<HTMLDivElement>}
    >
      <ToolbarCaptureActionToggle
        buttonRef={captureButtonRef}
        showCaptureMenu={showCaptureMenu}
        closeMenus={closeMenus}
        setShowCaptureMenu={setShowCaptureMenu}
        getCaptureActionIcon={getCaptureActionIcon}
      />

      {showCaptureMenu ? (
        <CaptureActionDropdown
          captureDropdownMenuRef={captureDropdownMenuRef}
          captureButtonRef={captureButtonRef}
          captureAction={captureAction}
          captureActionOptions={captureActionOptions}
          compactMenus={compactMenus}
          displayMode={displayMode}
          getMenuPosition={getMenuPosition}
          onSelect={onSelect}
          {...(props.viewportRightInset === undefined
            ? {}
            : { viewportRightInset: props.viewportRightInset })}
        />
      ) : null}
    </div>
  );
}

type ToolbarTimerMenuProps = {
  showTimerMenu: boolean;
  timerMenuRef: React.RefObject<HTMLDivElement | null>;
  timerDropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  timerButtonRef: React.RefObject<HTMLButtonElement | null>;
  compactMenus: boolean;
  displayMode: 'horizontal' | 'vertical';
  timerDelay: number;
  timerOptions: ReadonlyArray<{ value: number; label: string; hint: string }>;
  closeMenus: (except?: ToolbarCapturePopoverMenu | null) => void;
  setShowTimerMenu: (next: boolean) => void;
  getMenuPosition: (
    buttonRef: React.RefObject<HTMLButtonElement | null>,
    menuHeight?: number
  ) => 'up' | 'down';
  onTimerDelayChange: (delay: number) => void;
  viewportRightInset?: number;
};

export function ToolbarTimerMenu(props: ToolbarTimerMenuProps) {
  const {
    showTimerMenu,
    timerMenuRef,
    timerDropdownMenuRef,
    timerButtonRef,
    compactMenus,
    displayMode,
    timerDelay,
    timerOptions,
    closeMenus,
    setShowTimerMenu,
    getMenuPosition,
    onTimerDelayChange,
  } = props;

  return (
    <div className="sniptale-timer-wrapper" ref={timerMenuRef as React.Ref<HTMLDivElement>}>
      <ToolbarTimerToggle
        buttonRef={timerButtonRef}
        showTimerMenu={showTimerMenu}
        timerDelay={timerDelay}
        closeMenus={closeMenus}
        setShowTimerMenu={setShowTimerMenu}
      />

      {showTimerMenu ? (
        <TimerDropdown
          timerDropdownMenuRef={timerDropdownMenuRef}
          timerButtonRef={timerButtonRef}
          compactMenus={compactMenus}
          displayMode={displayMode}
          getMenuPosition={getMenuPosition}
          timerDelay={timerDelay}
          timerOptions={timerOptions}
          closeMenus={closeMenus}
          onTimerDelayChange={onTimerDelayChange}
          {...(props.viewportRightInset === undefined
            ? {}
            : { viewportRightInset: props.viewportRightInset })}
        />
      ) : null}
    </div>
  );
}

type ToolbarViewportMenuProps = {
  compactMenus: boolean;
  displayMode: 'horizontal' | 'vertical';
  screenshotMode: boolean;
  viewportWrapperRef: React.RefObject<HTMLDivElement | null>;
  viewportSelectorRef: React.RefObject<ViewportSelectorRef | null>;
  currentViewport: { width: number; height: number } | null;
  onViewportChange: (viewport: { width: number; height: number } | null) => void;
  isLoading: boolean;
  getViewportMenuPosition: (menuHeight?: number) => 'up' | 'down';
  setViewportMenuOpen: (isOpen: boolean) => void;
  closeMenus: (except?: ToolbarCapturePopoverMenu | null) => void;
  activeMenuType: ToolbarPopoverMenu | null;
  setActiveMenuType: (menu: ToolbarPopoverMenu | null) => void;
};

export function ToolbarViewportMenu(props: ToolbarViewportMenuProps) {
  const {
    screenshotMode,
    viewportWrapperRef,
    viewportSelectorRef,
    currentViewport,
    onViewportChange,
    isLoading,
    getViewportMenuPosition,
    setViewportMenuOpen,
    closeMenus,
    activeMenuType,
    setActiveMenuType,
  } = props;
  if (!screenshotMode) {
    return null;
  }
  return (
    <div ref={viewportWrapperRef as React.Ref<HTMLDivElement>}>
      <ViewportSelector
        ref={viewportSelectorRef as React.Ref<ViewportSelectorRef>}
        compactMenus={props.compactMenus}
        currentViewport={currentViewport}
        displayMode={props.displayMode}
        onViewportChange={onViewportChange}
        disabled={isLoading}
        menuPosition={getViewportMenuPosition(360)}
        onMenuStateChange={createViewportMenuStateChangeHandler({
          activeMenuType,
          closeMenus,
          setActiveMenuType,
          setViewportMenuOpen,
        })}
      />
    </div>
  );
}

function createViewportMenuStateChangeHandler(args: {
  activeMenuType: ToolbarPopoverMenu | null;
  closeMenus: (except?: ToolbarCapturePopoverMenu | null) => void;
  setActiveMenuType: (menu: ToolbarPopoverMenu | null) => void;
  setViewportMenuOpen: (isOpen: boolean) => void;
}) {
  return (isOpen: boolean) => {
    args.setViewportMenuOpen(isOpen);
    if (isOpen) {
      args.closeMenus('viewport');
    } else if (args.activeMenuType === 'viewport') {
      args.setActiveMenuType(null);
    }
  };
}
