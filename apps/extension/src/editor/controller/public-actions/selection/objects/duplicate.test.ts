import { expect, it, vi } from 'vitest';

import { createObjectLabel } from '../../../../document/model';
import { duplicateEditorSelection } from './duplicate';

it('clones the selection, assigns new identity, and selects the clone', async () => {
  const randomUUID = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('00000000-0000-4000-8000-000000000001');
  const clone: {
    sniptaleId?: string;
    sniptaleLabel?: string;
    sniptaleType: string;
    set: ReturnType<typeof vi.fn>;
  } = {
    sniptaleType: 'rectangle',
    set: vi.fn(),
  };
  const object = {
    clone: vi.fn(async () => clone),
    sniptaleType: 'rectangle',
  };
  const canvas = {
    add: vi.fn(),
    getActiveObjects: () => [object],
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const prepareObject = vi.fn();
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();

  await duplicateEditorSelection({
    canvas: canvas as never,
    commitHistory,
    nextLabelIndex: () => 3,
    prepareObject,
    syncRuntimeState,
  });

  expect(clone.set).toHaveBeenCalledWith({ left: 24, top: 24 });
  expect(clone.sniptaleId).toBe('00000000-0000-4000-8000-000000000001');
  expect(clone.sniptaleLabel).toBe(createObjectLabel('rectangle', 3));
  expect(prepareObject).toHaveBeenCalledWith(clone);
  expect(canvas.add).toHaveBeenCalledWith(clone);
  expect(canvas.setActiveObject).toHaveBeenCalledWith(clone);
  expect(commitHistory).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
  randomUUID.mockRestore();
});
