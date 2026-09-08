import { VideoProjectClipType, type VideoProjectClip } from '../types/index';

export function canCreateTransitionBoundary(
  leadingClip: VideoProjectClip,
  trailingClip: VideoProjectClip
): boolean {
  if (isTransitionExcludedClip(leadingClip) || isTransitionExcludedClip(trailingClip)) {
    return false;
  }

  if (
    (leadingClip.type === VideoProjectClipType.AUDIO) !==
    (trailingClip.type === VideoProjectClipType.AUDIO)
  )
    return false;

  const leadingEnd = getClipEndTime(leadingClip);
  const trailingEnd = getClipEndTime(trailingClip);
  return (
    trailingClip.startTime > leadingClip.startTime + 0.0001 &&
    leadingEnd > trailingClip.startTime + 0.0001 &&
    leadingEnd < trailingEnd - 0.0001
  );
}

function isTransitionExcludedClip(clip: VideoProjectClip): boolean {
  return clip.type === VideoProjectClipType.ANNOTATION || clip.type === VideoProjectClipType.EFFECT;
}

function getClipEndTime(clip: VideoProjectClip): number {
  return clip.startTime + clip.duration;
}
