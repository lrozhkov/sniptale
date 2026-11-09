import * as sceneCamera from '../../features/video/review/advanced/scene';
import { afterEach, expect, it, vi } from 'vitest';
import { createCameraFollowSettings } from '../../features/video/project/camera/cursor-policy';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { state, argsFixture } from './render-export.test-support';
import { writeReviewFrames } from './render-export';
import { assertReviewCameraAdmission } from './render-settings';
import { normalizeVideoProjectCursorSkin } from '../../features/video/project/cursor';
import { VideoCursorCaptureMode } from '../../features/video/project/types';

it.each([
  { allowExpansion: false, end: 26, ready: false },
  { allowExpansion: true, end: 26, ready: true },
  { allowExpansion: true, end: 2, ready: false },
])(
  'uses the rendered temporary link plan without bypassing dynamics %j',
  ({ allowExpansion, end, ready }) => {
    const args = argsFixture();
    args.index.duration = end;
    args.index.boundaries = [0, end];
    const times = [0, 0.4, end / 2, end - 0.4, end];
    args.advanced.zoom.enabled = true;
    args.advanced.ui.tracks.zoom = true;
    args.advanced.cameraFollowDefaults = { ...createCameraFollowSettings('calm'), allowExpansion };
    args.advanced.cursorFocusPath = {
      version: 1,
      mode: 'follow',
      smoothing: 0,
      sensitivity: 0.5,
      gapPolicy: 'hold',
      segments: [
        {
          id: 'source',
          start: 0,
          end,
          binding: { kind: 'project' },
          keys: times.map((time) => ({
            id: String(time),
            time,
            x: 0.5,
            y: 0.5,
            anchor: 'movement',
            interpolation: 'linear',
          })),
        },
      ],
    };
    const from = {
      ...createQuickEditZoomRegion({ id: 'from', at: 0, duration: 0.4, endMax: end }),
      followCursor: true,
      linkTo: 'to',
      transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none' as const, duration: 0 },
      exit: { type: 'none' as const, duration: 0 },
    };
    const to = {
      ...createQuickEditZoomRegion({ id: 'to', at: end - 0.4, duration: 0.4, endMax: end }),
      followCursor: false,
      transform: from.transform,
      enter: from.enter,
      exit: from.exit,
    };
    args.advanced.zoom.regions = [from, to];
    const cursorFacts = {
      source: { width: 320, height: 180, duration: end },
      facts: {
        actionEvents: [],
        signals: [],
        cursorTrack: {
          captureMode: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
          skin: normalizeVideoProjectCursorSkin(undefined),
          samples: times.map((time) => ({
            id: String(time),
            time,
            x: time === end / 2 ? 16 : 160,
            y: 90,
            visible: true,
            observation: 'observed' as const,
            recordingPoint: { x: time === end / 2 ? 0.05 : 0.5, y: 0.5 },
            captureSegment: 0,
          })),
        },
      },
    };
    const operation = () =>
      assertReviewCameraAdmission({
        ...args,
        index: { ...args.index, width: 320, height: 180 },
        cursorFacts,
      });
    if (ready) expect(operation).not.toThrow();
    else expect(operation).toThrow('Review export is unavailable');
    expect(args.writer.writeAt).not.toHaveBeenCalled();
  }
);

afterEach(() => vi.restoreAllMocks());

it.each([false, true])(
  'rejects a direct follow export before decoder/writer effects when source geometry is known=%s',
  async (known) => {
    const args = argsFixture();
    args.advanced.zoom.enabled = true;
    args.advanced.ui.tracks.zoom = true;
    args.advanced.cameraFollowDefaults = createCameraFollowSettings('calm');
    args.advanced.cursorFocusPath = {
      version: 1,
      mode: 'follow',
      smoothing: 0,
      sensitivity: 0.5,
      gapPolicy: 'hold',
      segments: [],
    };
    args.advanced.zoom.regions = [
      {
        ...createQuickEditZoomRegion({ id: 'conflict', at: 0, duration: 2, endMax: 2 }),
        followCursor: true,
        transform: { scale: 4, centerX: 0.5, centerY: 0.5 },
        enter: { type: 'ease-in-out', duration: 0.01 },
        exit: { type: 'none', duration: 0 },
      },
    ];
    if (known) {
      vi.spyOn(sceneCamera, 'resolveReviewCameraConflicts').mockReturnValueOnce([
        { regionId: 'conflict', interval: { start: 0, end: 2 }, time: 0, reason: 'dynamics' },
      ]);
    }
    const before = structuredClone(args.advanced);
    const drawn = state.drawn.length,
      encoded = state.encoded.length;
    await expect(
      writeReviewFrames({
        ...args,
        index: { ...args.index, ...(known ? { width: 320, height: 180 } : {}) },
      })
    ).rejects.toMatchObject({
      reasons: ['camera-follow'],
      cameraConflicts: [
        expect.objectContaining({ regionId: 'conflict', reason: known ? 'dynamics' : 'unproven' }),
      ],
    });
    expect(state.drawn).toHaveLength(drawn);
    expect(state.encoded).toHaveLength(encoded);
    expect(args.writer.writeAt).not.toHaveBeenCalled();
    expect(args.readProjectAsset).not.toHaveBeenCalled();
    expect(args.advanced).toEqual(before);
  }
);

it('refuses an unavailable archived frame before encoding it', async () => {
  const args = argsFixture();
  const encoded = state.encoded.length;
  const recordingHistory = {
    read: vi.fn(async () => {
      throw new Error('history-source-unavailable');
    }),
    dispose: vi.fn(),
  };
  await expect(writeReviewFrames({ ...args, recordingHistory })).rejects.toThrow(
    'history-source-unavailable'
  );
  expect(recordingHistory.read).toHaveBeenCalled();
  expect(state.encoded).toHaveLength(encoded);
});
