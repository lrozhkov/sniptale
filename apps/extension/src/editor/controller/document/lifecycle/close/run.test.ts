import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeEditorControllerDocument } from './run';

const storeState = {
  resetDocumentState: vi.fn(),
};

vi.mock('../../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => storeState,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createOptions() {
  return {
    canvas: {
      backgroundColor: 'black',
      calcOffset: vi.fn(),
      clear: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      setDimensions: vi.fn(),
      setZoom: vi.fn(),
    },
    setActiveTool: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setDrawSession: vi.fn(),
    setHistory: vi.fn(),
    setOriginalDocument: vi.fn(),
    setPanSession: vi.fn(),
    setSource: vi.fn(),
    setZoomLevel: vi.fn(),
    zoomLevel: 2,
  } as any;
}

describe('editor-controller-document.lifecycle.close.run', () => {
  it('closes through the canvas-presenter path when fabric is mounted', () => {
    const options = createOptions();

    closeEditorControllerDocument(options);

    expect(options.setActiveTool).toHaveBeenCalledWith('select');
    expect(options.setCanvasDocumentSize).toHaveBeenCalledWith({ height: 0, width: 0 });
    expect(options.setZoomLevel).toHaveBeenCalledWith(1);
    expect(options.canvas.clear).toHaveBeenCalledOnce();
    expect(options.canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('resets store-only state when no canvas is mounted yet', () => {
    const options = createOptions();

    closeEditorControllerDocument({
      ...options,
      canvas: null,
    });

    expect(storeState.resetDocumentState).toHaveBeenCalledOnce();
    expect(options.setActiveTool).not.toHaveBeenCalled();
  });
});
