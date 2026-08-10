import { expect, it, vi } from 'vitest';

import { createObjectLabel } from '../../../../document/model';
import { parseEditorDrawingMetadata } from '../../../../document/import-boundary';
import { duplicateEditorSelection } from './duplicate';

it('clones the selection, assigns new identity, and selects the clone', async () => {
  const randomUUID = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('00000000-0000-4000-8000-000000000001');
  const clone: {
    sniptaleId?: string;
    sniptaleLabel?: string;
    sniptaleDrawingJson?: string;
    sniptaleType: string;
    set: ReturnType<typeof vi.fn>;
  } = {
    sniptaleType: 'shape',
    sniptaleDrawingJson: JSON.stringify({
      version: 1,
      object: {
        bounds: { height: 20, width: 30, x: 10, y: 15 },
        color: '#f00',
        fillColor: null,
        id: 'shape-original',
        kind: 'rectangle',
        width: 4,
      },
    }),
    set: vi.fn(),
  };
  const object = {
    clone: vi.fn(async () => clone),
    sniptaleType: 'shape',
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
  expect(clone.sniptaleLabel).toBe(createObjectLabel('shape', 3));
  expect(parseEditorDrawingMetadata(clone.sniptaleDrawingJson)).toMatchObject({
    bounds: { x: 34, y: 39 },
    id: '00000000-0000-4000-8000-000000000001',
  });
  expect(prepareObject).toHaveBeenCalledWith(clone);
  expect(canvas.add).toHaveBeenCalledWith(clone);
  expect(canvas.setActiveObject).toHaveBeenCalledWith(clone);
  expect(commitHistory).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
  randomUUID.mockRestore();
});
