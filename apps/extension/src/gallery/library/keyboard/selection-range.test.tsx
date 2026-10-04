import { expect, it } from 'vitest';
import { resolveGallerySelectionRange } from './selection-range';
it('extends, contracts and crosses its fixed anchor without dropping unrelated selection', () => {
  const orderedIds = ['a', 'b', 'c', 'd'];
  const selectable = new Set(orderedIds);
  const baseSelectedIds = new Set(['outside']);
  const select = (targetId: string) =>
    resolveGallerySelectionRange(
      { anchorId: 'b', targetId, orderedIds, baseSelectedIds },
      selectable
    );
  expect([...select('d')!]).toEqual(['outside', 'b', 'c', 'd']);
  expect([...select('c')!]).toEqual(['outside', 'b', 'c']);
  expect([...select('a')!]).toEqual(['outside', 'a', 'b']);
});
it('rejects missing endpoints and ignores IDs outside the current selectable results', () => {
  const range = {
    anchorId: 'a',
    targetId: 'b',
    orderedIds: ['a', 'hidden', 'a', 'b'],
    baseSelectedIds: new Set<string>(),
  };
  expect(resolveGallerySelectionRange(range, new Set(['a', 'b']))).toEqual(new Set(['a', 'b']));
  expect(
    resolveGallerySelectionRange({ ...range, targetId: 'hidden' }, new Set(['a', 'b']))
  ).toBeNull();
});
