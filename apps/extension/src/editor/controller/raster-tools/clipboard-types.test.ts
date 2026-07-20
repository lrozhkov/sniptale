import { expect, it } from 'vitest';
import type { ApplyRasterBitmapTarget, ClipboardControllerLike } from './clipboard-types';

it('keeps raster clipboard controller contracts role-specific', () => {
  const controller: ClipboardControllerLike & ApplyRasterBitmapTarget = {
    applyRasterBitmap: async () => undefined,
    canvas: null,
    commitHistory: () => undefined,
    nextLabelIndex: () => 1,
    prepareObject: () => undefined,
    rasterToolSession: {
      brushDraft: null,
      clipboard: null,
      eraserDraft: null,
      gradientDraft: null,
      hoverCursor: null,
      lassoDraft: null,
      marqueeDraft: null,
      overlayListeners: new Set(),
      selection: null,
    },
    source: null,
    syncRuntimeState: () => undefined,
  };

  expect(controller.canvas).toBeNull();
});
