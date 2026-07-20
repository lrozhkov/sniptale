import { Point } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import { createEditorRasterToolSession } from './session';
import { handleRasterToolMouseDown, handleRasterToolMouseMove } from './interactions';

const mocks = vi.hoisted(() => ({
  handleFillMouseDown: vi.fn(async () => true),
  resolveRasterTargetState: vi.fn(),
}));

vi.mock('./fill', async () => {
  const actual = await vi.importActual<typeof import('./fill')>('./fill');
  return {
    ...actual,
    handleFillMouseDown: mocks.handleFillMouseDown,
  };
});

vi.mock('../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/target')>()),
  createRasterTargetSnapshot: vi.fn(),
  resolveBitmapPoint: vi.fn(),
  resolveRasterTarget: vi.fn(),
  resolveRasterTargetState: mocks.resolveRasterTargetState,
}));

function createBindings() {
  const session = createEditorRasterToolSession();
  return {
    getActiveTool: () => 'fill',
    getCanvas: () => ({}),
    getRasterToolSession: () => session,
  };
}

function resetEnvironment() {
  vi.clearAllMocks();
  mocks.resolveRasterTargetState.mockReturnValue({
    summary: {
      layerId: 'layer-1',
      layerName: 'Layer 1',
      status: 'ready',
    },
    target: null,
  });
}

function registerMouseDownTargetTest() {
  it('forwards the pointer target into raster mouse-down handling', async () => {
    const canvas = { getScenePoint: () => new Point(12, 16) };
    const target = { sniptaleId: 'pointer-layer' };

    await handleRasterToolMouseDown(createBindings() as never, {
      canvas: canvas as never,
      event: { e: {} as never, target: target as never },
    });

    expect(mocks.handleFillMouseDown).toHaveBeenCalledWith(
      expect.anything(),
      canvas,
      new Point(12, 16),
      target
    );
  });
}

function registerHoverTargetTest() {
  it('refreshes raster cursor state from the pointer target during hover', () => {
    const canvas = {
      defaultCursor: 'not-allowed',
      getScenePoint: () => new Point(30, 32),
    };
    const target = { sniptaleId: 'pointer-layer' };

    expect(
      handleRasterToolMouseMove(createBindings() as never, {
        canvas: canvas as never,
        event: { e: {} as never, target: target as never },
      })
    ).toBe(false);

    expect(mocks.resolveRasterTargetState).toHaveBeenCalledWith({ canvas, fallbackTarget: target });
    expect(useEditorStore.getState().rasterTarget.status).toBe('ready');
    expect(canvas.defaultCursor).toBe('crosshair');
  });
}

describe('editor-controller/raster-tools pointer target routing', () => {
  beforeEach(resetEnvironment);
  registerMouseDownTargetTest();
  registerHoverTargetTest();
});
