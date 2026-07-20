import { describe, expect, it, vi } from 'vitest';

import { finalizeEditorCropSelection, hideCropGuideForApply, logCropApplyStart } from './guide';

function registerHideGuideTest() {
  it('hides and restores crop guide visibility during apply', () => {
    const cropGuide = { visible: true };
    const canvas = {
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      setActiveObject: vi.fn(),
    };

    const restore = hideCropGuideForApply(canvas as never, cropGuide as never);
    expect(cropGuide.visible).toBe(false);

    restore();
    expect(cropGuide.visible).toBe(true);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(cropGuide);
  });
}

function registerFinalizeGuideTest() {
  it('finalizes crop guide state and logs result dimensions', () => {
    const cropGuide = { visible: false };
    const canvas = {
      discardActiveObject: vi.fn(),
      remove: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    const logCrop = vi.fn();
    const crop = { height: 20, left: 1, top: 2, width: 30 };

    expect(finalizeEditorCropSelection(canvas as never, cropGuide as never, logCrop, crop)).toEqual(
      { cropGuide: null, cropSelection: null }
    );
    expect(canvas.remove).toHaveBeenCalledWith(cropGuide);
    expect(logCrop).toHaveBeenCalledWith('apply:done', {
      crop,
      resultHeight: 20,
      resultWidth: 30,
    });
  });
}

function registerStartLogTest() {
  it('logs crop apply start with current canvas dimensions', () => {
    const logCrop = vi.fn();
    const crop = { height: 20, left: 1, top: 2, width: 30 };

    logCropApplyStart(logCrop, crop, { height: 200, width: 300 });

    expect(logCrop).toHaveBeenCalledWith('apply:start', {
      canvasHeight: 200,
      canvasWidth: 300,
      crop,
    });
  });
}

function runCropApplyGuideSuite() {
  registerHideGuideTest();
  registerFinalizeGuideTest();
  registerStartLogTest();
}

describe('crop apply guide owner', runCropApplyGuideSuite);
