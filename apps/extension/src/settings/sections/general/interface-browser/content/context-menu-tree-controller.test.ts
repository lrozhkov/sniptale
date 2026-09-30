import { expect, it, vi } from 'vitest';
import type { ContextMenuTree } from '../../../../../contracts/settings/context-menu-layout';
import {
  createSectionAtSelection,
  createTreeReorder,
  finishTreeRename,
  toggleTreeSection,
} from './context-menu-tree-controller';

const tree: ContextMenuTree = {
  version: 2,
  nodes: [
    {
      type: 'section',
      id: 'tools',
      title: 'Tools',
      enabled: true,
      children: [{ type: 'command', command: 'sniptale.gallery', enabled: true }],
    },
    { type: 'command', command: 'sniptale.settings', enabled: true },
    { type: 'command', command: 'sniptale.video.tab', enabled: true },
  ],
};

it('creates a nested section at the selected section and preserves existing children', () => {
  const result = createSectionAtSelection(tree, 'section:tools');
  expect(result?.parentId).toBe('tools');
  expect(result?.tree.nodes[0]).toMatchObject({
    children: [{ command: 'sniptale.gallery' }, { type: 'section', children: [] }],
  });
  expect(createSectionAtSelection(tree, 'command:sniptale.settings')?.tree.nodes[2]).toMatchObject({
    type: 'section',
    children: [],
  });
});

it('moves commands into and out of a section, reorders siblings and rejects unavailable moves', () => {
  const apply = vi.fn();
  const onExpanded = vi.fn();
  const onAnnounce = vi.fn();
  const reorder = createTreeReorder({
    tree,
    locale: 'en',
    expanded: new Set(),
    apply,
    onExpanded,
    onAnnounce,
  });
  reorder.moveRelative('command:sniptale.video.tab', -1);
  expect(apply).toHaveBeenLastCalledWith(
    expect.objectContaining({
      nodes: [
        expect.objectContaining({ id: 'tools' }),
        expect.objectContaining({ command: 'sniptale.video.tab' }),
        expect.objectContaining({ command: 'sniptale.settings' }),
      ],
    }),
    'command:sniptale.video.tab'
  );
  reorder.moveInside('command:sniptale.settings');
  expect(apply).toHaveBeenLastCalledWith(
    expect.objectContaining({
      nodes: [
        expect.objectContaining({
          children: [
            expect.objectContaining({ command: 'sniptale.gallery' }),
            expect.objectContaining({ command: 'sniptale.settings' }),
          ],
        }),
        expect.objectContaining({ command: 'sniptale.video.tab' }),
      ],
    }),
    'command:sniptale.settings'
  );
  expect(onExpanded).toHaveBeenCalledWith(new Set(['tools']));
  reorder.moveOutside('command:sniptale.gallery');
  expect(apply).toHaveBeenLastCalledWith(
    expect.objectContaining({
      nodes: [
        expect.objectContaining({ id: 'tools' }),
        expect.objectContaining({ command: 'sniptale.gallery' }),
        expect.objectContaining({ command: 'sniptale.settings' }),
        expect.objectContaining({ command: 'sniptale.video.tab' }),
      ],
    }),
    'command:sniptale.gallery'
  );
  reorder.moveInside('command:sniptale.video.tab');
  reorder.moveInside('section:tools');
  expect(onAnnounce).toHaveBeenCalledTimes(4);
});

it('returns focus to a closing ancestor of a selected nested command', () => {
  const opened = toggleTreeSection(tree, 'tools', new Set(), 'command:sniptale.gallery');
  expect(opened.expanded.has('tools')).toBe(true);
  const closed = toggleTreeSection(tree, 'tools', opened.expanded, 'command:sniptale.gallery');
  expect(closed).toEqual({ expanded: new Set(), focusKey: 'section:tools' });
  expect(
    toggleTreeSection(tree, 'tools', opened.expanded, 'command:sniptale.settings').focusKey
  ).toBeNull();
});

it('commits an existing section rename and removes a new empty section name', () => {
  const apply = vi.fn();
  const remove = vi.fn();
  const select = vi.fn();
  const close = vi.fn();
  finishTreeRename({
    tree,
    editing: { key: 'section:tools', value: 'New tools', isNew: false },
    apply,
    remove,
    select,
    close,
  });
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({
      nodes: [
        expect.objectContaining({ title: 'New tools' }),
        expect.anything(),
        expect.anything(),
      ],
    }),
    'section:tools'
  );
  expect(select).toHaveBeenCalledWith('section:tools');
  finishTreeRename({
    tree,
    editing: { key: 'section:tools', value: ' ', isNew: true },
    apply,
    remove,
    select,
    close,
  });
  expect(remove).toHaveBeenCalledWith('section:tools');
  expect(close).toHaveBeenCalledTimes(2);
});
