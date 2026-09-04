import { createClipGroupId } from '../../../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import {
  applyTimelinePlacementPolicy,
  canSplitProjectClipAtTime,
  getSourceTimedClipSourceOffset,
} from '../../../../features/video/project/timeline';
import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../features/video/project/types/index';
import { VideoClipLinkMode } from '../../../../features/video/project/types/index';
import { translate } from '../../../../platform/i18n';
import { VideoProjectClipType } from '../../../../features/video/project/types/index';
import { duplicateStandaloneEffectHost, splitStandaloneEffectHostWithResult } from './effect-host';
import {
  isSourceTimedClip,
  resolveEditableClipOperation,
  updateSourceTimedClipTiming,
} from '../helpers';

export function splitProjectClipsAtTime(
  project: VideoProject,
  clipId: string,
  splitTime: number
): VideoProject {
  return splitProjectClipsAtTimeWithResult(project, clipId, splitTime)?.project ?? project;
}

interface ProjectClipSplitMutationResult {
  project: VideoProject;
  trailingClipId: string;
  trailingTrackId: string;
}

export function splitProjectClipsAtTimeWithResult(
  project: VideoProject,
  clipId: string,
  splitTime: number
): ProjectClipSplitMutationResult | null {
  const operation = resolveEditableClipOperation(project, clipId);
  if (!operation || !canSplitProjectClipAtTime(project, clipId, splitTime)) return null;
  if (operation.clip.type === VideoProjectClipType.EFFECT) {
    const result = splitStandaloneEffectHostWithResult(project, clipId, splitTime);
    const trailingHost = result?.project.clips.find((clip) => clip.id === result.hostClipId);
    return result && trailingHost
      ? {
          project: result.project,
          trailingClipId: result.hostClipId,
          trailingTrackId: trailingHost.trackId,
        }
      : null;
  }

  const offsets = new Map(
    operation.affectedClips.map((item) => [item.id, splitTime - item.startTime])
  );
  const secondGroupId = operation.clipIds.length > 1 ? createClipGroupId() : null;
  let trailingClipId: string | null = null;
  const nextProject = applyVideoProjectMutationPatch(project, {
    clips: project.clips.flatMap((item) => {
      if (!operation.clipIdSet.has(item.id)) {
        return [item];
      }

      const splitClips = splitProjectClip(item, offsets.get(item.id) ?? 0, secondGroupId);
      if (item.id === clipId) trailingClipId = splitClips[1]?.id ?? null;
      return splitClips;
    }),
  });
  const trailingClip = nextProject.clips.find((clip) => clip.id === trailingClipId);
  return trailingClip
    ? {
        project: nextProject,
        trailingClipId: trailingClip.id,
        trailingTrackId: trailingClip.trackId,
      }
    : null;
}

export function duplicateProjectClips(project: VideoProject, clipId: string): VideoProject {
  const operation = resolveEditableClipOperation(project, clipId);
  if (!operation) {
    return project;
  }
  if (operation.clip.type === VideoProjectClipType.EFFECT) {
    return duplicateStandaloneEffectHost(project, clipId)?.project ?? project;
  }

  const duplicateGroupId = operation.clipIds.length > 1 ? createClipGroupId() : null;
  const duplicateIds: string[] = [];
  const nextProject = applyVideoProjectMutationPatch(project, {
    clips: project.clips.flatMap((item) => {
      if (!operation.clipIdSet.has(item.id)) {
        return [item];
      }

      const duplicate: VideoProjectClip = {
        ...item,
        id: crypto.randomUUID(),
        groupId: duplicateGroupId,
        linkMode: duplicateGroupId ? VideoClipLinkMode.LINKED : VideoClipLinkMode.DETACHED,
        startTime: item.startTime + 0.25,
        transform: { ...item.transform },
        name: `${item.name} ${translate('shared.projectActions.copySuffix')}`,
      } as VideoProjectClip;

      duplicateIds.push(duplicate.id);
      return [item, duplicate];
    }),
  });
  return applyTimelinePlacementPolicy(nextProject, duplicateIds);
}

function splitProjectClip(
  clip: VideoProjectClip,
  localOffset: number,
  secondGroupId: string | null
): VideoProjectClip[] {
  if (isSourceTimedClip(clip)) {
    const secondClipBase = createSplitSecondClipBase(clip, localOffset, secondGroupId);
    const sourceOffset = getSourceTimedClipSourceOffset(clip, localOffset);
    const firstClip = updateSourceTimedClipTiming(clip, {
      sourceDuration: sourceOffset,
    });
    const secondClip = updateSourceTimedClipTiming(secondClipBase, {
      sourceStart: clip.sourceStart + sourceOffset,
      sourceDuration: clip.sourceDuration - sourceOffset,
    });

    return [firstClip, secondClip];
  }

  const firstClip = { ...clip, duration: localOffset };
  const secondClipBase = createSplitSecondClipBase(clip, localOffset, secondGroupId);
  return [firstClip, secondClipBase];
}

function createSplitSecondClipBase<TClip extends VideoProjectClip>(
  clip: TClip,
  localOffset: number,
  secondGroupId: string | null
): TClip {
  const shouldKeepLinked = clip.linkMode === VideoClipLinkMode.LINKED && clip.groupId;
  return {
    ...clip,
    id: crypto.randomUUID(),
    startTime: clip.startTime + localOffset,
    duration: clip.duration - localOffset,
    transform: { ...clip.transform },
    name: `${clip.name} · ${translate('shared.projectActions.splitPartSuffix')} 2`,
    groupId: shouldKeepLinked ? secondGroupId : clip.groupId,
    linkMode: shouldKeepLinked ? VideoClipLinkMode.LINKED : clip.linkMode,
  } as TClip;
}
