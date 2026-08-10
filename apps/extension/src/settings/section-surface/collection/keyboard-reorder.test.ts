import { describe, expect, it } from 'vitest';

import {
  createKeyboardPreview,
  getKeyboardPreviewIntent,
  isKeyboardPreviewCurrent,
  moveKeyboardPreview,
  moveReorderPreviewToTarget,
  resolveKeyboardPreviewGroups,
} from './keyboard-reorder';
import type { SettingsCollectionResolvedGroup } from './types';

const groups: readonly SettingsCollectionResolvedGroup[] = [
  {
    id: 'group',
    items: [
      { id: 'first', title: 'First', capabilities: { reorder: true } },
      { id: 'second', title: 'Second', capabilities: { reorder: true } },
    ],
  },
];

describe('keyboard reorder preview', () => {
  it('builds a local preview and resolves one final typed intent', () => {
    const preview = createKeyboardPreview(groups, 'first');
    expect(preview).not.toBeNull();
    const moved = moveKeyboardPreview(preview!, 1);
    expect(resolveKeyboardPreviewGroups(groups, moved)[0]?.items.map((item) => item.id)).toEqual([
      'second',
      'first',
    ]);
    expect(getKeyboardPreviewIntent(groups, moved)).toEqual({
      itemId: 'first',
      groupId: 'group',
      beforeItemId: null,
      source: 'keyboard',
    });
    expect(isKeyboardPreviewCurrent(groups, moved)).toBe(true);
  });

  it('repositions a live pointer preview and emits the drag source', () => {
    const preview = createKeyboardPreview(groups, 'first')!;
    const moved = moveReorderPreviewToTarget(preview, 'second', 'after');
    expect(moved.itemIds).toEqual(['second', 'first']);
    expect(getKeyboardPreviewIntent(groups, moved, 'drag')).toEqual({
      itemId: 'first',
      groupId: 'group',
      beforeItemId: null,
      source: 'drag',
    });
    expect(moveReorderPreviewToTarget(moved, 'second', 'before').itemIds).toEqual([
      'first',
      'second',
    ]);
    expect(moveReorderPreviewToTarget(preview, 'missing', 'after')).toBe(preview);
  });

  it('treats missing, unchanged, boundary, and stale previews as no-ops', () => {
    expect(createKeyboardPreview(groups, 'missing')).toBeNull();
    const preview = createKeyboardPreview(groups, 'first')!;
    expect(moveKeyboardPreview(preview, -1)).toBe(preview);
    expect(getKeyboardPreviewIntent(groups, preview)).toBeNull();
    expect(getKeyboardPreviewIntent(groups, { ...preview, groupId: 'missing' })).toBeNull();
    expect(
      getKeyboardPreviewIntent(groups, {
        ...preview,
        itemId: 'missing',
        itemIds: ['second', 'first'],
      })
    ).toBeNull();
    expect(resolveKeyboardPreviewGroups(groups, { ...preview, itemIds: ['first'] })[0]).toBe(
      groups[0]
    );
  });

  it('rejects a preview after authoritative membership or capability changes', () => {
    const moved = moveKeyboardPreview(createKeyboardPreview(groups, 'first')!, 1);
    const expandedGroups: readonly SettingsCollectionResolvedGroup[] = [
      {
        ...groups[0]!,
        items: [...groups[0]!.items, { id: 'third', title: 'Third', capabilities: {} }],
      },
    ];
    expect(isKeyboardPreviewCurrent(expandedGroups, moved)).toBe(false);
    expect(getKeyboardPreviewIntent(expandedGroups, moved)).toBeNull();
    expect(
      isKeyboardPreviewCurrent(
        [
          {
            ...groups[0]!,
            items: groups[0]!.items.map((item) =>
              item.id === 'first' ? { ...item, capabilities: { reorder: false } } : item
            ),
          },
        ],
        moved
      )
    ).toBe(false);
  });
});
