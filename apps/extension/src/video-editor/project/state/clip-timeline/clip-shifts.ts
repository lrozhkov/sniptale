import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../features/video/project/types/index';

type ShiftedClipUpdater = (clip: VideoProjectClip, startTime: number) => VideoProjectClip;

interface ShiftedClipStartPatch {
  clips: VideoProject['clips'];
  effectInstances?: NonNullable<VideoProject['effectInstances']>;
}

export function createShiftedClipStartPatch({
  clipIds,
  delta,
  project,
  updateClip = updateClipStartTime,
}: {
  clipIds: ReadonlySet<string>;
  delta: number;
  project: VideoProject;
  updateClip?: ShiftedClipUpdater;
}): ShiftedClipStartPatch {
  const clipStartDeltaById = new Map<string, number>();
  const clips = project.clips.map((clip) => {
    if (!clipIds.has(clip.id)) {
      return clip;
    }

    const startTime = Math.max(0, clip.startTime + delta);
    clipStartDeltaById.set(clip.id, startTime - clip.startTime);
    return updateClip(clip, startTime);
  });
  const effectInstances = project.effectInstances?.map((instance) => {
    if (instance.target.kind !== 'clip') return instance;
    const startDelta = clipStartDeltaById.get(instance.target.clipId);
    return startDelta === undefined
      ? instance
      : { ...instance, startTime: Math.max(0, instance.startTime + startDelta) };
  });

  if (effectInstances) {
    return { clips, effectInstances };
  }

  return { clips };
}

function updateClipStartTime(clip: VideoProjectClip, startTime: number): VideoProjectClip {
  return { ...clip, startTime };
}
