import { expect, it, vi } from 'vitest';

import { nudgeEditorSelection } from './nudge';

it('moves selected objects, refreshes coordinates, and syncs runtime state', () => {
  const object = {
    left: 10,
    sniptaleId: 'object',
    sniptaleLocked: false,
    set: vi.fn(),
    setCoords: vi.fn(),
    top: 20,
  };
  const canvas = {
    getActiveObject: () => object,
    getActiveObjects: () => [object],
    requestRenderAll: vi.fn(),
  };
  const setSource = vi.fn();
  const syncRuntimeState = vi.fn();

  expect(
    nudgeEditorSelection({
      canvas: canvas as never,
      deltaX: 4,
      deltaY: -2,
      ensureObjectReachable: vi.fn(),
      setSource,
      source: null,
      syncRuntimeState,
    })
  ).toBe(true);

  expect(object.set).toHaveBeenCalledWith({ left: 14, top: 18 });
  expect(object.setCoords).toHaveBeenCalled();
  expect(setSource).toHaveBeenCalledWith(null);
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
});
