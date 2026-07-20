import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getErrorMessage } from '../../../platform/runtime-messaging';
import { loadSettings } from '../../../composition/persistence/settings';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { classifyTabRuntimeCapability } from '../../../features/tab-capabilities/runtime';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { enableScreenshotMode } from '../tab-mode-router-screenshot';
import {
  ensureActivePageAccessRuntime,
  ensureNativeVisibleCaptureAuthority,
} from '../page-access/service';
import {
  CONTEXT_MENU_EXPORT_COPY_JSON_ID,
  CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID,
  CONTEXT_MENU_EXPORT_START_ID,
  CONTEXT_MENU_SCREENSHOTS_PREPARE_ID,
  CONTEXT_MENU_VIDEO_AREA_ID,
  CONTEXT_MENU_VIDEO_PRESET_ID,
  CONTEXT_MENU_VIDEO_TAB_ID,
  CONTEXT_MENU_VIDEO_WINDOW_ID,
} from './constants';
import { copyContextMenuPageLink } from './page-link/actions';
import { parsePageLinkCopyFormat } from './page-link/constants';
import {
  copyContextMenuExportPreview,
  handlePageContextMenuAction,
  isTabBoundContextMenuAction,
  resolveContextMenuVideoPreset,
  showContextMenuToast,
  startContextMenuExport,
  startContextMenuVideoRecording,
} from './action-helpers';
import { handleQuickAction } from '../../capture/routes';
import type { ViewportOwnerState } from '../../routing-contracts/tab-mode-state';

const logger = createLogger({ namespace: 'BackgroundContextMenuActions' });

type ViewportState = Map<number, { width: number; height: number } | null>;
type CaptureGuardState = { isCapturing: boolean };
type ContextMenuTab = chrome.tabs.Tab & { id: number };

export interface BackgroundContextMenuActionDeps {
  captureGuardState: CaptureGuardState;
  screenshotModeState: Map<number, boolean>;
  viewportOwnerState: ViewportOwnerState;
  viewportState: ViewportState;
}

function requireTab(tab?: chrome.tabs.Tab): ContextMenuTab {
  if (!tab?.id) {
    throw new Error(translate('popup.common.noActiveTab'));
  }

  return { ...tab, id: tab.id };
}

type TabBoundContextMenuActionArgs = {
  deps: BackgroundContextMenuActionDeps;
  menuId: string;
  pageUrl?: string;
  tab: chrome.tabs.Tab;
  tabId: number;
};

function isPageRuntimeDependentContextMenuAction(menuId: string): boolean {
  return (
    menuId === CONTEXT_MENU_SCREENSHOTS_PREPARE_ID ||
    menuId === CONTEXT_MENU_VIDEO_TAB_ID ||
    menuId === CONTEXT_MENU_VIDEO_AREA_ID ||
    menuId === CONTEXT_MENU_VIDEO_PRESET_ID ||
    menuId === CONTEXT_MENU_EXPORT_START_ID ||
    menuId === CONTEXT_MENU_EXPORT_COPY_JSON_ID ||
    menuId === CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID ||
    parsePageLinkCopyFormat(menuId) !== null
  );
}

async function ensureContextMenuPageRuntime(args: {
  menuId: string;
  tab: chrome.tabs.Tab;
  tabId: number;
}): Promise<void> {
  if (!isPageRuntimeDependentContextMenuAction(args.menuId)) {
    return;
  }

  if (classifyTabRuntimeCapability(args.tab) !== TabRuntimeCapability.Regular) {
    return;
  }

  await ensureActivePageAccessRuntime(args.tabId);
}

async function handlePageLinkContextMenuAction(
  args: TabBoundContextMenuActionArgs
): Promise<boolean> {
  const pageLinkFormat = parsePageLinkCopyFormat(args.menuId);
  if (!pageLinkFormat) {
    return false;
  }

  await copyContextMenuPageLink({
    format: pageLinkFormat,
    ...(args.pageUrl ? { pageUrl: args.pageUrl } : {}),
    tab: args.tab,
    tabId: args.tabId,
  });
  return true;
}

async function handleTabBoundContextMenuAction(
  args: TabBoundContextMenuActionArgs
): Promise<boolean> {
  if (await handlePageLinkContextMenuAction(args)) {
    return true;
  }

  switch (args.menuId) {
    case CONTEXT_MENU_SCREENSHOTS_PREPARE_ID:
      await enableScreenshotMode(
        args.tabId,
        args.deps.screenshotModeState,
        args.deps.viewportState,
        args.deps.viewportOwnerState
      );
      return true;

    case CONTEXT_MENU_VIDEO_TAB_ID:
      await startContextMenuVideoRecording(args.tabId, CaptureMode.TAB);
      return true;

    case CONTEXT_MENU_VIDEO_AREA_ID:
      await startContextMenuVideoRecording(args.tabId, CaptureMode.TAB_CROP);
      return true;

    case CONTEXT_MENU_VIDEO_PRESET_ID:
      await startContextMenuVideoRecording(args.tabId, CaptureMode.VIEWPORT_EMULATION);
      return true;

    case CONTEXT_MENU_VIDEO_WINDOW_ID:
      await startContextMenuVideoRecording(args.tabId, CaptureMode.SCREEN);
      return true;

    case CONTEXT_MENU_EXPORT_START_ID:
      await startContextMenuExport(args.tabId);
      return true;

    case CONTEXT_MENU_EXPORT_COPY_JSON_ID:
      await copyContextMenuExportPreview(args.tabId, 'json');
      return true;

    case CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID:
      await copyContextMenuExportPreview(args.tabId, 'markdown');
      return true;

    default:
      return false;
  }
}

export async function handleBackgroundContextMenuAction(args: {
  deps: BackgroundContextMenuActionDeps;
  menuId: string;
  pageUrl?: string;
  tab?: chrome.tabs.Tab;
}): Promise<void> {
  const pageActionHandled = await handlePageContextMenuAction(args.menuId);
  if (pageActionHandled) {
    return;
  }

  if (!isTabBoundContextMenuAction(args.menuId)) {
    return;
  }

  const tab = requireTab(args.tab);
  const tabId = tab.id;

  await ensureContextMenuPageRuntime({
    menuId: args.menuId,
    tab,
    tabId,
  });

  await handleTabBoundContextMenuAction({
    deps: args.deps,
    menuId: args.menuId,
    ...(args.pageUrl ? { pageUrl: args.pageUrl } : {}),
    tab,
    tabId,
  });
}

export async function handleBackgroundContextMenuQuickAction(args: {
  actionId: string;
  deps: BackgroundContextMenuActionDeps;
  tab?: chrome.tabs.Tab;
}): Promise<void> {
  const tab = requireTab(args.tab);
  const tabId = tab.id;

  if (classifyTabRuntimeCapability(tab) === TabRuntimeCapability.Regular) {
    await ensureActivePageAccessRuntime(tabId);
  }

  await handleQuickAction({
    actionId: args.actionId,
    captureGuardState: args.deps.captureGuardState,
    pageAccessPort: { ensureActivePageAccessRuntime, ensureNativeVisibleCaptureAuthority },
    screenshotModeState: args.deps.screenshotModeState,
    tab,
    tabId,
    viewportState: args.deps.viewportState,
  });
}

export async function showBackgroundContextMenuError(args: {
  error: unknown;
  tab?: chrome.tabs.Tab;
}): Promise<void> {
  if (!args.tab?.id) {
    logger.warn('Context menu action failed without an active tab', args.error);
    return;
  }

  const message = getErrorMessage(args.error, translate('content.runtime.unknownError'));
  await showContextMenuToast(args.tab.id, {
    message,
    title: translate('common.states.error'),
    type: 'error',
  }).catch((toastError) => {
    logger.warn('Failed to show context menu error toast', toastError);
  });
}

export async function hasContextMenuVideoPreset(): Promise<boolean> {
  const settings = await loadSettings();
  const preset = await resolveContextMenuVideoPreset(settings);
  return preset !== null;
}
