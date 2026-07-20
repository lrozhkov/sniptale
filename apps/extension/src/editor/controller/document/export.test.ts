// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import {
  buildEditorCanvasDocument,
  copyEditorRenderedImage,
  renderEditorCanvasToDataUrl,
} from './export';

const writeMock = vi.fn();

class MockClipboardItem {
  readonly items: Record<string, Blob>;

  constructor(items: Record<string, Blob>) {
    this.items = items;
  }
}

function createExportCanvas() {
  const activeObject = { id: 'active-object' };
  const renderedCanvas = document.createElement('canvas');
  renderedCanvas.width = 200;
  renderedCanvas.height = 100;
  const toDataUrlMock = vi.fn(() => 'data:image/jpeg;base64,encoded');
  renderedCanvas.toDataURL = toDataUrlMock as typeof renderedCanvas.toDataURL;

  return {
    activeObject,
    discardActiveObject: vi.fn(),
    getActiveObject: vi.fn(() => activeObject),
    getObjects: vi.fn(() => [
      {
        sniptaleType: 'rectangle',
        toObject: vi.fn(() => ({ id: 'shape-1' })),
      },
      {
        height: 80,
        left: 12,
        sniptaleId: 'rich-1',
        sniptaleRichShape: createDefaultRichShapeObject({
          id: 'rich-1',
          shapeKind: 'rectangle',
        }),
        sniptaleType: 'rich-shape',
        scaleX: 1,
        scaleY: 1,
        top: 16,
        visible: true,
        width: 120,
      },
    ]),
    renderAll: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
    toCanvasElement: vi.fn(() => renderedCanvas),
    renderedCanvas,
    toDataUrlMock,
  };
}

function createEditorCanvasDocumentOptions() {
  const canvas = createExportCanvas();

  return {
    canvas,
    options: {
      browserFrame: {
        enabled: true,
        title: 'Browser frame',
      } as never,
      canvas: canvas as never,
      canvasDocumentSize: { width: 200, height: 100 },
      frame: {
        paddingTop: 12,
      } as never,
      source: {
        dataUrl: 'data:image/png;base64,source',
        displayHeight: 100,
        displayWidth: 200,
        intrinsicHeight: 100,
        intrinsicWidth: 200,
        left: 4,
        name: 'source.png',
        top: 8,
      } as never,
    },
  };
}

function expectBuiltEditorDocument(document: ReturnType<typeof buildEditorCanvasDocument>) {
  expect(document).toMatchObject({
    browserFrame: {
      enabled: true,
      title: 'Browser frame',
    },
    canvasHeight: 100,
    canvasWidth: 200,
    frame: expect.objectContaining({
      backgroundGradientAngle: 145,
      backgroundGradientFrom: '#7c2d12',
      backgroundGradientTo: '#f59e0b',
      backgroundMode: 'gradient',
      paddingBottom: 128,
      paddingLeft: 128,
      paddingTop: 12,
      paddingRight: 128,
    }),
    sourceImageData: 'data:image/png;base64,source',
    sourceName: 'source.png',
    sourceTop: 8,
  });
  expect(document.canvasJson).toBe(
    JSON.stringify({ version: '7.2.0', objects: [{ id: 'shape-1' }] })
  );
  expect(document.richShapes).toEqual([
    expect.objectContaining({
      frame: { height: 80, left: 12, top: 16, width: 120 },
      id: 'rich-1',
      shapeKind: 'rectangle',
    }),
  ]);
}

function expectMockCallArgs<T>(calls: T[][], index: number, label: string): T[] {
  const call = calls[index];
  if (!call) {
    throw new Error(`Expected ${label}`);
  }

  return call;
}

describe('copyEditorRenderedImage', () => {
  beforeEach(() => {
    vi.stubGlobal('ClipboardItem', MockClipboardItem);
    vi.stubGlobal('navigator', {
      clipboard: {
        write: writeMock,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('writes only the selected jpeg mime type to the clipboard', async () => {
    await copyEditorRenderedImage({
      dataUrl: 'data:image/jpeg;base64,encoded',
      mimeType: 'image/jpeg',
    });

    expect(writeMock).toHaveBeenCalledTimes(1);

    const clipboardArgs = expectMockCallArgs(
      writeMock.mock.calls as [MockClipboardItem[]][],
      0,
      'clipboard write args'
    );
    const items = clipboardArgs[0];
    if (!items) {
      throw new Error('Expected clipboard items');
    }
    const [item] = items;
    if (!item) {
      throw new Error('Expected clipboard item');
    }

    expect(items).toHaveLength(1);
    expect(Object.keys(item.items)).toEqual(['image/jpeg']);
    const imageItem = item.items['image/jpeg'];
    expect(imageItem).toBeInstanceOf(Blob);
    expect(imageItem?.type).toBe('image/jpeg');
  }, 10000);
});

describe('buildEditorCanvasDocument', () => {
  it('throws when the editor canvas or source is unavailable', () => {
    expect(() =>
      buildEditorCanvasDocument({
        browserFrame: { enabled: false } as never,
        canvas: null,
        canvasDocumentSize: { width: 200, height: 100 },
        frame: null as never,
        source: null,
      })
    ).toThrow();
  });

  it('serializes the current canvas scene with normalized frame settings', () => {
    const { options } = createEditorCanvasDocumentOptions();
    const document = buildEditorCanvasDocument(options);

    expectBuiltEditorDocument(document);
  });
});

describe('renderEditorCanvasToDataUrl', () => {
  it('throws when the canvas is unavailable', () => {
    expect(() => renderEditorCanvasToDataUrl(null, { format: 'png', quality: 100 })).toThrow();
  });

  it('renders the canvas while preserving the current active object', () => {
    const canvas = createExportCanvas();

    const dataUrl = renderEditorCanvasToDataUrl(canvas as never, {
      format: 'jpeg',
      quality: 75,
    });

    expect(dataUrl).toBe('data:image/jpeg;base64,encoded');
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.renderAll).toHaveBeenCalledTimes(2);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(canvas.toCanvasElement).toHaveBeenCalledWith(1);
    expect(canvas.toDataUrlMock).toHaveBeenCalledWith('image/jpeg', 0.75);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(canvas.activeObject);
  });

  it('resamples the rendered image to an explicit output size', () => {
    const canvas = createExportCanvas();
    const drawImage = vi.fn();
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage } as never);

    renderEditorCanvasToDataUrl(canvas as never, {
      format: 'png',
      quality: 100,
      outputSize: { width: 640, height: 360 },
    });

    expect(getContextSpy).toHaveBeenCalledWith('2d');
    expect(drawImage).toHaveBeenCalledWith(canvas.renderedCanvas, 0, 0, 640, 360);
  });
});
