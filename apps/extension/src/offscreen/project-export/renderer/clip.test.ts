import { afterEach, expect, it, vi } from 'vitest';
import { VideoProjectClipType } from '../../../features/video/project/types';

const { drawCompositionVisualLayerMock } = vi.hoisted(() => ({
  drawCompositionVisualLayerMock: vi.fn(),
}));

vi.mock('../../../features/video/composition/draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/composition/draw')>()),
  drawCompositionVisualLayer: drawCompositionVisualLayerMock,
}));

vi.mock('../../../features/video/composition/motion/layer-camera', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../features/video/composition/motion/layer-camera')
  >()),
  mapVisualLayerToViewportSpace: vi.fn((layer) => layer),
  shouldLockVisualLayerToViewport: vi.fn(() => false),
}));

afterEach(() => {
  drawCompositionVisualLayerMock.mockReset();
});

function createContext() {
  return {} as CanvasRenderingContext2D;
}

async function importDrawClip() {
  return await import('./clip');
}

function createBaseClip() {
  return {
    trackId: 'track-1',
    name: 'Clip',
    groupId: null,
    linkMode: 'DETACHED',
    startTime: 0,
    duration: 5,
    muted: true,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    transform: { x: 10, y: 20, width: 50, height: 40, rotation: 0, opacity: 0.6 },
  };
}

async function drawTestClip(clip: unknown) {
  const { drawClip } = await importDrawClip();
  const context = createContext();
  const project = {
    height: 100,
    tracks: [{ id: 'track-1', kind: 'OVERLAY', subtitleStyle: { fontSize: 20 } }],
    width: 100,
  };

  drawClip(context, project as never, clip as never, 1, 2, 3, {}, new Map());
}

function createAnnotationOverlayClip() {
  return {
    ...createBaseClip(),
    annotationFamily: 'CALLOUT',
    calloutDecor: {
      arrowKind: 'CHEVRON',
      frameKind: 'ROUNDED_RECT',
      markerKind: 'RING',
      pulseKind: 'SOFT',
    },
    content: { badge: 'NEW', headline: 'Headline', subline: 'Subline' },
    direction: 'LEFT',
    id: 'annotation-1',
    intensity: 'BALANCED',
    introAnimation: 'SLIDE_UP_FADE',
    introDurationMs: 300,
    leaderLine: {
      direction: 'LEFT',
      enabled: true,
      length: 120,
      style: 'ELBOW',
      thickness: 3,
    },
    motionFamily: 'CONNECTOR_DRAW',
    outroAnimation: 'REVEAL_MASK',
    outroDurationMs: 300,
    renderFamily: 'LINE',
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
    target: 'RECT',
    targetPoint: null,
    targetRect: { height: 28, width: 72, x: 18, y: 24 },
    templateKind: 'CALLOUT_CONNECTOR',
    type: VideoProjectClipType.ANNOTATION,
  };
}

async function drawOverlayCompatibilityLayers(): Promise<void> {
  await drawTestClip({
    ...createBaseClip(),
    id: 'text-1',
    text: 'Hello',
    style: {},
    type: VideoProjectClipType.TEXT,
  });
  await drawTestClip(createAnnotationOverlayClip());
  await drawTestClip({
    ...createBaseClip(),
    id: 'shape-1',
    shapeType: 'RECTANGLE',
    style: {},
    type: VideoProjectClipType.SHAPE,
  });
  await drawTestClip({
    ...createBaseClip(),
    id: 'subtitle-1',
    text: 'Subtitle',
    type: VideoProjectClipType.SUBTITLE,
  });
  await drawTestClip({ ...createBaseClip(), id: 'audio-1', type: VideoProjectClipType.AUDIO });
}

function expectDrawCall(callIndex: number, clipId: string, kind: string) {
  expect(drawCompositionVisualLayerMock).toHaveBeenNthCalledWith(
    callIndex,
    expect.anything(),
    expect.objectContaining({
      clipId,
      kind,
      opacity: 0.6,
      renderState: expect.objectContaining({ opacityMultiplier: 1 }),
    }),
    2,
    3,
    {},
    expect.any(Map),
    1
  );
}

it('maps media clips into composition layers before drawing', async () => {
  await drawTestClip({
    ...createBaseClip(),
    id: 'video-1',
    shadowIntensity: 50,
    type: VideoProjectClipType.VIDEO,
  });
  await drawTestClip({
    ...createBaseClip(),
    id: 'image-1',
    assetId: 'asset-1',
    type: VideoProjectClipType.IMAGE,
  });

  expectDrawCall(1, 'video-1', 'video');
  expectDrawCall(2, 'image-1', 'image');
  expect(drawCompositionVisualLayerMock).toHaveBeenNthCalledWith(
    1,
    expect.anything(),
    expect.objectContaining({
      clip: expect.objectContaining({ shadowIntensity: 50 }),
      kind: 'video',
    }),
    2,
    3,
    {},
    expect.any(Map),
    1
  );
});

it('maps overlay clips and skips audio compatibility draws', async () => {
  await drawOverlayCompatibilityLayers();

  expectDrawCall(1, 'text-1', 'text');
  expectDrawCall(2, 'annotation-1', 'annotation');
  expectDrawCall(3, 'shape-1', 'shape');
  expectDrawCall(4, 'subtitle-1', 'text');
  expect(drawCompositionVisualLayerMock).toHaveBeenCalledTimes(4);
  expect(drawCompositionVisualLayerMock).toHaveBeenNthCalledWith(
    2,
    expect.anything(),
    expect.objectContaining({
      clip: expect.objectContaining({
        renderFamily: 'LINE',
        target: 'RECT',
        templateKind: 'CALLOUT_CONNECTOR',
      }),
      clipId: 'annotation-1',
      kind: 'annotation',
    }),
    2,
    3,
    {},
    expect.any(Map),
    1
  );
  expect('scene' in (drawCompositionVisualLayerMock.mock.calls[1]?.[1].clip as object)).toBe(false);
});

it('passes opacity multipliers through the compatibility layer bridge', async () => {
  const { drawCompositionLayer } = await importDrawClip();

  drawCompositionLayer(
    createContext(),
    {
      clip: { fitMode: 'CONTAIN' },
      clipId: 'video-1',
      height: 10,
      kind: 'video',
      opacity: 0.6,
      renderState: {
        blurAmount: 0,
        opacityMultiplier: 1,
        scaleX: 1,
        scaleY: 1,
        translateX: 0,
        translateY: 0,
      },
      rotation: 0,
      width: 10,
      x: 0,
      y: 0,
      zIndex: 0,
    } as never,
    1,
    1,
    {},
    new Map(),
    0.4
  );

  expect(drawCompositionVisualLayerMock).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ clipId: 'video-1' }),
    1,
    1,
    {},
    expect.any(Map),
    0.4
  );
});
