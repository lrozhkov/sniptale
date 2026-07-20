import { beforeEach, expect, it, vi } from 'vitest';
import { createDrawingBindings } from '../drawing-tool-actions.test-support';

const storeState = vi.hoisted(() => ({
  richShapeToolSelection: { rough: false, shapeId: 'rectangle' },
}));

const mocks = vi.hoisted(() => ({
  createRichShapeToolDraft: vi.fn(() => ({
    object: { id: 'rich-shape-object' },
    tool: 'rich-shape',
  })),
  resolveActiveRichShapeToolSelection: vi.fn(() => ({ rough: false, shapeId: 'rectangle' })),
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => storeState,
  },
}));

vi.mock('../../tools/rich-shape-drawing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../tools/rich-shape-drawing')>()),
  createRichShapeToolDraft: mocks.createRichShapeToolDraft,
  resolveActiveRichShapeToolSelection: mocks.resolveActiveRichShapeToolSelection,
}));

import { handleRichShapeToolMouseDown } from './rich-shape';

beforeEach(() => {
  vi.clearAllMocks();
});

it('creates rich shape drag sessions from active shape-tool selection', () => {
  const bindings = { ...createDrawingBindings(), getSource: () => ({ id: 'source-1' }) };
  const point = { x: 50, y: 60 } as never;

  handleRichShapeToolMouseDown(bindings as never, 'shapes-and-lines', point);

  expect(mocks.resolveActiveRichShapeToolSelection).toHaveBeenCalledWith(
    'shapes-and-lines',
    storeState.richShapeToolSelection
  );
  expect(mocks.createRichShapeToolDraft).toHaveBeenCalledWith(
    expect.objectContaining({ point, source: { id: 'source-1' } })
  );
  expect(bindings.startDrawSession).toHaveBeenCalledWith(
    'rich-shape',
    point,
    expect.objectContaining({
      id: 'rich-shape-object',
      sniptaleRichShapeToolOrigin: 'shapes-and-lines',
    })
  );
});

it('skips rich shape sessions when selection or source is missing', () => {
  const bindings = { ...createDrawingBindings(), getSource: () => ({ id: 'source-1' }) };
  const point = { x: 50, y: 60 } as never;

  mocks.resolveActiveRichShapeToolSelection.mockReturnValueOnce(null as never);
  handleRichShapeToolMouseDown(bindings as never, 'shape-library', point);
  expect(mocks.createRichShapeToolDraft).not.toHaveBeenCalled();

  handleRichShapeToolMouseDown(
    { ...bindings, getSource: () => null } as never,
    'rough-shape',
    point
  );
  expect(mocks.resolveActiveRichShapeToolSelection).toHaveBeenCalledTimes(1);
});

it('skips rich shape sessions when the draft owner cannot create an object', () => {
  const bindings = { ...createDrawingBindings(), getSource: () => ({ id: 'source-1' }) };
  const point = { x: 50, y: 60 } as never;
  mocks.createRichShapeToolDraft.mockReturnValueOnce(null as never);

  handleRichShapeToolMouseDown(bindings as never, 'shape-library', point);

  expect(mocks.createRichShapeToolDraft).toHaveBeenCalledOnce();
  expect(bindings.startDrawSession).not.toHaveBeenCalled();
});
