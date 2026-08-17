import { browserCommands } from '@sniptale/platform/browser/commands';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';
import type { ToolbarWorkingMode } from '@sniptale/runtime-contracts/messaging/message-types';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { loadScreenshotCaptureRuntimeContext } from '../../capture/quick-actions/flow/load';
import { selectAndCaptureDesktopQuickAction } from '../../capture/quick-actions/desktop/workflow';
import { handleQuickAction } from '../../capture/routes';
import {
  openGalleryPage,
  openImageEditorPage,
  openScenarioEditorPage,
  openVideoEditorPage,
} from '../../../platform/navigation/extension-pages';
import { classifyTabRuntimeCapability } from '../../../features/tab-capabilities/runtime';
import {
  ensureActivePageAccessRuntime,
  ensureNativeVisibleCaptureAuthority,
} from '../../page-access/service';
import { startContextMenuExport, showContextMenuToast } from '../context-menu/action-helpers';
import { enableScreenshotMode } from '../tab-mode-router-screenshot';
import type { BackgroundModeState } from '../routing/runtime-wiring/shared';
import { translate } from '../../../platform/i18n';

export const extensionCommandIds = [
  'tools-open',
  'tools-drawing',
  'tools-annotations',
  'tools-quick-edit',
  'tools-design-review',
  'tools-video-recording',
  'capture-visible',
  'capture-full-page',
  'capture-selection',
  'capture-visible-edit',
  'capture-visible-copy',
  'capture-desktop-edit',
  'export-current-tab',
  'open-library',
  'open-image-editor',
  'open-video-editor',
  'open-scenario-editor',
] as const;

export type ExtensionCommandId = (typeof extensionCommandIds)[number];

const logger = createLogger({ namespace: 'BackgroundCommands' });

const toolbarModes = {
  'tools-open': undefined,
  'tools-drawing': 'drawing',
  'tools-annotations': 'highlighter',
  'tools-quick-edit': 'quick-edit',
  'tools-design-review': 'design-review',
  'tools-video-recording': 'video-recording',
} satisfies Partial<Record<ExtensionCommandId, ToolbarWorkingMode | undefined>>;

const captureConfigs = {
  'capture-visible': buildCaptureConfig('visible'),
  'capture-full-page': buildCaptureConfig('full'),
  'capture-selection': buildCaptureConfig('selection'),
  'capture-visible-edit': buildCaptureConfig('visible', 'edit'),
  'capture-visible-copy': buildCaptureConfig('visible', 'copy'),
  'capture-desktop-edit': buildCaptureConfig('desktop', 'edit'),
} satisfies Partial<Record<ExtensionCommandId, ScreenshotCaptureConfig>>;

function buildCaptureConfig(
  screenshotMode: ScreenshotCaptureConfig['screenshotMode'],
  afterCapture: ScreenshotCaptureConfig['afterCapture'] = 'download_default'
): ScreenshotCaptureConfig {
  return {
    afterCapture,
    delay: null,
    exitAfterCapture: false,
    imageFormat: afterCapture === 'copy' ? 'png' : null,
    imageQuality: null,
    screenshotMode,
    viewportPresetId: null,
  };
}

function parseExtensionCommand(command: string): ExtensionCommandId | null {
  return extensionCommandIds.includes(command as ExtensionCommandId)
    ? (command as ExtensionCommandId)
    : null;
}

async function requireCommandTab(tab?: chrome.tabs.Tab): Promise<chrome.tabs.Tab & { id: number }> {
  const candidate =
    typeof tab?.id === 'number'
      ? tab
      : (await browserTabs.query({ active: true, currentWindow: true }))[0];
  if (typeof candidate?.id !== 'number') throw new Error(translate('popup.common.noActiveTab'));
  return { ...candidate, id: candidate.id };
}

async function ensureCommandPageRuntime(tab: chrome.tabs.Tab & { id: number }): Promise<void> {
  if (classifyTabRuntimeCapability(tab) === TabRuntimeCapability.Regular) {
    await ensureActivePageAccessRuntime(tab.id);
  }
}

async function openToolbarFromCommand(
  command: keyof typeof toolbarModes,
  state: BackgroundModeState,
  tab?: chrome.tabs.Tab
): Promise<void> {
  const target = await requireCommandTab(tab);
  await ensureCommandPageRuntime(target);
  const workingMode = toolbarModes[command];
  await enableScreenshotMode(
    target.id,
    state.screenshotModeState,
    state.viewportState,
    state.viewportOwnerState,
    state.webSnapshotViewerPorts,
    workingMode === undefined ? {} : { workingMode }
  );
}

async function runCaptureFromCommand(
  command: keyof typeof captureConfigs,
  state: BackgroundModeState,
  tab?: chrome.tabs.Tab
): Promise<void> {
  const target = await requireCommandTab(tab);
  const config = captureConfigs[command];
  const runtimeContext = await loadScreenshotCaptureRuntimeContext(config);
  await ensureCommandPageRuntime(target);
  const desktopSelection =
    config.screenshotMode === 'desktop'
      ? await selectAndCaptureDesktopQuickAction({
          context: runtimeContext,
          tabId: target.id,
          targetTab: target,
        })
      : undefined;
  const result = await handleQuickAction({
    actionId: `command:${command}`,
    captureGuardState: state.captureGuardState,
    pageAccessPort: { ensureActivePageAccessRuntime, ensureNativeVisibleCaptureAuthority },
    screenshotModeState: state.screenshotModeState,
    tab: target,
    tabId: target.id,
    viewportState: state.viewportState,
    webSnapshotViewerPorts: state.webSnapshotViewerPorts,
    runtimeContext,
    ...(desktopSelection === undefined ? {} : { desktopSelection }),
  });
  if (result.result === 'failed') throw new Error(result.error);
  if (result.result === 'blocked') throw new Error('capture-blocked');
}

async function exportCurrentTab(tab?: chrome.tabs.Tab): Promise<void> {
  const target = await requireCommandTab(tab);
  await ensureCommandPageRuntime(target);
  await startContextMenuExport(target.id);
}

async function runExtensionCommand(
  command: ExtensionCommandId,
  state: BackgroundModeState,
  tab?: chrome.tabs.Tab
): Promise<void> {
  switch (command) {
    case 'tools-open':
    case 'tools-drawing':
    case 'tools-annotations':
    case 'tools-quick-edit':
    case 'tools-design-review':
    case 'tools-video-recording':
      await openToolbarFromCommand(command, state, tab);
      return;
    case 'capture-visible':
    case 'capture-full-page':
    case 'capture-selection':
    case 'capture-visible-edit':
    case 'capture-visible-copy':
    case 'capture-desktop-edit':
      await runCaptureFromCommand(command, state, tab);
      return;
    case 'export-current-tab':
      await exportCurrentTab(tab);
      return;
    case 'open-library':
      await openGalleryPage();
      return;
    case 'open-image-editor':
      await openImageEditorPage();
      return;
    case 'open-video-editor':
      await openVideoEditorPage();
      return;
    case 'open-scenario-editor':
      await openScenarioEditorPage();
      return;
  }
}

async function reportCommandFailure(
  command: ExtensionCommandId,
  error: unknown,
  tab?: chrome.tabs.Tab
): Promise<void> {
  logger.error('Extension command failed', { command, error });
  if (typeof tab?.id !== 'number') return;
  await showContextMenuToast(tab.id, {
    message: translate('background.runtime.commandFailed'),
    title: translate('common.states.error'),
    type: 'error',
  }).catch((toastError) => logger.warn('Failed to show command error', toastError));
}

export function registerExtensionCommandListener(state: BackgroundModeState): () => void {
  return browserCommands.subscribeToCommand((rawCommand, tab) => {
    const command = parseExtensionCommand(rawCommand);
    if (!command) return;
    void runExtensionCommand(command, state, tab).catch((error) => {
      void reportCommandFailure(command, error, tab);
    });
  });
}

export { runExtensionCommand };
