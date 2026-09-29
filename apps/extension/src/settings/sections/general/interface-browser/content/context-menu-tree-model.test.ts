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

describe('context menu tree mutations', () => {
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
