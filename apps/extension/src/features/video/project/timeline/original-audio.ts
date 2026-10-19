import { composeSourceAudioRanges, type AudioGainRange } from '../../audio/source-attenuation';
import type { VideoProject, VideoProjectClip } from '../types';

/** Finds exact authored targets, including legacy source identity before its first split. */
export function isProjectOriginalAudioTarget(project: VideoProject, clip: VideoProjectClip) {
  if (clip.type !== 'AUDIO' && clip.type !== 'VIDEO') return false;
  return project.clips.some(
    (take) =>
      take.type === 'AUDIO' &&
      take.id !== clip.id &&
      take.originalAudioMute?.targets.some(
        (target) =>
          target.assetId === clip.assetId &&
          target.sourceInstanceId === (clip.sourceInstanceId ?? clip.id)
      )
  );
}

/** Projects live take intervals onto only their explicitly captured source instances. */
export function getProjectOriginalAudioRanges(
  project: VideoProject,
  clip: VideoProjectClip
): AudioGainRange[] {
  if (clip.type !== 'AUDIO' && clip.type !== 'VIDEO') return [];
  const ranges = project.clips.flatMap((take) => {
    if (take.type !== 'AUDIO' || take.id === clip.id || !take.originalAudioMute) return [];
    const mute = take.originalAudioMute;
    if (
      !mute.targets.some(
        (target) =>
          target.assetId === clip.assetId &&
          target.sourceInstanceId === (clip.sourceInstanceId ?? clip.id)
      )
    )
      return [];
    const start = Math.max(clip.startTime, take.startTime);
    const end = Math.min(clip.startTime + clip.duration, take.startTime + take.duration);
    return end > start ? [{ start, end, volume: mute.volume }] : [];
  });
  return composeSourceAudioRanges([], ranges);
}

/** Copies explicit bindings only after the montage command has its complete instance map. */
export function remapCopiedOriginalAudioTargets(
  clips: VideoProject['clips'],
  copiedIds: ReadonlySet<string>,
  instances: ReadonlyMap<string, string>
): VideoProject['clips'] {
  return clips.map((clip) =>
    clip.type === 'AUDIO' && copiedIds.has(clip.id) && clip.originalAudioMute
      ? {
          ...clip,
          originalAudioMute: {
            ...clip.originalAudioMute,
            targets: clip.originalAudioMute.targets.map((target) => ({
              ...target,
              sourceInstanceId: instances.get(target.sourceInstanceId) ?? target.sourceInstanceId,
            })),
          },
        }
      : clip
  );
}
