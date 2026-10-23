// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { movePointerPreviewToClientY } from './pointer-reorder';
import type { SettingsCollectionKeyboardPreview } from './keyboard-reorder';

it('uses both pointer coordinates for a wrapped tile collection', () => {
  const root = document.createElement('div');
  root.dataset['settingsCollectionLayout'] = 'tiles';
  const itemIds = ['one', 'two', 'three', 'four'];
  for (const [index, id] of itemIds.entries()) {
    const row = document.createElement('div');
    row.dataset['settingsCollectionItem'] = id;
    const top = Math.floor(index / 2) * 50;
    const left = (index % 2) * 200;
    row.getBoundingClientRect = () =>
      ({ top, left, width: 190, height: 44, bottom: top + 44 }) as DOMRect;
    root.append(row);
  }
  const preview: SettingsCollectionKeyboardPreview = {
    itemId: 'four',
    itemIds,
    baselineItemIds: itemIds,
    groupId: null,
  };
  expect(movePointerPreviewToClientY(root, preview, 20, 200).itemIds).toEqual([
    'one',
    'four',
    'two',
    'three',
  ]);
  expect(movePointerPreviewToClientY(root, preview, 60, 20).itemIds).toEqual([
    'one',
    'two',
    'four',
    'three',
  ]);
  expect(movePointerPreviewToClientY(root, preview, 80, 500)).toBe(preview);
});
