import { expect, it } from 'vitest';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { hasLayerReorderChanged, projectLayerDropOrder } from './drop';

const layers = ['a', 'b', 'c', 'source'].map((id) => ({
  id,
  type: id === 'source' ? 'source-image' : 'image',
  selected: id === 'a',
  locked: id === 'source',
})) as EditorLayerItem[];
const order = layers.map((layer) => layer.id);

it.each([
  ['b', ['a', 'b', 'c', 'source']],
  ['c', ['b', 'a', 'c', 'source']],
  [null, ['b', 'c', 'a', 'source']],
] as const)('projects a block before %s and clamps the pinned source', (before, expected) => {
  expect(projectLayerDropOrder(layers, order, ['a'], before)).toEqual(expected);
  expect(order).toEqual(['a', 'b', 'c', 'source']);
});
it('preserves non-adjacent selected stacking order as one block', () => {
  expect(projectLayerDropOrder(layers, order, ['a', 'c'], null)).toEqual(['b', 'a', 'c', 'source']);
});
it('allows insertion at the end when the source is reorderable', () => {
  const movable = layers.map((layer) => ({ ...layer, reorderable: true }));
  expect(projectLayerDropOrder(movable, order, ['a'], null)).toEqual(['b', 'c', 'source', 'a']);
});
it.each(['selected', 'locked', 'immutable', 'reorderable'] as const)(
  'invalidates the gesture when %s changes',
  (field) => {
    expect(
      hasLayerReorderChanged(
        layers,
        layers.map((layer, index) => (index === 0 ? { ...layer, [field]: !layer[field] } : layer))
      )
    ).toBe(true);
  }
);
it('ignores presentation updates but detects changed order and membership', () => {
  expect(
    hasLayerReorderChanged(
      layers,
      layers.map((layer) => ({ ...layer, name: 'Renamed' }))
    )
  ).toBe(false);
  expect(hasLayerReorderChanged(layers, [...layers].reverse())).toBe(true);
  expect(hasLayerReorderChanged(layers, layers.slice(1))).toBe(true);
});
