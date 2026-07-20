import { translate } from '../../platform/i18n';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { classifyTabRuntimeCapability } from './runtime';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type {
  ActiveTabCapabilities,
  CapabilityState,
} from '@sniptale/runtime-contracts/tab-capabilities/types';
import { describeRestrictedPage, isOwnedSnapshotViewerPage, isRestrictedBrowserPage } from './url';

function getVideoModeLabel(mode: CaptureMode): string {
  switch (mode) {
    case CaptureMode.TAB:
      return translate('popup.labels.captureModeTab');
    case CaptureMode.TAB_CROP:
      return translate('popup.labels.captureModeArea');
    case CaptureMode.CAMERA:
      return translate('popup.video.modeCameraLabel');
    case CaptureMode.VIEWPORT_EMULATION:
      return translate('popup.labels.captureModePreset');
    case CaptureMode.SCREEN:
      return translate('popup.labels.captureModeScreen');
  }
}

function createUnsupported(reason: string): CapabilityState {
  return {
    supported: false,
    reason,
  };
}

function createSupported(): CapabilityState {
  return {
    supported: true,
    reason: null,
  };
}

function getRestrictedPageLabel(url: string | null | undefined): string {
  return describeRestrictedPage(url) ?? translate('popup.common.browserPageLabel');
}

function createMissingTabCapabilities(): ActiveTabCapabilities {
  const reason = translate('popup.common.noActiveTab');
  const unsupported = createUnsupported(reason);

  return {
    tabId: null,
    url: null,
    title: null,
    isRestrictedPage: false,
    restrictedPageLabel: null,
    screenshotMode: unsupported,
    quickActions: unsupported,
    export: unsupported,
    videoByMode: {
      [CaptureMode.TAB]: unsupported,
      [CaptureMode.TAB_CROP]: unsupported,
      [CaptureMode.CAMERA]: createSupported(),
      [CaptureMode.VIEWPORT_EMULATION]: unsupported,
      [CaptureMode.SCREEN]: unsupported,
    },
  };
}

function buildRestrictedScreenshotReason(pageLabel: string): string {
  return [
    translate('popup.home.screenshotUnavailablePrefix'),
    pageLabel + '.',
    translate('popup.common.openRegularSite'),
  ].join(' ');
}

function buildRestrictedQuickActionsReason(pageLabel: string): string {
  return [
    translate('popup.home.quickActionsUnavailablePrefix'),
    pageLabel + '.',
    translate('popup.common.openRegularSite'),
  ].join(' ');
}

function buildRestrictedExportReason(pageLabel: string): string {
  return `${translate('popup.export.unavailablePrefix')} ${pageLabel}. ${translate('popup.common.openRegularSite')}`;
}

function buildRestrictedVideoReason(mode: CaptureMode, pageLabel: string): string {
  return [
    translate('popup.labels.modeUnavailablePrefix'),
    `"${getVideoModeLabel(mode)}"`,
    translate('popup.labels.modeUnavailableMiddle'),
    pageLabel + '.',
    translate('popup.labels.modeUnavailableSuffix'),
  ].join(' ');
}

export function getScreenshotModeCapability(tab?: chrome.tabs.Tab | null): CapabilityState {
  if (!tab?.id) {
    return createUnsupported(translate('popup.common.noActiveTab'));
  }

  if (classifyTabRuntimeCapability(tab) === TabRuntimeCapability.Restricted) {
    return createUnsupported(buildRestrictedScreenshotReason(getRestrictedPageLabel(tab.url)));
  }

  return createSupported();
}

export function getQuickActionCapability(tab?: chrome.tabs.Tab | null): CapabilityState {
  if (!tab?.id) {
    return createUnsupported(translate('popup.common.noActiveTab'));
  }

  if (classifyTabRuntimeCapability(tab) === TabRuntimeCapability.Restricted) {
    return createUnsupported(buildRestrictedQuickActionsReason(getRestrictedPageLabel(tab.url)));
  }

  return createSupported();
}

export function getExportCapability(tab?: chrome.tabs.Tab | null): CapabilityState {
  if (!tab?.id) {
    return createUnsupported(translate('popup.common.noActiveTab'));
  }

  if (classifyTabRuntimeCapability(tab) === TabRuntimeCapability.Restricted) {
    return createUnsupported(buildRestrictedExportReason(getRestrictedPageLabel(tab.url)));
  }

  return createSupported();
}

export function getVideoCaptureModeCapability(
  mode: CaptureMode,
  tab?: chrome.tabs.Tab | null
): CapabilityState {
  if (!tab?.id) {
    return createUnsupported(translate('popup.common.noActiveTab'));
  }

  if (mode === CaptureMode.SCREEN) {
    return createSupported();
  }

  if (mode === CaptureMode.CAMERA) {
    return createSupported();
  }

  if (isRestrictedBrowserPage(tab.url)) {
    return createUnsupported(buildRestrictedVideoReason(mode, getRestrictedPageLabel(tab.url)));
  }

  return createSupported();
}

export function getTabCapabilities(tab?: chrome.tabs.Tab | null): ActiveTabCapabilities {
  if (!tab?.id) {
    return createMissingTabCapabilities();
  }

  const restrictedPageLabel =
    isRestrictedBrowserPage(tab.url) && !isOwnedSnapshotViewerPage(tab.url)
      ? getRestrictedPageLabel(tab.url)
      : null;

  return {
    tabId: tab.id,
    url: tab.url ?? null,
    title: tab.title ?? null,
    isRestrictedPage: restrictedPageLabel !== null,
    restrictedPageLabel,
    screenshotMode: getScreenshotModeCapability(tab),
    quickActions: getQuickActionCapability(tab),
    export: getExportCapability(tab),
    videoByMode: {
      [CaptureMode.TAB]: getVideoCaptureModeCapability(CaptureMode.TAB, tab),
      [CaptureMode.TAB_CROP]: getVideoCaptureModeCapability(CaptureMode.TAB_CROP, tab),
      [CaptureMode.CAMERA]: getVideoCaptureModeCapability(CaptureMode.CAMERA, tab),
      [CaptureMode.VIEWPORT_EMULATION]: getVideoCaptureModeCapability(
        CaptureMode.VIEWPORT_EMULATION,
        tab
      ),
      [CaptureMode.SCREEN]: getVideoCaptureModeCapability(CaptureMode.SCREEN, tab),
    },
  };
}
