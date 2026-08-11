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

export type PopupPage = 'home' | 'video' | 'export';

const GITHUB_REPOSITORY_URL = 'https://github.com/lrozhkov/sniptale';

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

export function openGallery() {
  void browserTabs.create({ url: runtimeInfo.getURL('apps/extension/src/gallery/index.html') });
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
    const desktopSelection: DesktopScreenshotSelection = {
      status: 'cancelled',
      requestId: prepareResponse.requestId,
      reservationToken: prepareResponse.reservationToken,
    };
    await getPopupRuntimeServices().messaging.sendRuntimeMessage(
      'actionId' in preparation
        ? {
            type: MessageType.TRIGGER_QUICK_ACTION,
            actionId: preparation.actionId,
            desktopSelection,
            tabId,
          }
        : {
            type: MessageType.TRIGGER_SCREENSHOT_CAPTURE,
            config: preparation.config,
            desktopSelection,
            tabId,
          }
    );
    throw new Error(selection.error);
  }
  return {
    status: 'selected',
    requestId: prepareResponse.requestId,
    reservationToken: prepareResponse.reservationToken,
    streamId: selection.selection.streamId,
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
