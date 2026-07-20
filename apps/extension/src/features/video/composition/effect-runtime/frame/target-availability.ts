import type { VideoProject } from '../../../project/types/index';

export function resolveEffectTargetTrackAvailability(
  project: VideoProject,
  clipIds: readonly string[]
): 'available' | 'hidden' | 'invalid' {
  const clips = clipIds.map((clipId) => project.clips.find(({ id }) => id === clipId));
  if (clips.some((clip) => !clip)) return 'invalid';
  return clips.every((clip) =>
    project.tracks.some(({ id, visible }) => id === clip!.trackId && visible)
  )
    ? 'available'
    : 'hidden';
}
