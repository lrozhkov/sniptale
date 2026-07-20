// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completeDrawSessionOnEnterFromBindings: vi.fn(() => true),
  getRichShapeTextCapability: vi.fn(() => false),
  handleEditorDoubleClick: vi.fn(),
  handleEditorWindowBlur: vi.fn(),
  handleEditorWindowKeyDown: vi.fn(() => ({ nextSpacePressed: true, preventDefault: true })),
  handleEditorWindowKeyUp: vi.fn(() => ({ nextSpacePressed: false })),
}));

vi.mock('../../input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../input')>()),
  handleEditorDoubleClick: mocks.handleEditorDoubleClick,
  handleEditorWindowBlur: mocks.handleEditorWindowBlur,
  handleEditorWindowKeyDown: mocks.handleEditorWindowKeyDown,
  handleEditorWindowKeyUp: mocks.handleEditorWindowKeyUp,
}));
vi.mock('../../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/rich-shape')>()),
  getRichShapeTextCapability: mocks.getRichShapeTextCapability,
}));
vi.mock('../draw-session-completion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../draw-session-completion')>()),
  completeDrawSessionOnEnterFromBindings: mocks.completeDrawSessionOnEnterFromBindings,
}));

import { createRuntimeWindowBlurHandler } from './blur';
import { createRuntimeDoubleClickHandler } from './double-click';
import { createRuntimeWindowKeyDownHandler, createRuntimeWindowKeyUpHandler } from './keyboard';

function createBindings() {
  return {
    applyCropSelection: vi.fn(),
    applyTextSelectionStyle: vi.fn(() => true),
    cancelTransientInteraction: vi.fn(() => false),
    commitHistory: vi.fn(),
    copyRasterSelection: vi.fn(),
    cutRasterSelection: vi.fn(),
    deleteRasterSelectionPixels: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    finalizeSelectionNudge: vi.fn(),
    getActiveTool: vi.fn(() => 'select'),
    getCanvas: vi.fn(() => ({ id: 'canvas' })),
    getCropGuide: vi.fn(() => null),
    getDrawSession: vi.fn(() => ({ object: { id: 'draft' } })),
    getRasterToolSession: vi.fn(() => ({ selection: { id: 'selection' } })),
    pasteRasterClipboard: vi.fn(),
    redo: vi.fn(),
    setIsSpacePressed: vi.fn(),
    syncRuntimeState: vi.fn(),
    undo: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRichShapeTextCapability.mockReturnValue(false);
});

it('keeps rich-shape double-click ownership ahead of legacy input routing', () => {
  const target = { sniptaleId: 'shape-1' };
  const beginRichShapeTextEditing = vi.fn(() => true);
  mocks.getRichShapeTextCapability.mockReturnValue(true);

  createRuntimeDoubleClickHandler({
    ...createBindings(),
    beginRichShapeTextEditing,
  } as never)({ e: {} as never, target: target as never });

  expect(beginRichShapeTextEditing).toHaveBeenCalledWith(target);
  expect(mocks.handleEditorDoubleClick).not.toHaveBeenCalled();
});

it('adapts keydown results into window state and default prevention', () => {
  const bindings = createBindings();
  const event = new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' });
  const preventDefault = vi.spyOn(event, 'preventDefault');

  createRuntimeWindowKeyDownHandler(bindings as never)(event);

  expect(mocks.handleEditorWindowKeyDown).toHaveBeenCalledWith(
    expect.objectContaining({ completeDrawSession: expect.any(Function), hasDrawSession: true })
  );
  expect(bindings.setIsSpacePressed).toHaveBeenCalledWith(true);
  expect(preventDefault).toHaveBeenCalledOnce();
});

it('keeps keyup and blur cleanup owned by window adapters', () => {
  const bindings = createBindings();

  createRuntimeWindowKeyUpHandler(bindings)(new KeyboardEvent('keyup', { code: 'Space' }));
  createRuntimeWindowBlurHandler(bindings)();

  expect(bindings.setIsSpacePressed).toHaveBeenCalledWith(false);
  expect(mocks.handleEditorWindowBlur).toHaveBeenCalledWith({
    finalizeSelectionNudge: expect.any(Function),
  });
  const [{ finalizeSelectionNudge }] = mocks.handleEditorWindowBlur.mock.calls[0] as [
    { finalizeSelectionNudge: () => void },
  ];
  finalizeSelectionNudge();
  expect(bindings.finalizeSelectionNudge).toHaveBeenCalledOnce();
});
