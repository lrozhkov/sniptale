import { PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';
import { translate } from '../../../platform/i18n';
import { getQuickActionDisplayName } from '../../../features/quick-actions-presets/catalog';
import { type ContextMenuSettings, type QuickAction } from '../../../contracts/settings';
import {
  buildContextMenuQuickActionId,
  CONTEXT_MENU_EXPORT_COPY_JSON_ID,
  CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID,
  CONTEXT_MENU_EXPORT_ID,
  CONTEXT_MENU_EXPORT_SEPARATOR_ID,
  CONTEXT_MENU_EXPORT_START_ID,
  CONTEXT_MENU_GALLERY_ID,
  CONTEXT_MENU_IMAGE_EDITOR_ID,
  CONTEXT_MENU_ROOT_ID,
  CONTEXT_MENU_SCREENSHOTS_ID,
  CONTEXT_MENU_SCREENSHOTS_PREPARE_ID,
  CONTEXT_MENU_SCREENSHOTS_SEPARATOR_ID,
  CONTEXT_MENU_SETTINGS_ID,
  CONTEXT_MENU_SETTINGS_SEPARATOR_ID,
  CONTEXT_MENU_VIDEO_AREA_ID,
  CONTEXT_MENU_VIDEO_EDITOR_ID,
  CONTEXT_MENU_VIDEO_ID,
  CONTEXT_MENU_VIDEO_PRESET_ID,
  CONTEXT_MENU_VIDEO_TAB_ID,
  CONTEXT_MENU_VIDEO_WINDOW_ID,
} from './constants';
import { buildPageLinkCopyDescriptors } from './page-link/descriptors';
import type { ContextMenuDescriptor } from './types';

function createDescriptor(
  id: string,
  title?: string,
  parentId?: string,
  type?: chrome.contextMenus.CreateProperties['type']
): ContextMenuDescriptor {
  return {
    id,
    ...(parentId ? { parentId } : {}),
    ...(title ? { title } : {}),
    ...(type ? { type } : {}),
  };
}

function getEnabledContextMenuQuickActions(actions: QuickAction[]): QuickAction[] {
  return actions.filter((action) => action.status);
}

function buildScreenshotsDescriptors(quickActions: QuickAction[]): ContextMenuDescriptor[] {
  const descriptors = [
    createDescriptor(
      CONTEXT_MENU_SCREENSHOTS_ID,
      translate('popup.tabs.home'),
      CONTEXT_MENU_ROOT_ID
    ),
    createDescriptor(
      CONTEXT_MENU_SCREENSHOTS_PREPARE_ID,
      translate('popup.home.screenshotPrepLabel'),
      CONTEXT_MENU_SCREENSHOTS_ID
    ),
  ];
  const enabledQuickActions = getEnabledContextMenuQuickActions(quickActions);

  if (enabledQuickActions.length === 0) {
    return descriptors;
  }

  return [
    ...descriptors,
    createDescriptor(
      CONTEXT_MENU_SCREENSHOTS_SEPARATOR_ID,
      undefined,
      CONTEXT_MENU_SCREENSHOTS_ID,
      'separator' as chrome.contextMenus.CreateProperties['type']
    ),
    ...enabledQuickActions.map((action) =>
      createDescriptor(
        buildContextMenuQuickActionId(action.id),
        getQuickActionDisplayName(action),
        CONTEXT_MENU_SCREENSHOTS_ID
      )
    ),
  ];
}

function buildVideoDescriptors(): ContextMenuDescriptor[] {
  return [
    createDescriptor(CONTEXT_MENU_VIDEO_ID, translate('popup.tabs.video'), CONTEXT_MENU_ROOT_ID),
    createDescriptor(
      CONTEXT_MENU_VIDEO_TAB_ID,
      translate('popup.video.modeTabLabel'),
      CONTEXT_MENU_VIDEO_ID
    ),
    createDescriptor(
      CONTEXT_MENU_VIDEO_AREA_ID,
      translate('popup.video.modeAreaLabel'),
      CONTEXT_MENU_VIDEO_ID
    ),
    createDescriptor(
      CONTEXT_MENU_VIDEO_PRESET_ID,
      translate('popup.video.modePresetLabel'),
      CONTEXT_MENU_VIDEO_ID
    ),
    createDescriptor(
      CONTEXT_MENU_VIDEO_WINDOW_ID,
      translate('popup.video.modeScreenLabel'),
      CONTEXT_MENU_VIDEO_ID
    ),
  ];
}

function buildExportDescriptors(): ContextMenuDescriptor[] {
  return [
    createDescriptor(CONTEXT_MENU_EXPORT_ID, translate('popup.tabs.export'), CONTEXT_MENU_ROOT_ID),
    createDescriptor(
      CONTEXT_MENU_EXPORT_START_ID,
      translate('popup.export.exportButton'),
      CONTEXT_MENU_EXPORT_ID
    ),
    createDescriptor(
      CONTEXT_MENU_EXPORT_SEPARATOR_ID,
      undefined,
      CONTEXT_MENU_EXPORT_ID,
      'separator' as chrome.contextMenus.CreateProperties['type']
    ),
    createDescriptor(
      CONTEXT_MENU_EXPORT_COPY_JSON_ID,
      translate('popup.export.copyJsonButton'),
      CONTEXT_MENU_EXPORT_ID
    ),
    createDescriptor(
      CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID,
      translate('popup.export.copyMarkdownButton'),
      CONTEXT_MENU_EXPORT_ID
    ),
  ];
}

function buildRootLeafDescriptors(settings: ContextMenuSettings): ContextMenuDescriptor[] {
  const descriptors: ContextMenuDescriptor[] = [];

  if (settings.showImageEditor) {
    descriptors.push(
      createDescriptor(
        CONTEXT_MENU_IMAGE_EDITOR_ID,
        translate('popup.home.imageEditorLabel'),
        CONTEXT_MENU_ROOT_ID
      )
    );
  }

  if (settings.showVideoEditor) {
    descriptors.push(
      createDescriptor(
        CONTEXT_MENU_VIDEO_EDITOR_ID,
        translate('popup.video.videoEditorLabel'),
        CONTEXT_MENU_ROOT_ID
      )
    );
  }

  if (settings.showGallery) {
    descriptors.push(
      createDescriptor(
        CONTEXT_MENU_GALLERY_ID,
        translate('popup.home.galleryLabel'),
        CONTEXT_MENU_ROOT_ID
      )
    );
  }

  return descriptors;
}

function buildSettingsDescriptors(hasPrimaryItems: boolean): ContextMenuDescriptor[] {
  const descriptors: ContextMenuDescriptor[] = [];

  if (hasPrimaryItems) {
    descriptors.push(
      createDescriptor(
        CONTEXT_MENU_SETTINGS_SEPARATOR_ID,
        undefined,
        CONTEXT_MENU_ROOT_ID,
        'separator' as chrome.contextMenus.CreateProperties['type']
      )
    );
  }

  descriptors.push(
    createDescriptor(
      CONTEXT_MENU_SETTINGS_ID,
      translate('popup.common.footerSettings'),
      CONTEXT_MENU_ROOT_ID
    )
  );

  return descriptors;
}

export function buildContextMenuDescriptors(args: {
  quickActions: QuickAction[];
  settings: ContextMenuSettings;
}): ContextMenuDescriptor[] {
  const descriptors = [createDescriptor(CONTEXT_MENU_ROOT_ID, PRODUCT_BRAND_NAME)];
  const primaryDescriptors: ContextMenuDescriptor[] = [];

  if (args.settings.showScreenshots) {
    primaryDescriptors.push(...buildScreenshotsDescriptors(args.quickActions));
  }

  if (args.settings.showVideo) {
    primaryDescriptors.push(...buildVideoDescriptors());
  }

  if (args.settings.showExport) {
    primaryDescriptors.push(...buildExportDescriptors());
  }

  primaryDescriptors.push(...buildRootLeafDescriptors(args.settings));

  if (args.settings.showPageLinkCopy) {
    primaryDescriptors.push(...buildPageLinkCopyDescriptors());
  }

  descriptors.push(...primaryDescriptors);

  if (args.settings.showSettings) {
    descriptors.push(...buildSettingsDescriptors(primaryDescriptors.length > 0));
  }

  return descriptors;
}
