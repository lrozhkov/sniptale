// @vitest-environment jsdom

import { Rect } from 'fabric';
import { EditorCanvas } from '../../../document/canvas-surface/render-region';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completeDrawSessionOnEnterFromBindings: vi.fn(() => true),
  getRichShapeTextCapability: vi.fn(() => false),
  handleEditorDoubleClick: vi.fn(),
  handleEditorWindowBlur: vi.fn(),
  handleEditorWindowKeyDown: vi.fn(() => ({
    nextSpacePressed: true as boolean | undefined,
    preventDefault: true,
  })),
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

import { cancelEditorTransientInteraction } from '../../input/canvas-actions/transient';
import { createRuntimeWindowBlurHandler } from './blur';
import { createRuntimeDoubleClickHandler } from './double-click';
import { createRuntimeWindowKeyDownHandler, createRuntimeWindowKeyUpHandler } from './keyboard';

function createBindings() {
  const canvas = { _currentTransform: {}, endCurrentTransform: vi.fn(), id: 'canvas' };
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
    getCanvas: vi.fn(() => canvas),
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

  Reflect.apply(createRuntimeWindowKeyDownHandler, null, [bindings])(event);

  expect(mocks.handleEditorWindowKeyDown).toHaveBeenCalledWith(
    expect.objectContaining({ completeDrawSession: expect.any(Function), hasDrawSession: true })
  );
  expect(bindings.setIsSpacePressed).toHaveBeenCalledWith(true);
  expect(preventDefault).toHaveBeenCalledOnce();
});

it('forwards IME composition state to text keyboard ownership', () => {
  const bindings = createBindings();
  const event = new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' });
  Object.defineProperty(event, 'isComposing', { value: true });

  Reflect.apply(createRuntimeWindowKeyDownHandler, null, [bindings])(event);

  expect(mocks.handleEditorWindowKeyDown).toHaveBeenCalledWith(
    expect.objectContaining({ isComposing: true })
  );
});

it('leaves window state and browser defaults unchanged for ignored keys', () => {
  const bindings = createBindings();
  mocks.handleEditorWindowKeyDown.mockImplementationOnce(() => ({
    nextSpacePressed: undefined,
    preventDefault: false,
  }));
  const event = new KeyboardEvent('keydown', { code: 'KeyQ', key: 'q' });
  const preventDefault = vi.spyOn(event, 'preventDefault');

  Reflect.apply(createRuntimeWindowKeyDownHandler, null, [bindings])(event);

  expect(bindings.setIsSpacePressed).not.toHaveBeenCalled();
  expect(preventDefault).not.toHaveBeenCalled();
});

it('keeps keyup and blur cleanup owned by window adapters', () => {
  const bindings = createBindings();

  createRuntimeWindowKeyUpHandler(bindings)(new KeyboardEvent('keyup', { code: 'Space' }));
  createRuntimeWindowBlurHandler(bindings)();

  expect(bindings.setIsSpacePressed).toHaveBeenCalledWith(false);
  expect(mocks.handleEditorWindowBlur).toHaveBeenCalledWith({
    cancelTransientInteraction: expect.any(Function),
    endCurrentTransform: expect.any(Function),
    finalizeSelectionNudge: expect.any(Function),
  });
  const [{ cancelTransientInteraction, endCurrentTransform, finalizeSelectionNudge }] = mocks
    .handleEditorWindowBlur.mock.calls[0] as [
    {
      cancelTransientInteraction: () => void;
      endCurrentTransform: () => void;
      finalizeSelectionNudge: () => void;
    },
  ];
  endCurrentTransform();
  cancelTransientInteraction();
  finalizeSelectionNudge();
  expect(bindings.getCanvas().endCurrentTransform).toHaveBeenCalledOnce();
  expect(bindings.cancelTransientInteraction).toHaveBeenCalledOnce();
  expect(bindings.cancelTransientInteraction).toHaveBeenCalledWith('window-blur');
  expect(bindings.finalizeSelectionNudge).toHaveBeenCalledOnce();
});

it('retains the accepted editor selection after a blurred native transform is restored', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 800, height: 600 });
  const object = new Rect({ left: 100, top: 100, width: 80, height: 60 });
  canvas.add(object);
  canvas.setActiveObject(object);
  const point = object.getCenterPoint();
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: point.x, clientY: point.y }));
  canvas.__onMouseMove(
    new MouseEvent('mousemove', { clientX: point.x + 20, clientY: point.y + 10, buttons: 1 })
  );
  const bindings = { ...createBindings(), getCanvas: () => canvas };
  mocks.handleEditorWindowBlur.mockImplementationOnce(
    (options: {
      endCurrentTransform?: () => void;
      cancelTransientInteraction?: () => boolean;
      finalizeSelectionNudge?: () => void;
    }) => {
      options.endCurrentTransform?.();
      options.cancelTransientInteraction?.();
      options.finalizeSelectionNudge?.();
    }
  );
  createRuntimeWindowBlurHandler(bindings)();
  expect(object.getCenterPoint().distanceFrom(point)).toBeLessThan(0.001);
  expect(canvas.getActiveObject()).toBe(object);
  expect(canvas._currentTransform).toBeNull();
  expect(bindings.cancelTransientInteraction).not.toHaveBeenCalled();
  expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
  void canvas.dispose();
});

it('restores the previous marquee selection once through the window blur owner', () => {
  const canvas = new EditorCanvas(document.createElement('canvas'), { width: 800, height: 600 });
  const object = new Rect({ left: 100, top: 100, width: 80, height: 60 });
  canvas.add(object);
  canvas.setActiveObject(object);
  canvas.__onMouseDown(new MouseEvent('mousedown', { clientX: 30, clientY: 30 }));
  canvas.__onMouseMove(new MouseEvent('mousemove', { clientX: 300, clientY: 250, buttons: 1 }));
  const bindings = { ...createBindings(), getCanvas: () => canvas };
  bindings.cancelTransientInteraction.mockImplementation(
    () =>
      cancelEditorTransientInteraction({
        canvas,
        drawSession: null,
        cropGuide: null,
        activeTool: 'select',
        preserveActiveTool: true,
        clearCropSelection: vi.fn(),
        switchToSelectTool: vi.fn(),
        syncRuntimeState: bindings.syncRuntimeState,
      }).changed
  );
  mocks.handleEditorWindowBlur.mockImplementationOnce(
    (options: {
      endCurrentTransform?: () => void;
      cancelTransientInteraction?: () => boolean;
      finalizeSelectionNudge?: () => void;
    }) => {
      options.endCurrentTransform?.();
      options.cancelTransientInteraction?.();
      options.finalizeSelectionNudge?.();
    }
  );
  createRuntimeWindowBlurHandler(bindings)();
  expect(canvas.getActiveObject()).toBe(object);
  expect(canvas.getSelectionPreviewObjects()).toEqual([]);
  expect(bindings.cancelTransientInteraction).toHaveBeenCalledOnce();
  void canvas.dispose();
});
