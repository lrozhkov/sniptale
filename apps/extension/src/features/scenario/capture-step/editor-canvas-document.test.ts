import { describe, expect, it } from 'vitest';
import { buildScenarioEditorCanvasDocument } from './editor-canvas-document';

const canvasArgs = {
  assetDataUrl: 'data:image/png;base64,doc',
  sourceHeight: 180,
  sourceWidth: 320,
};

function verifyCanvasDocumentForFocusRect() {
  const document = buildScenarioEditorCanvasDocument({
    ...canvasArgs,
    overlays: [
      {
        id: 'frame-1',
        kind: 'focus-rect',
        rect: { x: 10, y: 20, width: 120, height: 40 },
        autoSource: 'capture-target',
      },
    ],
  });

  expect(document.version).toBe('7.2.0');
  expect(document.objects).toHaveLength(1);
  expect(document.objects[0]).toEqual(
    expect.objectContaining({
      sniptaleMetaKind: 'scenario-focus-rect',
      sniptaleId: 'frame-1',
      sniptaleAutoSource: 'capture-target',
    })
  );
}

function verifyCanvasDocumentForPointOverlays() {
  const document = buildScenarioEditorCanvasDocument({
    ...canvasArgs,
    overlays: [
      {
        id: 'ring-1',
        kind: 'click-ring',
        point: { x: 24, y: 34 },
        autoSource: 'capture-click',
      },
      {
        id: 'cursor-1',
        kind: 'cursor',
        point: { x: 42, y: 52 },
      },
    ],
  });

  expect(document.objects.map((entry) => entry['sniptaleMetaKind'])).toEqual([
    'scenario-click-ring',
    'scenario-cursor',
  ]);
  expect(document.objects[0]).toEqual(
    expect.objectContaining({ sniptaleAutoSource: 'capture-click' })
  );
}

function verifyCanvasDocumentBuildsBlurObjectsAndIgnoresOtherKinds() {
  const document = buildScenarioEditorCanvasDocument({
    ...canvasArgs,
    overlays: [
      {
        id: 'blur-1',
        kind: 'blur-rect',
        rect: { x: 1, y: 2, width: 30, height: 40 },
        blurSettings: { amount: 6, blurType: 'distortion', showBorder: true },
      },
      {
        id: 'arrow-1',
        kind: 'arrow',
        start: { x: 0, y: 0 },
        end: { x: 30, y: 50 },
        color: '#ff00ff',
        strokeWidth: 3,
      },
      {
        id: 'shape-1',
        kind: 'rectangle',
        rect: { x: 3, y: 4, width: 20, height: 30 },
        strokeColor: '#000000',
        fillColor: '#ffffff',
        strokeWidth: 2,
      },
    ],
  });

  expect(document.objects).toEqual([
    expect.objectContaining({
      sniptaleId: 'blur-1',
      sniptaleType: 'blur',
      sniptaleMetaKind: 'scenario-blur-rect',
      sniptaleBlurAmount: 6,
      sniptaleBlurType: 'distortion',
      sniptaleBlurShowBorder: true,
    }),
  ]);
}

describe('capture-step editor canvas document', () => {
  it('builds a tagged canvas document for focus-rect overlays', verifyCanvasDocumentForFocusRect);
  it(
    'builds tagged canvas documents for point overlays in source order',
    verifyCanvasDocumentForPointOverlays
  );
  it(
    'builds blur canvas objects and ignores overlay kinds that are not projected into the canvas document',
    verifyCanvasDocumentBuildsBlurObjectsAndIgnoresOtherKinds
  );
});
