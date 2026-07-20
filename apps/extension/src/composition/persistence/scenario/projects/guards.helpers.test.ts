import { expect, it } from 'vitest';

import {
  parseBody,
  parseCaptureMetadata,
  parseImageTransform,
  parseNullableString,
  parseNumber,
  parsePageDescriptor,
  parsePoint,
  parseRect,
  parseString,
  parseTargetDescriptor,
  parseViewportTransform,
} from './guards.helpers.ts';

function createValidPageRecord() {
  return {
    title: 'Example',
    url: 'https://example.com',
    viewport: { x: 0, y: 0, width: 1280, height: 720 },
    scrollX: 0,
    scrollY: 120,
    devicePixelRatio: 1,
  };
}

function createValidTargetRecord() {
  return {
    selector: '#submit',
    iframeSelector: null,
    tagName: 'button',
    role: 'button',
    text: 'Submit',
    ariaLabel: null,
    title: null,
    rect: { x: 10, y: 20, width: 120, height: 40 },
    framePadding: { top: 4, left: 6, right: 8, bottom: 10 },
  };
}

function createValidCaptureMetadataRecord() {
  return {
    pointerRange: {
      start: { x: 10, y: 20 },
      end: { x: 16, y: 24 },
      minX: 10,
      minY: 20,
      maxX: 16,
      maxY: 24,
      distance: 8,
      durationMs: 120,
    },
    scroll: {
      startX: 0,
      startY: 100,
      endX: 0,
      endY: 160,
      deltaX: 0,
      deltaY: 60,
    },
    trigger: 'pointer-up' as const,
  };
}

function createValidCaptureRecord() {
  return {
    assetId: 'asset-1',
    galleryAssetId: 'gallery-1',
    captureSurface: 'full',
    sourceKind: 'auto-click',
    page: createValidPageRecord(),
    target: createValidTargetRecord(),
    interactionPoint: { x: 12, y: 16 },
    cursorPoint: { x: 14, y: 18 },
    captureMetadata: createValidCaptureMetadataRecord(),
    imageTransform: { scale: 1.4, x: -10, y: 12 },
    viewportTransform: { x: 20, y: 30, width: 500, height: 320 },
  };
}

const validOverlayFixtures = [
  {
    id: 'focus',
    kind: 'focus-rect',
    rect: { x: 1, y: 2, width: 3, height: 4 },
    autoSource: 'capture-target',
  },
  {
    id: 'click',
    kind: 'click-ring',
    point: { x: 5, y: 6 },
    autoSource: 'capture-click',
  },
  { id: 'cursor', kind: 'cursor', point: { x: 7, y: 8 } },
  {
    id: 'blur',
    kind: 'blur-rect',
    rect: { x: 9, y: 10, width: 11, height: 12 },
    blurSettings: { amount: 13, blurType: 'gaussian', showBorder: false },
  },
  {
    id: 'arrow',
    kind: 'arrow',
    start: { x: 10, y: 20 },
    end: { x: 30, y: 40 },
    color: '#ff7a00',
    strokeWidth: 2,
  },
  {
    id: 'rectangle',
    kind: 'rectangle',
    rect: { x: 1, y: 2, width: 30, height: 40 },
    strokeColor: '#ff7a00',
    fillColor: 'rgba(255,122,0,0.18)',
    strokeWidth: 2,
  },
  {
    id: 'ellipse',
    kind: 'ellipse',
    rect: { x: 2, y: 3, width: 20, height: 10 },
    strokeColor: '#ff7a00',
    fillColor: 'rgba(255,122,0,0.12)',
    strokeWidth: 3,
  },
  {
    id: 'text',
    kind: 'text',
    point: { x: 12, y: 14 },
    text: 'Label',
    color: '#111',
    fontSize: 16,
    fontFamily: 'Arial',
    fontWeight: 600,
  },
] as const;

function createOverlayFixtures() {
  return [...validOverlayFixtures, { id: 'invalid', kind: 'unknown' }];
}

it('parses scalar helper fallbacks and legacy body aliases', () => {
  expect(parseString('value')).toBe('value');
  expect(parseString(10, 'fallback')).toBe('fallback');
  expect(parseNumber(12, 5)).toBe(12);
  expect(parseNumber('12', 5)).toBe(5);
  expect(parseNullableString(null)).toBeNull();
  expect(parseNullableString('caption')).toBe('caption');
  expect(parseNullableString(10)).toBeNull();
  expect(parseBody({ body: 'Body' })).toBe('Body');
  expect(parseBody({ caption: ' Legacy caption ' })).toBe(' Legacy caption ');
  expect(parseBody({ subtitle: 'Legacy subtitle' })).toBe('Legacy subtitle');
  expect(parseBody({})).toBe('');
});

it('parses geometry helpers and transform fallbacks', () => {
  expect(parseRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
    x: 1,
    y: 2,
    width: 3,
    height: 4,
  });
  expect(parseRect({ x: 1, y: 2 })).toBeNull();
  expect(parsePoint({ x: 7, y: 8 })).toEqual({ x: 7, y: 8 });
  expect(parsePoint({ x: 7 })).toBeNull();
  expect(parseImageTransform({ scale: 1.5, x: 10, y: -20 })).toEqual({
    scale: 1.5,
    x: 10,
    y: -20,
  });
  expect(parseImageTransform({ scale: 1.5, x: 10 })).toEqual({
    scale: 1,
    x: 0,
    y: 0,
  });
});

it('parses target and page descriptors with fallbacks', () => {
  expect(parseViewportTransform({ x: 10, y: 20, width: 400, height: 300 })).toEqual({
    x: 10,
    y: 20,
    width: 400,
    height: 300,
  });
  expect(parseViewportTransform({ x: 10, y: 20 })).toEqual({
    x: 0,
    y: 0,
    width: 720,
    height: 420,
  });
  expect(
    parseTargetDescriptor({
      ...createValidTargetRecord(),
      ariaLabel: 'Submit form',
    })
  ).toEqual(
    expect.objectContaining({
      selector: '#submit',
      framePadding: { top: 4, left: 6, right: 8, bottom: 10 },
      role: 'button',
    })
  );
  expect(parseTargetDescriptor({ rect: { x: 10 } })).toBeNull();
  expect(
    parsePageDescriptor({
      ...createValidPageRecord(),
      scrollY: 100,
      devicePixelRatio: 2,
    })
  ).toEqual(
    expect.objectContaining({
      title: 'Example',
      scrollY: 100,
      devicePixelRatio: 2,
    })
  );
  expect(parsePageDescriptor({ viewport: null })).toEqual({
    title: null,
    url: null,
    viewport: { x: 0, y: 0, width: 720, height: 420 },
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
  });
});

it('parses capture metadata records and overlay unions', () => {
  const capture = parseCaptureMetadata({
    ...createValidCaptureRecord(),
    overlays: createOverlayFixtures(),
  });

  expect(capture).toEqual(
    expect.objectContaining({
      assetId: 'asset-1',
      galleryAssetId: 'gallery-1',
      captureSurface: 'full',
      sourceKind: 'auto-click',
      interactionPoint: { x: 12, y: 16 },
      cursorPoint: { x: 14, y: 18 },
      imageTransform: { scale: 1.4, x: -10, y: 12 },
      viewportTransform: { x: 20, y: 30, width: 500, height: 320 },
      target: expect.objectContaining({
        framePadding: { top: 4, left: 6, right: 8, bottom: 10 },
      }),
      captureMetadata: expect.objectContaining({
        trigger: 'pointer-up',
      }),
    })
  );
});

it('drops invalid overlay entries from parsed capture metadata', () => {
  const capture = parseCaptureMetadata({
    ...createValidCaptureRecord(),
    overlays: createOverlayFixtures(),
  });

  expect(capture.overlays.map((overlay) => overlay.kind)).toEqual([
    'focus-rect',
    'click-ring',
    'cursor',
    'blur-rect',
    'arrow',
    'rectangle',
    'ellipse',
    'text',
  ]);
  expect(capture.overlays[0]).toEqual(
    expect.objectContaining({ autoSource: 'capture-target', kind: 'focus-rect' })
  );
  expect(capture.overlays[1]).toEqual(
    expect.objectContaining({ autoSource: 'capture-click', kind: 'click-ring' })
  );
});
