// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completeDrawSessionFromBindings: vi.fn(() => true),
  completeDrawSessionOnEnterFromBindings: vi.fn(() => true),
  getRichShapeTextCapability: vi.fn(() => false),
  handleEditorDoubleClick: vi.fn(),
  handleEditorWindowBlur: vi.fn(),
  handleEditorWindowKeyDown: vi.fn(() => ({ nextSpacePressed: undefined, preventDefault: true })),
  handleEditorWindowKeyUp: vi.fn(() => ({ nextSpacePressed: false })),
}));

vi.mock('../input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../input')>()),
  handleEditorDoubleClick: mocks.handleEditorDoubleClick,
  handleEditorWindowBlur: mocks.handleEditorWindowBlur,
  handleEditorWindowKeyDown: mocks.handleEditorWindowKeyDown,
  handleEditorWindowKeyUp: mocks.handleEditorWindowKeyUp,
}));
vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  getRichShapeTextCapability: mocks.getRichShapeTextCapability,
}));
vi.mock('./draw-session-completion', () => ({
  completeDrawSessionFromBindings: mocks.completeDrawSessionFromBindings,
  completeDrawSessionOnEnterFromBindings: mocks.completeDrawSessionOnEnterFromBindings,
}));

import {
  createRuntimeDoubleClickHandler,
  createRuntimeWindowBlurHandler,
  createRuntimeWindowKeyDownHandler,
  createRuntimeWindowKeyUpHandler,
} from './runtime.window';

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
    getActiveTool: vi.fn(() => 'selection'),
    getCanvas: vi.fn(() => ({ id: 'canvas' })),
    getCropGuide: vi.fn(() => null),
    getDrawSession: vi.fn(() => null),
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
  mocks.completeDrawSessionFromBindings.mockReturnValue(true);
  mocks.completeDrawSessionOnEnterFromBindings.mockReturnValue(true);
  mocks.getRichShapeTextCapability.mockReturnValue(false);
});

it('starts embedded rich shape text editing on double click before legacy input routing', () => {
  const target = { sniptaleId: 'shape-1' };
  const beginRichShapeTextEditing = vi.fn(() => true);
  mocks.getRichShapeTextCapability.mockReturnValue(true);

  createRuntimeDoubleClickHandler({
    ...createBindings(),
    beginRichShapeTextEditing,
    getActiveTool: vi.fn(() => 'select'),
  } as never)({ e: {} as never, target: target as never });

  expect(beginRichShapeTextEditing).toHaveBeenCalledWith(target);
  expect(mocks.handleEditorDoubleClick).not.toHaveBeenCalled();
});

it('falls back to the legacy double-click input seam for unsupported targets', () => {
  const bindings = createBindings();
  const target = { sniptaleId: 'arrow-1' };

  createRuntimeDoubleClickHandler(bindings as never)({
    e: { type: 'dblclick' } as never,
    target: target as never,
  });

  expect(mocks.handleEditorDoubleClick).toHaveBeenCalledWith(
    expect.objectContaining({
      activeTool: 'selection',
      canvas: bindings.getCanvas(),
      target,
    })
  );
});

it('falls back when a text-capable rich shape editor start is declined', () => {
  const target = { sniptaleId: 'shape-1' };
  const beginRichShapeTextEditing = vi.fn(() => false);
  mocks.getRichShapeTextCapability.mockReturnValue(true);

  createRuntimeDoubleClickHandler({
    ...createBindings(),
    beginRichShapeTextEditing,
    getActiveTool: vi.fn(() => 'select'),
  } as never)({ e: {} as never, target: target as never });

  expect(beginRichShapeTextEditing).toHaveBeenCalledWith(target);
  expect(mocks.handleEditorDoubleClick).toHaveBeenCalledWith(expect.objectContaining({ target }));
});

it('does not try embedded rich shape editing outside select mode or without a target', () => {
  const beginRichShapeTextEditing = vi.fn(() => true);
  mocks.getRichShapeTextCapability.mockReturnValue(true);

  createRuntimeDoubleClickHandler({
    ...createBindings(),
    beginRichShapeTextEditing,
    getActiveTool: vi.fn(() => 'text'),
  } as never)({ e: {} as never, target: { sniptaleId: 'shape-1' } as never });
  createRuntimeDoubleClickHandler({
    ...createBindings(),
    beginRichShapeTextEditing,
    getActiveTool: vi.fn(() => 'select'),
  } as never)({ e: {} as never });

  expect(beginRichShapeTextEditing).toHaveBeenCalledOnce();
  expect(mocks.handleEditorDoubleClick).toHaveBeenCalledOnce();
});

it('passes raster clipboard command ownership into the keyboard input seam', () => {
  const bindings = createBindings();
  const handler = createRuntimeWindowKeyDownHandler(bindings as never);
  const event = new KeyboardEvent('keydown', { code: 'KeyV', ctrlKey: true, key: 'v' });
  const preventDefault = vi.spyOn(event, 'preventDefault');

  handler(event);

  expect(mocks.handleEditorWindowKeyDown).toHaveBeenCalledWith(
    expect.objectContaining({
      activeTool: 'selection',
      copyRasterSelection: bindings.copyRasterSelection,
      cutRasterSelection: bindings.cutRasterSelection,
      deleteRasterSelectionPixels: bindings.deleteRasterSelectionPixels,
      hasDrawSession: false,
      hasRasterSelection: true,
      pasteRasterClipboard: bindings.pasteRasterClipboard,
      applyTextSelectionStyle: bindings.applyTextSelectionStyle,
    })
  );
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(bindings.syncRuntimeState).not.toHaveBeenCalled();
});

it('omits optional text formatting ownership when the binding is unavailable', () => {
  const bindings = createBindings();
  delete (bindings as { applyTextSelectionStyle?: unknown }).applyTextSelectionStyle;

  createRuntimeWindowKeyDownHandler(bindings as never)(
    new KeyboardEvent('keydown', { code: 'KeyB', ctrlKey: true, key: 'b' })
  );

  expect(mocks.handleEditorWindowKeyDown).toHaveBeenCalledWith(
    expect.not.objectContaining({ applyTextSelectionStyle: expect.any(Function) })
  );
});

it('passes active draw sessions into Enter completion ownership', () => {
  const bindings = createBindings();
  bindings.getDrawSession.mockReturnValue({ object: { id: 'draft' }, tool: 'arrow' } as never);
  mocks.handleEditorWindowKeyDown.mockImplementationOnce(((options: {
    completeDrawSession: () => boolean;
  }) => {
    options.completeDrawSession();
    return { preventDefault: true };
  }) as never);

  createRuntimeWindowKeyDownHandler(bindings as never)(
    new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })
  );

  expect(mocks.handleEditorWindowKeyDown).toHaveBeenCalledWith(
    expect.objectContaining({ hasDrawSession: true, completeDrawSession: expect.any(Function) })
  );
  expect(mocks.completeDrawSessionOnEnterFromBindings).toHaveBeenCalledWith(bindings);
  expect(bindings.getDrawSession).toHaveBeenCalled();
});

it('forwards keyup and blur ownership into the input seam', () => {
  const bindings = {
    finalizeSelectionNudge: vi.fn(),
    setIsSpacePressed: vi.fn(),
  };

  createRuntimeWindowKeyUpHandler(bindings)(new KeyboardEvent('keyup', { code: 'Space' }));
  createRuntimeWindowBlurHandler(bindings)();

  expect(mocks.handleEditorWindowKeyUp).toHaveBeenCalledWith({
    code: 'Space',
    finalizeSelectionNudge: bindings.finalizeSelectionNudge,
  });
  expect(bindings.setIsSpacePressed).toHaveBeenCalledWith(false);
  expect(mocks.handleEditorWindowBlur).toHaveBeenCalledWith({
    finalizeSelectionNudge: expect.any(Function),
  });
});
