import { expect, it, vi } from 'vitest';
import { createReviewExportFixture } from './export-lifecycle.test-support';
import { exportReviewedVideo } from './export-lifecycle';
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import { buildReviewTimeMap } from '../../features/video/review/timeline';

it('routes captions through final frames with the full source edit map', async () => {
  const { args, deps } = createReviewExportFixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.captions = { ...createReviewCaptionSettings(), enabled: true };
  advanced.text = {
    version: 1,
    fragments: [
      {
        id: 'caption',
        text: 'Caption',
        originalText: '',
        start: 0,
        end: 6,
        revision: 0,
        timingRevision: 0,
        showInVideo: true,
        alignment: 'manual',
        timeDomain: 'source',
      },
    ],
  };
  args.index = { ...args.index, processedVideoCodec: 'vp9', frameRate: 30 };
  deps.writeReviewFrames = vi.fn(async () => ({
    videoPackets: 90,
    audioPackets: 0,
    resultDuration: 4,
    audioRanges: [],
  }));
  await exportReviewedVideo(args, deps);
  const captionTimeMap = buildReviewTimeMap(args.index.duration, [
    { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
  ]);
  expect(deps.writeReviewFrames).toHaveBeenCalledWith(
    expect.objectContaining({
      fragmentOffset: 0,
      captionTimeMap,
    })
  );
  expect(deps.writeReviewPackets).not.toHaveBeenCalled();
});
