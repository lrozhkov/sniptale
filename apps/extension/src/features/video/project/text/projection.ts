import { projectReviewTextFragment } from '../../review/text-projection';
import type { ReviewTextFragment } from '../../review/text-types';
import { mapSourceRangeToProjectSpans } from '../timeline/source-time';
import { normalizeClipPlaybackRate } from '../timeline/rate';
import type { VideoProject, VideoProjectClip } from '../types/model';
import type { VideoProjectTextBinding, VideoProjectTextDocument } from './types';

/** Legacy placements use their clip identity until their first source-bound split. */
export function isTextSourceClip(
  clip: VideoProjectClip,
  binding: VideoProjectTextBinding
): boolean {
  return (
    binding.kind === 'source' &&
    (clip.type === 'VIDEO' || clip.type === 'AUDIO') &&
    clip.assetId === binding.assetId &&
    (clip.sourceInstanceId ?? clip.id) === binding.sourceInstanceId
  );
}

/** Projects each placement separately; source order need not equal montage order. */
export function projectVideoProjectTextFragment(
  project: VideoProject,
  entry: VideoProjectTextDocument,
  fragment: ReviewTextFragment
): ReturnType<typeof projectReviewTextFragment> {
  if (entry.binding.kind === 'project')
    return projectReviewTextFragment(fragment, [
      {
        kind: 'keep',
        rate: 1,
        sourceStart: 0,
        sourceEnd: project.duration,
        resultStart: 0,
        resultEnd: project.duration,
      },
    ]);
  const clips = project.clips.flatMap((clip) => {
    if ((clip.type !== 'VIDEO' && clip.type !== 'AUDIO') || !isTextSourceClip(clip, entry.binding))
      return [];
    return [
      {
        ...clip,
        sourceDuration: Math.min(
          clip.sourceDuration,
          clip.duration * normalizeClipPlaybackRate(clip.playbackRate ?? 1)
        ),
      },
    ];
  });
  const spans = mapSourceRangeToProjectSpans(clips, fragment.start, fragment.end);
  let covered = 0;
  let end = fragment.start;
  for (const span of [...spans].sort((a, b) => a.sourceStart - b.sourceStart)) {
    covered += Math.max(0, span.sourceEnd - Math.max(end, span.sourceStart));
    end = Math.max(end, span.sourceEnd);
  }
  return {
    excludedFromResult: spans.length === 0,
    // Source-second tolerance matches retained voiceover boundary arithmetic.
    partiallyExcluded: spans.length > 0 && covered < fragment.end - fragment.start - 1e-7,
    ranges: spans.map((span) => ({ start: span.startTime, end: span.endTime })),
  };
}
