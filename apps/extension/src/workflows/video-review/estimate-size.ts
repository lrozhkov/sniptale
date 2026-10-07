import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { videoExportSampleWindows } from '../../features/video/project/export/size-estimate';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { measureVideoExportSize } from '../video/export-size';
import { resolveReviewOutputProfile } from './render-settings';
import { writeReviewFrames } from './render-export';

/** Samples the export composition through its existing renderer; no writer or publication is used. */
export async function estimateReviewExportSize(
  args: Omit<Parameters<typeof writeReviewFrames>[0], 'writer' | 'frameProbe' | 'onProgress'>
) {
  if (args.renderSettings?.frameRateMode === 'adaptive')
    throw new Error('Adaptive export size estimate is unavailable.');
  const profile = resolveReviewOutputProfile(args.index, args.advanced, args.renderSettings);
  if (!profile.codec || !profile.dimensionsSupported) throw new Error('Size estimate unavailable');
  const duration = buildReviewTimeMap(args.index.duration, args.edits).at(-1)?.resultEnd ?? 0;
  const windows = videoExportSampleWindows(duration, profile.fps);
  const effective = resolveQuickEditEffectiveState(args.advanced);
  const hasAudio =
    !!args.index.audioCodec ||
    [...effective.voiceover, ...effective.music].some((clip) => !clip.muted && clip.volume > 0);
  return measureVideoExportSize({
    profile: { ...profile, codec: profile.codec, quality: args.renderSettings?.quality ?? 'HIGH' },
    duration,
    windows,
    audioBitrate: hasAudio ? 192_000 : 0,
    signal: args.signal,
    async render(encode) {
      await writeReviewFrames({
        ...args,
        writer: {
          writeAt: async () => {
            throw new Error('Size probe must not write output');
          },
        },
        frameProbe: {
          async add(sample) {
            const frame = sample.toVideoFrame();
            try {
              await encode(frame);
            } finally {
              frame.close();
            }
          },
        },
      });
    },
  });
}
