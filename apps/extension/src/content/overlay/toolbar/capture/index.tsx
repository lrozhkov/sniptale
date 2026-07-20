import React from 'react';
import { useAppLocale } from '../../../../platform/i18n';
import type { ToolbarCaptureActionsProps } from '../types';
import { ToolbarCaptureActionGroup } from './group';
import { useCaptureActionPersistence } from './persistence';
import { useToolbarCaptureMenus } from './use-menus';

export const ToolbarCaptureActions: React.FC<ToolbarCaptureActionsProps> = (props) => {
  useAppLocale();
  const menus = useToolbarCaptureMenus(props.toolbarMenuState);
  const handleSelectCaptureAction = useCaptureActionPersistence(
    props.captureAction,
    props.onCaptureActionChange,
    menus.closeMenus,
    props.onCaptureActionCommitted
  );

  return (
    <ToolbarCaptureActionGroup
      screenshotMode={props.screenshotMode}
      isLoading={props.isLoading}
      captureAction={props.captureAction}
      compactMenus={props.compactMenus}
      displayMode={props.displayMode}
      pinToTab={props.pinToTab}
      pinToTabLocked={props.pinToTabLocked}
      onCompactMenusChange={props.onCompactMenusChange}
      onDisplayModeChange={props.onDisplayModeChange}
      onPinToTabChange={props.onPinToTabChange}
      onCaptureActionChange={props.onCaptureActionChange}
      onClose={props.onClose}
      onDisableScreenshotMode={props.onDisableScreenshotMode}
      timerDelay={props.timerDelay}
      onTimerDelayChange={props.onTimerDelayChange}
      currentViewport={props.currentViewport}
      onViewportChange={props.onViewportChange}
      toolbarMenuState={props.toolbarMenuState}
      onTakeScreenshot={props.onTakeScreenshot}
      scenario={props.scenario}
      menus={menus}
      onSelectCaptureAction={handleSelectCaptureAction}
    />
  );
};
