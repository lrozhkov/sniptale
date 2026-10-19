import { applyVideoProjectMutationPatch } from '../mutation';
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
    if (
      take.type !== 'AUDIO' ||
      take.id === clip.id ||
      !take.originalAudioMute ||
      project.tracks.find((track) => track.id === take.trackId)?.visible === false
    )
      return [];
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

type OriginalAudioMute = NonNullable<
  Extract<VideoProjectClip, { type: 'AUDIO' }>['originalAudioMute']
>;

/** Lists distinct project-local sound sources without acquiring resources or selecting defaults. */
export function listProjectOriginalAudioTargets(project: VideoProject) {
  const sources = new Map<string, OriginalAudioMute['targets'][number]>();
  const audioAssets = new Set(
    project.assets.filter((asset) => asset.metadata.hasAudio).map((asset) => asset.id)
  );
  for (const clip of project.clips) {
    if (
      (clip.type !== 'AUDIO' && clip.type !== 'VIDEO') ||
      (clip.type === 'VIDEO' && clip.muted) ||
      !audioAssets.has(clip.assetId)
    )
      continue;
    const target = { assetId: clip.assetId, sourceInstanceId: clip.sourceInstanceId ?? clip.id };
    if (Object.values(target).some((id) => !id || id.trim() !== id || id.length > 256)) continue;
    sources.set(JSON.stringify([target.assetId, target.sourceInstanceId]), target);
  }
  return [...sources.values()];
}

/** A new Apply must resolve every explicit target; historical missing targets remain readable. */
export function hasCurrentOriginalAudioTargets(project: VideoProject, mute: OriginalAudioMute) {
  if (
    !Number.isFinite(mute.volume) ||
    mute.volume < 0 ||
    mute.volume > 1 ||
    !mute.targets.length ||
    mute.targets.length > 512
  )
    return false;
  const key = (target: OriginalAudioMute['targets'][number]) =>
    JSON.stringify([target.assetId, target.sourceInstanceId]);
  const selected = mute.targets.map(key);
  const available = new Set(listProjectOriginalAudioTargets(project).map(key));
  return new Set(selected).size === selected.length && selected.every((id) => available.has(id));
}

/** Changes only an existing take override through the ordinary project mutation contract. */
export function updateProjectOriginalAudioVolume(
  project: VideoProject,
  clipId: string,
  volume: number | undefined
) {
  const clip = project.clips.find((item) => item.id === clipId);
  if (
    clip?.type !== 'AUDIO' ||
    !clip.originalAudioMute ||
    !project.tracks.some((track) => track.id === clip.trackId && !track.locked) ||
    (volume !== undefined && (!Number.isFinite(volume) || volume < 0 || volume > 1)) ||
    volume === clip.originalAudioMute.volume
  )
    return project;
  const { originalAudioMute, ...rest } = clip;
  const next =
    volume === undefined ? rest : { ...clip, originalAudioMute: { ...originalAudioMute, volume } };
  return applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((item) => (item.id === clipId ? next : item)),
  });
}
