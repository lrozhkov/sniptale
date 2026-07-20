import { vi } from 'vitest';

import { createEffectHostClip, createTextClip } from '../../project/factories/overlay-clip';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types';
import type { VideoProjectTransform } from '../../project/types';
import type { VideoCompositionVisualLayer } from '../types';

export class FakeHTMLMediaElement {
  static HAVE_CURRENT_DATA = 2;
  readyState = 3;
}

export class FakeHTMLVideoElement extends FakeHTMLMediaElement {
  videoHeight = 120;
  videoWidth = 200;
}

export function createVisualTestContext() {
  const maskContext = {
    fillRect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  };
  const maskCanvas = {
    getContext: vi.fn(() => maskContext),
  };
  return {
    beginPath: vi.fn(),
    canvas: {
      ownerDocument: {
        createElement: vi.fn(() => maskCanvas),
      },
    },
    clip: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    fillRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
    shadowBlur: 0,
    shadowColor: '',
    fillStyle: '',
    lineWidth: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    strokeStyle: '',
    __maskContext: maskContext,
  } as unknown as CanvasRenderingContext2D & { __maskContext: CanvasRenderingContext2D };
}

export function createEffectVisualLayer(): Extract<
  VideoCompositionVisualLayer,
  { kind: 'effect' }
> {
  const clip = createEffectHostClip({
    duration: 2,
    effectInstanceId: 'effect-instance',
    name: 'Effect host',
    projectHeight: 100,
    projectWidth: 200,
    startTime: 0,
    trackId: 'overlay-track',
  });
  return {
    ...createLayerGeometry(clip),
    kind: 'effect',
  };
}

export function createTextVisualLayer(): Extract<VideoCompositionVisualLayer, { kind: 'text' }> {
  return {
    ...createLayerGeometry(createTextClip('overlay-track', 200, 100, 0)),
    kind: 'text',
  };
}

export class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();

  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

type TransformClip = { id: string; transform: VideoProjectTransform };

function createLayerGeometry<TClip extends TransformClip>(clip: TClip) {
  return {
    clip,
    clipId: clip.id,
    height: clip.transform.height,
    opacity: clip.transform.opacity,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
    rotation: clip.transform.rotation,
    width: clip.transform.width,
    x: clip.transform.x,
    y: clip.transform.y,
    zIndex: 0,
  };
}
