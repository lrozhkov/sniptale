import { beforeEach, expect, it, vi } from 'vitest';
import { drawCompositionVisualLayer, drawFittedMediaFrame } from './index';

class FakeHTMLMediaElement {
  static HAVE_CURRENT_DATA = 2;
  readyState = 3;
}

class FakeHTMLVideoElement extends FakeHTMLMediaElement {
  videoHeight = 120;
  videoWidth = 200;
}

function createContext() {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '#000',
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn(() => ({ width: 24 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    textAlign: 'left',
    textBaseline: 'top',
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createBaseRenderState() {
  return {
    blurAmount: 0,
    opacityMultiplier: 1,
    scaleX: 1,
    scaleY: 1,
    translateX: 0,
    translateY: 0,
  };
}

function createScaledTextLayer() {
  return {
    clip: {
      style: {
        backgroundColor: '#000',
        borderColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        color: '#fff',
        fontFamily: 'Segoe UI',
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1.2,
        padding: 6,
        textAlign: 'left',
      },
      text: 'Scaled text',
    },
    clipId: 'text-1',
    height: 40,
    kind: 'text',
    opacity: 1,
    renderState: createBaseRenderState(),
    rotation: 0,
    width: 80,
    x: 10,
    y: 12,
    zIndex: 0,
  };
}

function createImageLayer() {
  return {
    clip: { assetId: 'image-1', fitMode: 'CONTAIN' },
    clipId: 'image-layer',
    height: 40,
    kind: 'image',
    opacity: 1,
    renderState: createBaseRenderState(),
    rotation: 0,
    width: 60,
    x: 3,
    y: 4,
    zIndex: 0,
  };
}

function createShapeLayer() {
  return {
    clip: {
      shapeType: 'RECTANGLE',
      style: { borderRadius: 8, fillColor: '#f00', strokeColor: '#0f0', strokeWidth: 2 },
    },
    clipId: 'shape-1',
    height: 30,
    kind: 'shape',
    opacity: 1,
    renderState: createBaseRenderState(),
    rotation: 0,
    width: 50,
    x: 2,
    y: 3,
    zIndex: 0,
  };
}

function createAnnotationPresentation() {
  return {
    effects: {
      accentProgress: 1,
      accentWidthMultiplier: 1,
      badgeProgress: 1,
      blurPx: 0,
      connectorProgress: 1,
      glossProgress: null,
      headlineProgress: 1,
      headlineRevealProgress: 1,
      maskProgress: 1,
      markerProgress: 1,
      scaleMultiplier: 1,
      shadowStrength: 1,
      shimmerProgress: null,
      sublineProgress: 1,
      sublineRevealProgress: 1,
      translateX: 0,
      translateY: 0,
    },
    frame: { height: 50, opacity: 1, rotation: 0, width: 80, x: 10, y: 12 },
    labelFrame: { height: 50, width: 80, x: 10, y: 12 },
    style: {
      accentColor: '#ff8800',
      backgroundColor: '#111111',
      badgeTextColor: '#ffffff',
      blurAmount: 0,
      borderRadius: 16,
      depthAmount: 0.2,
      headlineColor: '#ffffff',
      padding: 16,
      shimmerAmount: 0.4,
      sublineColor: '#cccccc',
    },
  };
}

function createAnnotationClip() {
  return {
    calloutDecor: {
      arrowKind: 'NONE',
      frameKind: 'NONE',
      markerKind: 'NONE',
      pulseKind: 'NONE',
    },
    content: { badge: 'NEW', headline: 'Headline', subline: 'Subline' },
    id: 'annotation-1',
    leaderLine: {
      direction: 'LEFT',
      enabled: false,
      length: 120,
      style: 'STRAIGHT',
      thickness: 3,
    },
    presentation: createAnnotationPresentation(),
    renderFamily: 'PLATE',
    target: 'NONE',
    targetPoint: null,
    targetRect: null,
    templateKind: 'LOWER_THIRD_BASIC',
    trackId: 'track-1',
  };
}

function createAnnotationLayer() {
  return {
    clip: createAnnotationClip(),
    clipId: 'annotation-1',
    height: 50,
    kind: 'annotation',
    opacity: 1,
    renderState: createBaseRenderState(),
    rotation: 0,
    width: 80,
    x: 10,
    y: 12,
    zIndex: 0,
  };
}

beforeEach(() => {
  vi.stubGlobal('HTMLMediaElement', FakeHTMLMediaElement);
  vi.stubGlobal('HTMLVideoElement', FakeHTMLVideoElement);
});

it('covers fitted media branches used by the shared visual owner', () => {
  const context = createContext();
  const renderer = vi.fn();

  drawFittedMediaFrame(context, 0, 0, 1, 2, 3, 4, 'CONTAIN', renderer);
  drawFittedMediaFrame(context, 100, 50, 0, 0, 40, 20, 'STRETCH', renderer);
  drawFittedMediaFrame(context, 100, 50, 0, 0, 40, 20, 'SOURCE_100', renderer);
  drawFittedMediaFrame(context, 100, 50, 0, 0, 40, 20, 'FIT_LONG_SIDE', renderer);
  drawFittedMediaFrame(context, 100, 50, 0, 0, 40, 20, 'FIT_SHORT_SIDE', renderer);
  drawFittedMediaFrame(context, 100, 50, 0, 0, 40, 20, 'COVER', renderer);

  expect(renderer).toHaveBeenCalledTimes(6);
  expect(context.rect).toHaveBeenCalledWith(0, 0, 40, 20);
  expect(context.clip).toHaveBeenCalledTimes(1);
});

it('routes scaled text layers through their display-scale draw path', () => {
  const context = createContext();

  drawCompositionVisualLayer(context, createScaledTextLayer() as never, 2, 2, {}, new Map());

  expect(context.fillText).toHaveBeenCalledWith('Scaled text', 32, 36, 136);
});

it('routes scaled image and shape layers through the shared visual switch', () => {
  const context = {
    ...createContext(),
    ellipse: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  drawCompositionVisualLayer(
    context,
    createImageLayer() as never,
    2,
    2,
    { 'image-1': { naturalHeight: 60, naturalWidth: 100 } as never },
    new Map()
  );
  drawCompositionVisualLayer(context, createShapeLayer() as never, 2, 2, {}, new Map());

  expect(context.drawImage).toHaveBeenCalled();
  expect(context.fill).toHaveBeenCalled();
  expect(context.stroke).toHaveBeenCalled();
});

it('routes scaled annotation layers through the shared visual switch', () => {
  const context = createContext();

  drawCompositionVisualLayer(context, createAnnotationLayer() as never, 2, 2, {}, new Map());

  expect(context.fillText).toHaveBeenCalledWith('NEW', expect.any(Number), expect.any(Number));
  expect(context.fillText).toHaveBeenCalledWith(
    'Headline',
    expect.any(Number),
    expect.any(Number),
    expect.any(Number)
  );
});

it('skips unavailable media payloads in the shared visual switch', () => {
  const context = createContext();
  const unavailableVideo = {
    ...new FakeHTMLVideoElement(),
    readyState: 0,
  } as unknown as HTMLMediaElement;

  drawCompositionVisualLayer(
    context,
    {
      clip: { fitMode: 'CONTAIN' },
      clipId: 'video-1',
      height: 50,
      kind: 'video',
      opacity: 1,
      renderState: createBaseRenderState(),
      rotation: 0,
      width: 80,
      x: 10,
      y: 12,
      zIndex: 0,
    } as never,
    2,
    2,
    {},
    new Map([['video-1', unavailableVideo]])
  );
  drawCompositionVisualLayer(context, createImageLayer() as never, 2, 2, {}, new Map());

  expect(context.drawImage).not.toHaveBeenCalled();
});
