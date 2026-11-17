import { expect, it, vi } from 'vitest';
import { createReviewExportFixture as fixture } from './export-lifecycle.test-support';
import { exportReviewedVideo, type ReviewExportClipPlan } from './export-lifecycle';
import { reviewRenderFrameSchedule } from './render-schedule';

it('shifts fragment clip placements across a leading cut to global output time', async () => {
  const { args, deps } = fixture();
  args.snapshot.workspace.history[0]!.after = {
    id: 'cut',
    kind: 'cut',
    start: 1,
    end: 3,
    requestedStart: 1,
    requestedEnd: 3,
  };
  args.index.processedVideoCodec = 'vp8';
  deps.writeReviewFrames.mockResolvedValue({
    videoPackets: 40,
    audioPackets: 0,
    resultDuration: 3,
    audioRanges: [],
  });
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.audio = true;
  advanced.audio.music = [
    {
      id: 'm',
      assetId: 'project-asset:m',
      timelineStart: 1.5,
      sourceOffset: 0,
      duration: 2,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      async decodeAudioData() {
        return { duration: 2, numberOfChannels: 2, getChannelData: () => new Float32Array(96_000) };
      }
    }
  );
  try {
    await exportReviewedVideo(
      { ...args, destination: 'download', selection: { kind: 'range', start: 2, end: 6 } },
      deps
    );
  } finally {
    vi.unstubAllGlobals();
  }
  expect(deps.writeReviewPackets).not.toHaveBeenCalled();
  const call = (deps.writeReviewFrames.mock.calls[0] ?? []) as unknown as Record<string, unknown>[];
  const exported = (call[0] ?? {}) as { exportAudio?: ReviewExportClipPlan };
  // Full-output time of source 2 is 1; the clip plays at 1.5 globally → 0.5 fragment-local.
  expect(exported.exportAudio!.entries[0]).toMatchObject({ timelineStart: 0.5 });
});

it('plans exact advanced fragment cuts before selecting the frame renderer', async () => {
  const { args, deps } = fixture();
  args.snapshot.workspace.advanced.ui.mode = 'advanced';
  args.snapshot.workspace.history = [];
  args.snapshot.workspace.cursor = 0;
  args.index.processedVideoCodec = 'vp8';
  deps.writeReviewFrames.mockResolvedValue({
    videoPackets: 20,
    audioPackets: 0,
    resultDuration: 2,
    audioRanges: [],
  });
  const before = structuredClone(args.snapshot);
  const result = await exportReviewedVideo(
    { ...args, destination: 'download', selection: { kind: 'range', start: 0.1, end: 2.1 } },
    deps
  );
  expect(result.receipt.filename).toMatch(
    /^Sniptale_video-review_.*_fragment-0\.100-2\.100\.webm$/
  );
  expect(deps.writeReviewPackets).not.toHaveBeenCalled();
  expect(deps.writeReviewFrames).toHaveBeenCalledWith(
    expect.objectContaining({
      edits: [
        expect.objectContaining({ kind: 'cut', start: 0, end: 0.1 }),
        expect.objectContaining({ kind: 'cut', start: 2.1, end: 6 }),
      ],
    })
  );
  expect(args.snapshot).toEqual(before);
  expect(deps.saveRecordingsBatchSafely).not.toHaveBeenCalled();
});

it.each([true, false])(
  'always omits fragment bookends even with legacy preference=%s',
  async (includeBookends) => {
    const { createNewWorkspacePresentationSettings } =
      await import('../../features/video/review/advanced/presentation');
    for (const fragment of [true, false]) {
      const { args, deps } = fixture();
      args.snapshot.workspace.advanced.ui.mode = 'advanced';
      args.snapshot.workspace.advanced.presentation = createNewWorkspacePresentationSettings();
      // A fragment's bookends are neutral; an authored canvas selects the frame writer.
      args.snapshot.workspace.advanced.canvas = { width: 320, height: 180 };
      args.index.processedVideoCodec = 'vp8';
      deps.writeReviewFrames.mockResolvedValue({
        videoPackets: 60,
        audioPackets: 0,
        resultDuration: 2,
        audioRanges: [],
      });
      const before = structuredClone(args.snapshot);
      const request = {
        ...args,
        destination: 'download' as const,
        includeBookends,
        ...(fragment ? { selection: { kind: 'range' as const, start: 0, end: 2 } } : {}),
      };
      await exportReviewedVideo(request, deps);
      expect(deps.writeReviewFrames).toHaveBeenCalledWith(
        expect.objectContaining({
          includeBookends: !fragment,
          advanced: expect.objectContaining({
            presentation: before.workspace.advanced.presentation,
          }),
        })
      );
      expect(args.snapshot).toEqual(before);
    }
  }
);

it('schedules the zoom on the held frames through the selected end of a download', async () => {
  const { args, deps } = fixture();
  args.index.processedVideoCodec = 'vp8';
  const { workspace } = args.snapshot;
  workspace.advanced.ui.mode = 'advanced';
  workspace.advanced.zoom.regions = [
    {
      id: 'zoom',
      start: 2,
      end: 4,
      transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
    },
  ];
  workspace.history.push({
    id: 'insert-hold',
    at: 2,
    target: 'edit',
    before: null,
    after: {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.96,
      frameDuration: 0.04,
    },
  });
  workspace.cursor = 2;
  const writeReviewFrames = vi.fn<
    NonNullable<Parameters<typeof exportReviewedVideo>[1]>['writeReviewFrames']
  >(async ({ index, edits }) => {
    const schedule = reviewRenderFrameSchedule(index.duration, edits, 30);
    return {
      videoPackets: schedule.flatMap((window) => window.timestamps).length,
      audioPackets: 0,
      resultDuration: schedule.at(-1)!.segment.resultEnd,
      audioRanges: [],
    };
  });
  const selection = { kind: 'range' as const, start: 1.5, end: 2, result: { start: 1.5, end: 3 } };
  const before = structuredClone(args.snapshot);
  const output = await exportReviewedVideo(
    { ...args, destination: 'download', selection },
    {
      ...deps,
      writeReviewFrames,
    }
  );
  expect(output.receipt.filename).toMatch(/fragment-1\.500-3\.000\.webm$/);
  expect(writeReviewFrames).toHaveBeenCalledOnce();
  const call = writeReviewFrames.mock.calls[0]![0];
  expect(call.fragmentOffset).toBe(1.5);
  expect(call.advanced.zoom.regions).toEqual(workspace.advanced.zoom.regions);
  const schedule = reviewRenderFrameSchedule(args.index.duration, call.edits, 30);
  expect(schedule.map((window) => window.segment.kind)).toEqual(['keep', 'freeze']);
  expect(schedule[1]!.timestamps[0]! + call.fragmentOffset).toBe(2);
  expect(schedule[1]!.sourceTimes).toEqual(Array(30).fill(1.96));
  expect(schedule[1]!.segment.resultEnd).toBe(1.5);
  expect(args.snapshot).toEqual(before);
  expect(deps.saveRecordingsBatchSafely).not.toHaveBeenCalled();
});
