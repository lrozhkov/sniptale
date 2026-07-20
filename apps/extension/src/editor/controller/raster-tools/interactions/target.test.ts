import { beforeEach, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../../state/useEditorStore';
import { syncRasterPointerTarget } from './target';

const mocks = vi.hoisted(() => ({
  resolveBrushCursorStatus: vi.fn(() => 'ready'),
  resolveRasterTargetState: vi.fn(),
}));

vi.mock('../brush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../brush')>()),
  resolveBrushCursorStatus: mocks.resolveBrushCursorStatus,
}));

vi.mock('../../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster/target')>()),
  resolveRasterTargetState: mocks.resolveRasterTargetState,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useEditorStore.setState({
    rasterTarget: { layerId: null, layerName: null, status: 'missing' },
  });
  mocks.resolveRasterTargetState.mockReturnValue({
    summary: { layerId: 'layer-1', layerName: 'Layer 1', status: 'ready' },
    target: null,
  });
});

it('stores brush pointer status through the brush target owner', () => {
  const canvas = { defaultCursor: 'default' };
  const fallbackTarget = { sniptaleId: 'locked', sniptaleLabel: 'Locked' };

  syncRasterPointerTarget(canvas as never, 'brush', fallbackTarget as never);
  expect(useEditorStore.getState().rasterTarget).toEqual({
    layerId: null,
    layerName: null,
    status: 'ready',
  });
  expect(canvas.defaultCursor).toBe('crosshair');

  mocks.resolveBrushCursorStatus.mockReturnValueOnce('locked');
  syncRasterPointerTarget(canvas as never, 'brush', fallbackTarget as never);
  expect(useEditorStore.getState().rasterTarget).toEqual({
    layerId: 'locked',
    layerName: 'Locked',
    status: 'locked',
  });
  expect(canvas.defaultCursor).toBe('not-allowed');
});

it('stores non-brush raster target summaries and derives the cursor from actionability', () => {
  const canvas = { defaultCursor: 'default' };
  const fallbackTarget = { sniptaleId: 'layer-1' };

  syncRasterPointerTarget(canvas as never, 'eraser', fallbackTarget as never);

  expect(mocks.resolveRasterTargetState).toHaveBeenCalledWith({ canvas, fallbackTarget });
  expect(useEditorStore.getState().rasterTarget.status).toBe('ready');
  expect(canvas.defaultCursor).toBe('none');

  mocks.resolveRasterTargetState.mockReturnValueOnce({
    summary: { layerId: null, layerName: null, status: 'missing' },
    target: null,
  });
  syncRasterPointerTarget(canvas as never, 'fill');
  expect(canvas.defaultCursor).toBe('not-allowed');
});
