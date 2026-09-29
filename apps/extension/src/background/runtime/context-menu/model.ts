import type { BrowserContextMenuUpdateProperties } from '@sniptale/platform/browser/context-menus';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { getTabCapabilities } from '../../../features/tab-capabilities/capabilities';
import type { ContextMenuSettings, QuickAction, ViewportPreset } from '../../../contracts/settings';
import { buildContextMenuDescriptors as buildContextMenuDescriptorsImpl } from './descriptors';
import {
  CONTEXT_MENU_EXPORT_COPY_JSON_ID,
  CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID,
  CONTEXT_MENU_EXPORT_START_ID,
  CONTEXT_MENU_ROOT_ID,
  CONTEXT_MENU_SCREENSHOTS_PREPARE_ID,
  CONTEXT_MENU_VIDEO_AREA_ID,
  CONTEXT_MENU_VIDEO_PRESET_ID,
  CONTEXT_MENU_VIDEO_TAB_ID,
  CONTEXT_MENU_VIDEO_WINDOW_ID,
  parseContextMenuQuickActionId,
} from './constants';
import {
  CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID,
  CONTEXT_MENU_PAGE_LINK_PLAIN_ID,
  CONTEXT_MENU_PAGE_LINK_RICH_ID,
} from './page-link/constants';
import type { ContextMenuDescriptor } from './types';

export { buildContextMenuDescriptorsImpl as buildContextMenuDescriptors };

const CONTEXT_MENU_CONTEXTS = [
  'all' as chrome.contextMenus.ContextType,
] as chrome.contextMenus.CreateProperties['contexts'];

export function getContextMenuContexts(): chrome.contextMenus.CreateProperties['contexts'] {
  return CONTEXT_MENU_CONTEXTS;
}

export function hasVisibleContextMenuItems(args: {
  quickActions: QuickAction[];
  settings: ContextMenuSettings;
  viewportPresets: readonly ViewportPreset[];
}): boolean {
  return buildContextMenuDescriptorsImpl(args).length > 1;
}

function isCommandVisible(
  id: string,
  capabilities: ReturnType<typeof getTabCapabilities>
): boolean {
  if (id === CONTEXT_MENU_SCREENSHOTS_PREPARE_ID) return capabilities.screenshotMode.supported;
  if (parseContextMenuQuickActionId(id)) return capabilities.quickActions.supported;
  if (
    id === CONTEXT_MENU_EXPORT_START_ID ||
    id === CONTEXT_MENU_EXPORT_COPY_JSON_ID ||
    id === CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID
  )
    return capabilities.export.supported;
  if (
    id === CONTEXT_MENU_PAGE_LINK_RICH_ID ||
    id === CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID ||
    id === CONTEXT_MENU_PAGE_LINK_PLAIN_ID
  )
    return !capabilities.isRestrictedPage && Boolean(capabilities.url);
  if (id === CONTEXT_MENU_VIDEO_TAB_ID) return capabilities.videoByMode[CaptureMode.TAB].supported;
  if (id === CONTEXT_MENU_VIDEO_AREA_ID)
    return capabilities.videoByMode[CaptureMode.TAB_CROP].supported;
  if (id === CONTEXT_MENU_VIDEO_PRESET_ID)
    return capabilities.videoByMode[CaptureMode.TAB].supported;
  if (id === CONTEXT_MENU_VIDEO_WINDOW_ID)
    return capabilities.videoByMode[CaptureMode.SCREEN].supported;
  return true;
}

/** Visibility is computed only for actual menu IDs; section state follows its emitted children. */
export function resolveContextMenuDynamicState(args: {
  descriptors: readonly ContextMenuDescriptor[];
  hasVideoPreset: boolean;
  tab?: chrome.tabs.Tab;
}): Record<string, BrowserContextMenuUpdateProperties> {
  const capabilities = getTabCapabilities(args.tab);
  const updates: Record<string, BrowserContextMenuUpdateProperties> = {};
  const visibleById = new Map<string, boolean>();
  for (const descriptor of [...args.descriptors].reverse()) {
    if (descriptor.id === CONTEXT_MENU_ROOT_ID) continue;
    const children = args.descriptors.filter((child) => child.parentId === descriptor.id);
    const visible =
      children.length > 0
        ? children.some((child) => visibleById.get(child.id) === true)
        : isCommandVisible(descriptor.id, capabilities);
    visibleById.set(descriptor.id, visible);
    updates[descriptor.id] = {
      visible,
      enabled:
        descriptor.id === CONTEXT_MENU_VIDEO_PRESET_ID ? visible && args.hasVideoPreset : visible,
    };
  }
  return updates;
}
