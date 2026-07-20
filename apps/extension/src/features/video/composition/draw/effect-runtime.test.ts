// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { VideoClipLinkMode, VideoMediaFitMode, VideoProjectClipType } from '../../project/types';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types';
import type { VideoCompositionVisualLayer } from '../types';
import type { EffectRuntimeRenderedFrame } from '../effect-runtime/runtime/types';
import {
  createEffectRuntimeDrawState,
  drawEffectRuntimeVisualLayer,
  hasEffectRuntimeTransitionFrame,
} from './effect-runtime';

const { drawLayerBitmap } = vi.hoisted(() => ({ drawLayerBitmap: vi.fn() }));
vi.mock('./visual', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./visual')>()),
  drawCompositionVisualLayerBitmap: drawLayerBitmap,
}));

class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

const drawImage = vi.fn();
const context: Partial<CanvasRenderingContext2D> = { drawImage, globalAlpha: 1 };

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as CanvasRenderingContext2D
  );
  drawImage.mockReset();
  context.globalAlpha = 1;
  drawLayerBitmap.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('draws a clip-target frame through the canonical visual layer bitmap seam', () => {
  const layer = createLayer('clip');
  const frame = createFrame(
    {
      chainIndex: 0,
      clipId: 'clip',
      kind: 'clip',
      placement: { height: 10, opacity: 1, rotation: 0, width: 20, x: 0, y: 0 },
    },
    'targetEffect'
  );
  const frames = new Map([['target', frame]]);

  expect(
    drawEffectRuntimeVisualLayer({
      alpha: 0.5,
      context: getContext(),
      frames,
      layer,
      scaleX: 2,
      scaleY: 3,
      state: createEffectRuntimeDrawState(),
    })
  ).toBe(true);
  expect(drawLayerBitmap).toHaveBeenCalledWith(context, layer, frame.bitmap, 2, 3, 0.5);
});

it('draws one full transition frame for both participating layers', () => {
  const frame = createFrame(
    {
      kind: 'transition',
      leadingClipId: 'leading',
      trailingClipId: 'trailing',
      transitionId: 't',
    },
    'transition'
  );
  const frames = new Map([['transition', frame]]);
  const state = createEffectRuntimeDrawState();

  expect(
    drawEffectRuntimeVisualLayer({
      context: getContext(),
      frames,
      layer: createLayer('leading'),
      scaleX: 2,
      scaleY: 3,
      state,
    })
  ).toBe(true);
  expect(
    drawEffectRuntimeVisualLayer({
      context: getContext(),
      frames,
      layer: createLayer('trailing'),
      scaleX: 2,
      scaleY: 3,
      state,
    })
  ).toBe(true);
  expect(drawImage).toHaveBeenCalledOnce();
  expect(drawImage).toHaveBeenCalledWith(
    frame.bitmap,
    0,
    0,
    frame.width,
    frame.height,
    0,
    0,
    frame.logicalWidth * 2,
    frame.logicalHeight * 3
  );
  expect(hasEffectRuntimeTransitionFrame(frames, 't')).toBe(true);
  expect(hasEffectRuntimeTransitionFrame(frames, 'missing')).toBe(false);
});

it('draws standalone frames through their ordinary host layer', () => {
  const scene = createFrame({ clipId: 'host', kind: 'scene' }, 'standalone');
  const clip = createFrame(
    {
      chainIndex: 0,
      clipId: 'other',
      kind: 'clip',
      placement: { height: 10, opacity: 1, rotation: 0, width: 20, x: 0, y: 0 },
    },
    'targetEffect'
  );
  const frames = new Map([
    ['scene', scene],
    ['clip', clip],
  ]);

  const hostLayer = createLayer('host');
  expect(
    drawEffectRuntimeVisualLayer({
      alpha: 0.5,
      context: getContext(),
      frames,
      layer: hostLayer,
      scaleX: 2,
      scaleY: 3,
      state: createEffectRuntimeDrawState(),
    })
  ).toBe(true);
  expect(drawLayerBitmap).toHaveBeenCalledWith(context, hostLayer, scene.bitmap, 2, 3, 0.5);
  expect(
    drawEffectRuntimeVisualLayer({
      context: getContext(),
      frames: undefined,
      layer: createLayer('missing'),
      scaleX: 1,
      scaleY: 1,
      state: createEffectRuntimeDrawState(),
    })
  ).toBe(false);
});

function getContext(): CanvasRenderingContext2D {
  return document.createElement('canvas').getContext('2d')!;
}

function createFrame(
  target: EffectRuntimeRenderedFrame['target'],
  kind: EffectRuntimeRenderedFrame['kind']
): EffectRuntimeRenderedFrame {
  return {
    bitmap: new FakeBitmap(10, 5),
    effectInstanceId: 'effect',
    height: 5,
    kind,
    logicalHeight: 10,
    logicalWidth: 20,
    snapshotId: 'snapshot',
    target,
    width: 10,
  };
}

function createLayer(clipId: string): VideoCompositionVisualLayer {
  return {
    clip: {
      assetId: `${clipId}-asset`,
      duration: 2,
      fadeInMs: 0,
      fadeOutMs: 0,
      fitMode: VideoMediaFitMode.CONTAIN,
      groupId: null,
      id: clipId,
      linkMode: VideoClipLinkMode.DETACHED,
      muted: false,
      name: clipId,
      startTime: 0,
      trackId: 'track',
      transform: { height: 10, opacity: 1, rotation: 0, width: 20, x: 0, y: 0 },
      transitionIn: 'NONE',
      transitionOut: 'NONE',
      type: VideoProjectClipType.IMAGE,
      volume: 1,
    },
    clipId,
    height: 10,
    kind: 'image',
    opacity: 1,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
    rotation: 0,
    width: 20,
    x: 0,
    y: 0,
    zIndex: 0,
  };
}
