import { expect, it } from 'vitest';
import {
  CONTEXT_MENU_ITEMS,
  createRecommendedContextMenuSettings,
} from '../../../contracts/settings/context-menu-layout';
import type { ContextMenuSettings } from '../../../contracts/settings';
import {
  buildContextMenuDescriptors,
  hasVisibleContextMenuItems,
  resolveContextMenuDynamicState,
} from './model';

function settings(): ContextMenuSettings {
  return {
    ...createRecommendedContextMenuSettings(),
    layout: {
      version: 1,
      sections: [
        { id: 'links', title: 'My links', items: ['showPageLinkCopy'] },
        {
          id: 'root',
          title: '',
          items: CONTEXT_MENU_ITEMS.filter(
            (key) => key !== 'showPageLinkCopy' && key !== 'showWindowResize'
          ),
        },
        { id: 'sizes', title: 'Sizes', items: ['showWindowResize'] },
      ],
    },
  };
}

it('reorders and reparents blocks while retaining stable action IDs and omitting empty sections', () => {
  const menu = settings();
  menu.showWindowResize = true;
  const descriptors = buildContextMenuDescriptors({
    settings: menu,
    quickActions: [],
    viewportPresets: [],
  });
  expect(descriptors.slice(0, 4)).toMatchObject([
    { id: 'sniptale.root' },
    { id: 'sniptale.section.links', parentId: 'sniptale.root', title: 'My links' },
    { id: 'sniptale.page-link.rich', parentId: 'sniptale.section.links' },
    { id: 'sniptale.page-link.markdown', parentId: 'sniptale.section.links' },
  ]);
  expect(descriptors.some((item) => item.id === 'sniptale.section.sizes')).toBe(false);
  expect(descriptors.some((item) => item.id === 'sniptale.settings.separator')).toBe(false);
  const ids = descriptors.map((item) => item.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const descriptor of descriptors) {
    if (descriptor.parentId)
      expect(ids.indexOf(descriptor.parentId)).toBeLessThan(ids.indexOf(descriptor.id));
  }
});

it('hides custom sections with no available blocks and restores them on ordinary pages', () => {
  const menu = settings();
  for (const [url, visible] of [
    ['chrome://settings', false],
    ['https://example.com', true],
  ] as const) {
    const descriptors = buildContextMenuDescriptors({
      settings: menu,
      quickActions: [],
      viewportPresets: [],
    });
    const updates = resolveContextMenuDynamicState({
      descriptors,
      hasVideoPreset: false,
      tab: { id: 7, url } as chrome.tabs.Tab,
    });
    expect(updates['sniptale.section.links']).toEqual({ visible, enabled: visible });
    expect(updates['sniptale.section.sizes']).toBeUndefined();
  }
});

it('omits every empty section and the service can suppress a root with no enabled blocks', () => {
  const menu = settings();
  for (const key of CONTEXT_MENU_ITEMS) menu[key] = false;
  expect(
    hasVisibleContextMenuItems({ settings: menu, quickActions: [], viewportPresets: [] })
  ).toBe(false);
});
