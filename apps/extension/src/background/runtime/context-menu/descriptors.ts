import { PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';
import { translate } from '../../../platform/i18n';
import { getQuickActionDisplayName } from '../../../features/quick-actions-presets/catalog';
import { getViewportPresetDisplayName } from '../../../features/viewport-presets/display-name';
import {
  isContextMenuCommandAvailable,
  parseContextMenuTree,
  resolveContextMenuTree,
} from '../../../contracts/settings/context-menu-layout';
import type { ContextMenuSettings, QuickAction, ViewportPreset } from '../../../contracts/settings';
import {
  CONTEXT_MENU_EXPORT_COPY_JSON_ID,
  CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID,
  CONTEXT_MENU_EXPORT_START_ID,
  CONTEXT_MENU_GALLERY_ID,
  CONTEXT_MENU_IMAGE_EDITOR_ID,
  CONTEXT_MENU_ROOT_ID,
  CONTEXT_MENU_SCREENSHOTS_PREPARE_ID,
  CONTEXT_MENU_SETTINGS_ID,
  CONTEXT_MENU_VIDEO_AREA_ID,
  CONTEXT_MENU_VIDEO_EDITOR_ID,
  CONTEXT_MENU_VIDEO_PRESET_ID,
  CONTEXT_MENU_VIDEO_TAB_ID,
  CONTEXT_MENU_VIDEO_WINDOW_ID,
  buildContextMenuQuickActionId,
  buildContextMenuWindowResizePresetId,
} from './constants';
import {
  CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID,
  CONTEXT_MENU_PAGE_LINK_PLAIN_ID,
  CONTEXT_MENU_PAGE_LINK_RICH_ID,
} from './page-link/constants';
import type { ContextMenuDescriptor } from './types';

function commandTitle(
  command: string,
  quickActions: QuickAction[],
  presets: readonly ViewportPreset[]
): string | null {
  const staticTitles: Record<string, string> = {
    [CONTEXT_MENU_SCREENSHOTS_PREPARE_ID]: translate('popup.home.screenshotPrepLabel'),
    [CONTEXT_MENU_VIDEO_TAB_ID]: translate('popup.video.modeTabLabel'),
    [CONTEXT_MENU_VIDEO_AREA_ID]: translate('popup.video.modeAreaLabel'),
    [CONTEXT_MENU_VIDEO_PRESET_ID]: translate('popup.video.modePresetLabel'),
    [CONTEXT_MENU_VIDEO_WINDOW_ID]: translate('popup.video.modeScreenLabel'),
    [CONTEXT_MENU_EXPORT_START_ID]: translate('popup.export.exportButton'),
    [CONTEXT_MENU_EXPORT_COPY_JSON_ID]: translate('popup.export.copyJsonButton'),
    [CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID]: translate('popup.export.copyMarkdownButton'),
    [CONTEXT_MENU_PAGE_LINK_RICH_ID]: translate('popup.common.pageLinkCopyRichLabel'),
    [CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID]: translate('popup.common.pageLinkCopyMarkdownLabel'),
    [CONTEXT_MENU_PAGE_LINK_PLAIN_ID]: translate('popup.common.pageLinkCopyPlainLabel'),
    [CONTEXT_MENU_IMAGE_EDITOR_ID]: translate('popup.home.imageEditorLabel'),
    [CONTEXT_MENU_VIDEO_EDITOR_ID]: translate('popup.video.videoEditorLabel'),
    [CONTEXT_MENU_GALLERY_ID]: translate('popup.home.galleryLabel'),
    [CONTEXT_MENU_SETTINGS_ID]: translate('popup.common.footerSettings'),
  };
  if (command in staticTitles) return staticTitles[command] ?? null;
  const action = quickActions.find((item) => buildContextMenuQuickActionId(item.id) === command);
  if (action) return getQuickActionDisplayName(action);
  const preset = presets.find((item) => buildContextMenuWindowResizePresetId(item.id) === command);
  if (preset) return `${getViewportPresetDisplayName(preset)} · ${preset.width} × ${preset.height}`;
  return null;
}

/** Emit each configured command once, in saved order, under its configured parent. */
export function buildContextMenuDescriptors(args: {
  quickActions: QuickAction[];
  settings: ContextMenuSettings;
  viewportPresets: readonly ViewportPreset[];
}): ContextMenuDescriptor[] {
  const descriptors: ContextMenuDescriptor[] = [
    { id: CONTEXT_MENU_ROOT_ID, title: PRODUCT_BRAND_NAME },
  ];
  const seen = new Set<string>();
  const tree = resolveContextMenuTree(args.settings, args.quickActions, args.viewportPresets);
  const legacy = !parseContextMenuTree(args.settings.layout);
  const appendCommand = (
    node: { command: string; enabled: boolean; title?: string | undefined },
    parentId: string
  ): boolean => {
    const available =
      isContextMenuCommandAvailable(node.command, args.quickActions, args.viewportPresets) ||
      (legacy &&
        (args.quickActions.some(
          (action) => action.status && buildContextMenuQuickActionId(action.id) === node.command
        ) ||
          args.viewportPresets.some(
            (preset) =>
              preset.enabled &&
              preset.target === 'window' &&
              buildContextMenuWindowResizePresetId(preset.id) === node.command
          )));
    if (!node.enabled || seen.has(node.command) || !available) return false;
    const title = node.title ?? commandTitle(node.command, args.quickActions, args.viewportPresets);
    if (!title) return false;
    seen.add(node.command);
    descriptors.push({ id: node.command, parentId, title });
    return true;
  };
  for (const node of tree.nodes) {
    if (node.type === 'command') {
      appendCommand(node, CONTEXT_MENU_ROOT_ID);
      continue;
    }
    if (!node.enabled) continue;
    const parentId = `sniptale.section.${node.id}`;
    const parentIndex = descriptors.length;
    descriptors.push({ id: parentId, parentId: CONTEXT_MENU_ROOT_ID, title: node.title });
    for (const child of node.children) appendCommand(child, parentId);
    if (descriptors.length === parentIndex + 1) descriptors.pop();
  }
  return descriptors;
}
