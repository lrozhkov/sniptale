import { expect, it } from 'vitest';
import { createReviewExportFixture } from './export-lifecycle.test-support';
import { exportReviewedVideo } from './export-lifecycle';
import { patchReviewClicks } from '../../features/video/review/advanced/click-animation';

it('joins freshly loaded semantic actions before fragment slicing, independently of lane visibility', async () => {
  const { args, deps } = createReviewExportFixture();
  args.snapshot.workspace.advanced.ui.mode = 'advanced';
  args.snapshot.workspace.advanced.ui.tracks.actions = false;
  args.snapshot.workspace.advanced.clickAnimations = patchReviewClicks([], ['kept', 'cut'], {
    effect: 'ripple',
    offset: -0.05,
  });
  args.index.processedVideoCodec = 'vp9';
  args.index.frameRate = 30;
  const original = await deps.loadVideoReviewSource();
  deps.loadVideoReviewSource.mockResolvedValue({
    ...original,
    telemetry: {
      recordingId: 'original',
      captureMode: 'TAB',
      viewport: null,
      cursorTrack: null,
      signals: [],
      createdAt: 1,
      updatedAt: 1,
      actionEvents: [
        { id: 'kept', time: 4.5 },
        { id: 'cut', time: 3 },
      ].map((item) => ({
        ...item,
        kind: 'CLICK',
        duration: 0,
        point: { x: 40, y: 40 },
        recordingPoint: { x: 0.25, y: 0.5 },
        label: '',
        data: {},
        preset: 'NONE',
      })),
    },
  });
  deps.writeReviewFrames.mockResolvedValue({
    videoPackets: 30,
    audioPackets: 0,
    resultDuration: 1,
    audioRanges: [],
    videoReencoded: true,
  });
  await exportReviewedVideo(
    { ...args, destination: 'download', selection: { kind: 'range', start: 4, end: 5 } },
    deps
  );
  expect(deps.writeReviewFrames).toHaveBeenCalledWith(
    expect.objectContaining({
      fragmentOffset: 2,
      clickCues: [
        expect.objectContaining({
          anchor: 2.45,
          start: 2.45,
          end: expect.closeTo(3.05),
          point: { x: 0.25, y: 0.5 },
        }),
      ],
    })
  );
  expect(deps.writeReviewPackets).not.toHaveBeenCalled();
});
