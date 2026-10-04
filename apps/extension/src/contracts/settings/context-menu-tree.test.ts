import { describe, expect, it } from 'vitest';
import {
  CONTEXT_MENU_ITEMS,
  createContextMenuLayout,
  createRecommendedContextMenuSettings,
  createRecommendedContextMenuTree,
  parseContextMenuLayout,
  parseContextMenuTree,
  resolveContextMenuTree,
  isContextMenuCommandAvailable,
  repairStoredContextMenuTree,
  type ContextMenuTreeNode,
} from './context-menu-layout';

function allCommands(
  nodes: readonly ContextMenuTreeNode[]
): Array<{ command: string; enabled: boolean }> {
  return nodes.flatMap((node) =>
    node.type === 'section'
      ? allCommands(node.children)
      : [{ command: node.command, enabled: node.enabled }]
  );
}

const quickActions = [{ id: 'capture-1', status: true }];
const viewportPresets = [
  { id: 'system:window-hd', enabled: true, target: 'window' as const, order: 0 },
];
const leaf = { type: 'command' as const, command: 'sniptale.video.tab', enabled: true };

describe('v2 command tree', () => {
  it('accepts deeply nested sections and rejects duplicate identities anywhere', () => {
    const nested = {
      version: 2 as const,
      nodes: [
        {
          type: 'section' as const,
          id: 'outer',
          title: 'Outer',
          enabled: true,
          children: [
            {
              type: 'section' as const,
              id: 'inner',
              title: 'Inner',
              enabled: true,
              children: [{ type: 'command' as const, command: 'sniptale.gallery', enabled: true }],
            },
          ],
        },
      ],
    };
    expect(parseContextMenuTree(nested)).toEqual(nested);
    expect(
      parseContextMenuTree({ ...nested, nodes: [...nested.nodes, nested.nodes[0]] })
    ).toBeNull();
    expect(
      parseContextMenuTree({
        ...nested,
        nodes: [...nested.nodes, { type: 'command', command: 'sniptale.gallery', enabled: true }],
      })
    ).toBeNull();
  });
  it('repairs damaged stored nesting without losing a valid descendant or enabling hidden content', () => {
    const stored = {
      version: 2,
      nodes: [
        {
          type: 'section',
          id: 'outer',
          title: 'Outer',
          enabled: false,
          children: [
            {
              type: 'section',
              id: 'inner',
              title: 'Inner',
              enabled: true,
              children: [
                { type: 'command', command: 'sniptale.gallery', enabled: true },
                { type: 'command', command: 'invalid', enabled: true },
              ],
            },
          ],
        },
      ],
    };
    expect(repairStoredContextMenuTree(stored)).toMatchObject({
      nodes: [
        {
          enabled: false,
          children: [{ enabled: true, children: [{ command: 'sniptale.gallery', enabled: true }] }],
        },
      ],
    });
  });
  it('restores the accepted recommended hierarchy and dynamic action order', () => {
    const tree = createRecommendedContextMenuTree(
      [
        { id: 'first', status: true },
        { id: 'hidden', status: false },
        { id: 'second', status: true },
      ],
      []
    );
    expect(tree.nodes.map((node) => (node.type === 'section' ? node.id : node.command))).toEqual([
      'recommended-screenshots',
      'recommended-video',
      'recommended-export',
      'sniptale.image-editor',
      'sniptale.video-editor',
      'sniptale.gallery',
      'recommended-page-link',
      'sniptale.settings',
    ]);
    const screenshots = tree.nodes[0];
    expect(
      screenshots?.type === 'section'
        ? screenshots.children.map((node) => (node.type === 'command' ? node.command : node.id))
        : []
    ).toEqual([
      'sniptale.screenshots.prepare',
      'sniptale.screenshots.quick-action.first',
      'sniptale.screenshots.quick-action.second',
    ]);
    expect(parseContextMenuTree(tree)).toEqual(tree);
  });
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
    expect(allCommands(tree.nodes)).toContainEqual({ command, enabled: true });
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
});

describe('legacy context menu migration', () => {
  it('projects missing and v1 layouts without writing or losing explicit legacy visibility', () => {
    const settings = {
      ...createRecommendedContextMenuSettings(),
      showVideo: false,
      showWindowResize: true,
    };
    const missing = resolveContextMenuTree(settings, quickActions, viewportPresets);
    expect(allCommands(missing.nodes)).toContainEqual({ command: leaf.command, enabled: false });
    expect(allCommands(missing.nodes)).toContainEqual({
      command: 'sniptale.screenshots.quick-action.capture-1',
      enabled: true,
    });
    expect(allCommands(missing.nodes)).toContainEqual({
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
    const video = first?.type === 'section' ? first.children[0] : null;
    expect(video).toMatchObject({ type: 'section', id: 'block-video', enabled: false });
    expect(video?.type === 'section' ? video.children[0] : null).toEqual({
      ...leaf,
      enabled: false,
    });
  });
  it('nests legacy command blocks inside their existing custom section', () => {
    const layout = createContextMenuLayout();
    layout.sections = [
      { id: 'tools', title: 'Tools', items: ['showVideo', 'showGallery'] },
      {
        id: 'root',
        title: '',
        items: CONTEXT_MENU_ITEMS.filter((item) => item !== 'showVideo' && item !== 'showGallery'),
      },
    ];
    const projected = resolveContextMenuTree(
      { ...createRecommendedContextMenuSettings(), layout },
      [],
      []
    );
    const tools = projected.nodes[0];
    expect(tools).toMatchObject({ id: 'tools' });
    expect(tools?.type === 'section' ? tools.children[0] : null).toMatchObject({
      type: 'section',
      id: 'block-video',
    });
    expect(tools?.type === 'section' ? tools.children[1] : null).toMatchObject({
      command: 'sniptale.gallery',
    });
    expect(parseContextMenuTree(projected)).toEqual(projected);
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
      allCommands(crowded.nodes).filter((node) => node.command.includes('quick-action.'))
    ).toHaveLength(100);
    expect(crowded.nodes).toContainEqual({
      type: 'command',
      command: 'sniptale.settings',
      enabled: true,
    });
    expect(allCommands(crowded.nodes)).toContainEqual({
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
