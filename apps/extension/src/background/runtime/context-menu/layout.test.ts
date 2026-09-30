import { expect, it } from 'vitest';
import {
  CONTEXT_MENU_ITEMS,
  createRecommendedContextMenuSettings,
  createRecommendedContextMenuTree,
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
    { id: 'sniptale.section.block-page-link', parentId: 'sniptale.section.links' },
    { id: 'sniptale.page-link.rich', parentId: 'sniptale.section.block-page-link' },
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

it('projects the restored recommendation with the same section hierarchy as settings', () => {
  const layout = createRecommendedContextMenuTree([{ id: 'quick', status: true }], []);
  const descriptors = buildContextMenuDescriptors({
    settings: { ...createRecommendedContextMenuSettings(), layout },
    quickActions: [{ id: 'quick', status: true, name: 'Quick' } as never],
    viewportPresets: [],
  });
  expect(
    descriptors.filter((item) => item.parentId === 'sniptale.root').map((item) => item.id)
  ).toEqual([
    'sniptale.section.recommended-screenshots',
    'sniptale.section.recommended-video',
    'sniptale.section.recommended-export',
    'sniptale.gallery',
    'sniptale.section.recommended-page-link',
    'sniptale.settings',
  ]);
  expect(
    descriptors.find((item) => item.id === 'sniptale.screenshots.quick-action.quick')?.parentId
  ).toBe('sniptale.section.recommended-screenshots');
});

it('projects nested sections and hides all ancestors on restricted pages', () => {
  const menu = settings();
  menu.layout = {
    version: 2,
    nodes: [
      {
        type: 'section',
        id: 'outer',
        title: 'Outer',
        enabled: true,
        children: [
          {
            type: 'section',
            id: 'inner',
            title: 'Inner',
            enabled: true,
            children: [{ type: 'command', command: 'sniptale.page-link.rich', enabled: true }],
          },
        ],
      },
    ],
  };
  const descriptors = buildContextMenuDescriptors({
    settings: menu,
    quickActions: [],
    viewportPresets: [],
  });
  expect(descriptors.map((item) => item.id)).toEqual([
    'sniptale.root',
    'sniptale.section.outer',
    'sniptale.section.inner',
    'sniptale.page-link.rich',
  ]);
  const restricted = resolveContextMenuDynamicState({
    descriptors,
    hasVideoPreset: false,
    tab: { id: 7, url: 'chrome://settings' } as chrome.tabs.Tab,
  });
  expect(restricted['sniptale.section.inner']?.visible).toBe(false);
  expect(restricted['sniptale.section.outer']?.visible).toBe(false);
});
