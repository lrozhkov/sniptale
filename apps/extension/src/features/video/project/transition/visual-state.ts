import { buildProjectTransitionSegments } from './project';
import { getTransitionProgress } from './runtime';
import type { VideoProject, VideoProjectClip } from '../types';

/** Audio follows the same directed junction fold; GL controls do not execute in the audio path. */
export function resolveClipTransitionAudioMultiplier(
  project: VideoProject,
  clip: VideoProjectClip,
  currentTime: number
): number {
  const active = buildProjectTransitionSegments(project).flatMap((segment) => {
    const progress = getTransitionProgress(segment, currentTime);
    return progress === null ? [] : [{ segment, progress }];
  });
  const incoming = active.find((edge) => edge.segment.trailingClipId === clip.id);
  let multiplier = incoming?.progress ?? 1;
  let id = clip.id;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(id)) throw new Error('Cyclic project transition chain.');
    visited.add(id);
    const outgoing = active.find((edge) => edge.segment.leadingClipId === id);
    if (!outgoing) return multiplier;
    multiplier *= 1 - outgoing.progress;
    id = outgoing.segment.trailingClipId;
  }
}
