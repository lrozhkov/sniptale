import { Camera } from 'lucide-react';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createSecureRandomUuid as createEditorSessionId } from '@sniptale/platform/security/secure-random-id';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';
import { buildScenarioEditorUrl } from '../../../platform/navigation/extension-pages/scenario-editor';
import { getPopupResponseErrorMessage } from '../../diagnostics/runtime-errors';
import { getActiveTabId } from '../tab-access';
import { ICON_MAP } from '../home/quick-actions/meta';
import { getPopupRuntimeServices } from '../runtime/services';
export {
  formatHotkeyShort,
  getQuickActionColor,
  getQuickActionMeta,
} from '../home/quick-actions/meta';
export {
  describeCaptureSource,
  formatDuration,
  getCaptureModeLabels,
  getRecordingStatusLabel,
  getViewportPresetLabel,
  IDLE_RECORDING_STATE,
} from '../../recording/video/copy';

export type PopupPage = 'home' | 'video' | 'export';

const GITHUB_REPOSITORY_URL = 'https://github.com/lrozhkov/sniptale';

export function DynamicIcon({ name, color }: { name: string; color?: string }) {
  const Icon = ICON_MAP[name] || Camera;
  return <Icon className="h-4 w-4" style={color ? { color } : undefined} />;
}

export async function openScreenshotMode() {
  const tabId = await getActiveTabId();
  const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    tabId,
  });

  if (response?.success === false) {
    throw new Error(getPopupResponseErrorMessage(response, 'popup.home.openPrepError'));
  }

  window.close();
}

export function openImageEditor() {
  void browserTabs.create({
    url: buildEditorUrl({
      sessionId: createEditorSessionId(),
    }),
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

export async function triggerQuickAction(actionId: string) {
  const tabId = await getActiveTabId();
  const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.TRIGGER_QUICK_ACTION,
    actionId,
    tabId,
  });

  if (response?.success === false) {
    throw new Error(getPopupResponseErrorMessage(response, 'popup.home.triggerQuickActionError'));
  }

  window.close();
}
