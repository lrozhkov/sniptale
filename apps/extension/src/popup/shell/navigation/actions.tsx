import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import {
  MessageType,
  type ToolbarWorkingMode,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';
import { buildScenarioEditorUrl } from '../../../platform/navigation/extension-pages/scenario-editor';
import { getPopupResponseErrorMessage } from '../../diagnostics/runtime-errors';
import { getActiveTabId } from '../tab-access';
import { getPopupRuntimeServices } from '../../runtime-services';
import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';
import { chooseDesktopScreenshotSource } from '../../../platform/media-utils/desktop-capture-source-picker';
import type { DesktopScreenshotSelection } from '@sniptale/runtime-contracts/capture/action';
import { captureDesktopScreenshotFrame } from '../../../platform/media-utils/desktop-screenshot-frame';
import { openGalleryPage } from '../../../platform/navigation/extension-pages';

export type PopupPage = 'screenshots' | 'video' | 'menu' | 'tools' | 'export';

const GITHUB_REPOSITORY_URL = 'https://github.com/lrozhkov/sniptale';

async function cancelPreparedDesktopCapture(args: {
  preparation: { actionId: string } | { config: ScreenshotCaptureConfig };
  requestId: string;
  reservationToken: string;
  tabId: number;
}): Promise<void> {
  const desktopSelection: DesktopScreenshotSelection = {
    status: 'cancelled',
    requestId: args.requestId,
    reservationToken: args.reservationToken,
  };
  await getPopupRuntimeServices().messaging.sendRuntimeMessage(
    'actionId' in args.preparation
      ? {
          type: MessageType.TRIGGER_QUICK_ACTION,
          actionId: args.preparation.actionId,
          desktopSelection,
          tabId: args.tabId,
        }
      : {
          type: MessageType.TRIGGER_SCREENSHOT_CAPTURE,
          config: args.preparation.config,
          desktopSelection,
          tabId: args.tabId,
        }
  );
}

export async function openScreenshotMode(workingMode?: ToolbarWorkingMode) {
  const tabId = await getActiveTabId();
  const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    tabId,
    ...(workingMode === undefined ? {} : { workingMode }),
  });

  if (response?.success === false) {
    throw new Error(getPopupResponseErrorMessage(response, 'popup.home.openPrepError'));
  }

  window.close();
}

export function openImageEditor() {
  void browserTabs.create({
    url: buildEditorUrl(),
  });
  window.close();
}

export function openLibrary(folder?: 'screenshot' | 'recording') {
  void openGalleryPage(folder ? { folder } : {});
  window.close();
}

export function openScenarioEditor() {
  void browserTabs.create({ url: buildScenarioEditorUrl() });
  window.close();
}

export function openDesignSystem() {
  void browserTabs.create({
    url: runtimeInfo.getURL('apps/extension/src/design-system/index.html'),
  });
  window.close();
}

export function openVideoEditor() {
  void browserTabs.create({
    url: runtimeInfo.getURL('apps/extension/src/video-editor/index.html'),
  });
  window.close();
}

export function openSettings() {
  void browserTabs.create({ url: runtimeInfo.getURL('apps/extension/src/settings/index.html') });
  window.close();
}

export function openGithubRepository() {
  void browserTabs.create({ url: GITHUB_REPOSITORY_URL });
  window.close();
}

async function choosePopupDesktopSource(
  enabled: boolean,
  tabId: number,
  preparation: { actionId: string } | { config: ScreenshotCaptureConfig }
): Promise<DesktopScreenshotSelection | undefined> {
  if (!enabled) return undefined;
  const prepareResponse = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE,
    ...preparation,
    tabId,
  });
  if (
    prepareResponse?.success !== true ||
    (prepareResponse.imageFormat !== 'png' &&
      prepareResponse.imageFormat !== 'jpeg' &&
      prepareResponse.imageFormat !== 'webp') ||
    typeof prepareResponse.imageQuality !== 'number' ||
    typeof prepareResponse.requestId !== 'string' ||
    typeof prepareResponse.reservationToken !== 'string'
  ) {
    throw new Error(getPopupResponseErrorMessage(prepareResponse, 'popup.home.captureError'));
  }
  const selection = await chooseDesktopScreenshotSource();
  if (selection.status === 'cancelled') {
    return {
      status: 'cancelled',
      requestId: prepareResponse.requestId,
      reservationToken: prepareResponse.reservationToken,
    };
  }
  if (selection.status === 'failed') {
    await cancelPreparedDesktopCapture({
      preparation,
      requestId: prepareResponse.requestId,
      reservationToken: prepareResponse.reservationToken,
      tabId,
    });
    throw new Error(selection.error);
  }
  let frame: Awaited<ReturnType<typeof captureDesktopScreenshotFrame>>;
  try {
    frame = await captureDesktopScreenshotFrame({
      streamId: selection.selection.streamId,
      imageFormat: prepareResponse.imageFormat,
      imageQuality: prepareResponse.imageQuality,
    });
  } catch (error) {
    await cancelPreparedDesktopCapture({
      preparation,
      requestId: prepareResponse.requestId,
      reservationToken: prepareResponse.reservationToken,
      tabId,
    });
    throw error;
  }
  return {
    status: 'selected',
    requestId: prepareResponse.requestId,
    reservationToken: prepareResponse.reservationToken,
    ...frame,
  };
}

export async function triggerQuickAction(actionId: string, desktop = false) {
  const tabId = await getActiveTabId();
  const desktopSelection = await choosePopupDesktopSource(desktop, tabId, { actionId });
  const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.TRIGGER_QUICK_ACTION,
    actionId,
    ...(desktopSelection === undefined ? {} : { desktopSelection }),
    tabId,
  });

  if (response?.success === false) {
    throw new Error(getPopupResponseErrorMessage(response, 'popup.home.triggerQuickActionError'));
  }

  if (desktopSelection?.status !== 'cancelled') window.close();
}

export async function triggerScreenshotCapture(config: ScreenshotCaptureConfig) {
  const tabId = await getActiveTabId();
  const desktopSelection = await choosePopupDesktopSource(
    config.screenshotMode === 'desktop',
    tabId,
    { config }
  );
  const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.TRIGGER_SCREENSHOT_CAPTURE,
    config,
    ...(desktopSelection === undefined ? {} : { desktopSelection }),
    tabId,
  });
  if (response?.success === false) {
    throw new Error(getPopupResponseErrorMessage(response, 'popup.home.captureError'));
  }
  if (desktopSelection?.status !== 'cancelled') window.close();
}
