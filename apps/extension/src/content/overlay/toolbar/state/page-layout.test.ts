import { expect, it, vi } from 'vitest';
import {
  PAGE_TOOLBAR_LAYOUT_MAX_DIVIDERS,
  type PageToolbarLayoutItem,
} from '../../../../contracts/settings';
import {
  createPageToolbarResetPatch,
  createPageToolbarLayoutCommands,
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

it('includes new editing and review tools in legacy layout migration and the unified reset', () => {
  for (const [mode, additions] of [
    ['quick-edit', ['editing-marker', 'editing-ai-text']],
    [
      'design-review',
      ['review-comment', 'review-inspect', 'review-compare', 'review-move', 'review-check'],
    ],
  ] as const) {
    const migrated = getPageToolbarLayout(mode, ['settings', 'mode']);
    const reset = createPageToolbarResetPatch();
    for (const control of additions) {
      expect(migrated).toContain(control);
      expect(reset.pageControls).toHaveProperty(control, true);
      expect(reset.pageControlOverrides?.[mode]).toHaveProperty(control, null);
    }
    expect(migrated.indexOf('settings')).toBeLessThan(migrated.indexOf('mode'));
  }
});

it('inserts the provisional divider identity at its selected gap without recreating the source', async () => {
  const save = vi.fn(async () => undefined);
  const commands = createPageToolbarLayoutCommands(
    ['mode', 'capture-visible', 'settings'],
    'cursor',
    save
  );
  await commands.addSeparator({ id: 'separator:draft', target: 'settings', before: true });
  expect(save).toHaveBeenCalledExactlyOnceWith({
    pageLayouts: { cursor: ['mode', 'capture-visible', 'separator:draft', 'settings'] },
  });
});
it('refuses a divider final position adjacent to another divider', async () => {
  const save = vi.fn(async () => undefined);
  const commands = createPageToolbarLayoutCommands(
    ['mode', 'separator:a', 'capture-visible', 'separator:b', 'settings'],
    'cursor',
    save
  );
  await commands.moveItem('separator:a', 'separator:b', false);
  expect(save).not.toHaveBeenCalled();
});

it('refuses duplicate/malformed ids, unknown targets and adjacent copies without altering accepted items', async () => {
  const save = vi.fn(async () => undefined);
  const items: PageToolbarLayoutItem[] = ['mode', 'separator:a', 'capture-visible', 'settings'];
  const commands = createPageToolbarLayoutCommands(items, 'cursor', save);
  for (const position of [
    { id: 'separator:a', target: 'settings', before: true },
    { id: 'separator:<script>', target: 'settings', before: true },
    { id: 'separator:new', target: 'separator:missing', before: true },
    { id: 'separator:new', target: 'separator:a', before: false },
  ] as const)
    await commands.addSeparator(position);
  expect(save).not.toHaveBeenCalled();
  expect(items).toEqual(['mode', 'separator:a', 'capture-visible', 'settings']);
});
it('retains divider count limits for explicitly positioned copies', async () => {
  const save = vi.fn(async () => undefined);
  const items: PageToolbarLayoutItem[] = [
    'mode',
    ...Array.from(
      { length: PAGE_TOOLBAR_LAYOUT_MAX_DIVIDERS },
      (_, index): PageToolbarLayoutItem => `separator:${index}`
    ),
    'settings',
  ];
  const commands = createPageToolbarLayoutCommands(items, 'cursor', save);
  expect(commands.canAddSeparator).toBe(false);
  await commands.addSeparator({ id: 'separator:new', target: 'mode', before: true });
  expect(save).not.toHaveBeenCalled();
});
