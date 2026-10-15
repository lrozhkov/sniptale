import { expect, it, vi } from 'vitest';
import { createReviewExportFixture as fixture } from './export-lifecycle.test-support';
import { exportReviewedVideo, type ReviewExportClipPlan } from './export-lifecycle';

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
