import { expect, it } from 'vitest';
import { createBlurRectCanvasObject } from './editor-canvas-blur-rect';

it('builds blur canvas objects with blur metadata and source snapshot fields', () => {
  expect(
    createBlurRectCanvasObject({
      assetDataUrl: 'data:image/png;base64,doc',
      overlay: {
        id: 'blur-1',
        kind: 'blur-rect',
        rect: { x: 12, y: 16, width: 80, height: 40 },
        blurSettings: {
          amount: 9,
          blurType: 'solid',
          radius: 8,
          shadow: 20,
          showBorder: true,
          strokeColor: '#112233',
          strokeOpacity: 0.6,
          strokeStyle: 'dashed',
          strokeWidth: 5,
        },
      },
      sourceWidth: 320,
      sourceHeight: 180,
    })
  ).toEqual(
    expect.objectContaining({
      sniptaleId: 'blur-1',
      sniptaleType: 'blur',
      sniptaleBlurAmount: 9,
      sniptaleBlurType: 'solid',
      sniptaleBlurShowBorder: true,
      sniptaleBlurStrokeColor: '#112233',
      sniptaleBlurStrokeWidth: 5,
      sniptaleShapeRadius: 8,
      sniptaleShapeShadow: 20,
      sniptaleShapeStrokeOpacity: 0.6,
      sniptaleShapeStrokeStyle: 'dashed',
      sniptaleBlurSourceData: 'data:image/png;base64,doc',
      sniptaleBlurSourceWidth: 320,
      sniptaleBlurSourceHeight: 180,
      sniptaleMetaKind: 'scenario-blur-rect',
      stroke: '#112233',
      strokeWidth: 5,
    })
  );
});

it('keeps the border disabled branch and auto source metadata for scenario blur overlays', () => {
  expect(
    createBlurRectCanvasObject({
      assetDataUrl: 'data:image/png;base64,doc',
      overlay: {
        autoSource: 'capture-target',
        id: 'blur-2',
        kind: 'blur-rect',
        rect: { x: 1, y: 2, width: 3, height: 4 },
        blurSettings: { amount: 4, blurType: 'distortion', showBorder: false },
      },
      sourceWidth: 100,
      sourceHeight: 50,
    })
  ).toEqual(
    expect.objectContaining({
      sniptaleAutoSource: 'capture-target',
      sniptaleBlurShowBorder: false,
      stroke: null,
      strokeWidth: 0,
    })
  );
});
