import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { videoExportSampleWindows } from '../../features/video/project/export/size-estimate';
import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
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
  const mainDuration = buildReviewTimeMap(args.index.duration, args.edits).at(-1)?.resultEnd ?? 0;
  const effective = resolveQuickEditEffectiveState(args.advanced);
  let duration = mainDuration;
  if (effective.presentation) {
    const sequence = planReviewPresentationSequence({
      settings: effective.presentation,
      mainDuration,
      fragmentOffset: args.fragmentOffset,
      includeBookends: args.includeBookends ?? true,
      rate: profile.rate,
    });
    if (!sequence.ok)
      throw new Error('Presentation cannot be represented on the output frame lattice');
    duration = sequence.plan.totalDurationUs / 1_000_000;
  }
  const windows = videoExportSampleWindows(duration, profile.fps);
  // Bookend metadata has no audio-presence field; budget configured video sound conservatively.
  const bookendAudio =
    args.includeBookends !== false &&
    effective.presentation &&
    [effective.presentation.intro, effective.presentation.outro].some(
      (slot) => slot.mode === 'video' && !slot.video.audio.muted && slot.video.audio.gain > 0
    );

  const hasAudio =
    !!bookendAudio ||
    !!args.index.audioCodec ||
    [...effective.voiceover, ...effective.music].some((clip) => !clip.muted && clip.volume > 0);
  return measureVideoExportSize({
    profile: { ...profile, codec: profile.codec, quality: args.renderSettings?.quality ?? 'HIGH' },
    duration,
    windows,
    audioBitrate: hasAudio ? (effective.presentation ? 128_000 : 192_000) : 0,
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
