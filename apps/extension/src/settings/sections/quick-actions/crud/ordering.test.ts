import { expect, it, vi } from 'vitest';
import type { QuickAction } from '../../../../contracts/settings';
import { reorderAndSaveQuickActions, toggleQuickActionStatus } from './ordering';

function createQuickAction(id: string): QuickAction {
  return {
    afterCapture: 'download_default',
    bundledId: null,
    delay: null,
    emulation: 'native',
    exitAfterCapture: false,
    hotkey: null,
    icon: 'Camera',
    id,
    imageFormat: null,
    imageQuality: null,
    name: id,
    origin: 'user',
    screenshotMode: 'visible',
    status: true,
  };
}

it('toggles status and reorders only when the drag target is valid', async () => {
  const onPersist = vi.fn().mockResolvedValue(undefined);
  const setDraggedId = vi.fn();
  const setDragOverId = vi.fn();
  const actions = [createQuickAction('one'), createQuickAction('two')];

  await toggleQuickActionStatus(actions, 'one', onPersist);
  await reorderAndSaveQuickActions({
    actions,
    draggedId: 'one',
    onPersist,
    setDraggedId,
    setDragOverId,
    targetId: 'two',
  });

  expect(onPersist).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'one', status: false }),
    expect.objectContaining({ id: 'two', status: true }),
  ]);
  expect(onPersist).toHaveBeenLastCalledWith([actions[1], actions[0]]);
  expect(setDraggedId).toHaveBeenLastCalledWith(null);
  expect(setDragOverId).toHaveBeenLastCalledWith(null);
});

it('resets drag state when there is no actionable reorder target', async () => {
  const onPersist = vi.fn().mockResolvedValue(undefined);
  const setDraggedId = vi.fn();
  const setDragOverId = vi.fn();

  await reorderAndSaveQuickActions({
    actions: [createQuickAction('one')],
    draggedId: null,
    onPersist,
    setDraggedId,
    setDragOverId,
    targetId: 'one',
  });

  expect(onPersist).not.toHaveBeenCalled();
  expect(setDraggedId).toHaveBeenLastCalledWith(null);
  expect(setDragOverId).toHaveBeenLastCalledWith(null);
});
