import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { readArrowPoints } from '../../objects/arrow/controls';
import { createArrowObject } from '../../objects/arrow';
import { createLineObject, getLinePoints } from '../../objects/line';

const defaultSettings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET);

const mocks = vi.hoisted(() => ({
  completeEditorDrawWorkflowMock: vi.fn(() => ({
    cropGuide: null,
    cropSelection: null,
    drawSession: null,
  })),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      toolSettings: {
        arrow: defaultSettings.arrow,
        line: defaultSettings.line,
      },
    }),
  },
}));

vi.mock('../draw-workflow', async () => ({
  ...(await vi.importActual<typeof import('../draw-workflow')>('../draw-workflow')),
  completeEditorDrawWorkflow: mocks.completeEditorDrawWorkflowMock,
}));

import {
  completeDrawSessionFromBindings,
  completeDrawSessionOnEnterFromBindings,
} from './draw-session-completion';

function createBindings(drawSession: unknown) {
  return {
    commitHistory: vi.fn(),
    getCanvas: vi.fn(() => ({ requestRenderAll: vi.fn() })),
    getCanvasDocumentSize: vi.fn(() => ({ height: 100, width: 100 })),
    getDrawSession: vi.fn(() => drawSession),
    setCropState: vi.fn(),
    setDrawSession: vi.fn(),
    syncRuntimeState: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('settles line completion at the latest known pointer point before closing', () => {
  const line = createLineObject({
    id: 'line-enter',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 0 },
    ],
    settings: defaultSettings.line,
  });
  line.sniptaleLineClickMode = true;
  line.sniptaleLineDrawing = true;
  const bindings = createBindings({
    lastPoint: { x: 35, y: 18 },
    object: line,
    objectId: 'line-enter',
    start: { x: 0, y: 0 },
    tool: 'line',
  });

  expect(completeDrawSessionOnEnterFromBindings(bindings as never)).toBe(true);

  expect(getLinePoints(line)).toEqual([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 35, y: 18 },
  ]);
  expect(mocks.completeEditorDrawWorkflowMock).toHaveBeenCalledOnce();
  expect(bindings.setDrawSession).toHaveBeenCalledWith(null);
});

it('settles arrow completion at the latest known pointer point before closing', () => {
  const arrow = createArrowObject({
    id: 'arrow-enter',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 24, y: 0 },
      { x: 24, y: 0 },
    ],
    settings: defaultSettings.arrow,
  });
  arrow.sniptaleArrowClickMode = true;
  arrow.sniptaleArrowDraftPoints = [
    { x: 0, y: 0 },
    { x: 24, y: 0 },
    { x: 24, y: 0 },
  ];
  arrow.sniptaleArrowDrawing = true;
  const bindings = createBindings({
    lastPoint: { x: 48, y: 22 },
    object: arrow,
    objectId: 'arrow-enter',
    start: { x: 0, y: 0 },
    tool: 'arrow',
  });

  expect(completeDrawSessionOnEnterFromBindings(bindings as never)).toBe(true);

  expect(arrow.sniptaleArrowDraftPoints).toEqual([
    { x: 0, y: 0 },
    { x: 24, y: 0 },
    { x: 48, y: 22 },
  ]);
  expect(readArrowPoints(arrow).at(-1)).toEqual({ x: 48, y: 22 });
  expect(mocks.completeEditorDrawWorkflowMock).toHaveBeenCalledOnce();
  expect(bindings.setDrawSession).toHaveBeenCalledWith(null);
});

it('does not mutate geometry before Enter completion without a last pointer point', () => {
  const line = createLineObject({
    id: 'line-enter-empty',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
    settings: defaultSettings.line,
  });
  const bindings = createBindings({
    object: line,
    objectId: 'line-enter-empty',
    start: { x: 0, y: 0 },
    tool: 'line',
  });

  expect(completeDrawSessionOnEnterFromBindings(bindings as never)).toBe(true);

  expect(getLinePoints(line)).toEqual([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  ]);
  expect(mocks.completeEditorDrawWorkflowMock).toHaveBeenCalledOnce();
});

it('skips Enter geometry settling for closed lines and non-arrow objects', () => {
  const line = createLineObject({
    id: 'closed-line',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
    settings: defaultSettings.line,
  });
  line.sniptaleLineClosed = true;

  expect(
    completeDrawSessionOnEnterFromBindings(
      createBindings({
        lastPoint: { x: 40, y: 10 },
        object: line,
        start: { x: 0, y: 0 },
        tool: 'line',
      }) as never
    )
  ).toBe(true);
  expect(getLinePoints(line)).toEqual([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  ]);

  expect(
    completeDrawSessionOnEnterFromBindings(
      createBindings({
        lastPoint: { x: 40, y: 10 },
        object: line,
        start: { x: 0, y: 0 },
        tool: 'arrow',
      }) as never
    )
  ).toBe(true);
});

it('surfaces a failed workflow completion without clearing local draw state', () => {
  (mocks.completeEditorDrawWorkflowMock as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
  const bindings = createBindings(null);

  expect(completeDrawSessionFromBindings(bindings as never)).toBe(false);

  expect(bindings.setDrawSession).not.toHaveBeenCalled();
  expect(bindings.setCropState).not.toHaveBeenCalled();
  expect(bindings.syncRuntimeState).not.toHaveBeenCalled();
});
