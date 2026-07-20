import { expect, it, vi } from 'vitest';

const { applyViewportZoomMock } = vi.hoisted(() => ({
  applyViewportZoomMock: vi.fn(),
}));

vi.mock('../../../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../viewport')>()),
  applyEditorViewportZoom: applyViewportZoomMock,
}));

import { resetClosedEditorCanvas } from './canvas';

it('resets the editor canvas and reapplies viewport zoom around the cleared document size', () => {
  const setCanvasDocumentSize = vi.fn();
  const canvas = {
    backgroundColor: 'black',
    backgroundImage: 'image',
    clear: vi.fn(),
    discardActiveObject: vi.fn(),
    setDimensions: vi.fn(),
    setZoom: vi.fn(),
  };

  resetClosedEditorCanvas({
    canvas: canvas as never,
    setCanvasDocumentSize,
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 2,
  });

  expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
  expect(canvas.clear).toHaveBeenCalledOnce();
  expect(canvas.backgroundImage).toBeUndefined();
  expect(canvas.backgroundColor).toBe('transparent');
  expect(canvas.setZoom).toHaveBeenCalledWith(1);
  expect(setCanvasDocumentSize).toHaveBeenCalledWith({ height: 0, width: 0 });
  expect(canvas.setDimensions).toHaveBeenCalledWith({ height: 0, width: 0 });
  expect(applyViewportZoomMock).toHaveBeenCalledWith(canvas, { height: 0, width: 0 }, 2, 1);
});
