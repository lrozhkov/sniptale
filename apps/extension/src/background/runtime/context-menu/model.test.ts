import { describe, expect, it } from 'vitest';
import { type ContextMenuSettings, type QuickAction } from '../../../contracts/settings';
import {
  CONTEXT_MENU_EXPORT_ID,
  CONTEXT_MENU_EXPORT_SEPARATOR_ID,
  CONTEXT_MENU_ROOT_ID,
  CONTEXT_MENU_SCREENSHOTS_ID,
  CONTEXT_MENU_SETTINGS_ID,
  CONTEXT_MENU_SETTINGS_SEPARATOR_ID,
  CONTEXT_MENU_VIDEO_ID,
  CONTEXT_MENU_VIDEO_PRESET_ID,
  CONTEXT_MENU_VIDEO_WINDOW_ID,
} from './constants';
import {
  CONTEXT_MENU_PAGE_LINK_ID,
  CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID,
  CONTEXT_MENU_PAGE_LINK_PLAIN_ID,
  CONTEXT_MENU_PAGE_LINK_RICH_ID,
} from './page-link/constants';
import {
  buildContextMenuDescriptors,
  getContextMenuContexts,
  getEnabledContextMenuQuickActions,
  hasVisibleContextMenuItems,
  resolveContextMenuDynamicState,
} from './model';

function createContextMenuSettings(
  overrides: Partial<ContextMenuSettings> = {}
): ContextMenuSettings {
  return {
    enabled: true,
    showScreenshots: true,
    showVideo: true,
    showExport: true,
    showImageEditor: true,
    showVideoEditor: true,
    showGallery: true,
    showPageLinkCopy: true,
    showSettings: true,
    ...overrides,
  };
}

function createQuickAction(id: string, status = true): QuickAction {
  return {
    id,
    exitAfterCapture: true,
    icon: 'Camera',
    imageFormat: 'png',
    imageQuality: 100,
    name: id,
    screenshotMode: 'visible',
    status,
  };
}

function createTab(url: string): chrome.tabs.Tab {
  return { id: 7, url } as chrome.tabs.Tab;
}

function verifySettingsSeparatorPlacement() {
  const withSettings = buildContextMenuDescriptors({
    quickActions: [],
    settings: createContextMenuSettings(),
  });
  const settingsOnly = buildContextMenuDescriptors({
    quickActions: [],
    settings: createContextMenuSettings({
      showExport: false,
      showGallery: false,
      showPageLinkCopy: false,
      showImageEditor: false,
      showScreenshots: false,
      showVideo: false,
      showVideoEditor: false,
    }),
  });

  expect(withSettings.some((item) => item.id === CONTEXT_MENU_SETTINGS_SEPARATOR_ID)).toBe(true);
  expect(settingsOnly.some((item) => item.id === CONTEXT_MENU_SETTINGS_SEPARATOR_ID)).toBe(false);
  expect(settingsOnly.some((item) => item.id === CONTEXT_MENU_SETTINGS_ID)).toBe(true);
}

function verifyQuickActionSubmenuFiltering() {
  const descriptors = buildContextMenuDescriptors({
    quickActions: [createQuickAction('enabled'), createQuickAction('disabled', false)],
    settings: createContextMenuSettings(),
  });

  expect(descriptors.some((item) => item.id === 'sniptale.screenshots.quick-actions')).toBe(false);
  expect(descriptors).toContainEqual(
    expect.objectContaining({
      id: 'sniptale.screenshots.quick-action.enabled',
      parentId: CONTEXT_MENU_SCREENSHOTS_ID,
    })
  );
  expect(descriptors.some((item) => item.id === 'sniptale.screenshots.quick-action.disabled')).toBe(
    false
  );
}

function verifyPageLinkCopyDescriptors() {
  const descriptors = buildContextMenuDescriptors({
    quickActions: [],
    settings: createContextMenuSettings(),
  });
  const disabledDescriptors = buildContextMenuDescriptors({
    quickActions: [],
    settings: createContextMenuSettings({ showPageLinkCopy: false }),
  });

  expect(descriptors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: CONTEXT_MENU_PAGE_LINK_ID,
        parentId: CONTEXT_MENU_ROOT_ID,
      }),
      expect.objectContaining({
        id: CONTEXT_MENU_PAGE_LINK_RICH_ID,
        parentId: CONTEXT_MENU_PAGE_LINK_ID,
      }),
      expect.objectContaining({
        id: CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID,
        parentId: CONTEXT_MENU_PAGE_LINK_ID,
      }),
      expect.objectContaining({
        id: CONTEXT_MENU_PAGE_LINK_PLAIN_ID,
        parentId: CONTEXT_MENU_PAGE_LINK_ID,
      }),
    ])
  );
  expect(disabledDescriptors.some((item) => item.id === CONTEXT_MENU_PAGE_LINK_ID)).toBe(false);
}

function verifyDescriptorsOmitUndefinedFields() {
  const descriptors = buildContextMenuDescriptors({
    quickActions: [createQuickAction('enabled')],
    settings: createContextMenuSettings(),
  });
  const rootDescriptor = descriptors.find((item) => item.id === CONTEXT_MENU_ROOT_ID);
  const exportSeparatorDescriptor = descriptors.find(
    (item) => item.id === CONTEXT_MENU_EXPORT_SEPARATOR_ID
  );

  expect(rootDescriptor).toEqual({
    id: CONTEXT_MENU_ROOT_ID,
    title: 'Sniptale',
  });
  expect(rootDescriptor && 'parentId' in rootDescriptor).toBe(false);
  expect(rootDescriptor && 'type' in rootDescriptor).toBe(false);
  expect(exportSeparatorDescriptor).toEqual({
    id: CONTEXT_MENU_EXPORT_SEPARATOR_ID,
    parentId: CONTEXT_MENU_EXPORT_ID,
    type: 'separator',
  });
  expect(exportSeparatorDescriptor && 'title' in exportSeparatorDescriptor).toBe(false);
}

function verifyRestrictedPageVisibility() {
  const updates = resolveContextMenuDynamicState({
    hasVideoPreset: true,
    settings: createContextMenuSettings(),
    tab: createTab('chrome://extensions'),
  });

  expect(updates[CONTEXT_MENU_SCREENSHOTS_ID]?.visible).toBe(false);
  expect(updates[CONTEXT_MENU_EXPORT_ID]?.visible).toBe(false);
  expect(updates[CONTEXT_MENU_PAGE_LINK_ID]?.visible).toBe(false);
  expect(updates[CONTEXT_MENU_VIDEO_ID]?.visible).toBe(true);
  expect(updates[CONTEXT_MENU_VIDEO_WINDOW_ID]?.enabled).toBe(true);
  expect(updates[CONTEXT_MENU_VIDEO_PRESET_ID]?.enabled).toBe(false);
}

function verifyPresetVisibilityWithoutResolvedPreset() {
  const updates = resolveContextMenuDynamicState({
    hasVideoPreset: false,
    settings: createContextMenuSettings(),
    tab: createTab('https://example.test'),
  });

  expect(updates[CONTEXT_MENU_VIDEO_PRESET_ID]?.enabled).toBe(false);
  expect(updates[CONTEXT_MENU_VIDEO_ID]?.visible).toBe(true);
}

function verifyContextMenuContextsAndQuickActionFiltering() {
  expect(getContextMenuContexts()).toEqual(['all']);
  expect(
    getEnabledContextMenuQuickActions([
      createQuickAction('enabled'),
      createQuickAction('disabled', false),
    ])
  ).toEqual([createQuickAction('enabled')]);
}

function verifyVisibleItemDetection() {
  expect(
    hasVisibleContextMenuItems({
      quickActions: [],
      settings: createContextMenuSettings({
        showExport: false,
        showGallery: false,
        showPageLinkCopy: false,
        showImageEditor: false,
        showScreenshots: false,
        showSettings: false,
        showVideo: false,
        showVideoEditor: false,
      }),
    })
  ).toBe(false);
}

describe('context menu model', () => {
  it(
    'adds the bottom settings separator only when settings are shown after primary items',
    verifySettingsSeparatorPlacement
  );
  it(
    'places enabled quick actions directly under screenshots without a submenu',
    verifyQuickActionSubmenuFiltering
  );
  it('adds fixed page-link copy format descriptors when enabled', verifyPageLinkCopyDescriptors);
  it(
    'omits undefined descriptor fields from root and separator entries',
    verifyDescriptorsOmitUndefinedFields
  );
  it(
    'hides screenshots and export on restricted pages and keeps window recording available',
    verifyRestrictedPageVisibility
  );
  it(
    'disables preset capture when no resolved viewport preset exists',
    verifyPresetVisibilityWithoutResolvedPreset
  );
  it(
    'returns the shared menu contexts and only enabled quick actions',
    verifyContextMenuContextsAndQuickActionFiltering
  );
  it(
    'reports when there are no visible context menu items beyond the root',
    verifyVisibleItemDetection
  );
});
