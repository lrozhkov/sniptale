import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTextboxMock: vi.fn(() => false),
}));

vi.mock('../core/helpers', async () => ({
  ...(await vi.importActual<typeof import('../core/helpers')>('../core/helpers')),
  isTextbox: mocks.isTextboxMock,
}));

vi.mock('../input', () => ({
  handleEditorDoubleClick: vi.fn(),
  handleEditorWindowBlur: vi.fn(),
  handleEditorWindowKeyDown: vi.fn(() => ({ nextSpacePressed: undefined, preventDefault: false })),
  handleEditorWindowKeyUp: vi.fn(() => ({})),
  resolveEditorSpaceKeyUp: () => false,
}));

vi.mock('../document/source', async () => ({
  ...(await vi.importActual<typeof import('../document/source')>('../document/source')),
  syncSourceStateFromObject: vi.fn(),
}));

vi.mock('./text-callout', async () => ({
  ...(await vi.importActual<typeof import('./text-callout')>('./text-callout')),
  normalizeScaledTextCalloutTarget: vi.fn(),
  updateTextCalloutHoverCursor: vi.fn(),
}));

import { createRuntimeEventHandlers } from './runtime';

function createBindings() {
  const canvas = {
    requestRenderAll: vi.fn(),
  };

  return {
    canvas,
    ensureObjectReachable: vi.fn(() => true),
    getCanvas: vi.fn(() => canvas),
    syncRuntimeState: vi.fn(),
  };
}

function createScaledRectangle() {
  return {
    getCenterPoint: () => ({ x: 110, y: 40 }),
    height: 20,
    left: 10,
    sniptaleRole: 'annotation',
    sniptaleShapeRadius: 50,
    sniptaleType: 'rectangle',
    rx: 12,
    ry: 12,
    scaleX: 2,
    scaleY: 0.5,
    set: vi.fn(function apply(this: Record<string, unknown>, payload: Record<string, unknown>) {
      Object.assign(this, payload);
    }),
    setCoords: vi.fn(),
    setPositionByOrigin: vi.fn(),
    strokeWidth: 2,
    top: 30,
    width: 100,
  };
}

function expectRectangleResizeNormalized(
  rectangle: ReturnType<typeof createScaledRectangle>,
  bindings: ReturnType<typeof createBindings>
) {
  expect(rectangle.scaleX).toBe(1);
  expect(rectangle.scaleY).toBe(1);
  expect(rectangle.width).toBe(200);
  expect(rectangle.height).toBe(10);
  expect(rectangle.rx).toBe(5);
  expect(rectangle.ry).toBe(5);
  expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(rectangle);
  expect(bindings.canvas.requestRenderAll).toHaveBeenCalledOnce();
}

describe('runtime annotation resize integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes non-raster annotation scaling through the shared resize seam', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const pencil = { sniptaleType: 'pencil', set: vi.fn(), setCoords: vi.fn() };
    const highlighter = { sniptaleType: 'highlighter', set: vi.fn(), setCoords: vi.fn() };
    const circle = { set: vi.fn() };
    const step = {
      getObjects: vi.fn(() => [circle, { set: vi.fn() }]),
      sniptaleType: 'step',
      setCoords: vi.fn(),
    };

    handlers.handleObjectScaling({ target: pencil } as never);
    handlers.handleObjectScaling({ target: highlighter } as never);
    handlers.handleObjectScaling({ target: step } as never);

    expect(pencil.set).toHaveBeenCalledWith(expect.objectContaining({ strokeUniform: true }));
    expect(highlighter.set).toHaveBeenCalledWith(expect.objectContaining({ strokeUniform: true }));
    expect(circle.set).toHaveBeenCalledWith(expect.objectContaining({ strokeUniform: true }));
    expect(bindings.ensureObjectReachable).toHaveBeenCalledTimes(3);
    expect(bindings.canvas.requestRenderAll).toHaveBeenCalledTimes(3);
  });

  it('normalizes scaled rectangles through the rectangle geometry seam', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const rectangle = createScaledRectangle();

    handlers.handleObjectScaling({ target: rectangle } as never);
    expectRectangleResizeNormalized(rectangle, bindings);
  });
});
