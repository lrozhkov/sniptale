export function createValidCaptureRecord() {
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

export function createOverlayFixtures() {
  return [...validOverlayFixtures, { id: 'invalid', kind: 'unknown' }];
}
