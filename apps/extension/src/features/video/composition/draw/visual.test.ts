import { drawCompositionBorders } from './border';
import { createQuickEditBorder } from '../../project/scene/focus-appearance';
import { createEmptyVideoProject, createVideoProjectAsset } from '../../project/factories/creation';
import { createVideoClipFromAsset } from '../../project/factories/clip';
import { resolveVideoCompositionFrame } from '../timeline/frame';
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

vi.mock('./border', () => ({ drawCompositionBorders: vi.fn() }));

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

  expect(context.globalAlpha).toBe(1);
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
  expect(context.__maskContext.fillRect).toHaveBeenCalledWith(77, 77, 160, 100);
  expect(context.__maskContext.globalCompositeOperation).toBe('destination-out');
  expect(context.__maskContext.shadowColor).toBe('rgba(0, 0, 0, 0.5)');
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
  expect(context.__maskContext.fillRect).toHaveBeenCalledWith(77, 77, 120, 80);
  expect(context.__maskContext.globalCompositeOperation).toBe('destination-out');
  expect(context.__maskContext.shadowColor).toBe('rgba(0, 0, 0, 0.5)');
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

it('draws a captured point inside its fitted video with the same alpha, rotation and content clipping', () => {
  const context = createContext();
  context.arc = vi.fn();
  const layer = createCapturedVideoLayer();
  const video = new FakeHTMLVideoElement();
  drawCompositionVisualLayer(
    context,
    layer,
    1,
    1,
    {},
    new Map([[layer.clipId, video as unknown as HTMLVideoElement]])
  );
  expect(context.globalAlpha).toBe(1);
  expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
  expect(context.arc).toHaveBeenCalledWith(35, 70, 16.5, 0, Math.PI * 2);
  expect(context.rect).toHaveBeenCalledWith(10, 40, 100, 60);
  expect(vi.mocked(context.drawImage).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(context.arc).mock.invocationCallOrder[0]!
  );
});

it('keeps a point-less KEY badge within CONTAIN content rather than the letterbox', () => {
  const context = createContext();
  const layer = createCapturedVideoLayer();
  layer.rotation = 0;
  const action = layer.actions![0]!;
  layer.actions = [
    {
      ...action,
      event: { ...action.event, kind: 'KEY', label: 'Ctrl + K', point: null },
      point: null,
      renderKind: 'keystroke',
      preset: 'NONE',
    },
  ];
  drawCompositionVisualLayer(
    context,
    layer,
    1,
    1,
    {},
    new Map([[layer.clipId, new FakeHTMLVideoElement() as unknown as HTMLVideoElement]])
  );
  expect(context.fillText).toHaveBeenCalledWith('Ctrl + K', 60, 77.2, expect.closeTo(10));
  expect(context.rect).toHaveBeenCalledWith(10, 40, 100, 60);
});

it('omits orphan captured pixels when source is unavailable and never draws accents again on an effect bitmap', () => {
  const context = createContext();
  context.arc = vi.fn();
  const layer = createCapturedVideoLayer();
  drawCompositionVisualLayer(context, layer, 1, 1, {}, new Map());
  expect(context.arc).not.toHaveBeenCalled();
  drawCompositionVisualLayerBitmap(context, layer, new FakeBitmap(100, 100), 1, 1);
  expect(context.drawImage).toHaveBeenCalledOnce();
  expect(context.arc).not.toHaveBeenCalled();
});

function createCapturedVideoLayer(): Extract<
  import('../types').VideoCompositionVisualLayer,
  { kind: 'video' }
> {
  const project = createEmptyVideoProject('Captured layer', 200, 120);
  const asset = createVideoProjectAsset(
    'Video',
    'VIDEO',
    { kind: 'recording', recordingId: 'recording' },
    {
      width: 200,
      height: 120,
      duration: 3,
      mimeType: 'video/mp4',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(
    project.tracks[0]!.id,
    asset,
    project.width,
    project.height,
    0
  );
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.sourceInstanceId = 'instance';
  clip.transform = { x: 10, y: 20, width: 100, height: 100, rotation: 90, opacity: 0.4 };
  project.assets = [asset];
  project.clips = [clip];
  project.duration = 3;
  project.actionEvents = [
    {
      id: 'action',
      kind: 'CLICK',
      label: 'Click',
      data: {},
      point: { x: 0.25, y: 0.5 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'recording',
        sourceInstanceId: 'instance',
        sourceEventId: 'raw',
        sourceTime: 1,
      },
      presentation: { duration: 1 },
    },
  ];
  const layer = resolveVideoCompositionFrame(project, 1.5).visualLayers[0];
  if (layer?.kind !== 'video') throw new Error('Expected video layer');
  return layer;
}

it.each([false, true])(
  'paints borders before source actions and excludes them from effect actions; camera=%s',
  (camera) => {
    const context = createContext();
    context.arc = vi.fn();
    const layer = createCapturedVideoLayer();
    if (camera) {
      layer.trackRole = 'CAMERA';
      layer.clip.cameraAppearance = { shape: 'circle', roundness: 50, zoom: 1, panX: 0, panY: 0 };
    }
    layer.borders = [
      {
        id: 'border',
        border: createQuickEditBorder(),
        clock: {
          time: 1,
          duration: 3,
          enter: { type: 'none', duration: 0 },
          exit: { type: 'none', duration: 0 },
        },
      },
    ];
    vi.mocked(drawCompositionBorders).mockClear();
    const sources = new Map([
      [layer.clipId, new FakeHTMLVideoElement() as unknown as HTMLVideoElement],
    ]);
    drawCompositionVisualLayer(context, layer, 1, 1, {}, sources);
    expect(drawCompositionBorders).toHaveBeenCalledOnce();
    const borderOrder = vi.mocked(drawCompositionBorders).mock.invocationCallOrder[0]!;
    expect(vi.mocked(context.drawImage).mock.invocationCallOrder[0]).toBeLessThan(borderOrder);
    expect(vi.mocked(context.arc).mock.invocationCallOrder.at(-1)).toBeGreaterThan(borderOrder);
    expect(drawCompositionBorders).toHaveBeenCalledWith(
      context,
      layer.borders,
      camera ? { x: 10, y: 20, width: 100, height: 100 } : { x: 10, y: 40, width: 100, height: 60 },
      1,
      0
    );
    vi.mocked(drawCompositionBorders).mockClear();
    vi.mocked(context.drawImage).mockClear();
    vi.mocked(context.arc).mockClear();
    drawCompositionVisualLayer(context, { ...layer, effectActionsOnly: true }, 1, 1, {}, sources);
    expect(drawCompositionBorders).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.arc).toHaveBeenCalled();
    vi.mocked(drawCompositionBorders).mockClear();
    vi.mocked(context.drawImage).mockClear();
    vi.mocked(context.arc).mockClear();
    drawCompositionVisualLayer(
      context,
      { ...layer, effectActionsOnly: true, deferSourceBorders: true },
      1,
      1,
      {},
      sources
    );
    expect(drawCompositionBorders).toHaveBeenCalledOnce();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(vi.mocked(context.arc).mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      vi.mocked(drawCompositionBorders).mock.invocationCallOrder[0]!
    );
  }
);

it('paints original-window border coordinates while clipping to the retained visible crop', () => {
  const context = createContext();
  const layer = createCapturedVideoLayer();
  layer.actions = [];
  layer.clip.fitMode = 'STRETCH';
  layer.clip.sourceCrop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  layer.borders = [
    {
      id: 'source-border',
      coordinateSpace: 'source-window',
      border: createQuickEditBorder(),
      clock: {
        time: 1,
        duration: 3,
        enter: { type: 'none', duration: 0 },
        exit: { type: 'none', duration: 0 },
      },
    },
  ];
  vi.mocked(drawCompositionBorders).mockClear();
  drawCompositionVisualLayer(
    context,
    layer,
    1,
    1,
    {},
    new Map([[layer.clipId, new FakeHTMLVideoElement() as unknown as HTMLVideoElement]])
  );
  expect(drawCompositionBorders).toHaveBeenCalledExactlyOnceWith(
    context,
    layer.borders,
    { x: 10, y: 20, width: 100, height: 100 },
    1,
    0,
    { x: -2.5, y: 7.5, width: 125, height: 125 },
    undefined
  );
});

it('clips a source-attached effect before inner motion and retains its independent bitmap', () => {
  const context = createContext();
  context.transform = vi.fn();
  const layer = createEffectVisualLayer();
  const owner = createCapturedVideoLayer();
  owner.opacity = 0.6;
  layer.sourceAttachment = {
    owner,
    mapping: {
      frame: { x: 10, y: 20, width: 100, height: 100, rotation: 0 },
      sourceWidth: 200,
      sourceHeight: 120,
      fitMode: 'CONTAIN',
      windowCornerRadius: 8,
      renderState: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 },
    },
    innerTransform: [2, 0, -10, 0, 2, -20, 0, 0, 1],
  };
  const bitmap = new FakeBitmap(40, 20);
  drawCompositionVisualLayerBitmap(context, layer, bitmap, 2, 2, 0.5);
  expect(context.roundRect).toHaveBeenCalledWith(20, 80, 200, 120, 16);
  expect(context.transform).toHaveBeenCalledWith(2, 0, 0, 2, -20, -40);
  expect(context.translate).toHaveBeenCalledWith(20, 80);
  expect(context.scale).toHaveBeenCalledWith(0.5, 0.5);
  expect(context.drawImage).toHaveBeenCalledOnce();
  expect(vi.mocked(context.clip).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(context.transform).mock.invocationCallOrder[0]!
  );
  expect(context.globalAlpha).toBe(1);
  expect(bitmap.close).not.toHaveBeenCalled();
});
