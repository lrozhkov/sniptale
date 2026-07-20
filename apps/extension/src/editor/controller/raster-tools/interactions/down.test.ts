import { Point } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';
import { handleRasterToolMouseDown } from './down';

const mocks = vi.hoisted(() => ({
  handleBrushMouseDown: vi.fn(async () => true),
  handleEraserMouseDown: vi.fn(async () => true),
  handleFillMouseDown: vi.fn(async () => true),
  handleSelectionMouseDown: vi.fn(async () => true),
}));

vi.mock('../brush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../brush')>()),
  handleBrushMouseDown: mocks.handleBrushMouseDown,
}));

vi.mock('../edit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../edit')>()),
  handleEraserMouseDown: mocks.handleEraserMouseDown,
}));

vi.mock('../fill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../fill')>()),
  handleFillMouseDown: mocks.handleFillMouseDown,
}));

vi.mock('../selection/start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../selection/start')>()),
  handleSelectionMouseDown: mocks.handleSelectionMouseDown,
}));

function createBindings(tool: string) {
  return {
    getActiveTool: () => tool,
  };
}

function createArgs() {
  const canvas = { getScenePoint: () => new Point(12, 16) };
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
});

it('routes raster mouse down to the active tool owner with the pointer target', async () => {
  const { args, canvas, target } = createArgs();

  await handleRasterToolMouseDown(createBindings('selection') as never, args);
  await handleRasterToolMouseDown(createBindings('brush') as never, args);
  await handleRasterToolMouseDown(createBindings('eraser') as never, args);
  await handleRasterToolMouseDown(createBindings('fill') as never, args);

  expect(mocks.handleSelectionMouseDown).toHaveBeenCalledWith(
    expect.anything(),
    canvas,
    new Point(12, 16),
    target
  );
  expect(mocks.handleBrushMouseDown).toHaveBeenCalledWith(
    expect.anything(),
    canvas,
    new Point(12, 16),
    target
  );
  expect(mocks.handleEraserMouseDown).toHaveBeenCalledWith(
    expect.anything(),
    canvas,
    new Point(12, 16),
    target
  );
  expect(mocks.handleFillMouseDown).toHaveBeenCalledWith(
    expect.anything(),
    canvas,
    new Point(12, 16),
    target
  );
});

it('ignores non-raster tools before reading the scene point', async () => {
  const canvas = { getScenePoint: vi.fn() };

  await expect(
    handleRasterToolMouseDown(createBindings('text') as never, {
      canvas: canvas as never,
      event: { e: {} as never },
    })
  ).resolves.toBe(false);

  expect(canvas.getScenePoint).not.toHaveBeenCalled();
});
