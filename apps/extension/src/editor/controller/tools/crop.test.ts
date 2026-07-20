// @vitest-environment jsdom

import { Point, Rect } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyCropGuideSelection,
  configureCropGuideForEditing,
  createCropGuideRect,
  createCropSelectionFromRect,
  cropRenderedEditorDocument,
  getActiveEditorCropRect,
  isEditorCropGuide,
  normalizeEditorCropSelection,
} from './crop';

class ImageMock {
  static failNext = false;

  onerror: null | (() => void) = null;
  onload: null | (() => void) = null;
  set src(_value: string) {
    const shouldFail = ImageMock.failNext;
    ImageMock.failNext = false;
    queueMicrotask(() => {
      if (shouldFail) {
        this.onerror?.();
        return;
      }

      this.onload?.();
    });
  }
}

beforeEach(() => {
  ImageMock.failNext = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function runEditorControllerCropGuideSuite() {
  it('creates and normalizes crop guides', () => {
    const rect = createCropGuideRect(new Point(10, 20));
    const setControlsVisibility = vi.fn();
    rect.setControlsVisibility = setControlsVisibility;

    expect(rect.left).toBe(10);
    expect(rect.top).toBe(20);
    expect(rect.sniptaleRole).toBe('crop-guide');
    expect(isEditorCropGuide(rect)).toBe(true);
    expect(isEditorCropGuide(new Rect())).toBe(false);
    rect.set({ width: 20, height: 10, scaleX: 2, scaleY: 3 });
    expect(createCropSelectionFromRect(rect)).toEqual({ left: 10, top: 20, width: 40, height: 30 });
    expect(createCropSelectionFromRect(new Rect())).toEqual({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
    expect(createCropSelectionFromRect({ left: undefined, top: undefined } as never)).toEqual({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
    applyCropGuideSelection(rect, { height: 0, left: 3, top: 4, width: 0 }, 'preview');
    expect(rect.sniptaleCropGuideMode).toBe('preview');
    expect(rect.selectable).toBe(true);
    expect(setControlsVisibility).toHaveBeenCalledWith({ mtr: false });
    configureCropGuideForEditing(rect);
    expect(
      normalizeEditorCropSelection(
        { left: -5, top: 15.7, width: 999, height: 0.2 },
        { width: 300, height: 200 }
      )
    ).toEqual({
      left: 0,
      top: 16,
      width: 300,
      height: 1,
    });
  });
}

function runEditorControllerCropRenderSuite() {
  it('renders cropped image data and resolves the active crop rect', async () => {
    const drawImage = vi.fn();
    const getContext = vi.fn(() => ({ drawImage }));
    const toDataURL = vi.fn(() => 'data:image/png;base64,cropped');
    const createElementSpy = vi.spyOn(document, 'createElement');

    vi.stubGlobal('Image', ImageMock as never);
    createElementSpy.mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext,
          toDataURL,
        } as never;
      }

      return Document.prototype.createElement.call(document, tagName);
    });

    await expect(
      cropRenderedEditorDocument('data:image/png;base64,source', {
        left: 5,
        top: 6,
        width: 70,
        height: 80,
      })
    ).resolves.toBe('data:image/png;base64,cropped');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 5, 6, 70, 80, 0, 0, 70, 80);

    const cropRect = new Rect();
    expect(getActiveEditorCropRect({ tool: 'crop', object: cropRect } as never, null)).toBe(
      cropRect
    );
    expect(
      getActiveEditorCropRect({ tool: 'rectangle', object: new Rect() } as never, cropRect)
    ).toBe(cropRect);
  });
}

function runEditorControllerCropRenderFailureSuite() {
  it('surfaces crop image load and canvas context failures', async () => {
    vi.stubGlobal('Image', ImageMock as never);
    ImageMock.failNext = true;
    await expect(
      cropRenderedEditorDocument('data:image/png;base64,source', {
        left: 0,
        top: 0,
        width: 10,
        height: 10,
      })
    ).rejects.toThrow();

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: () => null,
          height: 0,
          toDataURL: vi.fn(),
          width: 0,
        } as never;
      }

      return Document.prototype.createElement.call(document, tagName);
    });

    await expect(
      cropRenderedEditorDocument('data:image/png;base64,source', {
        left: 0,
        top: 0,
        width: 10,
        height: 10,
      })
    ).rejects.toThrow();
  });
}

describe('editor-controller-crop guides', runEditorControllerCropGuideSuite);
describe('editor-controller-crop rendering', runEditorControllerCropRenderSuite);
describe('editor-controller-crop render failures', runEditorControllerCropRenderFailureSuite);
