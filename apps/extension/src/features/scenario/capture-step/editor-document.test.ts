import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../editor/document/constants';
import {
  buildAutoScenarioCaptureOverlays,
  createScenarioCaptureEditorDocument,
  projectCompatOverlaysFromEditorDocument,
  syncScenarioCaptureEditorDocumentOverlays,
  shouldRenderScenarioStepOverlays,
} from './editor-document';
import { createScenarioCaptureStep } from '../project/public';

function createEditorDocument(canvasJson: string) {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,doc',
    sourceName: null,
    sourceWidth: 320,
    sourceHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 320,
    sourceDisplayHeight: 180,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson,
  };
}

function createTargetDescriptor(
  rect: { height: number; width: number; x: number; y: number } | null,
  framePadding = { top: 0, left: 0, right: 0, bottom: 0 }
) {
  return {
    selector: '#submit',
    iframeSelector: null,
    tagName: 'button',
    role: 'button',
    text: 'Submit',
    ariaLabel: null,
    title: null,
    rect,
    framePadding,
  };
}

function verifiesFocusRectPriority() {
  const overlays = buildAutoScenarioCaptureOverlays({
    cursorPoint: { x: 18, y: 28 },
    interactionPoint: { x: 16, y: 24 },
    target: createTargetDescriptor(
      { x: 10, y: 20, width: 120, height: 40 },
      { top: 4, left: 6, right: 8, bottom: 10 }
    ),
  });

  expect(overlays.map((overlay) => overlay.kind)).toEqual(['focus-rect']);
  expect(overlays[0]).toEqual(
    expect.objectContaining({
      autoSource: 'capture-target',
      rect: { x: 4, y: 16, width: 134, height: 54 },
    })
  );
}

function verifiesClickRingFallback() {
  const overlays = buildAutoScenarioCaptureOverlays({
    cursorPoint: { x: 26, y: 36 },
    interactionPoint: { x: 25, y: 35 },
    target: createTargetDescriptor(null),
  });

  expect(overlays.map((overlay) => overlay.kind)).toEqual(['click-ring']);
  expect(overlays[0]).toEqual(
    expect.objectContaining({
      autoSource: 'capture-click',
      kind: 'click-ring',
      point: { x: 26, y: 36 },
    })
  );
}

function verifiesCompatOverlayProjection() {
  const sourceOverlays = [
    {
      id: 'frame-1',
      kind: 'focus-rect' as const,
      rect: { x: 10, y: 20, width: 120, height: 40 },
      autoSource: 'capture-target' as const,
    },
    {
      id: 'cursor-1',
      kind: 'cursor' as const,
      point: { x: 18, y: 28 },
    },
    {
      id: 'blur-1',
      kind: 'blur-rect' as const,
      rect: { x: 24, y: 32, width: 72, height: 36 },
      blurSettings: { amount: 12, blurType: 'distortion' as const, showBorder: true },
    },
  ];
  const document = createScenarioCaptureEditorDocument({
    dataUrl: 'data:image/png;base64,doc',
    overlays: sourceOverlays,
    sourceHeight: 180,
    sourceWidth: 320,
  });

  expect(projectCompatOverlaysFromEditorDocument(document)).toEqual(sourceOverlays);
}

function verifiesMalformedCompatOverlayFiltering() {
  const document = createEditorDocument(
    JSON.stringify({
      version: '7.2.0',
      objects: [
        {
          sniptaleId: 'cursor-1',
          sniptaleMetaKind: 'scenario-cursor',
          left: 18,
          top: 28,
        },
        {
          sniptaleId: 'broken-rect',
          sniptaleMetaKind: 'scenario-focus-rect',
          left: 10,
          top: 20,
          width: 'invalid',
          height: 40,
        },
        {
          sniptaleId: 'broken-blur',
          sniptaleType: 'blur',
          left: 12,
          top: 14,
          width: 40,
          height: 20,
          sniptaleBlurAmount: 'bad',
          sniptaleBlurType: 'gaussian',
        },
      ],
    })
  );

  expect(projectCompatOverlaysFromEditorDocument(document)).toEqual([
    { id: 'cursor-1', kind: 'cursor', point: { x: 18, y: 28 } },
  ]);
}

function createAssetModeOverlayDocument() {
  return createEditorDocument(
    JSON.stringify({
      version: '7.2.0',
      objects: [
        {
          sniptaleId: 'blur-1',
          sniptaleType: 'blur',
          left: 18,
          top: 22,
          width: 44,
          height: 28,
          sniptaleBlurAmount: 9,
          sniptaleBlurType: 'solid',
          sniptaleBlurShowBorder: true,
        },
        {
          sniptaleId: 'ring-1',
          sniptaleMetaKind: 'scenario-click-ring',
          sniptaleAutoSource: 'capture-click',
          left: 20,
          top: 30,
        },
      ],
    })
  );
}

function verifiesAssetModeOverlaySuppression() {
  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
    overlays: [],
  });

  expect(shouldRenderScenarioStepOverlays(step)).toBe(true);
  expect(
    shouldRenderScenarioStepOverlays({
      ...step,
      annotationRenderMode: 'asset',
    })
  ).toBe(false);
  expect(projectCompatOverlaysFromEditorDocument(createAssetModeOverlayDocument())).toEqual([
    {
      id: 'blur-1',
      kind: 'blur-rect',
      rect: { x: 18, y: 22, width: 44, height: 28 },
      blurSettings: { amount: 9, blurType: 'solid', showBorder: true },
    },
    { id: 'ring-1', kind: 'click-ring', point: { x: 20, y: 30 }, autoSource: 'capture-click' },
  ]);
}

function verifiesCompatOverlaySyncForPersistedEditorDocument() {
  const syncedDocument = syncScenarioCaptureEditorDocumentOverlays(
    createEditorDocument(
      JSON.stringify({
        version: '7.2.0',
        objects: [
          {
            sniptaleId: 'frame-1',
            sniptaleMetaKind: 'scenario-focus-rect',
            left: 10,
            top: 20,
            width: 100,
            height: 40,
          },
          {
            sniptaleId: 'blur-1',
            sniptaleType: 'blur',
            left: 18,
            top: 22,
            width: 44,
            height: 28,
            sniptaleBlurAmount: 9,
            sniptaleBlurType: 'solid',
            sniptaleBlurShowBorder: true,
          },
          {
            sniptaleId: 'text-1',
            type: 'Textbox',
            text: 'Keep me',
          },
        ],
      })
    ),
    []
  );

  expect(JSON.parse(syncedDocument.canvasJson)).toEqual({
    version: '7.2.0',
    objects: [
      {
        sniptaleId: 'text-1',
        text: 'Keep me',
        type: 'Textbox',
      },
    ],
  });
}

describe('capture-step editor document helpers', () => {
  it(
    'prefers a frame over a click ring without adding a separate auto cursor overlay',
    verifiesFocusRectPriority
  );
  it('falls back to a click ring when no focus rect is available', verifiesClickRingFallback);
  it(
    'projects compat overlays back from tagged editor document objects',
    verifiesCompatOverlayProjection
  );
  it('filters malformed tagged compat overlay objects', verifiesMalformedCompatOverlayFiltering);
  it(
    'skips overlay rendering after editor apply-back switches the step to asset mode',
    verifiesAssetModeOverlaySuppression
  );
  it(
    'replaces persisted compat overlays with the current step overlays when reopening the editor',
    verifiesCompatOverlaySyncForPersistedEditorDocument
  );
});
