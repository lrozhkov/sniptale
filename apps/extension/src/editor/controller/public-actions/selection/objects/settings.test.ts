import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applySelectionToolSettingsToObjectsMock: vi.fn(),
}));

vi.mock('../../../selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection')>()),
  applySelectionToolSettingsToObjects: mocks.applySelectionToolSettingsToObjectsMock,
}));

import { applyEditorSelectionSettings, previewEditorSelectionSettings } from './settings';

it('applies selection settings with commit for apply and without commit for preview', () => {
  const selected = { sniptaleId: 'selected', sniptaleLocked: false, sniptaleType: 'rectangle' };
  const canvas = {
    getActiveObjects: () => [selected],
    requestRenderAll: vi.fn(),
  };
  const withHistoryMuted = vi.fn((callback: () => void) => callback()) as never;
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();

  applyEditorSelectionSettings({
    canvas: canvas as never,
    commitHistory,
    syncRuntimeState,
    withHistoryMuted,
  });
  previewEditorSelectionSettings({
    canvas: canvas as never,
    syncRuntimeState,
    withHistoryMuted,
  });

  expect(mocks.applySelectionToolSettingsToObjectsMock).toHaveBeenCalledTimes(2);
  expect(canvas.requestRenderAll).toHaveBeenCalledTimes(2);
  expect(commitHistory).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledTimes(2);
});
