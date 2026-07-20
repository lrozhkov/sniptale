import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleCropMouseDown: vi.fn(),
  handleRasterToolMouseDown: vi.fn(),
  handleShapeMouseDown: vi.fn(),
  handleSelectedTextTargetMouseDown: vi.fn(() => false),
  isRasterEditorTool: vi.fn(() => false),
}));

vi.mock('../raster-tools/interactions/down', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster-tools/interactions/down')>()),
  handleRasterToolMouseDown: mocks.handleRasterToolMouseDown,
}));

vi.mock('../raster-tools/interactions/tool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster-tools/interactions/tool')>()),
  isRasterEditorTool: mocks.isRasterEditorTool,
}));

vi.mock('./drawing-tool-actions/primitive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./drawing-tool-actions/primitive')>()),
  handleCropMouseDown: mocks.handleCropMouseDown,
  handleShapeMouseDown: mocks.handleShapeMouseDown,
}));

vi.mock('./drawing-callout-actions', () => ({
  handleCalloutMouseDown: vi.fn(),
}));

vi.mock('./text-callout/selected', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./text-callout/selected')>()),
  handleSelectedTextTargetMouseDown: mocks.handleSelectedTextTargetMouseDown,
}));

vi.mock('./arrow-drawing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./arrow-drawing')>()),
  handleArrowDrawingMouseDown: vi.fn(),
}));

vi.mock('./line-drawing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./line-drawing')>()),
  handleLineDrawingMouseDown: vi.fn(),
}));

import { handleDrawingMouseDownTool } from './drawing-mouse-down/handler';

function createCanvas() {
  const activeObject = { id: 'active' };
  return {
    discardActiveObject: vi.fn(),
    getActiveObject: vi.fn(() => activeObject),
    getActiveObjects: vi.fn(() => [activeObject]),
    getScenePoint: vi.fn(() => ({ x: 12, y: 24 })),
    requestRenderAll: vi.fn(),
  };
}

function createBindings(tool: string, overrides: Record<string, unknown> = {}) {
  return {
    getActiveTool: vi.fn(() => tool),
    getCropGuide: vi.fn(() => ({ id: 'crop-guide' })),
    getCropSelectionMouseEnabled: vi.fn(() => true),
    syncRuntimeState: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handleSelectedTextTargetMouseDown.mockReturnValue(false);
  mocks.isRasterEditorTool.mockReturnValue(false);
});

it('routes raster tools without clearing the active annotation selection', () => {
  const canvas = createCanvas();
  const bindings = createBindings('brush');
  mocks.isRasterEditorTool.mockReturnValue(true);

  expect(
    handleDrawingMouseDownTool(bindings as never, canvas as never, { e: { kind: 'down' } } as never)
  ).toBe(true);

  expect(mocks.handleRasterToolMouseDown).toHaveBeenCalledWith(bindings, {
    canvas,
    event: { e: { kind: 'down' } },
  });
  expect(canvas.discardActiveObject).not.toHaveBeenCalled();
  expect(bindings.syncRuntimeState).not.toHaveBeenCalled();
});

it('clears selection before dispatching a new sticky shape draw session', () => {
  const canvas = createCanvas();
  const bindings = createBindings('rectangle');

  handleDrawingMouseDownTool(
    bindings as never,
    canvas as never,
    {
      alreadySelected: false,
      e: { kind: 'down' },
    } as never
  );

  expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
  expect(mocks.handleShapeMouseDown).toHaveBeenCalledWith(bindings, 'rectangle', { x: 12, y: 24 });
});

it('keeps crop guide interactions under Fabric transform ownership', () => {
  const cropGuide = { id: 'crop-guide' };
  const canvas = createCanvas();
  const bindings = createBindings('crop', {
    getCropGuide: vi.fn(() => cropGuide),
  });

  handleDrawingMouseDownTool(
    bindings as never,
    canvas as never,
    {
      e: { kind: 'down' },
      target: cropGuide,
    } as never
  );

  expect(mocks.handleCropMouseDown).not.toHaveBeenCalled();
  expect(canvas.discardActiveObject).not.toHaveBeenCalled();
});
