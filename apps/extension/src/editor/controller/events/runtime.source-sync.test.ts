import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshBlurObjectsForSourceMock: vi.fn(),
  syncSourceStateFromObjectMock: vi.fn(() => ({ id: 'next-source' })),
}));

vi.mock('../document/source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/source')>()),
  syncSourceStateFromObject: mocks.syncSourceStateFromObjectMock,
}));

vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  refreshBlurObjectsForSource: mocks.refreshBlurObjectsForSourceMock,
}));

import { syncSourceState } from './runtime.source-sync';

describe('runtime source sync', () => {
  it('updates source state for any canvas object and refreshes blur objects for source images', () => {
    const drawingBlur = {
      set: vi.fn(),
      sniptaleBlurAmount: 12,
      sniptaleDrawingJson: JSON.stringify({
        object: {
          bounds: { height: 40, width: 60, x: 10, y: 20 },
          id: 'blur-1',
          kind: 'blur',
        },
        version: 1,
      }),
    };
    const bindings = {
      getCanvas: vi.fn(() => ({ getObjects: () => [drawingBlur], id: 'canvas' })),
      getSource: vi.fn(() => ({ id: 'source' })),
      setSource: vi.fn(),
    };

    syncSourceState(bindings as never, { sniptaleType: 'rectangle' } as never);
    syncSourceState(bindings as never, { sniptaleType: 'source-image' } as never);

    expect(bindings.setSource).toHaveBeenCalledTimes(2);
    expect(mocks.refreshBlurObjectsForSourceMock).toHaveBeenCalledOnce();
    expect(mocks.refreshBlurObjectsForSourceMock).toHaveBeenCalledWith(
      { getObjects: expect.any(Function), id: 'canvas' },
      { id: 'source' }
    );
    expect(drawingBlur.set).toHaveBeenCalledWith({
      fill: 'transparent',
      stroke: null,
      strokeWidth: 0,
    });
    expect(drawingBlur).not.toHaveProperty('sniptaleBlurAmount');
  });
});
