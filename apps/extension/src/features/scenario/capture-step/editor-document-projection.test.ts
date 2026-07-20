import { expect, it } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../editor/document/constants';
import { projectCompatOverlaysFromEditorDocument } from './editor-document-projection';

function createDocument(objects: Record<string, unknown>[] | string) {
  return {
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasHeight: 180,
    canvasJson:
      typeof objects === 'string' ? objects : JSON.stringify({ version: '7.2.0', objects }),
    canvasWidth: 320,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    sourceDisplayHeight: 180,
    sourceDisplayWidth: 320,
    sourceHeight: 180,
    sourceImageData: 'data:image/png;base64,doc',
    sourceLeft: 0,
    sourceName: null,
    sourceTop: 0,
    sourceWidth: 320,
    version: 1,
  } as const;
}

function createTaggedProjectionObjects() {
  return [
    {
      sniptaleId: 'focus-1',
      sniptaleMetaKind: 'scenario-focus-rect',
      left: 1,
      top: 2,
      width: 3,
      height: 4,
      sniptaleAutoSource: 'capture-target',
    },
    {
      sniptaleId: 'ring-1',
      sniptaleMetaKind: 'scenario-click-ring',
      left: 11,
      top: 12,
      sniptaleAutoSource: 'capture-click',
    },
    {
      sniptaleId: 'cursor-1',
      sniptaleMetaKind: 'scenario-cursor',
      left: 21,
      top: 22,
    },
    {
      sniptaleId: 'broken-blur',
      sniptaleType: 'blur',
      left: 0,
      top: 0,
      width: 10,
      height: 10,
      sniptaleBlurAmount: 'wide',
      sniptaleBlurType: 'pixelate',
    },
  ];
}

function expectTaggedProjectionObjects() {
  return [
    {
      autoSource: 'capture-target',
      id: 'focus-1',
      kind: 'focus-rect',
      rect: { x: 1, y: 2, width: 3, height: 4 },
    },
    {
      autoSource: 'capture-click',
      id: 'ring-1',
      kind: 'click-ring',
      point: { x: 11, y: 12 },
    },
    {
      id: 'cursor-1',
      kind: 'cursor',
      point: { x: 21, y: 22 },
    },
  ];
}

it('projects blur objects back into scenario blur overlays', () => {
  expect(
    projectCompatOverlaysFromEditorDocument(
      createDocument([
        {
          sniptaleId: 'blur-1',
          sniptaleType: 'blur',
          left: 10,
          top: 20,
          width: 80,
          height: 40,
          sniptaleBlurAmount: 7,
          sniptaleBlurType: 'distortion',
          sniptaleBlurShowBorder: true,
        },
      ])
    )
  ).toEqual([
    {
      id: 'blur-1',
      kind: 'blur-rect',
      rect: { x: 10, y: 20, width: 80, height: 40 },
      blurSettings: { amount: 7, blurType: 'distortion', showBorder: true },
    },
  ]);
});

it('projects pixelate blur objects back into scenario blur overlays', () => {
  expect(
    projectCompatOverlaysFromEditorDocument(
      createDocument([
        {
          sniptaleId: 'blur-2',
          sniptaleType: 'blur',
          left: 5,
          top: 6,
          width: 70,
          height: 30,
          sniptaleBlurAmount: 9,
          sniptaleBlurType: 'pixelate',
          sniptaleBlurShowBorder: false,
        },
      ])
    )
  ).toEqual([
    {
      id: 'blur-2',
      kind: 'blur-rect',
      rect: { x: 5, y: 6, width: 70, height: 30 },
      blurSettings: { amount: 9, blurType: 'pixelate', showBorder: false },
    },
  ]);
});

it('projects tagged focus, click-ring, and cursor overlays while dropping invalid blur payloads', () => {
  expect(
    projectCompatOverlaysFromEditorDocument(createDocument(createTaggedProjectionObjects()))
  ).toEqual(expectTaggedProjectionObjects());
});

it('returns an empty overlay list for malformed canvas JSON', () => {
  expect(projectCompatOverlaysFromEditorDocument(createDocument('{'))).toEqual([]);
});
