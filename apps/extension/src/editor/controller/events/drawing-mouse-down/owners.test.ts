import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleArrowDrawingMouseDownMock: vi.fn(),
  handleCropMouseDownMock: vi.fn(),
  handleLineDrawingMouseDownMock: vi.fn(),
  handleRichShapeToolMouseDownMock: vi.fn(),
  handleShapeMouseDownMock: vi.fn(),
}));

vi.mock('../arrow-drawing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../arrow-drawing')>()),
  handleArrowDrawingMouseDown: mocks.handleArrowDrawingMouseDownMock,
}));

vi.mock('../drawing-tool-actions/primitive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../drawing-tool-actions/primitive')>()),
  handleCropMouseDown: mocks.handleCropMouseDownMock,
  handleShapeMouseDown: mocks.handleShapeMouseDownMock,
}));

vi.mock('../drawing-tool-actions/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../drawing-tool-actions/rich-shape')>()),
  handleRichShapeToolMouseDown: mocks.handleRichShapeToolMouseDownMock,
}));

vi.mock('../line-drawing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../line-drawing')>()),
  handleLineDrawingMouseDown: mocks.handleLineDrawingMouseDownMock,
}));

vi.mock('../drawing-callout-actions', () => ({
  handleCalloutMouseDown: vi.fn(),
}));

import { cropDown } from './crop';
import { drawDown } from './direct';
import { stickyDown } from './sticky';

function createCanvas() {
  return {
    getScenePoint: vi.fn(() => ({ x: 12, y: 24 })),
  };
}

function createBindings(overrides: Record<string, unknown> = {}) {
  return {
    getCropGuide: vi.fn(() => null),
    getCropSelectionMouseEnabled: vi.fn(() => true),
    ...overrides,
  };
}

describe('drawing mouse down dispatch owners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes direct arrow drawing before sticky tools', () => {
    const canvas = createCanvas();
    const bindings = createBindings();

    expect(drawDown(bindings as never, canvas as never, 'arrow', { e: {} } as never)).toBe(true);
    expect(mocks.handleArrowDrawingMouseDownMock).toHaveBeenCalledWith(bindings, canvas, { e: {} });
    expect(drawDown(bindings as never, canvas as never, 'select', { e: {} } as never)).toBe(true);
    expect(drawDown(bindings as never, canvas as never, 'line', { e: {} } as never)).toBe(true);
    expect(drawDown(bindings as never, canvas as never, 'rectangle', { e: {} } as never)).toBe(
      false
    );
    expect(mocks.handleLineDrawingMouseDownMock).toHaveBeenCalledWith(bindings, canvas, { e: {} });
  });

  it('keeps crop guide targets under fabric transform ownership', () => {
    const cropGuide = { id: 'crop-guide' };
    const canvas = createCanvas();
    const bindings = createBindings({ getCropGuide: vi.fn(() => cropGuide) });

    expect(
      cropDown(bindings as never, canvas as never, 'crop', { e: {}, target: cropGuide } as never)
    ).toBe(true);
    expect(mocks.handleCropMouseDownMock).not.toHaveBeenCalled();
  });

  it('dispatches sticky shape-library tools from the scene point owner', () => {
    const canvas = createCanvas();
    const bindings = createBindings();

    stickyDown(bindings as never, canvas as never, 'shape-library', { e: {} } as never);

    expect(mocks.handleRichShapeToolMouseDownMock).toHaveBeenCalledWith(bindings, 'shape-library', {
      x: 12,
      y: 24,
    });
  });
});
