import { describe, expect, it } from 'vitest';

import {
  getAdjacentMoveIntent,
  getSettingsCollectionMoveIntent,
  resolveSettingsCollectionGroups,
} from './model';
import type { SettingsCollectionItem } from './types';

const item = (id: string): SettingsCollectionItem => ({
  id,
  title: id,
  capabilities: { reorder: true },
});

describe('SettingsCollection model', () => {
  it('uses item order for an ungrouped collection and group itemIds for grouped order', () => {
    const items = [item('a'), item('b')];
    expect(resolveSettingsCollectionGroups(items)[0]?.items.map((entry) => entry.id)).toEqual([
      'a',
      'b',
    ]);
    expect(
      resolveSettingsCollectionGroups(items, [{ id: 'group', itemIds: ['b', 'a'] }])[0]?.items.map(
        (entry) => entry.id
      )
    ).toEqual(['b', 'a']);
  });

  it.each([
    [[item('a'), item('a')], undefined, 'duplicate item'],
    [
      [item('a')],
      [
        { id: 'one', itemIds: ['a'] },
        { id: 'one', itemIds: [] },
      ],
      'duplicate group',
    ],
    [[item('a')], [{ id: 'one', itemIds: [] }], 'registered exactly once'],
    [[item('a')], [{ id: 'one', itemIds: ['missing'] }], 'unknown item'],
    [
      [item('a')],
      [
        { id: 'one', itemIds: ['a'] },
        { id: 'two', itemIds: ['a'] },
      ],
      'duplicate registered item',
    ],
  ])('rejects an invalid collection model', (items, groups, message) => {
    expect(() => resolveSettingsCollectionGroups(items, groups)).toThrow(message);
  });

  it('creates equivalent beforeItemId positions for menu and keyboard moves', () => {
    const groups = resolveSettingsCollectionGroups([item('a'), item('b'), item('c')]);
    expect(getAdjacentMoveIntent({ groups, itemId: 'c', direction: -1, source: 'menu' })).toEqual({
      itemId: 'c',
      groupId: null,
      beforeItemId: 'b',
      source: 'menu',
    });
    expect(
      getAdjacentMoveIntent({ groups, itemId: 'c', direction: -1, source: 'keyboard' })
    ).toEqual({
      itemId: 'c',
      groupId: null,
      beforeItemId: 'b',
      source: 'keyboard',
    });
  });

  it('supports insertion at the end and suppresses self, no-op, and cross-group moves', () => {
    const groups = resolveSettingsCollectionGroups(
      [item('a'), item('b'), item('c')],
      [
        { id: 'one', itemIds: ['a', 'b'] },
        { id: 'two', itemIds: ['c'] },
      ]
    );
    expect(
      getSettingsCollectionMoveIntent({
        groups,
        itemId: 'a',
        targetItemId: 'b',
        placement: 'after',
        source: 'drag',
      })
    ).toEqual({ itemId: 'a', groupId: 'one', beforeItemId: null, source: 'drag' });
    expect(
      getSettingsCollectionMoveIntent({
        groups,
        itemId: 'a',
        targetItemId: 'a',
        placement: 'before',
        source: 'drag',
      })
    ).toBeNull();
    expect(
      getSettingsCollectionMoveIntent({
        groups,
        itemId: 'a',
        targetItemId: 'b',
        placement: 'before',
        source: 'drag',
      })
    ).toBeNull();
    expect(
      getSettingsCollectionMoveIntent({
        groups,
        itemId: 'a',
        targetItemId: 'c',
        placement: 'before',
        source: 'drag',
      })
    ).toBeNull();
  });
});
