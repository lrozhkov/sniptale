import type { BrowserContextMenuUpdateProperties } from '@sniptale/platform/browser/context-menus';
import { getTabCapabilities } from '../../../features/tab-capabilities/capabilities';
import { type ContextMenuSettings, type QuickAction } from '../../../contracts/settings';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  CONTEXT_MENU_EXPORT_ID,
  CONTEXT_MENU_SCREENSHOTS_ID,
  CONTEXT_MENU_VIDEO_AREA_ID,
  CONTEXT_MENU_VIDEO_ID,
  CONTEXT_MENU_VIDEO_PRESET_ID,
  CONTEXT_MENU_VIDEO_TAB_ID,
  CONTEXT_MENU_VIDEO_WINDOW_ID,
} from './constants';
import {
  CONTEXT_MENU_PAGE_LINK_ID,
  CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID,
  CONTEXT_MENU_PAGE_LINK_PLAIN_ID,
  CONTEXT_MENU_PAGE_LINK_RICH_ID,
} from './page-link/constants';
import { buildContextMenuDescriptors as buildContextMenuDescriptorsImpl } from './descriptors';

export { buildContextMenuDescriptorsImpl as buildContextMenuDescriptors };

const CONTEXT_MENU_CONTEXTS = [
  'all' as chrome.contextMenus.ContextType,
] as chrome.contextMenus.CreateProperties['contexts'];

export function getContextMenuContexts(): chrome.contextMenus.CreateProperties['contexts'] {
  return CONTEXT_MENU_CONTEXTS;
}

export function getEnabledContextMenuQuickActions(actions: QuickAction[]): QuickAction[] {
  return actions.filter((action) => action.status);
}

export function hasVisibleContextMenuItems(args: {
  quickActions: QuickAction[];
  settings: ContextMenuSettings;
}): boolean {
  return buildContextMenuDescriptorsImpl(args).length > 1;
}

function resolveVideoDynamicState(args: {
  capabilities: ReturnType<typeof getTabCapabilities>;
  hasVideoPreset: boolean;
  settings: ContextMenuSettings;
}): Record<string, BrowserContextMenuUpdateProperties> {
  const videoTabEnabled = args.capabilities.videoByMode[CaptureMode.TAB].supported;
  const videoAreaEnabled = args.capabilities.videoByMode[CaptureMode.TAB_CROP].supported;
  const videoPresetEnabled =
    args.hasVideoPreset && args.capabilities.videoByMode[CaptureMode.VIEWPORT_EMULATION].supported;
  const videoWindowEnabled = args.capabilities.videoByMode[CaptureMode.SCREEN].supported;
  const videoVisible =
    args.settings.showVideo &&
    (videoTabEnabled || videoAreaEnabled || videoPresetEnabled || videoWindowEnabled);

  return {
    [CONTEXT_MENU_VIDEO_ID]: {
      enabled: videoVisible,
      visible: videoVisible,
    },
    [CONTEXT_MENU_VIDEO_TAB_ID]: {
      enabled: videoTabEnabled,
      visible: args.settings.showVideo,
    },
    [CONTEXT_MENU_VIDEO_AREA_ID]: {
      enabled: videoAreaEnabled,
      visible: args.settings.showVideo,
    },
    [CONTEXT_MENU_VIDEO_PRESET_ID]: {
      enabled: videoPresetEnabled,
      visible: args.settings.showVideo,
    },
    [CONTEXT_MENU_VIDEO_WINDOW_ID]: {
      enabled: videoWindowEnabled,
      visible: args.settings.showVideo,
    },
  };
}

function resolvePageLinkDynamicState(args: {
  capabilities: ReturnType<typeof getTabCapabilities>;
  settings: ContextMenuSettings;
}): Record<string, BrowserContextMenuUpdateProperties> {
  const pageLinkVisible =
    args.settings.showPageLinkCopy &&
    !args.capabilities.isRestrictedPage &&
    Boolean(args.capabilities.url);

  return {
    [CONTEXT_MENU_PAGE_LINK_ID]: {
      enabled: pageLinkVisible,
      visible: pageLinkVisible,
    },
    [CONTEXT_MENU_PAGE_LINK_RICH_ID]: {
      enabled: pageLinkVisible,
      visible: pageLinkVisible,
    },
    [CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID]: {
      enabled: pageLinkVisible,
      visible: pageLinkVisible,
    },
    [CONTEXT_MENU_PAGE_LINK_PLAIN_ID]: {
      enabled: pageLinkVisible,
      visible: pageLinkVisible,
    },
  };
}

export function resolveContextMenuDynamicState(args: {
  hasVideoPreset: boolean;
  settings: ContextMenuSettings;
  tab?: chrome.tabs.Tab;
}): Record<string, BrowserContextMenuUpdateProperties> {
  const capabilities = getTabCapabilities(args.tab);

  return {
    [CONTEXT_MENU_SCREENSHOTS_ID]: {
      visible: args.settings.showScreenshots && capabilities.screenshotMode.supported,
    },
    ...resolveVideoDynamicState({
      capabilities,
      hasVideoPreset: args.hasVideoPreset,
      settings: args.settings,
    }),
    [CONTEXT_MENU_EXPORT_ID]: {
      visible: args.settings.showExport && capabilities.export.supported,
    },
    ...resolvePageLinkDynamicState({ capabilities, settings: args.settings }),
  };
}
