import type { ReviewAnnotation } from '../../review/types';
import { mapSourceRangeToProjectSpans } from '../timeline/source-time';
import { normalizeClipPlaybackRate } from '../timeline/rate';
import type { VideoProject, VideoProjectClip, VideoProjectVideoClip } from '../types/model';
import type { VideoProjectCommentBinding, VideoProjectCommentDocument } from './types';

/** An asset can have multiple independently authored placements. */
export function isCommentSourceClip(
  clip: VideoProjectClip,
  binding: VideoProjectCommentBinding
): clip is VideoProjectVideoClip {
  return (
    binding.kind === 'source' &&
    clip.type === 'VIDEO' &&
    clip.assetId === binding.assetId &&
    (clip.sourceInstanceId ?? clip.id) === binding.sourceInstanceId
  );
}

function sourceClips(
  project: VideoProject,
  document: VideoProjectCommentDocument,
  includeHidden: boolean
) {
  return project.clips.filter(
    (clip): clip is VideoProjectVideoClip =>
      isCommentSourceClip(clip, document.binding) &&
      project.tracks.some((track) => track.id === clip.trackId && (includeHidden || track.visible))
  );
}

/** Projects a note independently for every retained source piece; the authored anchor never changes. */
export function projectVideoProjectCommentAnchor(
  project: VideoProject,
  document: VideoProjectCommentDocument,
  anchor: ReviewAnnotation['anchor'],
  includeHidden = true
): { clipId: string | null; start: number; end: number }[] {
  const start = anchor.kind === 'point' ? anchor.time : anchor.start;
  const end = anchor.kind === 'point' ? anchor.time : anchor.end;
  if (document.binding.kind === 'project') return [{ clipId: null, start, end }];
  const clips = sourceClips(project, document, includeHidden);
  if (anchor.kind === 'point')
    return clips.flatMap((clip) => {
      const rate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
      const limit = clip.sourceStart + Math.min(clip.sourceDuration, clip.duration * rate);
      if (start < clip.sourceStart || start >= limit) return [];
      const time = clip.startTime + (start - clip.sourceStart) / rate;
      return [{ clipId: clip.id, start: time, end: time }];
    });
  return mapSourceRangeToProjectSpans(
    clips.map((clip) => ({
      ...clip,
      sourceDuration: Math.min(
        clip.sourceDuration,
        clip.duration * normalizeClipPlaybackRate(clip.playbackRate ?? 1)
      ),
    })),
    start,
    end
  ).map((span) => ({ clipId: span.clipId, start: span.startTime, end: span.endTime }));
}
