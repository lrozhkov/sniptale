import { beforeEach, expect, it, vi } from 'vitest';
import {
  drawActionCompositionState,
  drawCompositionVisualLayer,
  drawCursorCompositionState,
  drawFittedMediaFrame,
} from './index';

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
    arc: vi.fn(),
    beginPath: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    fill: vi.fn(),
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
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  vi.stubGlobal('HTMLMediaElement', FakeHTMLMediaElement);
  vi.stubGlobal('HTMLVideoElement', FakeHTMLVideoElement);
});

it('supports stretch and all shared media fit modes without extra cropping', () => {
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

it('renders video layers through the shared composition visual pipeline', () => {
  const context = createContext();
  const video = new FakeHTMLVideoElement() as unknown as HTMLMediaElement;

  drawCompositionVisualLayer(
    context,
    {
      clip: { fitMode: 'COVER' },
      clipId: 'video-1',
      height: 50,
      kind: 'video',
      opacity: 0.5,
      renderState: {
        blurAmount: 0,
        opacityMultiplier: 1,
        scaleX: 1,
        scaleY: 1,
        translateX: 0,
        translateY: 0,
      },
      rotation: 0,
      width: 80,
      x: 10,
      y: 12,
      zIndex: 0,
    } as never,
    2,
    2,
    {},
    new Map([['video-1', video]])
  );

  expect(context.drawImage).toHaveBeenCalledTimes(1);
});

it('renders image layers through the shared composition visual pipeline', () => {
  const context = createContext();

  drawCompositionVisualLayer(
    context,
    {
      clip: { assetId: 'image-1', fitMode: 'CONTAIN' },
      clipId: 'image-layer',
      height: 40,
      kind: 'image',
      opacity: 1,
      renderState: {
        blurAmount: 0,
        opacityMultiplier: 1,
        scaleX: 1,
        scaleY: 1,
        translateX: 0,
        translateY: 0,
      },
      rotation: 0,
      width: 60,
      x: 3,
      y: 4,
      zIndex: 0,
    } as never,
    1,
    1,
    { 'image-1': { naturalHeight: 60, naturalWidth: 100 } as never },
    new Map()
  );

  expect(context.drawImage).toHaveBeenCalledTimes(1);
});

it('skips video and image draws when media payloads are not ready and applies opacity multipliers', () => {
  const context = createContext();
  const video = new FakeHTMLVideoElement() as unknown as HTMLMediaElement;
  Object.defineProperty(video, 'readyState', { value: 0 });

  drawUnavailableVideoLayer(context, video);
  drawMissingImageLayer(context);

  expect(context.drawImage).not.toHaveBeenCalled();
  expect(context.globalAlpha).toBeCloseTo(0.375);
});

it('renders visible cursor and active action preset overlays', () => {
  const context = createContext();

  drawCursorCompositionState(context, {
    animationPreset: 'PULSE',
    captureMode: 'separate',
    color: '#fff',
    preset: 'ARROW',
    scale: 1.2,
    shadow: true,
    time: 2,
    visible: true,
    x: 20,
    y: 30,
  });
  drawCursorCompositionState(context, {
    animationPreset: 'NONE',
    captureMode: 'separate',
    color: '#fff',
    preset: 'DOT',
    scale: 1,
    shadow: false,
    time: 0,
    visible: false,
    x: 0,
    y: 0,
  });

  for (const preset of ['CLICK_RIPPLE', 'NONE', 'SPOTLIGHT', 'DWELL_ZOOM']) {
    drawActionCompositionState(
      context,
      {
        duration: 1,
        event: { preset },
        point: { x: 40, y: 50 },
        progress: 0.5,
        start: 0,
      } as never,
      null
    );
  }

  expect(context.translate).toHaveBeenCalledWith(20, 30);
  expect(context.scale).toHaveBeenCalled();
  expect(context.arc).toHaveBeenCalled();
  expect(context.createRadialGradient).toHaveBeenCalledTimes(1);
});

it('covers every cursor preset and animation branch in the shared cursor renderer', () => {
  const context = createContext();

  renderCursorVariants(context);

  expect(context.moveTo).toHaveBeenCalled();
  expect(context.lineTo).toHaveBeenCalled();
  expect(context.arc).toHaveBeenCalled();
  expect(context.fill).toHaveBeenCalled();
  expect(context.stroke).toHaveBeenCalled();
  expect(context.translate).toHaveBeenCalledWith(0, expect.any(Number));
  expect(context.scale).toHaveBeenCalledTimes(4);
});

function renderCursorVariants(context: CanvasRenderingContext2D) {
  renderCursorVariant(context, 'NONE', 'ARROW', '#fff', 10, 20, 0, false);
  renderCursorVariant(context, 'PULSE', 'DOT', '#0ff', 30, 40, 0.25, true);
  renderCursorVariant(context, 'FLOAT', 'RING', '#f0f', 50, 60, 0.25, false);
  renderCursorVariant(context, 'BREATHE', 'CROSSHAIR', '#ff0', 70, 80, 0.5, false);
}

function renderCursorVariant(
  context: CanvasRenderingContext2D,
  animationPreset: 'NONE' | 'PULSE' | 'FLOAT' | 'BREATHE',
  preset: 'ARROW' | 'DOT' | 'RING' | 'CROSSHAIR',
  color: string,
  x: number,
  y: number,
  time: number,
  shadow: boolean
) {
  drawCursorCompositionState(context, {
    animationPreset,
    captureMode: 'embedded-fallback',
    color,
    preset,
    scale: 1,
    shadow,
    time,
    visible: true,
    x,
    y,
  });
}

function drawUnavailableVideoLayer(context: CanvasRenderingContext2D, video: HTMLMediaElement) {
  drawCompositionVisualLayer(
    context,
    {
      clip: { fitMode: 'CONTAIN' },
      clipId: 'video-1',
      height: 50,
      kind: 'video',
      opacity: 0.5,
      renderState: {
        blurAmount: 0,
        opacityMultiplier: 1,
        scaleX: 1,
        scaleY: 1,
        translateX: 0,
        translateY: 0,
      },
      rotation: 0,
      width: 80,
      x: 10,
      y: 12,
      zIndex: 0,
    } as never,
    2,
    2,
    {},
    new Map([['video-1', video]])
  );
}

function drawMissingImageLayer(context: CanvasRenderingContext2D) {
  drawCompositionVisualLayer(
    context,
    {
      clip: { assetId: 'missing', fitMode: 'CONTAIN' },
      clipId: 'image-layer',
      height: 40,
      kind: 'image',
      opacity: 0.75,
      renderState: {
        blurAmount: 0,
        opacityMultiplier: 1,
        scaleX: 1,
        scaleY: 1,
        translateX: 0,
        translateY: 0,
      },
      rotation: 0,
      width: 60,
      x: 3,
      y: 4,
      zIndex: 0,
    } as never,
    1,
    1,
    {},
    new Map(),
    0.5
  );
}
