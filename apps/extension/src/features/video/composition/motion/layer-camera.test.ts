import { expect, it } from 'vitest';
import { VideoMotionOverlayZoomMode } from '../../project/types/index';
import {
  mapVisualLayerToViewportSpace,
  partitionVisualLayersByViewportLock,
  segmentVisualLayersByViewportLock,
  shouldLockVisualLayerToViewport,
} from './layer-camera';

function createCamera() {
  return {
    focusPoint: { x: 640, y: 360 },
    motionBlurAmount: 0,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    regionId: 'motion-1',
    scale: 2,
    viewportHeight: 360,
    viewportWidth: 640,
    viewportX: 100,
    viewportY: 50,
  } as const;
}

function createRenderState() {
  return {
    blurAmount: 0,
    opacityMultiplier: 1,
    scaleX: 1,
    scaleY: 1,
    translateX: 0,
    translateY: 0,
  };
}

function createTextLayer() {
  return {
    clip: { text: 'Text' },
    clipId: 'text-1',
    height: 80,
    kind: 'text',
    opacity: 1,
    renderState: createRenderState(),
    rotation: 0,
    width: 240,
    x: 120,
    y: 90,
    zIndex: 1,
  };
}

function createImageLayer() {
  return {
    clip: { assetId: 'image-1' },
    clipId: 'image-1',
    height: 80,
    kind: 'image',
    opacity: 1,
    renderState: createRenderState(),
    rotation: 0,
    width: 240,
    x: 120,
    y: 90,
    zIndex: 1,
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
    frame: { height: 120, opacity: 1, rotation: 0, width: 240, x: 120, y: 90 },
    labelFrame: { height: 120, width: 240, x: 120, y: 90 },
    style: {
      accentColor: '#f97316',
      backgroundColor: '#111827',
      badgeTextColor: '#ffffff',
      blurAmount: 0,
      borderRadius: 20,
      depthAmount: 0.2,
      headlineColor: '#ffffff',
      padding: 24,
      shimmerAmount: 0.2,
      sublineColor: '#cbd5e1',
    },
  };
}

function createAnnotationLayer() {
  return {
    clip: {
      calloutDecor: {
        arrowKind: 'NONE',
        frameKind: 'ROUNDED_RECT',
        markerKind: 'DOT',
        pulseKind: 'NONE',
      },
      content: { badge: null, headline: 'Headline', subline: 'Subline' },
      id: 'annotation-1',
      leaderLine: {
        direction: 'RIGHT',
        enabled: true,
        length: 120,
        style: 'ELBOW',
        thickness: 2,
      },
      presentation: createAnnotationPresentation(),
      renderFamily: 'LINE',
      target: 'RECT',
      targetPoint: null,
      targetRect: { height: 80, width: 120, x: 600, y: 260 },
      templateKind: 'CALLOUT_CONNECTOR',
      trackId: 'track-1',
    },
    clipId: 'annotation-1',
    height: 120,
    kind: 'annotation',
    opacity: 1,
    renderState: createRenderState(),
    rotation: 0,
    width: 240,
    x: 120,
    y: 90,
    zIndex: 1,
  };
}

it('locks text, annotation, and shape layers to viewport space when motion zoom mode requests it', () => {
  const camera = createCamera();

  expect(shouldLockVisualLayerToViewport(createTextLayer() as never, camera)).toBe(true);
  expect(shouldLockVisualLayerToViewport(createImageLayer() as never, camera)).toBe(false);
});

it('keeps annotation geometry fixed in viewport space while lock-overlays mode is active', () => {
  const camera = createCamera();
  const mapped = mapVisualLayerToViewportSpace(createAnnotationLayer() as never, camera) as Extract<
    ReturnType<typeof mapVisualLayerToViewportSpace>,
    { kind: 'annotation' }
  >;

  expect(mapped.x).toBe(120);
  expect(mapped.y).toBe(90);
  expect(mapped.width).toBe(240);
  expect(mapped.height).toBe(120);
  expect(mapped.clip.presentation.labelFrame).toEqual({
    height: 120,
    width: 240,
    x: 120,
    y: 90,
  });
  expect(mapped.clip.targetRect).toEqual({
    height: 80,
    width: 120,
    x: 600,
    y: 260,
  });
});

it('keeps layers camera-following when the motion region explicitly requests it', () => {
  const camera = {
    ...createCamera(),
    overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
  };

  expect(shouldLockVisualLayerToViewport(createTextLayer() as never, camera)).toBe(false);
  expect(mapVisualLayerToViewportSpace(createImageLayer() as never, camera)).toEqual(
    createImageLayer()
  );
});

it('partitions locked overlays away from camera-following media for multi-pass rendering', () => {
  const camera = createCamera();
  const layers = [
    createImageLayer(),
    createTextLayer(),
    {
      ...createAnnotationLayer(),
      kind: 'shape' as const,
    },
  ];

  expect(partitionVisualLayersByViewportLock(layers as never, camera)).toEqual({
    locked: [
      expect.objectContaining({ clipId: 'text-1', kind: 'text' }),
      expect.objectContaining({ clipId: 'annotation-1', kind: 'shape' }),
    ],
    unlocked: [expect.objectContaining({ clipId: 'image-1', kind: 'image' })],
  });
});

it('segments locked overlays without losing their z-order relative to unlocked layers', () => {
  const camera = createCamera();
  const layers = [
    createImageLayer(),
    createTextLayer(),
    createImageLayer(),
    createAnnotationLayer(),
  ];

  expect(segmentVisualLayersByViewportLock(layers as never, camera)).toEqual([
    {
      isLocked: false,
      layers: [expect.objectContaining({ clipId: 'image-1', kind: 'image' })],
    },
    {
      isLocked: true,
      layers: [expect.objectContaining({ clipId: 'text-1', kind: 'text' })],
    },
    {
      isLocked: false,
      layers: [expect.objectContaining({ clipId: 'image-1', kind: 'image' })],
    },
    {
      isLocked: true,
      layers: [expect.objectContaining({ clipId: 'annotation-1', kind: 'annotation' })],
    },
  ]);
});

it('keeps text-layer origins fixed in viewport space and leaves media layers unchanged', () => {
  const camera = createCamera();

  expect(mapVisualLayerToViewportSpace(createTextLayer() as never, camera)).toEqual(
    expect.objectContaining({
      x: 120,
      y: 90,
    })
  );
  expect(
    mapVisualLayerToViewportSpace(
      {
        ...createImageLayer(),
        kind: 'video',
      } as never,
      camera
    )
  ).toEqual({
    ...createImageLayer(),
    kind: 'video',
  });
});
