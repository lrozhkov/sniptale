import { ContentToolbarDivider, ContentToolbarGroup } from '@sniptale/ui/content-toolbar';
import type { ToolbarCaptureActionsProps } from '../types';
import { ToolbarHistoryControls } from './history';
import { ToolbarCaptureButtons } from './options';
import { ToolbarSettingsMenu } from './settings';
import { ToolbarCaptureMenuGroup } from './menu-group';
import type { useToolbarCaptureMenus } from './use-menus';

export function ToolbarCaptureActionGroup(
  props: ToolbarCaptureActionsProps & {
    menus: ReturnType<typeof useToolbarCaptureMenus>;
    onSelectCaptureAction: (action: ToolbarCaptureActionsProps['captureAction']) => Promise<void>;
  }
) {
  const { menus, onSelectCaptureAction, ...captureProps } = props;

  return (
    <>
      <ContentToolbarDivider />
      <ContentToolbarGroup>
        <ToolbarCaptureButtons onTakeScreenshot={captureProps.onTakeScreenshot} />
      </ContentToolbarGroup>
      <ContentToolbarDivider />
      <ContentToolbarGroup>
        <ToolbarCaptureMenuGroup
          {...captureProps}
          menus={menus}
          onSelectCaptureAction={onSelectCaptureAction}
        />
      </ContentToolbarGroup>
      {captureProps.screenshotMode ? (
        <>
          <ContentToolbarDivider dataUi="content.toolbar.history-divider-before" />
          <ContentToolbarGroup dataUi="content.toolbar.history-group">
            <ToolbarHistoryControls screenshotMode={captureProps.screenshotMode} />
          </ContentToolbarGroup>
          <ContentToolbarDivider dataUi="content.toolbar.history-divider-after" />
        </>
      ) : null}
      <ContentToolbarGroup dataUi="content.toolbar.settings-group">
        <ToolbarSettingsMenu
          compactMenus={captureProps.compactMenus}
          pinToTab={captureProps.pinToTab}
          pinToTabLocked={captureProps.pinToTabLocked}
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
