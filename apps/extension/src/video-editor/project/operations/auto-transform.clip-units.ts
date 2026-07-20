import { createClipGroupId } from '../../../features/video/project/factories/creation';
import { normalizeClipPlaybackRate } from '../../../features/video/project/timeline/basics';
import type { VideoProject } from '../../../features/video/project/types/model';
import { VideoClipLinkMode } from '../../../features/video/project/types/model';
import {
  collectRecordingSourceUnits,
  getSourceEnd,
  getSourceUnitKey,
  isRecordingSourceTimedClip,
  isSourceTimedClip,
  updateSourceTimedClipTiming,
  type SourceTimedClip,
} from './source-timed-clips';

export const AUTO_TRANSFORM_SOURCE_EPSILON = 0.001;

export {
  collectRecordingSourceUnits as collectSourceUnits,
  getSourceEnd,
  getSourceUnitKey,
  isRecordingSourceTimedClip,
  type SourceTimedClip,
};

export function cloneSourceTimedClip(
  clip: SourceTimedClip,
  patch: Partial<
    Pick<SourceTimedClip, 'playbackRate' | 'sourceDuration' | 'sourceStart' | 'startTime'>
  >
): SourceTimedClip {
  return updateSourceTimedClipTiming(clip, patch);
}

function collectSplitTargets(
  project: VideoProject,
  recordingId: string,
  sourceTime: number
): {
  secondGroupIds: Map<string, string | null>;
  splitTargets: Set<string>;
} {
  const splitTargets = new Set<string>();
  const secondGroupIds = new Map<string, string | null>();

  for (const unit of collectRecordingSourceUnits(project, recordingId)) {
    const representative = unit[0];
    if (
      !representative ||
      sourceTime <= representative.sourceStart + AUTO_TRANSFORM_SOURCE_EPSILON ||
      sourceTime >= getSourceEnd(representative) - AUTO_TRANSFORM_SOURCE_EPSILON
    ) {
      continue;
    }

    const key = getSourceUnitKey(representative);
    secondGroupIds.set(
      key,
      unit.length > 1 && representative.groupId !== null ? createClipGroupId() : null
    );
    unit.forEach((clip) => splitTargets.add(clip.id));
  }

  return { secondGroupIds, splitTargets };
}

function splitClip(
  clip: SourceTimedClip,
  sourceTime: number,
  secondGroupIds: Map<string, string | null>
) {
  const key = getSourceUnitKey(clip);
  const sourceOffset = sourceTime - clip.sourceStart;
  const secondGroupId = secondGroupIds.get(key) ?? null;
  const firstClip = cloneSourceTimedClip(clip, { sourceDuration: sourceOffset });
  const secondClip = cloneSourceTimedClip(
    {
      ...clip,
      id: crypto.randomUUID(),
      startTime: clip.startTime + sourceOffset / normalizeClipPlaybackRate(clip.playbackRate ?? 1),
      groupId:
        secondGroupId !== null && clip.linkMode === VideoClipLinkMode.LINKED
          ? secondGroupId
          : clip.groupId,
      linkMode:
        secondGroupId !== null && clip.linkMode === VideoClipLinkMode.LINKED
          ? VideoClipLinkMode.LINKED
          : clip.linkMode,
      transform: { ...clip.transform },
    },
    {
      sourceStart: sourceTime,
      sourceDuration: clip.sourceDuration - sourceOffset,
    }
  );

  return [firstClip, secondClip];
}

export function splitUnitsAtSourceTime(
  project: VideoProject,
  recordingId: string,
  sourceTime: number
): VideoProject {
  const { splitTargets, secondGroupIds } = collectSplitTargets(project, recordingId, sourceTime);

  if (splitTargets.size === 0) {
    return project;
  }

  return {
    ...project,
    clips: project.clips.flatMap((clip) => {
      if (!splitTargets.has(clip.id) || !isSourceTimedClip(clip)) {
        return [clip];
      }

      return splitClip(clip, sourceTime, secondGroupIds);
    }),
  };
}
