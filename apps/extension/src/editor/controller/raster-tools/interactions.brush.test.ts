import { Point } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import { createEditorRasterToolSession } from './session';
import {
  handleRasterToolMouseDown,
  handleRasterToolMouseMove,
  handleRasterToolMouseUp,
} from './interactions';

const mocks = vi.hoisted(() => ({
  finishBrushDraft: vi.fn(async () => false),
  handleBrushMouseDown: vi.fn(async () => true),
  resolveBrushCursorStatus: vi.fn(() => 'ready'),
  updateBrushDraft: vi.fn(() => false),
  updateBrushHoverCursor: vi.fn(() => true),
}));

vi.mock('./brush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./brush')>()),
  finishBrushDraft: mocks.finishBrushDraft,
  handleBrushMouseDown: mocks.handleBrushMouseDown,
  resolveBrushCursorStatus: mocks.resolveBrushCursorStatus,
  updateBrushDraft: mocks.updateBrushDraft,
  updateBrushHoverCursor: mocks.updateBrushHoverCursor,
}));

function createBindings() {
  const session = createEditorRasterToolSession();
  return {
    getActiveTool: () => 'brush',
    getCanvas: () => null,
    getRasterToolSession: () => session,
    session,
  };
}

function createCanvas() {
  return {
    defaultCursor: 'default',
    getScenePoint: () => new Point(10, 12),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useEditorStore.setState({
    rasterTarget: { layerId: null, layerName: null, status: 'missing' },
  });
});

it('routes brush down, hover move, draft move, and finish through the brush owner', async () => {
  const bindings = createBindings();
  const canvas = createCanvas();

  expect(
    await handleRasterToolMouseDown(bindings as never, {
      canvas: canvas as never,
      event: { e: {} as never },
    })
  ).toBe(true);
  expect(
    handleRasterToolMouseMove(bindings as never, {
      canvas: canvas as never,
      event: { e: {} as never },
    })
  ).toBe(true);
  mocks.updateBrushDraft.mockReturnValueOnce(true);
  expect(
    handleRasterToolMouseMove(bindings as never, {
      canvas: canvas as never,
      event: { e: {} as never },
    })
  ).toBe(true);
  mocks.finishBrushDraft.mockResolvedValueOnce(true);
  expect(await handleRasterToolMouseUp(bindings as never)).toBe(true);

  expect(mocks.handleBrushMouseDown).toHaveBeenCalledOnce();
  expect(mocks.resolveBrushCursorStatus).toHaveBeenCalled();
  expect(mocks.updateBrushHoverCursor).toHaveBeenCalledOnce();
  expect(mocks.updateBrushDraft).toHaveBeenCalled();
  expect(mocks.finishBrushDraft).toHaveBeenCalledOnce();
  expect(canvas.defaultCursor).toBe('crosshair');
  expect(useEditorStore.getState().rasterTarget.status).toBe('ready');
});

it('uses not-allowed cursor for blocked brush targets', () => {
  const bindings = createBindings();
  const canvas = createCanvas();
  mocks.resolveBrushCursorStatus.mockReturnValueOnce('locked');

  handleRasterToolMouseMove(bindings as never, {
    canvas: canvas as never,
    event: { e: {} as never, target: { sniptaleId: 'locked', sniptaleLabel: 'Locked' } as never },
  });

  expect(canvas.defaultCursor).toBe('not-allowed');
  expect(useEditorStore.getState().rasterTarget.status).toBe('locked');
});
