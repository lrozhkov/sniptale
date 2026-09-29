import { describe, expect, it } from 'vitest';
import {
  CONTEXT_MENU_ITEMS,
  createContextMenuLayout,
  createRecommendedContextMenuSettings,
  parseContextMenuLayout,
  parseContextMenuTree,
  resolveContextMenuTree,
  isContextMenuCommandAvailable,
  repairStoredContextMenuTree,
} from './context-menu-layout';

describe('context menu layout boundary', () => {
  it('round trips a complete section layout and returns isolated defaults', () => {
    const layout = createContextMenuLayout();
    layout.sections = [
      { id: 'tools', title: '<Tools>', items: ['showSettings'] },
      { id: 'root', title: '', items: CONTEXT_MENU_ITEMS.filter((key) => key !== 'showSettings') },
    ];
    expect(parseContextMenuLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
    layout.sections[0]!.items.length = 0;
    expect(createContextMenuLayout().sections[0]?.items).toHaveLength(9);
    expect(createRecommendedContextMenuSettings()).toMatchObject({
      showImageEditor: false,
      showVideoEditor: false,
      showWindowResize: false,
      showScreenshots: true,
    });
  });
  it.each([
    null,
    {},
    { version: 2, sections: [] },
    { version: 1, sections: [] },
    { ...createContextMenuLayout(), extra: true },
    { version: 1, sections: [{ id: 'root', title: '', items: [] }] },
    {
      version: 1,
      sections: [{ id: 'root', title: '', items: [...CONTEXT_MENU_ITEMS, 'showSettings'] }],
    },
    {
      version: 1,
      sections: [{ id: 'root', title: '', items: [...CONTEXT_MENU_ITEMS.slice(1), 'unknown'] }],
    },
    { version: 1, sections: [{ id: 'root', title: 'wrong', items: [...CONTEXT_MENU_ITEMS] }] },
    {
      version: 1,
      sections: [
        { id: 'root', title: '', items: [...CONTEXT_MENU_ITEMS] },
        { id: 'root', title: '', items: [] },
      ],
    },
    { version: 1, sections: [{ id: 'other', title: 'Other', items: [...CONTEXT_MENU_ITEMS] }] },
    ...['', ' ', ' padded', 'control\nname', 'a'.repeat(41)].map((title) => ({
      version: 1,
      sections: [...createContextMenuLayout().sections, { id: 'tools', title, items: [] }],
    })),
    {
      version: 1,
      sections: [
        ...createContextMenuLayout().sections,
        ...Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, title: 'Tools', items: [] })),
      ],
    },
  ])('rejects malformed or ambiguous layout %#', (value) => {
    expect(parseContextMenuLayout(value)).toBeNull();
  });
});

describe('v2 command tree', () => {
  const quickActions = [{ id: 'capture-1', status: true }];
  const viewportPresets = [
    { id: 'system:window-hd', enabled: true, target: 'window' as const, order: 0 },
  ];
  const leaf = { type: 'command' as const, command: 'sniptale.video.tab', enabled: true };

  it('round trips ordered mixed nodes while retaining unavailable dynamic references', () => {
    const tree = {
      version: 2 as const,
      nodes: [
        leaf,
        {
          type: 'section' as const,
          id: 'tools',
          title: 'Tools',
          enabled: false,
          children: [
            {
              type: 'command' as const,
              command: 'sniptale.screenshots.quick-action.removed',
              enabled: true,
              title: 'Old action',
            },
            {
              type: 'command' as const,
              command: 'sniptale.window-resize.preset.system%3Awindow-hd',
              enabled: true,
            },
          ],
        },
      ],
    };
    expect(parseContextMenuTree(tree)).toEqual(tree);
    expect(
      isContextMenuCommandAvailable(
        'sniptale.screenshots.quick-action.removed',
        quickActions,
        viewportPresets
      )
    ).toBe(false);
    expect(
      isContextMenuCommandAvailable(
        'sniptale.screenshots.quick-action.removed',
        [...quickActions, { id: 'removed', status: true }],
        viewportPresets
      )
    ).toBe(true);
    expect(
      isContextMenuCommandAvailable(
        'sniptale.window-resize.preset.system%3Awindow-hd',
        quickActions,
        viewportPresets
      )
    ).toBe(true);
    const settings = { ...createRecommendedContextMenuSettings(), showVideo: false, layout: tree };
    expect(resolveContextMenuTree(settings, quickActions, viewportPresets)).toEqual(tree);
  });

  it('accepts existing preset IDs with encoded spaces and slashes', () => {
    const preset = [{ id: 'custom / size', enabled: true, target: 'window' as const, order: 0 }];
    const tree = resolveContextMenuTree(
      { ...createRecommendedContextMenuSettings(), showWindowResize: true },
      [],
      preset
    );
    const command = `sniptale.window-resize.preset.${encodeURIComponent('custom / size')}`;
    expect(tree.nodes).toContainEqual({ type: 'command', command, enabled: true });
    expect(parseContextMenuTree(tree)).toEqual(tree);
    expect(isContextMenuCommandAvailable(command, [], preset)).toBe(true);
  });

  it('rejects unknown commands, duplicate identities, excessive depth and unsafe titles', () => {
    const section = {
      type: 'section',
      id: 'tools',
      title: 'Tools',
      enabled: true,
      children: [leaf],
    };
    for (const tree of [
      { version: 3, nodes: [leaf] },
      { version: 2, nodes: [leaf, leaf] },
      { version: 2, nodes: [leaf, section] },
      { version: 2, nodes: [{ ...leaf, command: 'sniptale.unknown' }] },
      { version: 2, nodes: [{ ...leaf, command: 'sniptale.window-resize.preset.%ZZ' }] },
      { version: 2, nodes: [{ ...section, title: '<unsafe>\n' }] },
      { version: 2, nodes: [{ ...section, children: [section] }] },
      { version: 2, nodes: [{ ...section, id: 'root' }] },
      { version: 2, nodes: Array.from({ length: 81 }, () => leaf) },
    ])
      expect(parseContextMenuLayout(tree)).toBeNull();
  });

  it('projects missing and v1 layouts without writing or losing explicit legacy visibility', () => {
    const settings = {
      ...createRecommendedContextMenuSettings(),
      showVideo: false,
      showWindowResize: true,
    };
    const missing = resolveContextMenuTree(settings, quickActions, viewportPresets);
    expect(missing.nodes).toContainEqual({ ...leaf, enabled: false });
    expect(missing.nodes).toContainEqual({
      type: 'command',
      command: 'sniptale.screenshots.quick-action.capture-1',
      enabled: true,
    });
    expect(missing.nodes).toContainEqual({
      type: 'command',
      command: 'sniptale.window-resize.preset.system%3Awindow-hd',
      enabled: true,
    });
    expect(settings).not.toHaveProperty('layout');
    const legacy = createContextMenuLayout();
    legacy.sections = [
      { id: 'tools', title: 'Tools', items: ['showVideo'] },
      { id: 'root', title: '', items: CONTEXT_MENU_ITEMS.filter((item) => item !== 'showVideo') },
    ];
    const projected = resolveContextMenuTree(
      { ...settings, layout: legacy },
      quickActions,
      viewportPresets
    );
    expect(projected.nodes[0]).toMatchObject({ type: 'section', id: 'tools' });
    const first = projected.nodes[0];
    expect(first?.type === 'section' ? first.children[0] : null).toEqual({
      ...leaf,
      enabled: false,
    });
  });

  it('can serialize a legacy menu with 100 quick actions without dropping commands', () => {
    const crowded = resolveContextMenuTree(
      createRecommendedContextMenuSettings(),
      Array.from({ length: 100 }, (_, index) => ({
        id: index === 0 ? 'a'.repeat(513) : `action-${index}`,
        status: true,
      })),
      viewportPresets
    );
    expect(parseContextMenuTree(crowded)).toEqual(crowded);
    expect(
      crowded.nodes.filter(
        (node) => node.type === 'command' && node.command.includes('quick-action.')
      )
    ).toHaveLength(100);
    expect(crowded.nodes).toContainEqual({
      type: 'command',
      command: 'sniptale.settings',
      enabled: true,
    });
    expect(crowded.nodes).toContainEqual({
      type: 'command',
      command: 'sniptale.video.window',
      enabled: true,
    });
  });

  it('repairs a partial stored v2 tree without losing valid order and enabled state', () => {
    const damaged = {
      version: 2,
      nodes: [
        { type: 'command', command: 'sniptale.video.tab', enabled: false },
        { type: 'command', command: 'sniptale.video.tab', enabled: true },
        {
          type: 'section',
          id: 'tools',
          title: 'Tools',
          enabled: false,
          children: [
            { type: 'command', command: 'sniptale.gallery', enabled: true },
            { type: 'command', command: 'unknown.command', enabled: true },
          ],
        },
        {
          type: 'section',
          id: 'tools',
          title: 'Duplicate',
          enabled: true,
          children: [{ type: 'command', command: 'sniptale.settings', enabled: true }],
        },
      ],
    };
    expect(parseContextMenuTree(damaged)).toBeNull();
    const repaired = repairStoredContextMenuTree(damaged);
    expect(repaired).toEqual({
      version: 2,
      nodes: [
        { type: 'command', command: 'sniptale.video.tab', enabled: false },
        {
          type: 'section',
          id: 'tools',
          title: 'Tools',
          enabled: false,
          children: [{ type: 'command', command: 'sniptale.gallery', enabled: true }],
        },
        { type: 'command', command: 'sniptale.settings', enabled: true },
      ],
    });
    expect(parseContextMenuTree(repaired)).toEqual(repaired);
    expect(repairStoredContextMenuTree({ version: 3, nodes: damaged.nodes })).toBeNull();
    expect(
      repairStoredContextMenuTree({
        version: 2,
        nodes: [
          {
            type: 'section',
            id: 'broken',
            title: '',
            enabled: false,
            children: [{ type: 'command', command: 'sniptale.settings', enabled: true }],
          },
        ],
      })?.nodes
    ).toEqual([{ type: 'command', command: 'sniptale.settings', enabled: false }]);
  });
});
