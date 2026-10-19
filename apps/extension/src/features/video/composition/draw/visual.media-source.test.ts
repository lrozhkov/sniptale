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

it('reflects decoded camera pixels without reflecting normal video or action glyphs', () => {
  for (const trackRole of ['CAMERA', undefined] as const) {
    const context = createContext();
    const draw = vi.fn();
    vi.mocked(drawActionCompositionState).mockClear();
    const layer = {
      ...createVideoLayer(),
      actions: gestureLayer().actions,
      trackRole,
      clip: { fitMode: 'STRETCH', cameraMirrored: true },
    };
    drawCompositionVisualLayer(
      context,
      layer as never,
      1,
      1,
      {},
      new Map([['video-1', { draw, sourceWidth: 80, sourceHeight: 50 }]])
    );
    expect(draw).toHaveBeenCalledWith(context, 10, 12, 80, 50);
    if (trackRole !== 'CAMERA') expect(context.scale).not.toHaveBeenCalled();
    else expect(context.scale).toHaveBeenCalledWith(-1, 1);
    if (trackRole === 'CAMERA') {
      expect(context.translate).toHaveBeenCalledWith(100, 0);
      const reflect = vi
        .mocked(context.scale)
        .mock.invocationCallOrder.find(
          (_, i) => vi.mocked(context.scale).mock.calls[i]?.[0] === -1
        )!;
      const pixel = draw.mock.invocationCallOrder[0]!;
      const action = vi.mocked(drawActionCompositionState).mock.invocationCallOrder.at(-1)!;
      expect(pixel).toBeGreaterThan(reflect);
      expect(action).toBeGreaterThan(pixel);
      expect(
        vi
          .mocked(context.restore)
          .mock.invocationCallOrder.some((order) => order > pixel && order < action)
      ).toBe(true);
      const painted = vi.mocked(drawActionCompositionState).mock.lastCall![1];
      expect(painted.point).toEqual({ x: 74, y: 27 });
      expect(painted.gestureFeedback!.path![0]).toEqual({ x: 82, y: 22 });
      expect(painted.gestureFeedback!.area).toEqual({ x: 58, y: 22, width: 24, height: 20 });
    }
  }
});

it('uses the same authored shadow color for decoded video and image windows', () => {
  for (const kind of ['video', 'image'] as const) {
    const project = createVideoProjectFromRecording({
      recordingId: 'shadow',
      filename: 'source.webm',
      width: 160,
      height: 90,
      duration: 4,
      mimeType: 'video/webm',
      size: 100,
    });
    const original = project.clips.find((clip) => clip.type === 'VIDEO');
    if (!original) throw new Error('Missing video');
    const styled = { ...original, shadowIntensity: 70, shadowColor: '#00ff0080' };
    project.clips = [kind === 'video' ? styled : { ...styled, type: 'IMAGE' }];
    const layer = resolveVideoCompositionFrame(project, 0).visualLayers[0];
    if (!layer) throw new Error('Missing visual layer');
    const context = createVisualTestContext();
    const draw = vi.fn();
    drawCompositionVisualLayer(
      context,
      layer,
      1,
      1,
      { [styled.assetId]: { naturalWidth: 160, naturalHeight: 90 } as HTMLImageElement },
      new Map([[styled.id, { draw, sourceWidth: 160, sourceHeight: 90 }]])
    );
    expect(Reflect.get(context.__maskContext, 'shadowColor')).toBe('#00ff0080');
    if (kind === 'video') expect(draw).toHaveBeenCalledOnce();
    else expect(context.drawImage).toHaveBeenCalled();
  }
});

it.each([false, true])(
  'uses circle on decoded frames only for camera=%s without changing source geometry',
  (camera) => {
    const project = createVideoProjectFromRecording({
      recordingId: 'circle',
      filename: 'source.webm',
      width: 160,
      height: 90,
      duration: 4,
      mimeType: 'video/webm',
      size: 100,
    });
    const clip = project.clips.find((clip) => clip.type === 'VIDEO');
    if (!clip) throw new Error('Missing video');
    clip.cameraAppearance = { shape: 'circle', roundness: 0, zoom: 1, panX: 0, panY: 0 };
    if (camera) project.tracks[0]!.role = 'CAMERA';
    const layer = resolveVideoCompositionFrame(project, 0).visualLayers.find(
      (layer) => layer.kind === 'video'
    );
    if (!layer) throw new Error('Missing layer');
    const context = createVisualTestContext(),
      draw = vi.fn();
    drawCompositionVisualLayer(
      context,
      layer,
      1,
      1,
      {},
      new Map([[clip.id, { draw, sourceWidth: 160, sourceHeight: 90 }]])
    );
    expect(draw).toHaveBeenCalledWith(context, 0, 0, 160, 90);
    if (camera) expect(context.moveTo).toHaveBeenCalledWith(125, 45);
    else expect(context.moveTo).not.toHaveBeenCalled();
    expect(clip.transform).toMatchObject({ width: 160, height: 90 });
  }
);
