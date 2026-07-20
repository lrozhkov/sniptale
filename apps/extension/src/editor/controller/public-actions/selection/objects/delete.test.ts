import { expect, it, vi } from 'vitest';

import { deleteEditorSelection } from './delete';

it('deletes non-source objects and resets frame draft when a background is removed', () => {
  const background = { sniptaleRole: 'background', sniptaleType: 'background' };
  const canvas = {
    discardActiveObject: vi.fn(),
    getActiveObjects: () => [background],
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
  };
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();

  deleteEditorSelection({
    canvas: canvas as never,
    commitHistory,
    syncRuntimeState,
  });

  expect(canvas.remove).toHaveBeenCalledWith(background);
  expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(commitHistory).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
});

it('keeps source objects and history untouched', () => {
  const source = { sniptaleRole: 'source', sniptaleType: 'source-image' };
  const canvas = {
    discardActiveObject: vi.fn(),
    getActiveObjects: () => [source],
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
  };
  const commitHistory = vi.fn();

  deleteEditorSelection({
    canvas: canvas as never,
    commitHistory,
    syncRuntimeState: vi.fn(),
  });

  expect(canvas.remove).not.toHaveBeenCalled();
  expect(commitHistory).not.toHaveBeenCalled();
});
