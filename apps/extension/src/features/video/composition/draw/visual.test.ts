import { beforeEach, expect, it, vi } from 'vitest';
import { drawCompositionVisualLayer, drawFittedMediaFrame } from './index';
import { drawCompositionVisualLayerBitmap } from './visual';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types';
import {
  createEffectVisualLayer,
  createTextVisualLayer,
  createVisualTestContext,
  FakeBitmap,
  FakeHTMLMediaElement,
  FakeHTMLVideoElement,
} from './visual.test-support';

const createContext = createVisualTestContext;

beforeEach(() => {
  vi.stubGlobal('HTMLMediaElement', FakeHTMLMediaElement);
  vi.stubGlobal('HTMLVideoElement', FakeHTMLVideoElement);
});

it('applies render-state transforms and blur before drawing composition layers', () => {
  const context = createContext();
  const video = new FakeHTMLVideoElement() as unknown as HTMLMediaElement;

  drawCompositionVisualLayer(
    context,
    {
      clip: { fitMode: 'CONTAIN' },
      clipId: 'video-1',
      height: 50,
      kind: 'video',
      opacity: 1,
      renderState: {
        blurAmount: 4,
        opacityMultiplier: 1,
        scaleX: 0.84,
        scaleY: 1.1,
        translateX: 12,
        translateY: -6,
      },
      rotation: 12,
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

  expect(context.filter).toBe('blur(8.00px)');
  expect(context.translate).toHaveBeenCalled();
  expect(context.scale).toHaveBeenCalledWith(0.84, 1.1);
  expect(context.rotate).toHaveBeenCalled();
});

it('draws EffectV1 bitmaps through ordinary layer geometry and render state', () => {
  const context = createContext();
  const layer = createEffectVisualLayer();
  layer.renderState = {
    ...IDENTITY_TRANSITION_VISUAL_STATE,
    blurAmount: 2,
    scaleX: 1.2,
    translateX: 3,
  };
  layer.rotation = 10;
  const bitmap = new FakeBitmap(20, 10);

  drawCompositionVisualLayerBitmap(context, layer, bitmap, 2, 3, 0.5);

  expect(context.globalAlpha).toBe(0.5);
  expect(context.filter).toBe('blur(5.00px)');
  expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 20, 10, 104, 78, 192, 144);
  expect(context.translate).toHaveBeenCalled();
  expect(context.scale).toHaveBeenCalledWith(1.2, 1);
  expect(context.rotate).toHaveBeenCalled();

  Reflect.deleteProperty(layer, 'renderState');
  layer.rotation = 0;
  drawCompositionVisualLayerBitmap(context, layer, bitmap, 1, 1);
  expect(context.drawImage).toHaveBeenCalledTimes(2);
});

it('keeps EffectV1 hosts inert in the native fallback and routes text layers', () => {
  const context = createContext();

  drawCompositionVisualLayer(context, createEffectVisualLayer(), 1, 1, {}, new Map());
  drawCompositionVisualLayer(context, createTextVisualLayer(), 1, 1, {}, new Map());

  expect(context.fillText).toHaveBeenCalled();
});

it('draws media shadows before fitted video frames', () => {
  const context = createContext();
  const video = new FakeHTMLVideoElement() as unknown as HTMLMediaElement;

  drawCompositionVisualLayer(
    context,
    {
      clip: { fitMode: 'CONTAIN', shadowIntensity: 50 },
      clipId: 'video-1',
      height: 50,
      kind: 'video',
      opacity: 1,
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

  expect(context.fillRect).not.toHaveBeenCalled();
  expect(context.__maskContext.fillRect).toHaveBeenCalledWith(50, 50, 160, 100);
  expect(context.__maskContext.globalCompositeOperation).toBe('destination-out');
  expect(context.__maskContext.shadowColor).toBe('rgba(0, 0, 0, 0.28)');
  expect(context.__maskContext.shadowOffsetY).toBe(0);
  expect(context.shadowBlur).toBe(0);
  expect(context.drawImage).toHaveBeenCalledTimes(2);
});

it('draws glow media shadows without a vertical backdrop offset', () => {
  const context = createContext();
  const video = new FakeHTMLVideoElement() as unknown as HTMLMediaElement;

  drawCompositionVisualLayer(
    context,
    {
      clip: { fitMode: 'CONTAIN', shadowIntensity: 50, shadowMode: 'GLOW' },
      clipId: 'video-1',
      height: 50,
      kind: 'video',
      opacity: 1,
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

  expect(context.shadowBlur).toBe(0);
  expect(context.fillRect).not.toHaveBeenCalled();
  expect(context.strokeRect).not.toHaveBeenCalled();
  expect(context.__maskContext.fillRect).toHaveBeenCalledWith(60, 60, 160, 100);
  expect(context.__maskContext.globalCompositeOperation).toBe('destination-out');
  expect(context.__maskContext.shadowColor).toBe('rgba(255, 255, 255, 0.34)');
  expect(context.__maskContext.shadowOffsetY).toBe(0);
  expect(context.drawImage).toHaveBeenCalledTimes(2);
});

it('draws media shadows before fitted image frames', () => {
  const context = createContext();

  drawCompositionVisualLayer(
    context,
    {
      clip: { assetId: 'image-1', fitMode: 'CONTAIN', shadowIntensity: 50 },
      clipId: 'image-layer',
      height: 40,
      kind: 'image',
      opacity: 1,
      rotation: 0,
      width: 60,
      x: 3,
      y: 4,
      zIndex: 0,
    } as never,
    2,
    2,
    { 'image-1': { naturalHeight: 60, naturalWidth: 100 } as never },
    new Map()
  );

  expect(context.fillRect).not.toHaveBeenCalled();
  expect(context.__maskContext.fillRect).toHaveBeenCalledWith(50, 50, 120, 80);
  expect(context.__maskContext.globalCompositeOperation).toBe('destination-out');
  expect(context.__maskContext.shadowColor).toBe('rgba(0, 0, 0, 0.28)');
  expect(context.__maskContext.shadowOffsetY).toBe(0);
  expect(context.shadowBlur).toBe(0);
  expect(context.drawImage).toHaveBeenCalledTimes(2);
});

it('skips unavailable media payloads in the visual draw path', () => {
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

  expect(context.drawImage).not.toHaveBeenCalled();
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
