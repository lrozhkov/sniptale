import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createLineObject, getLinePoints } from '../../objects/line';

const defaultLineSettings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

const mocks = vi.hoisted(() => ({
  completeEditorDrawWorkflowMock: vi.fn(() => ({
    cropGuide: null,
    cropSelection: null,
    drawSession: null,
  })),
  handleLineMouseDownMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      toolSettings: {
        line: {
          color: '#111827',
          corners: 'round',
          fillColor: '#ffffff',
          fillMode: 'none',
          fillOpacity: 0.2,
          gradientAngle: 0,
          gradientFrom: '#ffffff',
          gradientTo: '#ff671d',
          opacity: 1,
          roughFillAngle: -41,
          roughFillColor: '#ffffff',
          roughFillGap: 8,
          roughFillStyle: 'hachure',
          roughFillWeight: 1,
          roughFillRoughness: 1,
          roughFillBowing: 1,
          roughFillOpacity: 0.2,
          roughness: 0,
          style: 'solid',
          width: 3,
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
  handleLineMouseDown: mocks.handleLineMouseDownMock,
}));

import { handleLineDrawingMouseDown, shouldKeepLineDrawSessionOpen } from './line-drawing';

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

function createLine(
  points = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]
) {
  return createLineObject({
    id: 'line-1',
    labelIndex: 1,
    points,
    settings: defaultLineSettings,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('starts a new line session through the drawing action seam', () => {
  const { bindings, canvas } = createBindings();

  handleLineDrawingMouseDown(bindings as never, canvas as never, { e: {} as never });

  expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
  expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
  expect(mocks.handleLineMouseDownMock).toHaveBeenCalledWith(bindings, { x: 10, y: 0 });
});

it('keeps selected line targets under existing edit controls', () => {
  const selectedByFlag = createBindings();
  handleLineDrawingMouseDown(selectedByFlag.bindings as never, selectedByFlag.canvas as never, {
    alreadySelected: true,
    e: {} as never,
    target: { sniptaleId: 'active' } as never,
  });

  const selectedByCanvas = createBindings();
  handleLineDrawingMouseDown(selectedByCanvas.bindings as never, selectedByCanvas.canvas as never, {
    e: {} as never,
    target: { sniptaleId: 'active' } as never,
  });

  expect(selectedByFlag.canvas.discardActiveObject).not.toHaveBeenCalled();
  expect(selectedByCanvas.canvas.discardActiveObject).not.toHaveBeenCalled();
  expect(mocks.handleLineMouseDownMock).not.toHaveBeenCalled();
});

it('extends click-mode line sessions with a trailing preview point', () => {
  const line = createLine();
  line.sniptaleLineClickMode = true;
  const { bindings, canvas } = createBindings({ object: line, tool: 'line' });

  handleLineDrawingMouseDown(bindings as never, canvas as never, { e: {} as never });

  expect(getLinePoints(line)).toEqual([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 0 },
  ]);
  expect(line.sniptaleLineClickMode).toBe(true);
  expect(line.sniptaleLinePointerMoved).toBe(false);
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
});

it('completes sessions when the next click closes the shape or repeats the last point', () => {
  const closedLine = createLine([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 20, y: 20 },
  ]);
  closedLine.sniptaleLineClickMode = true;
  const { bindings, canvas } = createBindings({ object: closedLine, tool: 'line' });
  canvas.getScenePoint.mockReturnValueOnce({ x: 1, y: 1 });

  handleLineDrawingMouseDown(bindings as never, canvas as never, { e: {} as never });

  expect(closedLine.sniptaleLineClosed).toBe(true);
  expect(mocks.completeEditorDrawWorkflowMock).toHaveBeenCalledOnce();
  expect(bindings.setDrawSession).toHaveBeenCalledWith(null);
  expect(bindings.setCropState).toHaveBeenCalledWith(null, null);

  const repeatLine = createLine([
    { x: 0, y: 0 },
    { x: 5, y: 0 },
  ]);
  const repeat = createBindings({ object: repeatLine, tool: 'line' });
  repeat.canvas.getScenePoint.mockReturnValueOnce({ x: 6, y: 0 });
  handleLineDrawingMouseDown(repeat.bindings as never, repeat.canvas as never, {
    e: {} as never,
  });
  expect(mocks.completeEditorDrawWorkflowMock).toHaveBeenCalledTimes(2);
});

it('keeps click-mode sessions open until the pointer moves', () => {
  const line = createLine();
  line.sniptaleLinePointerMoved = false;
  const { bindings } = createBindings({ object: line, tool: 'line' });

  expect(shouldKeepLineDrawSessionOpen(bindings as never)).toBe(true);
  expect(line.sniptaleLineClickMode).toBe(true);

  line.sniptaleLinePointerMoved = true;
  line.sniptaleLineClickMode = false;
  expect(shouldKeepLineDrawSessionOpen(bindings as never)).toBe(false);
  expect(shouldKeepLineDrawSessionOpen(createBindings().bindings as never)).toBe(false);
});
