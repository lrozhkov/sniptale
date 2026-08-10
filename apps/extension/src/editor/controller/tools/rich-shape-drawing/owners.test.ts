import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRichShapeToolDraft: vi.fn(),
  markRichShapeToolOrigin: vi.fn(),
  resizeRichShapeObjectToBounds: vi.fn(),
  state: { richShapeToolSelection: null as unknown },
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: { getState: () => mocks.state },
}));
vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  createRichShapeToolDraft: mocks.createRichShapeToolDraft,
  markRichShapeToolOrigin: mocks.markRichShapeToolOrigin,
}));
vi.mock('../../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/rich-shape')>()),
  resizeRichShapeObjectToBounds: mocks.resizeRichShapeObjectToBounds,
}));

import { handleRichShapeToolMouseDown } from './pointer';
import { updateRichShapeDraft } from './resize';
import { resolveActiveRichShapeToolSelection } from './selection';

describe('rich shape drawing owners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRichShapeToolDraft.mockReturnValue(undefined);
    mocks.state.richShapeToolSelection = null;
  });

  it('starts a catalog draft when both source and selection are available', () => {
    const selection = { itemId: 'shape-rectangle', source: 'built-in' };
    const object = { id: 'draft' };
    const bindings = {
      getSource: vi.fn(() => ({ id: 'source' })),
      nextLabelIndex: vi.fn(() => 2),
      prepareObject: vi.fn(),
      startDrawSession: vi.fn(),
    };
    mocks.state.richShapeToolSelection = selection;
    mocks.createRichShapeToolDraft.mockReturnValue({ object, tool: 'rich-shape' });
    const point = { x: 10, y: 20 };

    handleRichShapeToolMouseDown(bindings as never, point as never);

    expect(mocks.markRichShapeToolOrigin).toHaveBeenCalledWith(object, 'shape');
    expect(bindings.startDrawSession).toHaveBeenCalledWith('rich-shape', point, object);
  });

  it('does not start without a source, selection, or successfully created draft', () => {
    const bindings = {
      getSource: vi.fn<() => unknown>(() => null),
      nextLabelIndex: vi.fn(),
      prepareObject: vi.fn(),
      startDrawSession: vi.fn(),
    };
    handleRichShapeToolMouseDown(bindings as never, { x: 0, y: 0 } as never);
    bindings.getSource.mockReturnValue({ id: 'source' });
    handleRichShapeToolMouseDown(bindings as never, { x: 0, y: 0 } as never);
    mocks.state.richShapeToolSelection = { itemId: 'shape', source: 'built-in' };
    handleRichShapeToolMouseDown(bindings as never, { x: 0, y: 0 } as never);

    expect(bindings.startDrawSession).not.toHaveBeenCalled();
  });

  it('resizes rich-shape drafts in free and constrained directions', () => {
    const object = {
      sniptaleRichShape: { geometry: { viewBox: { height: 50, width: 100 } } },
    };
    const session = {
      object,
      start: { x: 100, y: 100 },
      tool: 'rich-shape',
    };

    updateRichShapeDraft(session as never, { x: 60, y: 70 } as never);
    expect(mocks.resizeRichShapeObjectToBounds).toHaveBeenLastCalledWith(object, {
      height: 30,
      left: 60,
      top: 70,
      width: 40,
    });

    updateRichShapeDraft(session as never, { x: 40, y: 60 } as never, true);
    expect(mocks.resizeRichShapeObjectToBounds).toHaveBeenLastCalledWith(object, {
      height: 30,
      left: 40,
      top: 70,
      width: 60,
    });
    expect(updateRichShapeDraft({ tool: 'pencil' } as never, {} as never)).toBeNull();
  });

  it('returns the active rich-shape selection unchanged', () => {
    const selection = { itemId: 'shape', source: 'built-in' } as never;
    expect(resolveActiveRichShapeToolSelection(selection)).toBe(selection);
    expect(resolveActiveRichShapeToolSelection(null)).toBeNull();
  });
});
