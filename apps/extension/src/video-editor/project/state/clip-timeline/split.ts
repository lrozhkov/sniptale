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
  trailingClipIdsBySourceId: ReadonlyMap<string, string>;
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
          trailingClipIdsBySourceId: new Map([[clipId, trailingHost.id]]),
        }
      : null;
  }

  const offsets = new Map(
    operation.affectedClips.map((item) => [item.id, splitTime - item.startTime])
  );
  const secondGroupId = operation.clipIds.length > 1 ? createClipGroupId() : null;
  let trailingClipId: string | null = null;
  const trailingClipIdsBySourceId = new Map<string, string>();
  const clips = project.clips.flatMap((item) => {
    if (!operation.clipIdSet.has(item.id)) {
      return [item];
    }

    if (item.startTime + item.duration <= splitTime) return [item];
    if (item.startTime >= splitTime) return [{ ...item, groupId: secondGroupId }];

    const splitClips = splitProjectClip(item, offsets.get(item.id) ?? 0, secondGroupId);
    if (splitClips[1]) trailingClipIdsBySourceId.set(item.id, splitClips[1].id);
    if (item.id === clipId) trailingClipId = splitClips[1]?.id ?? null;
    return splitClips;
  });
  const nextProject = applyVideoProjectMutationPatch(project, {
    clips,
    ...(project.effectInstances
      ? {
          effectInstances: splitClipEffects(
            project.effectInstances,
            splitTime,
            trailingClipIdsBySourceId
          ),
        }
      : {}),
  });
  const trailingClip = nextProject.clips.find((clip) => clip.id === trailingClipId);
  return trailingClip
    ? {
        project: nextProject,
        trailingClipId: trailingClip.id,
        trailingTrackId: trailingClip.trackId,
        trailingClipIdsBySourceId,
      }
    : null;
}

function splitClipEffects(
  instances: NonNullable<VideoProject['effectInstances']>,
  splitTime: number,
  trailingIds: ReadonlyMap<string, string>
): NonNullable<VideoProject['effectInstances']> {
  return instances.flatMap((instance) => {
    if (instance.target.kind !== 'clip') return [instance];
    const trailingId = trailingIds.get(instance.target.clipId);
    if (!trailingId) return [instance];
    const end = instance.startTime + instance.duration;
    const leadingDuration = Math.min(splitTime, end) - instance.startTime;
    const trailingStart = Math.max(splitTime, instance.startTime);
    const leading = leadingDuration > 0 ? [{ ...instance, duration: leadingDuration }] : [];
    return end > trailingStart
      ? [
          ...leading,
          {
            ...instance,
            id: leading.length ? crypto.randomUUID() : instance.id,
            target: { kind: 'clip' as const, clipId: trailingId },
            controls: { ...instance.controls },
            startTime: trailingStart,
            duration: end - trailingStart,
            sourceStart:
              (instance.sourceStart ?? 0) +
              (trailingStart - instance.startTime) * instance.playbackRate,
          },
        ]
      : leading;
  });
}

export function duplicateProjectClips(project: VideoProject, clipId: string): VideoProject {
  return duplicateProjectClipsWithResult(project, clipId)?.project ?? project;
}

interface ProjectClipDuplicateMutationResult {
  duplicateClipId: string;
  duplicateTrackId: string;
  project: VideoProject;
}

export function duplicateProjectClipsWithResult(
  project: VideoProject,
  clipId: string
): ProjectClipDuplicateMutationResult | null {
  const operation = resolveEditableClipOperation(project, clipId);
  if (!operation) return null;
  if (operation.clip.type === VideoProjectClipType.EFFECT) {
    const result = duplicateStandaloneEffectHost(project, clipId);
    const duplicateHost = result?.project.clips.find((clip) => clip.id === result.hostClipId);
    return result && duplicateHost
      ? {
          duplicateClipId: duplicateHost.id,
          duplicateTrackId: duplicateHost.trackId,
          project: result.project,
        }
      : null;
  }

  const duplicateGroupId = operation.clipIds.length > 1 ? createClipGroupId() : null;
  const duplicateIds: string[] = [];
  const sourceInstances = new Map<string, string>();
  let duplicateClipId: string | null = null;
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

      if (item.type === 'VIDEO' && duplicate.type === 'VIDEO' && item.sourceInstanceId) {
        const sourceInstanceId = sourceInstances.get(item.sourceInstanceId) ?? crypto.randomUUID();
        sourceInstances.set(item.sourceInstanceId, sourceInstanceId);
        duplicate.sourceInstanceId = sourceInstanceId;
      }
      duplicateIds.push(duplicate.id);
      if (item.id === clipId) duplicateClipId = duplicate.id;
      return [item, duplicate];
    }),
  });
  nextProject.actionEvents = [
    ...project.actionEvents,
    ...project.actionEvents.flatMap((event) => {
      if (event.anchor.kind !== 'recording-source') return [];
      const sourceInstanceId = sourceInstances.get(event.anchor.sourceInstanceId);
      return sourceInstanceId
        ? [
            {
              ...event,
              id: crypto.randomUUID(),
              anchor: { ...event.anchor, sourceInstanceId },
              data: { ...event.data },
              point: event.point ? { ...event.point } : null,
              ...(event.presentation ? { presentation: { ...event.presentation } } : {}),
            },
          ]
        : [];
    }),
  ];
  const placedProject = applyTimelinePlacementPolicy(nextProject, duplicateIds);
  const selectedDuplicate = placedProject.clips.find((clip) => clip.id === duplicateClipId);
  return selectedDuplicate
    ? {
        duplicateClipId: selectedDuplicate.id,
        duplicateTrackId: selectedDuplicate.trackId,
        project: placedProject,
      }
    : null;
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
    groupId: shouldKeepLinked ? secondGroupId : clip.groupId,
    linkMode: shouldKeepLinked ? VideoClipLinkMode.LINKED : clip.linkMode,
  } as TClip;
}
