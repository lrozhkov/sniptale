import { VIDEO_PROJECT_ATTACHMENT_GEOMETRY } from '../types/export';
import type { VideoProjectRenderScope } from '../export/render-scope';
import { normalizeClipPlaybackRate } from '../timeline/rate';
import {
  getVideoProjectTrackLogicalLaneIds,
  resolveClipLogicalLaneId,
} from '../timeline/logical-lanes';
import type { VideoProject, VideoProjectEffectClip, VideoProjectVideoClip } from '../types';

export function getEffectInsertionError(
  project: VideoProject,
  trackId: string,
  start: number,
  duration: number,
  timelineLaneId?: string | null
): 'effectTargetMissing' | 'effectTargetOccupied' | null {
  const track = project.tracks.find((track) => track.id === trackId);
  if (
    !track ||
    track.locked ||
    track.kind !== 'PRIMARY' ||
    track.role === 'CAMERA' ||
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    return 'effectTargetMissing';
  const lane = resolveClipLogicalLaneId({ timelineLaneId: timelineLaneId ?? null });
  if (!getVideoProjectTrackLogicalLaneIds(project, trackId).includes(lane))
    return 'effectTargetMissing';
  return project.clips.some(
    (clip) =>
      clip.trackId === trackId &&
      resolveClipLogicalLaneId(clip) === lane &&
      clip.startTime < start + duration &&
      clip.startTime + clip.duration > start
  )
    ? 'effectTargetOccupied'
    : null;
}

/** Selects this source placement only; an absent placement does not select another video. */
export function resolveEffectSourceClip(
  project: VideoProjectRenderScope,
  host: VideoProjectEffectClip,
  time: number
): VideoProjectVideoClip | undefined {
  const binding = host.attachment;
  if (binding?.kind !== 'source') return undefined;
  const geometryProject = project[VIDEO_PROJECT_ATTACHMENT_GEOMETRY] ?? project;
  return geometryProject.clips
    .filter(
      (clip): clip is VideoProjectVideoClip =>
        clip.type === 'VIDEO' &&
        clip.assetId === binding.assetId &&
        (clip.sourceInstanceId ?? clip.id) === binding.sourceInstanceId &&
        time >= clip.startTime &&
        time < clip.startTime + clip.duration &&
        geometryProject.tracks.some((track) => track.id === clip.trackId && track.visible)
    )
    .sort((left, right) => right.startTime - left.startTime)[0];
}

/** Original source timing is a restore recipe, not a second running timeline. */
export function resolveEffectSourceInterval(project: VideoProject, host: VideoProjectEffectClip) {
  const range = host.sourceRange;
  if (!range) return null;
  let start = Infinity,
    end = -Infinity;
  for (const clip of project.clips) {
    if (
      clip.type !== 'VIDEO' ||
      clip.assetId !== range.assetId ||
      (clip.sourceInstanceId ?? clip.id) !== range.sourceInstanceId ||
      project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
    )
      continue;
    const rate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
    const from = Math.max(range.start, clip.sourceStart);
    const to = Math.min(
      range.end,
      clip.sourceStart + Math.min(clip.sourceDuration, clip.duration * rate)
    );
    if (to <= from) continue;
    start = Math.min(start, clip.startTime + (from - clip.sourceStart) / rate);
    end = Math.max(end, clip.startTime + (to - clip.sourceStart) / rate);
  }
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

/** Only explicit timing edits activate a retained host; its original range stays available. */
export function activateRetainedEffectHost(host: VideoProjectEffectClip): VideoProjectEffectClip {
  if (!host.sourceRange?.dormant) return host;
  const { dormant: _dormant, ...sourceRange } = host.sourceRange;
  return { ...host, sourceRange };
}
