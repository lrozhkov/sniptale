import { resolveVideoProjectActionOccurrences } from '../../../../features/video/project/action-occurrences';
import { isVideoProjectUtilityLaneLocked } from '../../../../features/video/project/utility-lanes';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import {
  normalizeRecordingActionEventsToProjectSpace,
  createRecordingTelemetryNormalizationParams,
} from '../../operations/telemetry';
import type { VideoProjectClip } from '../../../../features/video/project/types';
import type {
  VideoProject,
  VideoProjectActionEvent,
} from '../../../../features/video/project/types';

/** A locked history prevents moving an existing event point at or after the insertion. */
export function areMaterialInsertActionsLocked(project: VideoProject, time: number): boolean {
  return (
    isVideoProjectUtilityLaneLocked(project, 'actions') &&
    resolveVideoProjectActionOccurrences(project).some((occurrence) => occurrence.time >= time)
  );
}

/** Anchored points are already reconciled; only unbound project-time points need a shift. */
export function insertMaterialActionGap(
  project: VideoProject,
  time: number,
  duration: number
): VideoProject {
  return {
    ...project,
    actionEvents: project.actionEvents.map((event) =>
      event.anchor.kind === 'project' && event.anchor.time >= time
        ? { ...event, anchor: { kind: 'project' as const, time: event.anchor.time + duration } }
        : event
    ),
  };
}

/** Instantiates captured events only for the newly placed video, never its linked audio. */
export function addMaterialCapturedActions(
  project: VideoProject,
  addedClips: readonly VideoProjectClip[],
  telemetry: RecordingTelemetryEntry | undefined
): VideoProject {
  if (!telemetry) return project;
  const events = normalizeRecordingActionEventsToProjectSpace(
    telemetry.actionEvents,
    createRecordingTelemetryNormalizationParams(telemetry, project)
  );
  const added = addedClips.flatMap((clip) => {
    if (clip.type !== 'VIDEO' || !clip.sourceInstanceId) return [];
    const asset = project.assets.find((item) => item.id === clip.assetId);
    const recordingId =
      asset?.source.kind === 'recording'
        ? asset.source.recordingId
        : asset?.source.kind === 'project-asset'
          ? asset.source.originRecordingId
          : null;
    if (recordingId !== telemetry.recordingId) return [];
    const sourceInstanceId = clip.sourceInstanceId;
    return events.flatMap<VideoProjectActionEvent>((event) => {
      if (
        project.actionEvents.some(
          (fact) =>
            fact.anchor.kind === 'recording-source' &&
            fact.anchor.recordingId === recordingId &&
            fact.anchor.sourceInstanceId === sourceInstanceId &&
            fact.anchor.sourceEventId === event.id
        )
      )
        return [];
      return [
        {
          id: crypto.randomUUID(),
          kind: event.kind,
          label: event.label,
          data: { ...event.data },
          point: event.point ? { ...event.point } : null,
          capturedDuration: event.duration,
          ...(event.kind !== 'CLICK' && event.kind !== 'KEY'
            ? { presentation: { preset: event.preset } }
            : {}),
          anchor: {
            kind: 'recording-source',
            recordingId,
            sourceInstanceId,
            sourceEventId: event.id,
            sourceTime: event.time,
          },
        },
      ];
    });
  });
  return added.length === 0
    ? project
    : {
        ...project,
        actionEvents: [...project.actionEvents, ...added],
      };
}
