import { describe, expect, it } from 'vitest';
import {
  parseContextMenuTree,
  type ContextMenuTree,
} from '../../../../../contracts/settings/context-menu-layout';
import {
  addContextMenuCommand,
  addContextMenuSection,
  contextMenuNodePosition,
  moveContextMenuNode,
  removeContextMenuNode,
  reactivateContextMenuCommand,
  restoreContextMenuSectionCommands,
  updateContextMenuNode,
  visibleContextMenuNodes,
} from './context-menu-tree-model';

const tree: ContextMenuTree = {
  version: 2,
  nodes: [
    { type: 'command', command: 'sniptale.settings', enabled: true },
    {
      type: 'section',
      id: 'tools',
      title: 'Tools',
      enabled: true,
      children: [
        { type: 'command', command: 'sniptale.video.tab', enabled: true },
        { type: 'command', command: 'sniptale.video.area', enabled: true },
      ],
    },
    { type: 'command', command: 'sniptale.gallery', enabled: true },
  ],
};

it('restores section commands without stealing active commands or changing the source tree', () => {
  const before = structuredClone(tree);
  const restored = restoreContextMenuSectionCommands(tree, 'tools', [
    'sniptale.settings',
    'sniptale.image-editor',
  ]);
  expect(restored.nodes[0]).toEqual(tree.nodes[0]);
  expect(restored.nodes[1]).toMatchObject({
    children: [
      { command: 'sniptale.video.tab' },
      { command: 'sniptale.video.area' },
      { command: 'sniptale.image-editor' },
    ],
  });
  expect(tree).toEqual(before);
  expect(restoreContextMenuSectionCommands(tree, 'missing', ['sniptale.gallery'])).toBe(tree);
});

describe('context menu tree mutations', () => {
  it('omits legacy disabled sections without modifying their stored commands', () => {
    const hidden: ContextMenuTree = {
      version: 2,
      nodes: [
        { type: 'section', id: 'empty', title: 'Empty', enabled: false, children: [] },
        {
          type: 'section',
          id: 'tools',
          title: 'Tools',
          enabled: false,
          children: [{ type: 'command', command: 'sniptale.gallery', enabled: false }],
        },
      ],
    };
    const before = structuredClone(hidden);
    expect(visibleContextMenuNodes(hidden, new Set(['empty', 'tools']))).toEqual([]);
    expect(hidden).toEqual(before);
    expect(parseContextMenuTree(hidden)).not.toBeNull();
  });
  it('reactivates a retained command with its disabled ancestor chain and placement', () => {
    const disabled: ContextMenuTree = {
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
              enabled: false,
              children: [{ type: 'command', command: 'sniptale.gallery', enabled: false }],
            },
          ],
        },
      ],
    };
    const restored = reactivateContextMenuCommand(disabled, 'sniptale.gallery');
    expect(restored.nodes[0]).toMatchObject({
      enabled: true,
      children: [{ enabled: true, children: [{ command: 'sniptale.gallery', enabled: true }] }],
    });
    expect(parseContextMenuTree(restored)).not.toBeNull();
  });
  it('shows only active nodes and reactivates a stored disabled command when added', () => {
    const disabled: ContextMenuTree = {
      version: 2,
      nodes: [
        { type: 'command', command: 'sniptale.gallery', enabled: false },
        { type: 'section', id: 'tools', title: 'Tools', enabled: true, children: [] },
      ],
    };
    expect(visibleContextMenuNodes(disabled, new Set()).map((row) => row.key)).toEqual([
      'section:tools',
    ]);
    const added = addContextMenuCommand(disabled, 'sniptale.gallery', {
      parentId: 'tools',
      index: 0,
    });
    expect(added.nodes[0]).toMatchObject({
      children: [{ command: 'sniptale.gallery', enabled: true }],
    });
    expect(parseContextMenuTree(added)).not.toBeNull();
  });
  it('moves nested sections with descendants and rejects dropping into their own descendants', () => {
    const nested: ContextMenuTree = {
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
              children: [{ type: 'command', command: 'sniptale.gallery', enabled: true }],
            },
          ],
        },
        { type: 'command', command: 'sniptale.settings', enabled: true },
      ],
    };
    expect(contextMenuNodePosition(nested, 'command:sniptale.gallery')).toEqual({
      parentId: 'inner',
      index: 0,
    });
    expect(moveContextMenuNode(nested, 'section:outer', { parentId: 'inner', index: 0 })).toBe(
      nested
    );
    const moved = moveContextMenuNode(nested, 'section:inner', { parentId: null, index: 1 });
    expect(moved.nodes[1]).toMatchObject({
      id: 'inner',
      children: [{ command: 'sniptale.gallery' }],
    });
    expect(parseContextMenuTree(moved)).not.toBeNull();
  });
  it('uses one index rule for same-parent and cross-parent moves', () => {
    const moved = moveContextMenuNode(tree, 'command:sniptale.video.tab', {
      parentId: 'tools',
      index: 2,
    });
    expect(moved.nodes[1]).toMatchObject({
      children: [{ command: 'sniptale.video.area' }, { command: 'sniptale.video.tab' }],
    });
    const outside = moveContextMenuNode(moved, 'command:sniptale.video.tab', {
      parentId: null,
      index: 2,
    });
    expect(outside.nodes.map((node) => (node.type === 'command' ? node.command : node.id))).toEqual(
      ['sniptale.settings', 'tools', 'sniptale.video.tab', 'sniptale.gallery']
    );
    expect(contextMenuNodePosition(outside, 'command:sniptale.video.tab')).toEqual({
      parentId: null,
      index: 2,
    });
    expect(parseContextMenuTree(outside)).not.toBeNull();
    expect(tree.nodes[1]).toMatchObject({
      children: [{ command: 'sniptale.video.tab' }, { command: 'sniptale.video.area' }],
    });
  });

  it('rejects section nesting, invalid positions and duplicate commands without mutating the draft', () => {
    expect(moveContextMenuNode(tree, 'section:tools', { parentId: 'tools', index: 0 })).toBe(tree);
    expect(
      moveContextMenuNode(tree, 'command:sniptale.gallery', { parentId: 'missing', index: 0 })
    ).toBe(tree);
    expect(
      moveContextMenuNode(tree, 'command:sniptale.gallery', { parentId: null, index: -1 })
    ).toBe(tree);
    expect(addContextMenuCommand(tree, 'sniptale.gallery', { parentId: 'tools', index: 0 })).toBe(
      tree
    );
  });

  it('creates a section at the chosen root position and spills its children in order on removal', () => {
    const added = addContextMenuSection(tree, 1)!;
    expect(added.key).toBe('section:section-1');
    expect(added.tree.nodes[1]).toMatchObject({ type: 'section', title: '' });
    const removed = removeContextMenuNode(tree, 'section:tools');
    expect(removed.nodes.map((node) => (node.type === 'command' ? node.command : node.id))).toEqual(
      ['sniptale.settings', 'sniptale.video.tab', 'sniptale.video.area', 'sniptale.gallery']
    );
    expect(parseContextMenuTree(removed)).not.toBeNull();
  });

  it('keeps commands hidden when removing a disabled parent section', () => {
    const disabled = updateContextMenuNode(tree, 'section:tools', { enabled: false });
    const removed = removeContextMenuNode(disabled, 'section:tools');
    expect(removed.nodes.slice(1, 3)).toMatchObject([
      { command: 'sniptale.video.tab', enabled: false },
      { command: 'sniptale.video.area', enabled: false },
    ]);
    expect(parseContextMenuTree(removed)).not.toBeNull();
    expect(tree.nodes[1]).toMatchObject({ enabled: true });
  });

  it('preserves disabled nodes and clears a leaf name override when requested', () => {
    const renamed = updateContextMenuNode(tree, 'command:sniptale.settings', {
      title: 'My settings',
      enabled: false,
    });
    expect(renamed.nodes[0]).toMatchObject({ enabled: false, title: 'My settings' });
    const cleared = updateContextMenuNode(renamed, 'command:sniptale.settings', { title: '' });
    expect(cleared.nodes[0]).not.toHaveProperty('title');
    expect(parseContextMenuTree(cleared)).not.toBeNull();
  });

  it('exposes only children of expanded sections to keyboard navigation', () => {
    expect(visibleContextMenuNodes(tree, new Set()).map((row) => row.key)).toEqual([
      'command:sniptale.settings',
      'section:tools',
      'command:sniptale.gallery',
    ]);
    expect(visibleContextMenuNodes(tree, new Set(['tools'])).map((row) => row.key)).toEqual([
      'command:sniptale.settings',
      'section:tools',
      'command:sniptale.video.tab',
      'command:sniptale.video.area',
      'command:sniptale.gallery',
    ]);
  });
});

it('removes an entire branch for catalog return without mutating the snapshot used by Undo', () => {
  const original = structuredClone(tree);
  const next = removeContextMenuNode(tree, 'section:tools', { preserveChildren: false });
  expect(next.nodes.some((node) => node.type === 'section' && node.id === 'tools')).toBe(false);
  expect(JSON.stringify(next)).not.toContain('sniptale.video.');
  expect(next.nodes).toHaveLength(2);
  expect(tree).toEqual(original);
  expect(parseContextMenuTree(next)).not.toBeNull();
});
