import { expect, it } from 'vitest';
import {
  createPageToolbarResetPatch,
  getPageToolbarLayout,
  movePageToolbarItem,
} from './page-layout';

it('preserves saved order and removed dividers, inserting a newly available button at its canonical neighbor', () => {
  const layout = getPageToolbarLayout('quick-edit', ['settings', 'mode', 'editing-ai']);
  expect(layout.filter((item) => ['settings', 'mode', 'editing-ai'].includes(item))).toEqual([
    'settings',
    'mode',
    'editing-ai',
  ]);
  expect(layout.indexOf('editing-direct-text') + 1).toBe(layout.indexOf('editing-ai'));
  expect(layout.indexOf('editing-block-selection') + 1).toBe(layout.indexOf('editing-direct-text'));
  expect(layout.some((item) => item.startsWith('separator:'))).toBe(false);
  expect(new Set(layout)).toEqual(
    new Set(getPageToolbarLayout('quick-edit').filter((item) => !item.startsWith('separator:')))
  );
});
it('moves buttons across old group boundaries and moves dividers without losing identities', () => {
  const items = getPageToolbarLayout('drawing');
  const moved = movePageToolbarItem(items, 'capture-visible', 'drawing-select', true);
  expect(moved.indexOf('capture-visible') + 1).toBe(moved.indexOf('drawing-select'));
  expect(new Set(moved)).toEqual(new Set(items));
  expect(movePageToolbarItem(moved, 'separator:capture', 'mode', false).slice(0, 2)).toEqual([
    'mode',
    'separator:capture',
  ]);
  expect(movePageToolbarItem(items, 'mode', 'mode', false)).toEqual(items);
});
it('resets visibility, overrides, order and dividers for every page mode in one patch', () => {
  const reset = createPageToolbarResetPatch();
  expect(reset.pageControls?.['capture-full']).toBe(true);
  expect(reset.pageControlOverrides?.drawing?.['capture-full']).toBeNull();
  expect(Object.values(reset.pageLayouts!)).toEqual([null, null, null, null, null]);
  expect(reset).not.toHaveProperty('recordingControls');
  expect(reset).not.toHaveProperty('position');
});

it('inserts the quick-action control into old layouts without losing saved order', () => {
  const saved = getPageToolbarLayout('drawing').filter((item) => item !== 'quick-actions');
  const restored = getPageToolbarLayout('drawing', saved);
  expect(restored.filter((item) => item !== 'quick-actions')).toEqual(saved);
  expect(restored.indexOf('capture-size') + 1).toBe(restored.indexOf('quick-actions'));
  expect(restored.indexOf('quick-actions') + 1).toBe(restored.indexOf('scenario-panel'));
});
