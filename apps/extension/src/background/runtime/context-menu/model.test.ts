import { describe, expect, it } from 'vitest';
import type { ContextMenuSettings, QuickAction, ViewportPreset } from '../../../contracts/settings';
import { buildContextMenuDescriptors, resolveContextMenuDynamicState } from './model';
import {
  CONTEXT_MENU_ROOT_ID,
  CONTEXT_MENU_VIDEO_PRESET_ID,
  buildContextMenuWindowResizePresetId,
} from './constants';

const quickActions = [
  {
    id: 'first',
    name: 'First',
    status: true,
    icon: 'Camera',
    screenshotMode: 'visible',
    exitAfterCapture: true,
    imageFormat: 'png',
    imageQuality: 100,
  },
] as QuickAction[];
const presets = [
  {
    id: 'window-hd',
    name: 'Window HD',
    kind: 'user',
    enabled: true,
    height: 720,
    width: 1280,
    order: 0,
    target: 'window',
  },
] as ViewportPreset[];
function settings(layout?: ContextMenuSettings['layout']): ContextMenuSettings {
  return {
    enabled: true,
    showScreenshots: true,
    showVideo: true,
    showExport: true,
    showImageEditor: true,
    showVideoEditor: true,
    showGallery: true,
    showPageLinkCopy: true,
    showWindowResize: true,
    showSettings: true,
    ...(layout ? { layout } : {}),
  };
}
function tab(url: string): chrome.tabs.Tab {
  return { id: 7, url } as chrome.tabs.Tab;
}

const tree = {
  version: 2 as const,
  nodes: [
    { type: 'command' as const, command: 'sniptale.settings', enabled: true },
    {
      type: 'section' as const,
      id: 'tools',
      title: 'Tools',
      enabled: true,
      children: [
        { type: 'command' as const, command: 'sniptale.video.window', enabled: true },
        { type: 'command' as const, command: 'sniptale.video.preset', enabled: true },
        {
          type: 'command' as const,
          command: 'sniptale.screenshots.quick-action.first',
          enabled: true,
        },
        { type: 'command' as const, command: 'sniptale.page-link.rich', enabled: true },
        {
          type: 'command' as const,
          command: buildContextMenuWindowResizePresetId('window-hd'),
          enabled: true,
        },
      ],
    },
    { type: 'command' as const, command: 'sniptale.gallery', enabled: true },
  ],
};

describe('context menu projection', () => {
  it('emits v2 leaves in exact saved order with one parent section and stable dispatch ids', () => {
    const descriptors = buildContextMenuDescriptors({
      settings: settings(tree),
      quickActions,
      viewportPresets: presets,
    });
    expect(descriptors.map(({ id, parentId }) => [id, parentId])).toEqual([
      [CONTEXT_MENU_ROOT_ID, undefined],
      ['sniptale.settings', CONTEXT_MENU_ROOT_ID],
      ['sniptale.section.tools', CONTEXT_MENU_ROOT_ID],
      ['sniptale.video.window', 'sniptale.section.tools'],
      ['sniptale.video.preset', 'sniptale.section.tools'],
      ['sniptale.screenshots.quick-action.first', 'sniptale.section.tools'],
      ['sniptale.page-link.rich', 'sniptale.section.tools'],
      [buildContextMenuWindowResizePresetId('window-hd'), 'sniptale.section.tools'],
      ['sniptale.gallery', CONTEXT_MENU_ROOT_ID],
    ]);
    expect(new Set(descriptors.map((item) => item.id)).size).toBe(descriptors.length);
  });

  it('omits unavailable dynamic references and empty or disabled sections', () => {
    const descriptors = buildContextMenuDescriptors({
      settings: settings({
        version: 2,
        nodes: [
          {
            type: 'section',
            id: 'missing',
            title: 'Missing',
            enabled: true,
            children: [
              {
                type: 'command',
                command: 'sniptale.screenshots.quick-action.first',
                enabled: true,
              },
            ],
          },
          {
            type: 'section',
            id: 'disabled',
            title: 'Disabled',
            enabled: false,
            children: [{ type: 'command', command: 'sniptale.gallery', enabled: true }],
          },
        ],
      }),
      quickActions: [],
      viewportPresets: [],
    });
    expect(descriptors).toEqual([{ id: CONTEXT_MENU_ROOT_ID, title: 'Sniptale' }]);
  });

  it('projects missing and v1 layouts with inventories and explicit legacy visibility', () => {
    const legacy = buildContextMenuDescriptors({
      settings: settings(),
      quickActions,
      viewportPresets: presets,
    });
    expect(legacy.some((item) => item.id === 'sniptale.screenshots.quick-action.first')).toBe(true);
    expect(
      legacy.some((item) => item.id === buildContextMenuWindowResizePresetId('window-hd'))
    ).toBe(true);
    const v1 = buildContextMenuDescriptors({
      settings: settings({
        version: 1,
        sections: [
          {
            id: 'root',
            title: '',
            items: [
              'showSettings',
              'showScreenshots',
              'showVideo',
              'showExport',
              'showImageEditor',
              'showVideoEditor',
              'showGallery',
              'showPageLinkCopy',
              'showWindowResize',
            ],
          },
        ],
      }),
      quickActions,
      viewportPresets: presets,
    });
    expect(v1[1]?.id).toBe('sniptale.settings');
    expect(v1.some((item) => item.id === 'sniptale.screenshots.quick-action.first')).toBe(true);
    const disabled = buildContextMenuDescriptors({
      settings: { ...settings(), showScreenshots: false },
      quickActions,
      viewportPresets: presets,
    });
    expect(disabled.some((item) => item.id === 'sniptale.screenshots.quick-action.first')).toBe(
      false
    );
    const v2 = buildContextMenuDescriptors({
      settings: { ...settings(tree), showVideo: false },
      quickActions,
      viewportPresets: presets,
    });
    expect(v2.some((item) => item.id === 'sniptale.video.window')).toBe(true);
  });

  it('retains every supported legacy quick action before an oversized tree can be explicitly saved', () => {
    const actions = Array.from({ length: 100 }, (_, index) => ({
      ...quickActions[0]!,
      id: `action-${index}`,
      name: `Action ${index}`,
    }));
    actions.push({ ...quickActions[0]!, id: 'legacy / id', name: 'Legacy action' });
    const descriptors = buildContextMenuDescriptors({
      settings: settings(),
      quickActions: actions,
      viewportPresets: [],
    });
    expect(
      descriptors.filter((item) => item.id.startsWith('sniptale.screenshots.quick-action.'))
    ).toHaveLength(101);
    expect(
      descriptors.some((item) => item.id === 'sniptale.screenshots.quick-action.legacy / id')
    ).toBe(true);
  });

  it('applies capability visibility to every emitted leaf and derives section visibility', () => {
    const descriptors = buildContextMenuDescriptors({
      settings: settings(tree),
      quickActions,
      viewportPresets: presets,
    });
    const restricted = resolveContextMenuDynamicState({
      descriptors,
      hasVideoPreset: false,
      tab: tab('chrome://extensions'),
    });
    expect(restricted['sniptale.screenshots.quick-action.first']).toEqual({
      visible: false,
      enabled: false,
    });
    expect(restricted['sniptale.page-link.rich']).toEqual({ visible: false, enabled: false });
    expect(restricted[CONTEXT_MENU_VIDEO_PRESET_ID]).toEqual({ visible: false, enabled: false });
    expect(restricted['sniptale.video.window']).toEqual({ visible: true, enabled: true });
    expect(restricted['sniptale.section.tools']).toEqual({ visible: true, enabled: true });
    const regular = resolveContextMenuDynamicState({
      descriptors,
      hasVideoPreset: false,
      tab: tab('https://example.test'),
    });
    expect(regular[CONTEXT_MENU_VIDEO_PRESET_ID]).toEqual({ visible: true, enabled: false });
  });
});
