import { PanelBottomClose, Pin, PinOff } from 'lucide-react';
import {
  ContentToolbarButton,
  ContentToolbarDivider,
  ContentToolbarGroup,
} from '@sniptale/ui/content-toolbar';
import { translate } from '../../../../platform/i18n';
import { createTrustedContentActionIntentSource } from '../../../application/privileged-action-intent';
import type { ToolbarCaptureActionsProps } from '../types';
import { ToolbarHistoryControls } from './history';
import { ToolbarCaptureButtons } from './options';
import { ToolbarSettingsMenu } from './settings';
import { ToolbarCaptureMenuGroup } from './menu-group';
import type { useToolbarCaptureMenus } from './use-menus';

function NavigationToolbarActions(props: ToolbarCaptureActionsProps) {
  const pinned = props.pinToTab || props.pinToTabLocked;
  const pinTitle = props.autoBlurEnabled
    ? translate('content.toolbar.pinToTabAutoBlurLockedHint')
    : props.pinToTabLocked
      ? translate('content.toolbar.pinToTabLockedHint')
      : !props.pinToTabAvailable
        ? translate('content.toolbar.pinToTabUnavailableHint')
        : translate('content.toolbar.pinToTab');

  return (
    <>
      <ContentToolbarButton
        type="button"
        active={pinned}
        aria-pressed={pinned}
        dataUi="content.toolbar.navigation.pin-to-tab"
        disabled={props.pinToTabLocked || !props.pinToTabAvailable}
        title={pinTitle}
        onClick={(event) => {
          event.stopPropagation();
          props.onPinToTabChange(
            !props.pinToTab,
            createTrustedContentActionIntentSource(event.nativeEvent) ?? undefined
          );
        }}
      >
        {pinned ? <Pin size={18} strokeWidth={2} /> : <PinOff size={18} strokeWidth={2} />}
      </ContentToolbarButton>
      <ContentToolbarButton
        type="button"
        dataUi="content.toolbar.navigation.collapse"
        title={translate('content.toolbar.hideToolbar')}
        onClick={(event) => {
          event.stopPropagation();
          props.onClose();
        }}
      >
        <PanelBottomClose size={18} strokeWidth={2} />
      </ContentToolbarButton>
    </>
  );
}

export function ToolbarCaptureActionGroup(
  props: ToolbarCaptureActionsProps & {
    menus: ReturnType<typeof useToolbarCaptureMenus>;
    onSelectCaptureAction: (action: ToolbarCaptureActionsProps['captureAction']) => Promise<void>;
  }
) {
  const { menus, onSelectCaptureAction, ...captureProps } = props;

  return (
    <>
      <ContentToolbarDivider
        className="sniptale-capture-leading-divider"
        dataUi="content.toolbar.capture-leading-divider"
      />
      <ContentToolbarGroup>
        <ToolbarCaptureButtons
          compactMenus={captureProps.compactMenus}
          currentViewport={captureProps.currentViewport}
          displayMode={captureProps.displayMode}
          isLoading={captureProps.isLoading}
          onTakeScreenshot={captureProps.onTakeScreenshot}
          toolbarMenuState={captureProps.toolbarMenuState}
        />
      </ContentToolbarGroup>
      <ContentToolbarDivider />
      <ContentToolbarGroup>
        <ToolbarCaptureMenuGroup
          {...captureProps}
          menus={menus}
          onSelectCaptureAction={onSelectCaptureAction}
        />
      </ContentToolbarGroup>
      {!captureProps.videoRecordingMode &&
      (captureProps.screenshotMode ||
        captureProps.canClearPagePreparation ||
        captureProps.isNavigationMode) ? (
        <>
          <ContentToolbarDivider dataUi="content.toolbar.history-divider-before" />
          <ContentToolbarGroup dataUi="content.toolbar.history-group">
            <ToolbarHistoryControls
              screenshotMode={captureProps.screenshotMode}
              displayMode={captureProps.displayMode}
              toolbarMenuState={captureProps.toolbarMenuState}
              isNavigationMode={captureProps.isNavigationMode ?? false}
              canClearPagePreparation={captureProps.canClearPagePreparation ?? false}
              resetScope={captureProps.resetScope ?? 'all'}
              {...(captureProps.onClearPagePreparation === undefined
                ? {}
                : { onClearPagePreparation: captureProps.onClearPagePreparation })}
            />
          </ContentToolbarGroup>
          <ContentToolbarDivider dataUi="content.toolbar.history-divider-after" />
        </>
      ) : null}
      <ContentToolbarGroup dataUi="content.toolbar.settings-group">
        {captureProps.isNavigationMode ? <NavigationToolbarActions {...captureProps} /> : null}
        <ToolbarSettingsMenu
          compactMenus={captureProps.compactMenus}
          pinToTab={captureProps.pinToTab}
          pinToTabAvailable={captureProps.pinToTabAvailable}
          pinToTabLocked={captureProps.pinToTabLocked}
          autoBlurEnabled={captureProps.autoBlurEnabled ?? false}
          showPinItem={!captureProps.isNavigationMode}
          showHideItem={!captureProps.isNavigationMode}
          sidebarVisible={captureProps.scenario?.sidebarVisible ?? false}
          screenshotMode={captureProps.screenshotMode}
          displayMode={captureProps.displayMode}
          toolbarMenuState={captureProps.toolbarMenuState}
          onCompactMenusChange={captureProps.onCompactMenusChange}
          onClose={captureProps.onClose}
          onDisableScreenshotMode={captureProps.onDisableScreenshotMode}
          onDisplayModeChange={captureProps.onDisplayModeChange}
          onPinToTabChange={captureProps.onPinToTabChange}
        />
      </ContentToolbarGroup>
    </>
  );
}
