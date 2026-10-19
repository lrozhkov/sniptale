import {
  isProjectOriginalAudioTarget,
  remapCopiedOriginalAudioTargets,
} from '../../../../features/video/project/timeline/original-audio';
import { duplicateVideoProjectTextDocuments } from '../../../../features/video/project/text/duplication';
import { isTextSourceClip } from '../../../../features/video/project/text/projection';
import { cursorFocusOverrideId } from '../../../../features/video/project/cursor-focus-path/authoring';
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

    const source =
      isSourceTimedClip(item) &&
      !item.sourceInstanceId &&
      (project.textDocuments?.some((entry) => isTextSourceClip(item, entry.binding)) ||
        isProjectOriginalAudioTarget(project, item))
        ? { ...item, sourceInstanceId: item.id }
        : item;
    const splitClips = splitProjectClip(source, offsets.get(item.id) ?? 0, secondGroupId);
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
  const duplicateClipIds = new Map<string, string>();
  const duplicateCursorIds = new Map<string, string>();
  const duplicateActionIds = new Map<string, string>();
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

      duplicateSourceInstance(item, duplicate, project, sourceInstances);
      duplicateClipIds.set(item.id, duplicate.id);
      duplicateIds.push(duplicate.id);
      if (item.id === clipId) duplicateClipId = duplicate.id;
      return [item, duplicate];
    }),
  });
  nextProject.clips = remapCopiedOriginalAudioTargets(
    nextProject.clips,
    new Set(duplicateIds),
    sourceInstances
  );
  nextProject.actionEvents = [
    ...project.actionEvents,
    ...project.actionEvents.flatMap((event) => {
      if (event.anchor.kind !== 'recording-source') return [];
      const sourceInstanceId = sourceInstances.get(event.anchor.sourceInstanceId);
      const duplicateActionId = crypto.randomUUID();
      if (sourceInstanceId) duplicateActionIds.set(event.id, duplicateActionId);
      return sourceInstanceId
        ? [
            {
              ...event,
              id: duplicateActionId,
              anchor: { ...event.anchor, sourceInstanceId },
              data: { ...event.data },
              point: event.point ? { ...event.point } : null,
              ...(event.presentation ? { presentation: { ...event.presentation } } : {}),
            },
          ]
        : [];
    }),
  ];
  duplicateCursorSamples(project, nextProject, duplicateClipIds, duplicateCursorIds);
  if (project.cursorFocusPath)
    nextProject.cursorFocusPath = {
      ...project.cursorFocusPath,
      segments: [
        ...project.cursorFocusPath.segments,
        ...project.cursorFocusPath.segments.flatMap((segment) => {
          if (segment.binding.kind !== 'recording-source') return [];
          const sourceInstanceId = sourceInstances.get(segment.binding.sourceInstanceId);
          return sourceInstanceId
            ? [
                {
                  ...segment,
                  id: crypto.randomUUID(),
                  binding: { ...segment.binding, sourceInstanceId },
                  keys: segment.keys.map((key) => ({
                    ...key,
                    id: duplicateFocusKeyId(
                      key,
                      segment.binding.kind === 'recording-source'
                        ? segment.binding.sourceInstanceId
                        : '',
                      sourceInstanceId,
                      duplicateCursorIds,
                      duplicateActionIds
                    ),
                    ...(key.incoming ? { incoming: { ...key.incoming } } : {}),
                    ...(key.outgoing ? { outgoing: { ...key.outgoing } } : {}),
                  })),
                },
              ]
            : [];
        }),
      ],
    };
  if (project.actionFeedback)
    nextProject.actionFeedback = [
      ...project.actionFeedback,
      ...project.actionFeedback.flatMap((group) => {
        const sourceInstanceId = sourceInstances.get(group.sourceInstanceId);
        return sourceInstanceId ? [{ ...structuredClone(group), sourceInstanceId }] : [];
      }),
    ];
  if (project.textDocuments) {
    const documents = duplicateVideoProjectTextDocuments(project.textDocuments, sourceInstances);
    if (!documents) return null;
    nextProject.textDocuments = documents;
  }
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

/** A focus override keeps its captured-anchor relationship inside the copied source instance. */
function duplicateFocusKeyId(
  key: import('../../../../features/video/project/cursor-focus-path/types').CursorFocusKey,
  originalInstance: string,
  newInstance: string,
  cursorIds: ReadonlyMap<string, string>,
  actionIds: ReadonlyMap<string, string>
) {
  const overridePrefix = cursorFocusOverrideId('');
  if (key.anchor === 'manual') {
    const captured = key.id.startsWith(overridePrefix)
      ? duplicateCapturedFocusKeyId(
          key.id.slice(overridePrefix.length),
          originalInstance,
          newInstance,
          cursorIds,
          actionIds
        )
      : null;
    return captured ? cursorFocusOverrideId(captured) : crypto.randomUUID();
  }
  return (
    duplicateCapturedFocusKeyId(key.id, originalInstance, newInstance, cursorIds, actionIds) ??
    crypto.randomUUID()
  );
}

function duplicateCapturedFocusKeyId(
  keyId: string,
  originalInstance: string,
  newInstance: string,
  cursorIds: ReadonlyMap<string, string>,
  actionIds: ReadonlyMap<string, string>
): string | null {
  const cursorId = cursorIds.get(keyId);
  if (cursorId) return cursorId;
  for (const prefix of ['click:', 'release:']) {
    if (keyId.startsWith(prefix)) {
      const id = actionIds.get(keyId.slice(prefix.length));
      if (id) return `${prefix}${id}`;
    }
  }
  for (const prefix of ['dwell-start:', 'dwell-end:']) {
    if (keyId.startsWith(`${prefix}${originalInstance}:`))
      return `${prefix}${newInstance}:${keyId.slice(prefix.length + originalInstance.length + 1)}`;
  }
  if (keyId.startsWith('end:segment:')) {
    const id = cursorIds.get(keyId.slice('end:segment:'.length));
    if (id) return `end:segment:${id}`;
  }
  return null;
}

function duplicateSourceInstance(
  item: VideoProjectClip,
  duplicate: VideoProjectClip,
  project: VideoProject,
  sourceInstances: Map<string, string>
): void {
  if (
    isSourceTimedClip(item) &&
    isSourceTimedClip(duplicate) &&
    item.type === duplicate.type &&
    (item.sourceInstanceId ||
      isProjectOriginalAudioTarget(project, item) ||
      project.textDocuments?.some((entry) => isTextSourceClip(item, entry.binding)) ||
      project.cursorFocusPath?.segments.some(
        (segment) =>
          segment.binding.kind === 'recording-source' &&
          segment.binding.sourceInstanceId === item.id
      ))
  ) {
    const originalInstanceId = item.sourceInstanceId ?? item.id;
    const sourceInstanceId = sourceInstances.get(originalInstanceId) ?? crypto.randomUUID();
    sourceInstances.set(originalInstanceId, sourceInstanceId);
    duplicate.sourceInstanceId = sourceInstanceId;
  }
}

function duplicateCursorSamples(
  project: VideoProject,
  nextProject: VideoProject,
  duplicateClipIds: Map<string, string>,
  duplicateCursorIds: Map<string, string>
): void {
  if (project.cursorTrack)
    nextProject.cursorTrack = {
      ...project.cursorTrack,
      samples: [
        ...project.cursorTrack.samples,
        ...project.cursorTrack.samples.flatMap((sample) => {
          const anchor = sample.sourceAnchor;
          const sourceClipId = anchor && duplicateClipIds.get(anchor.sourceClipId);
          if (!anchor || !sourceClipId) return [];
          const clip = nextProject.clips.find((item) => item.id === sourceClipId);
          if (clip?.type !== 'VIDEO') return [];
          const id = crypto.randomUUID();
          duplicateCursorIds.set(sample.id, id);
          return [
            {
              ...sample,
              id,
              time:
                clip.startTime + (anchor.sourceTime - clip.sourceStart) / (clip.playbackRate ?? 1),
              sourceAnchor: { ...anchor, sourceClipId },
            },
          ];
        }),
      ].sort((a, b) => a.time - b.time),
    };
}
