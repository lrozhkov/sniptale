import { ToolbarCaptureActionMenu, ToolbarTimerMenu, ToolbarViewportMenu } from './menus';
import type { ToolbarCaptureActionsProps } from '../types';
import { getCaptureActionIcon, getCaptureActionOptions, getTimerOptions } from './options';
import type { useToolbarCaptureMenus } from './use-menus';

function CaptureActionMenuNode(props: {
  menus: ReturnType<typeof useToolbarCaptureMenus>;
  captureAction: ToolbarCaptureActionsProps['captureAction'];
  compactMenus: boolean;
  displayMode: ToolbarCaptureActionsProps['displayMode'];
  onSelectCaptureAction: (action: ToolbarCaptureActionsProps['captureAction']) => Promise<void>;
  viewportRightInset: number;
}) {
  const { menus, captureAction, compactMenus, displayMode, onSelectCaptureAction } = props;

  return (
    <ToolbarCaptureActionMenu
      showCaptureMenu={menus.showCaptureMenu}
      captureMenuRef={menus.captureMenuRef}
      captureDropdownMenuRef={menus.captureDropdownMenuRef}
      captureButtonRef={menus.captureButtonRef}
      captureAction={captureAction}
      captureActionOptions={getCaptureActionOptions()}
      compactMenus={compactMenus}
      closeMenus={menus.closeMenus}
      displayMode={displayMode}
      setShowCaptureMenu={menus.setShowCaptureMenu}
      getMenuPosition={menus.getMenuPosition}
      getCaptureActionIcon={() => getCaptureActionIcon(captureAction)}
      onSelect={(value) => void onSelectCaptureAction(value as typeof captureAction)}
      viewportRightInset={props.viewportRightInset}
    />
  );
}

function TimerMenuNode(props: {
  menus: ReturnType<typeof useToolbarCaptureMenus>;
  compactMenus: boolean;
  displayMode: ToolbarCaptureActionsProps['displayMode'];
  timerDelay: number;
  onTimerDelayChange: (delay: number) => void;
  viewportRightInset: number;
}) {
  const { menus, compactMenus, displayMode, timerDelay, onTimerDelayChange } = props;

  return (
    <ToolbarTimerMenu
      showTimerMenu={menus.showTimerMenu}
      timerMenuRef={menus.timerMenuRef}
      timerDropdownMenuRef={menus.timerDropdownMenuRef}
      timerButtonRef={menus.timerButtonRef}
      compactMenus={compactMenus}
      displayMode={displayMode}
      timerDelay={timerDelay}
      timerOptions={getTimerOptions()}
      closeMenus={menus.closeMenus}
      setShowTimerMenu={menus.setShowTimerMenu}
      getMenuPosition={menus.getMenuPosition}
      onTimerDelayChange={onTimerDelayChange}
      viewportRightInset={props.viewportRightInset}
    />
  );
}

export function ToolbarCaptureMenuGroup(
  props: ToolbarCaptureActionsProps & {
    menus: ReturnType<typeof useToolbarCaptureMenus>;
    onSelectCaptureAction: (action: ToolbarCaptureActionsProps['captureAction']) => Promise<void>;
  }
) {
  const { menus, onSelectCaptureAction, ...captureProps } = props;
  const viewportRightInset = captureProps.scenario?.sidebarVisible ? 348 : 0;
  const viewportMenu = (
    <ToolbarViewportMenu
      compactMenus={captureProps.compactMenus}
      screenshotMode={captureProps.screenshotMode}
      displayMode={captureProps.displayMode}
      viewportWrapperRef={menus.viewportWrapperRef}
      viewportSelectorRef={menus.viewportSelectorRef}
      currentViewport={captureProps.currentViewport}
      onViewportChange={captureProps.onViewportChange}
      isLoading={captureProps.isLoading}
      getViewportMenuPosition={menus.getViewportMenuPosition}
      setViewportMenuOpen={menus.setViewportMenuOpen}
      closeMenus={menus.closeMenus}
      activeMenuType={menus.activeMenuType}
      setActiveMenuType={menus.setActiveMenuType}
    />
  );

  return (
    <>
      <CaptureActionMenuNode
        menus={menus}
        captureAction={captureProps.captureAction}
        compactMenus={captureProps.compactMenus}
        displayMode={captureProps.displayMode}
        onSelectCaptureAction={onSelectCaptureAction}
        viewportRightInset={viewportRightInset}
      />
      <TimerMenuNode
        menus={menus}
        compactMenus={captureProps.compactMenus}
        displayMode={captureProps.displayMode}
        timerDelay={captureProps.timerDelay}
        onTimerDelayChange={captureProps.onTimerDelayChange}
        viewportRightInset={viewportRightInset}
      />
      {viewportMenu}
    </>
  );
}
