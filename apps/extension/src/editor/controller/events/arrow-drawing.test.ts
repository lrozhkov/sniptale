import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { readArrowPoints } from '../../objects/arrow/controls';
import { createArrowObject } from '../../objects/arrow';

const defaultArrowSettings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).arrow;

const mocks = vi.hoisted(() => ({
  arrowSettings: {
    color: '#111827',
    arrowType: 'sharp',
    dynamicWidth: false,
    endHead: 'triangle',
    mode: 'straight',
    opacity: 1,
    shadow: 0,
    startHead: 'none',
    variant: 'standard',
    width: 3,
  },
  completeEditorDrawWorkflowMock: vi.fn(() => ({
    cropGuide: null,
    cropSelection: null,
    drawSession: null,
  })),
  handleArrowMouseDownMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      toolSettings: {
        arrow: {
          ...mocks.arrowSettings,
        },
      },
    }),
  },
}));

vi.mock('../draw-workflow', async () => ({
  ...(await vi.importActual<typeof import('../draw-workflow')>('../draw-workflow')),
  completeEditorDrawWorkflow: mocks.completeEditorDrawWorkflowMock,
}));

vi.mock('./drawing-tool-actions/primitive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./drawing-tool-actions/primitive')>()),
  handleArrowMouseDown: mocks.handleArrowMouseDownMock,
}));

import { handleArrowDrawingMouseDown, shouldKeepArrowDrawSessionOpen } from './arrow-drawing';

function createCanvas(point = { x: 10, y: 0 }) {
  return {
    discardActiveObject: vi.fn(),
    getActiveObject: vi.fn(() => ({ sniptaleId: 'active' })),
    getActiveObjects: vi.fn(() => [{ sniptaleId: 'active' }]),
    getScenePoint: vi.fn(() => point),
    requestRenderAll: vi.fn(),
  };
}

function createBindings(drawSession: unknown = null) {
  const canvas = createCanvas();
  return {
    canvas,
    bindings: {
      commitHistory: vi.fn(),
      getCanvas: vi.fn(() => canvas),
      getCanvasDocumentSize: vi.fn(() => ({ height: 100, width: 100 })),
      getDrawSession: vi.fn(() => drawSession),
      setCropState: vi.fn(),
      setDrawSession: vi.fn(),
      syncRuntimeState: vi.fn(),
    },
  };
}

function createArrow(
  points = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ],
  settings = defaultArrowSettings
) {
  return createArrowObject({
    id: 'arrow-1',
    labelIndex: 1,
    points,
    settings,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.arrowSettings, {
    ...defaultArrowSettings,
    color: '#111827',
    arrowType: 'sharp',
    dynamicWidth: false,
    width: 3,
  });
});

it('starts a new arrow session through the drawing action seam', () => {
  const { bindings, canvas } = createBindings();

  handleArrowDrawingMouseDown(bindings as never, canvas as never, { e: {} as never });

  expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
  expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
  expect(mocks.handleArrowMouseDownMock).toHaveBeenCalledWith(bindings, { x: 10, y: 0 });
});

it('keeps selected arrow targets under existing edit controls', () => {
  const selectedByFlag = createBindings();
  handleArrowDrawingMouseDown(selectedByFlag.bindings as never, selectedByFlag.canvas as never, {
    alreadySelected: true,
    e: {} as never,
    target: { sniptaleId: 'active' } as never,
  });

  const selectedByCanvas = createBindings();
  handleArrowDrawingMouseDown(
    selectedByCanvas.bindings as never,
    selectedByCanvas.canvas as never,
    {
      e: {} as never,
      target: { sniptaleId: 'active' } as never,
    }
  );

  expect(selectedByFlag.canvas.discardActiveObject).not.toHaveBeenCalled();
  expect(selectedByCanvas.canvas.discardActiveObject).not.toHaveBeenCalled();
  expect(mocks.handleArrowMouseDownMock).not.toHaveBeenCalled();
});

it('extends click-mode arrow sessions with a trailing preview point', () => {
  const arrow = createArrow();
  arrow.sniptaleArrowClickMode = true;
  const drawSession = { object: arrow, tool: 'arrow' };
  const { bindings, canvas } = createBindings(drawSession);

  handleArrowDrawingMouseDown(bindings as never, canvas as never, { e: {} as never });

  expect(drawSession).toEqual(expect.objectContaining({ lastPoint: { x: 10, y: 0 } }));
  expect(arrow.sniptaleArrowDraftPoints).toEqual([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 0 },
  ]);
  expect(arrow.sniptaleArrowClickMode).toBe(true);
  expect(arrow.sniptaleArrowPointerMoved).toBe(false);
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
});

it('extends click-mode sessions from raw draft points instead of normalized elbow routes', () => {
  const arrow = createArrow([
    { x: 0, y: 0 },
    { x: 15, y: 0 },
    { x: 15, y: 20 },
    { x: 30, y: 20 },
    { x: 30, y: 20 },
  ]);
  arrow.sniptaleArrowClickMode = true;
  arrow.sniptaleArrowDraftPoints = [
    { x: 0, y: 0 },
    { x: 30, y: 20 },
    { x: 30, y: 20 },
  ];
  const { bindings, canvas } = createBindings({ object: arrow, tool: 'arrow' });
  canvas.getScenePoint.mockReturnValueOnce({ x: 60, y: 40 });

  handleArrowDrawingMouseDown(bindings as never, canvas as never, { e: {} as never });

  expect(arrow.sniptaleArrowDraftPoints).toEqual([
    { x: 0, y: 0 },
    { x: 30, y: 20 },
    { x: 60, y: 40 },
    { x: 60, y: 40 },
  ]);
  expect(readArrowPoints(arrow).length).toBeLessThanOrEqual(6);
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
});

it('keeps elbow click-route sessions open after adding the second point', () => {
  Object.assign(mocks.arrowSettings, { arrowType: 'elbow' });
  const arrow = createArrow(undefined, { ...defaultArrowSettings, arrowType: 'elbow' });
  arrow.sniptaleArrowClickMode = true;
  arrow.sniptaleArrowDraftPoints = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  const { bindings, canvas } = createBindings({ object: arrow, tool: 'arrow' });
  canvas.getScenePoint.mockReturnValueOnce({ x: 40, y: 20 });

  handleArrowDrawingMouseDown(bindings as never, canvas as never, { e: {} as never });

  expect(arrow.sniptaleArrowDraftPoints).toEqual([
    { x: 0, y: 0 },
    { x: 40, y: 20 },
    { x: 40, y: 20 },
  ]);
  expect(readArrowPoints(arrow)).toEqual([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 40, y: 20 },
  ]);
  expect(mocks.completeEditorDrawWorkflowMock).not.toHaveBeenCalled();
  expect(arrow.sniptaleArrowClickMode).toBe(true);
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
});

it('completes sessions when the next click repeats the last point', () => {
  const arrow = createArrow([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 20, y: 20 },
  ]);
  arrow.sniptaleArrowClickMode = true;
  const { bindings, canvas } = createBindings({ object: arrow, tool: 'arrow' });
  canvas.getScenePoint.mockReturnValueOnce({ x: 21, y: 20 });

  handleArrowDrawingMouseDown(bindings as never, canvas as never, { e: {} as never });

  expect(mocks.completeEditorDrawWorkflowMock).toHaveBeenCalledOnce();
  expect(bindings.setDrawSession).toHaveBeenCalledWith(null);
  expect(bindings.setCropState).toHaveBeenCalledWith(null, null);
});

it('keeps click-mode sessions open until the pointer moves', () => {
  const arrow = createArrow();
  arrow.sniptaleArrowPointerMoved = false;
  const { bindings } = createBindings({ object: arrow, tool: 'arrow' });

  expect(shouldKeepArrowDrawSessionOpen(bindings as never)).toBe(true);
  expect(arrow.sniptaleArrowClickMode).toBe(true);

  arrow.sniptaleArrowPointerMoved = true;
  arrow.sniptaleArrowClickMode = false;
  expect(shouldKeepArrowDrawSessionOpen(bindings as never)).toBe(false);
  expect(shouldKeepArrowDrawSessionOpen(createBindings().bindings as never)).toBe(false);
});
