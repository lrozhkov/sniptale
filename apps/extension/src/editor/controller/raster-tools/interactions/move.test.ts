import { Point } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../../state/useEditorStore';
import { handleRasterToolMouseMove } from './move';

const mocks = vi.hoisted(() => ({
  clearEditorRasterHoverCursor: vi.fn(),
  syncRasterPointerTarget: vi.fn(),
  updateBrushDraft: vi.fn(() => false),
  updateBrushHoverCursor: vi.fn(() => true),
  updateEraserDraft: vi.fn(() => false),
  updateGradientDraft: vi.fn(() => false),
  updateLassoDraft: vi.fn(() => false),
  updateMarqueeDraft: vi.fn(() => false),
  updateRasterHoverCursor: vi.fn(() => true),
}));

vi.mock('./target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./target')>()),
  syncRasterPointerTarget: mocks.syncRasterPointerTarget,
}));

vi.mock('../brush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../brush')>()),
  updateBrushDraft: mocks.updateBrushDraft,
  updateBrushHoverCursor: mocks.updateBrushHoverCursor,
}));

vi.mock('../edit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../edit')>()),
  updateEraserDraft: mocks.updateEraserDraft,
  updateRasterHoverCursor: mocks.updateRasterHoverCursor,
}));

vi.mock('../fill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../fill')>()),
  updateGradientDraft: mocks.updateGradientDraft,
}));

vi.mock('../selection/draft', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../selection/draft')>()),
  updateLassoDraft: mocks.updateLassoDraft,
  updateMarqueeDraft: mocks.updateMarqueeDraft,
}));

vi.mock('../session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session')>()),
  clearEditorRasterHoverCursor: mocks.clearEditorRasterHoverCursor,
}));

function createBindings(tool: string) {
  const session = { hoverCursor: null };
  return {
    getActiveTool: () => tool,
    getCanvas: () => ({ id: 'main-canvas' }),
    getRasterToolSession: () => session,
    session,
  };
}

function createArgs() {
  const canvas = { getScenePoint: () => new Point(20, 24) };
  const target = { sniptaleId: 'pointer-layer' };
  return {
    canvas,
    target,
    args: {
      canvas: canvas as never,
      event: { e: {} as never, target: target as never },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useEditorStore.setState({
    rasterTarget: { layerId: 'layer-1', layerName: 'Layer 1', status: 'ready' },
  });
});

it('updates pointer target before draft movement and returns after the first active draft owner', () => {
  const bindings = createBindings('selection');
  const { args, canvas, target } = createArgs();
  mocks.updateLassoDraft.mockReturnValueOnce(true);

  expect(handleRasterToolMouseMove(bindings as never, args)).toBe(true);

  expect(mocks.syncRasterPointerTarget).toHaveBeenCalledWith(canvas, 'selection', target);
  expect(mocks.updateMarqueeDraft).toHaveBeenCalledOnce();
  expect(mocks.updateLassoDraft).toHaveBeenCalledOnce();
  expect(mocks.updateEraserDraft).not.toHaveBeenCalled();
});

it('updates actionable eraser and brush hover cursors after draft owners decline the move', () => {
  const eraserBindings = createBindings('eraser');
  const brushBindings = createBindings('brush');
  const { args } = createArgs();

  expect(handleRasterToolMouseMove(eraserBindings as never, args)).toBe(true);
  expect(handleRasterToolMouseMove(brushBindings as never, args)).toBe(true);

  expect(mocks.updateRasterHoverCursor).toHaveBeenCalledWith(
    eraserBindings.session,
    new Point(20, 24)
  );
  expect(mocks.updateBrushHoverCursor).toHaveBeenCalledWith(
    brushBindings.session,
    new Point(20, 24)
  );
});

it('clears hover state for non-actionable targets and ignores non-raster tools', () => {
  const bindings = createBindings('fill');
  const { args } = createArgs();
  useEditorStore.setState({
    rasterTarget: { layerId: null, layerName: null, status: 'missing' },
  });

  expect(handleRasterToolMouseMove(bindings as never, args)).toBe(false);
  expect(mocks.clearEditorRasterHoverCursor).toHaveBeenCalledWith(bindings.session);

  const nonRaster = createBindings('text');
  expect(handleRasterToolMouseMove(nonRaster as never, args)).toBe(false);
  expect(mocks.syncRasterPointerTarget).toHaveBeenCalledTimes(1);
});
