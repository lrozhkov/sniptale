import {
  Blocks,
  Camera,
  Film,
  FileStack,
  Github,
  Image,
  Images,
  Play,
  Settings2,
  Video,
  Zap,
} from 'lucide-react';
import { isDesignSystemEnabled } from '../../../platform/config/design-system-access';
import { translate } from '../../../platform/i18n';
import { getQuickActionDisplayName } from '../../../features/quick-actions-presets/catalog';
import type { CommandPaletteAction } from '../../../ui/command-palette/types';
import {
  commandPaletteIcon,
  createCommandPaletteNavigationAction,
  createCommandPaletteRunAction,
  createCommandPaletteUtilityAction,
} from '../../../ui/command-palette/action-builders';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { PopupCommandPaletteRuntime } from '../runtime/types/command-palette';
import {
  formatHotkeyShort,
  getQuickActionMeta,
  openDesignSystem,
  openGallery,
  openGithubRepository,
  openImageEditor,
  openScenarioEditor,
  openScreenshotMode,
  openSettings,
  openVideoEditor,
  triggerQuickAction,
} from '../navigation/actions';

function getPopupStartDisabledReason(runtime: PopupCommandPaletteRuntime): string | undefined {
  const currentModeCapability =
    runtime.environment.activeTabCapabilities.videoByMode[runtime.recording.videoCaptureMode];
  const pageAccessDisabledReason = getPageAccessDisabledReasonForCaptureMode(runtime);

  return currentModeCapability.reason ?? pageAccessDisabledReason;
}

function getPageAccessDisabledReason(runtime: PopupCommandPaletteRuntime): string | undefined {
  return runtime.environment.pageAccess?.disabledReason ?? undefined;
}

function isPageAccessChoiceActive(runtime: PopupCommandPaletteRuntime): boolean {
  return (
    runtime.environment.pageAccess?.status?.supported === true &&
    !runtime.environment.pageAccess.status.currentTabActive
  );
}

function getPageAccessDisabledReasonForCaptureMode(
  runtime: PopupCommandPaletteRuntime
): string | undefined {
  if (
    runtime.recording.videoCaptureMode === CaptureMode.TAB ||
    runtime.recording.videoCaptureMode === CaptureMode.TAB_CROP ||
    runtime.recording.videoCaptureMode === CaptureMode.VIEWPORT_EMULATION
  ) {
    return getPageAccessDisabledReason(runtime);
  }

  return undefined;
}

function buildPopupNavigationActions(runtime: PopupCommandPaletteRuntime): CommandPaletteAction[] {
  const section = translate('shared.ui.commandPaletteNavigationSection');
  const currentPage = runtime.navigation.page;
  const pageAccessDisabledReason = getPageAccessDisabledReason(runtime);

  return [
    createCommandPaletteNavigationAction({
      id: 'popup-page-home',
      title: translate('popup.tabs.home'),
      section,
      icon: commandPaletteIcon(Camera),
      active: currentPage === 'home',
      onSelect: () => runtime.navigation.setPage('home'),
    }),
    createCommandPaletteNavigationAction({
      id: 'popup-page-video',
      title: translate('popup.tabs.video'),
      section,
      icon: commandPaletteIcon(Video),
      active: currentPage === 'video',
      onSelect: () => runtime.navigation.setPage('video'),
    }),
    createCommandPaletteNavigationAction({
      id: 'popup-page-export',
      title: translate('popup.tabs.export'),
      section,
      icon: commandPaletteIcon(Film),
      active: currentPage === 'export',
      disabled: Boolean(pageAccessDisabledReason),
      disabledReason: pageAccessDisabledReason,
      onSelect: () => {
        if (!pageAccessDisabledReason) {
          runtime.navigation.setPage('export');
        }
      },
    }),
  ];
}

function buildPopupPrimaryActions(runtime: PopupCommandPaletteRuntime): CommandPaletteAction[] {
  const pageAccessDisabledReason = getPageAccessDisabledReason(runtime);
  const screenshotDisabledReason =
    runtime.environment.activeTabCapabilities.screenshotMode.reason ?? pageAccessDisabledReason;
  const startDisabledReason = getPopupStartDisabledReason(runtime);

  return [
    buildPopupScreenshotAction(screenshotDisabledReason),
    buildPopupRecordingAction(runtime, startDisabledReason),
    ...buildPopupEditorActions(),
    buildPopupGalleryAction(runtime),
  ];
}

function buildPopupScreenshotAction(disabledReason: string | undefined): CommandPaletteAction {
  return createCommandPaletteRunAction({
    id: 'popup-open-screenshot',
    title: translate('popup.home.screenshotPrepLabel'),
    subtitle: translate('popup.home.screenshotPrepTitle'),
    section: translate('shared.ui.commandPaletteActionsSection'),
    icon: commandPaletteIcon(Camera),
    disabled: Boolean(disabledReason),
    disabledReason,
    onSelect: openScreenshotMode,
  });
}

function buildPopupRecordingAction(
  runtime: PopupCommandPaletteRuntime,
  disabledReason: string | undefined
): CommandPaletteAction {
  return createCommandPaletteRunAction({
    id: 'popup-start-recording',
    title: translate('popup.video.startButton'),
    subtitle: translate('popup.video.startTitle'),
    section: translate('shared.ui.commandPaletteActionsSection'),
    icon: commandPaletteIcon(Play),
    disabled: Boolean(disabledReason) || runtime.recording.isStartPending,
    disabledReason,
    onSelect: runtime.recording.handleStartRecording,
  });
}

function buildPopupEditorActions(): CommandPaletteAction[] {
  const section = translate('shared.ui.commandPaletteActionsSection');

  return [
    createCommandPaletteRunAction({
      id: 'popup-open-image-editor',
      title: translate('popup.home.imageEditorLabel'),
      subtitle: translate('popup.home.imageEditorTitle'),
      section,
      icon: commandPaletteIcon(Image),
      onSelect: openImageEditor,
    }),
    createCommandPaletteRunAction({
      id: 'popup-open-scenario-editor',
      title: translate('popup.home.scenarioEditorLabel'),
      subtitle: translate('popup.home.scenarioEditorTitle'),
      section,
      icon: commandPaletteIcon(FileStack),
      onSelect: openScenarioEditor,
    }),
    createCommandPaletteRunAction({
      id: 'popup-open-video-editor',
      title: translate('popup.video.videoEditorLabel'),
      subtitle: translate('popup.video.videoEditorTitle'),
      section,
      icon: commandPaletteIcon(Film),
      onSelect: openVideoEditor,
    }),
  ];
}

function buildPopupGalleryAction(runtime: PopupCommandPaletteRuntime): CommandPaletteAction {
  return createCommandPaletteRunAction({
    id: 'popup-open-gallery',
    title: translate('popup.home.galleryLabel'),
    subtitle: runtime.environment.galleryStatus?.text ?? translate('popup.home.galleryTitle'),
    section: translate('shared.ui.commandPaletteActionsSection'),
    icon: commandPaletteIcon(Images),
    onSelect: openGallery,
  });
}

function buildPopupUtilityActions(): CommandPaletteAction[] {
  return [
    createCommandPaletteUtilityAction({
      id: 'popup-open-settings',
      title: translate('popup.common.footerSettings'),
      section: translate('shared.ui.commandPaletteUtilitySection'),
      icon: commandPaletteIcon(Settings2),
      onSelect: openSettings,
    }),
    ...(isDesignSystemEnabled()
      ? [
          createCommandPaletteUtilityAction({
            id: 'popup-open-design-system',
            title: translate('popup.common.footerDesignSystem'),
            section: translate('shared.ui.commandPaletteUtilitySection'),
            icon: commandPaletteIcon(Blocks),
            onSelect: openDesignSystem,
          }),
        ]
      : []),
    createCommandPaletteUtilityAction({
      id: 'popup-open-github',
      title: translate('popup.common.footerGithub'),
      section: translate('shared.ui.commandPaletteUtilitySection'),
      icon: commandPaletteIcon(Github),
      onSelect: openGithubRepository,
    }),
  ];
}

function buildPopupQuickActionEntries(runtime: PopupCommandPaletteRuntime): CommandPaletteAction[] {
  if (isPageAccessChoiceActive(runtime)) {
    return [];
  }

  const quickActionsDisabledReason =
    runtime.environment.activeTabCapabilities.quickActions.reason ?? undefined;

  return runtime.home.quickActions.map((action) =>
    createCommandPaletteRunAction({
      id: `popup-quick-action-${action.id}`,
      title: getQuickActionDisplayName(action),
      subtitle: getQuickActionMeta(action, runtime.home.viewportPresets),
      section: translate('popup.home.quickActionsTitle'),
      shortcut: action.hotkey ? formatHotkeyShort(action.hotkey) : undefined,
      icon: commandPaletteIcon(Zap),
      disabled: Boolean(quickActionsDisabledReason),
      disabledReason: quickActionsDisabledReason,
      onSelect: () => triggerQuickAction(action.id),
    })
  );
}

export function buildPopupCommandPaletteActions(
  runtime: PopupCommandPaletteRuntime
): CommandPaletteAction[] {
  return [
    ...buildPopupNavigationActions(runtime),
    ...buildPopupPrimaryActions(runtime),
    ...buildPopupUtilityActions(),
    ...buildPopupQuickActionEntries(runtime),
  ];
}
