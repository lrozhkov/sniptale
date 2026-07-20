import { buildProjectTransitionSegments } from '../transition/project';
import { resolveClipTransitionAudioMultiplier } from '../transition/presentation';
import type { VideoProject, VideoProjectClip, VideoProjectTransitionSegment } from '../types/index';

function getClipIncomingTransitionSegment(
  project: VideoProject,
  clip: VideoProjectClip
): VideoProjectTransitionSegment | null {
  return (
    buildProjectTransitionSegments(project).find((segment) => segment.trailingClipId === clip.id) ??
    null
  );
}

function getClipOutgoingTransitionSegment(
  project: VideoProject,
  clip: VideoProjectClip
): VideoProjectTransitionSegment | null {
  return (
    buildProjectTransitionSegments(project).find((segment) => segment.leadingClipId === clip.id) ??
    null
  );
}

export function getClipTransitionMultiplier(
  project: VideoProject,
  clip: VideoProjectClip,
  currentTime: number
): number {
  return resolveClipTransitionAudioMultiplier(project, clip, currentTime);
}

export function getClipTransitionOverlapDurations(
  project: VideoProject,
  clip: VideoProjectClip
): {
  incomingMs: number;
  outgoingMs: number;
} {
  const incoming = getClipIncomingTransitionSegment(project, clip);
  const outgoing = getClipOutgoingTransitionSegment(project, clip);
  return {
    incomingMs: incoming ? Math.max(0, Math.round((incoming.end - incoming.start) * 1000)) : 0,
    outgoingMs: outgoing ? Math.max(0, Math.round((outgoing.end - outgoing.start) * 1000)) : 0,
  };
}
