import { beforeEach, expect, it, vi } from 'vitest';

import { drawCompositionVisualLayer } from './index';
import { drawActionCompositionState } from './effects/actions';
import { createVideoProjectFromRecording } from '../../project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../project/cursor';
import { resolveVideoCompositionFrame } from '../timeline/frame';
import { createVisualTestContext } from './visual.test-support';
vi.mock('./effects/actions', async (original) => ({
  ...(await original<typeof import('./effects/actions')>()),
  drawActionCompositionState: vi.fn(),
}));

class FakeHTMLMediaElement {
  static HAVE_CURRENT_DATA = 2;
}

function createContext() {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createVideoLayer() {
  return {
    clip: { fitMode: 'STRETCH' },
    clipId: 'video-1',
    height: 50,
    kind: 'video',
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
    width: 80,
    x: 10,
    y: 12,
    zIndex: 0,
  };
}

beforeEach(() => {
  vi.stubGlobal('HTMLMediaElement', FakeHTMLMediaElement);
  vi.stubGlobal('HTMLVideoElement', class extends FakeHTMLMediaElement {});
});

it('renders decoded frame sources through the video layer path', () => {
  const context = createContext();
  const draw = vi.fn();

  drawCompositionVisualLayer(
    context,
    createVideoLayer() as never,
    1,
    1,
    {},
    new Map([
      [
        'video-1',
        {
          draw,
          sourceHeight: 50,
          sourceWidth: 80,
        },
      ],
    ])
  );

  expect(draw).toHaveBeenCalledWith(context, 10, 12, 80, 50);
  expect(context.drawImage).not.toHaveBeenCalled();
});
function gestureLayer() {
  const project = createVideoProjectFromRecording({
    recordingId: 'held',
    filename: 'held.webm',
    width: 100,
    height: 100,
    duration: 4,
    mimeType: 'video/webm',
    size: 10,
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [1, 2].map((time) => ({
        id: `sample-${time}`,
        time,
        x: 20,
        y: 30,
        visible: true,
        captureSegment: 0,
        recordingPoint: { x: 0.2, y: 0.3 },
      })),
    },
    sourceNormalizedActionEvents: [
      {
        id: 'hold',
        kind: 'CLICK',
        time: 1,
        duration: 0.6,
        point: { x: 0.2, y: 0.3 },
        label: 'Hold',
        preset: 'NONE',
        data: {
          gestureId: 'hold',
          gestureType: 'hold',
          downTime: 1,
          upTime: 3,
          button: 0,
          completion: 'released',
          captureSegment: 0,
        },
      },
    ],
  });
  const layer = resolveVideoCompositionFrame(project, 1.5).visualLayers.find(
    (item) => item.kind === 'video'
  );
  if (layer?.kind !== 'video' || !layer.actions?.[0]?.gestureFeedback)
    throw new Error('Expected physical feedback layer');
  layer.actions[0].gestureFeedback = {
    ...layer.actions[0].gestureFeedback,
    path: [
      { x: 0.1, y: 0.2 },
      { x: 0.2, y: 0.3 },
    ],
    area: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  };
  return layer;
}
it('video fitting projects physical gesture points, paths and authored areas once', () => {
  vi.mocked(drawActionCompositionState).mockClear();
  const layer = gestureLayer(),
    draw = vi.fn();
  drawCompositionVisualLayer(
    createVisualTestContext(),
    layer,
    2,
    3,
    {},
    new Map([[layer.clipId, { draw, sourceWidth: 100, sourceHeight: 100 }]])
  );
  const [, x, y, width, height] = draw.mock.lastCall!;
  const painted = vi.mocked(drawActionCompositionState).mock.lastCall![1];
  expect(painted.point).toEqual({ x: x + 0.2 * width, y: y + 0.3 * height });
  expect(painted.gestureFeedback!.path).toEqual([
    { x: x + 0.1 * width, y: y + 0.2 * height },
    { x: x + 0.2 * width, y: y + 0.3 * height },
  ]);
  expect(painted.gestureFeedback!.area).toEqual({
    x: x + 0.1 * width,
    y: y + 0.2 * height,
    width: 0.3 * width,
    height: 0.4 * height,
  });
  expect(layer.actions![0]!.point).toEqual({ x: 0.2, y: 0.3 });
  expect(drawActionCompositionState).toHaveBeenCalledOnce();
});
