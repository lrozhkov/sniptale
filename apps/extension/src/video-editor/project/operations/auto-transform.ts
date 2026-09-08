import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import type {
  VideoProject,
  VideoProjectMotionRegion,
  VideoProjectVideoClip,
} from '../../../features/video/project/types';
import type { VideoAutoProcessingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { getVideoProjectUtilityLanes } from '../../../features/video/project/utility-lanes';
import { buildAutoTransformCandidates } from './auto-transform.candidates';
import { buildAutoZoomRegions } from './auto-transform.zoom';
import {
  applyAutoProcessingTiming,
  planAutoProcessingInterval,
  type AutoProcessingTarget,
  type AutoProcessingTimingRequest,
} from './auto-transform.clip-timeline';
export type { AutoProcessingTarget } from './auto-transform.clip-timeline';

export interface AutoProcessingActions {
  prepare: (
    request: AutoProcessingRequest,
    selectedIds?: readonly string[]
  ) => Promise<AutoProcessingPreview | { status: 'stale' }>;
  apply: (preview: AutoProcessingPreview) => Promise<'applied' | 'stale' | 'blocked' | 'unchanged'>;
  isCurrent: (preview: AutoProcessingPreview) => boolean;
}

export interface AutoProcessingRequest {
  targets: AutoProcessingTarget[];
  settings: VideoAutoProcessingSettings;
  camera: boolean;
}
interface AutoProcessingSuggestion {
  id: string;
  target: AutoProcessingTarget;
  kind: 'timing' | 'camera';
  label: string;
  startTime: number;
  endTime: number;
  beforeDuration: number;
  afterDuration: number;
  status: 'available' | 'blocked' | 'unchanged';
  reason: string | null;
  timing?: AutoProcessingTimingRequest;
  region?: VideoProjectMotionRegion;
}
export interface AutoProcessingPreview {
  status: 'ready' | 'blocked' | 'unchanged';
  sourceProject: VideoProject;
  project: VideoProject | null;
  request: AutoProcessingRequest;
  suggestions: AutoProcessingSuggestion[];
  selectedIds: string[];
  telemetry: (RecordingTelemetryEntry | undefined)[];
  summary: {
    beforeDuration: number;
    afterDuration: number;
    shiftedCount: number;
    affectedCount: number;
    removedDuration: number;
  };
  blockedId?: string;
}

export function getAutoProcessingClipChoices(project: VideoProject) {
  return project.clips.flatMap((clip) => {
    if (
      clip.type !== 'VIDEO' ||
      project.tracks.find((track) => track.id === clip.trackId)?.role === 'CAMERA'
    )
      return [];
    const asset = project.assets.find((item) => item.id === clip.assetId);
    const recordingId =
      asset?.source.kind === 'recording'
        ? asset.source.recordingId
        : asset?.source.kind === 'project-asset'
          ? asset.source.originRecordingId
          : null;
    const linked =
      clip.linkMode === 'LINKED' && clip.groupId
        ? project.clips.filter(
            (item) => item.groupId === clip.groupId && item.linkMode === 'LINKED'
          )
        : [clip];
    return [
      {
        clipId: clip.id,
        recordingId: recordingId ?? '',
        sourceInstanceId: clip.sourceInstanceId ?? '',
        name: clip.name,
        sourceName: asset?.name ?? clip.name,
        startTime: clip.startTime,
        endTime: clip.startTime + clip.duration,
        linkedCount: linked.length,
        locked: linked.some(
          (item) => project.tracks.find((track) => track.id === item.trackId)?.locked
        ),
      },
    ];
  });
}

function unavailable(
  target: AutoProcessingTarget,
  label: string,
  startTime: number,
  reason: string
): AutoProcessingSuggestion {
  return {
    id: JSON.stringify(['unavailable', target]),
    target,
    kind: 'timing',
    label,
    startTime,
    endTime: startTime,
    beforeDuration: 0,
    afterDuration: 0,
    status: 'blocked',
    reason,
  };
}

function buildTimingSuggestions(
  project: VideoProject,
  target: AutoProcessingTarget,
  clip: VideoProjectVideoClip,
  candidates: ReturnType<typeof buildAutoTransformCandidates>
): AutoProcessingSuggestion[] {
  return candidates.flatMap((candidate) => {
    const sourceStart = Math.max(clip.sourceStart, candidate.startTime);
    const sourceEnd = Math.min(clip.sourceStart + clip.sourceDuration, candidate.endTime);
    if (sourceEnd <= sourceStart) return [];
    const timing = {
      id: JSON.stringify(['timing', target, sourceStart, sourceEnd, candidate.action]),
      target,
      sourceStart,
      sourceEnd,
      action: candidate.action,
      playbackRate: candidate.playbackRate,
    };
    const plan = planAutoProcessingInterval(project, timing);
    const rate = clip.playbackRate ?? 1;
    const startTime = clip.startTime + (sourceStart - clip.sourceStart) / rate;
    const beforeDuration = (sourceEnd - sourceStart) / rate;
    return [
      {
        id: timing.id,
        target,
        kind: 'timing',
        label: clip.name,
        startTime,
        endTime: startTime + beforeDuration,
        beforeDuration,
        afterDuration: plan.status === 'ready' ? plan.nextDuration : beforeDuration,
        status: plan.status === 'ready' ? 'available' : plan.status,
        reason: plan.status === 'blocked' ? plan.reason : null,
        timing,
      },
    ];
  });
}

function buildCameraSuggestions(
  project: VideoProject,
  target: AutoProcessingTarget,
  clip: VideoProjectVideoClip,
  telemetry: RecordingTelemetryEntry
): AutoProcessingSuggestion[] {
  if (getVideoProjectUtilityLanes(project).camera.locked)
    return [
      {
        ...unavailable(target, clip.name, clip.startTime, 'camera-locked'),
        id: JSON.stringify(['camera-locked', target]),
        kind: 'camera',
      },
    ];
  const regions = buildAutoZoomRegions({
    project,
    recordingId: target.recordingId,
    telemetry,
    clipIds: new Set([target.clipId]),
  });
  return regions.flatMap((region) => {
    if (
      !region.id.startsWith('auto-motion:') ||
      region.targetAction?.clipId !== target.clipId ||
      project.motionRegions?.includes(region)
    )
      return [];
    const existing = project.motionRegions?.find((item) => item.id === region.id);
    const unchanged = existing && JSON.stringify(existing) === JSON.stringify(region);
    return [
      {
        id: JSON.stringify(['camera', region.targetAction]),
        target,
        kind: 'camera',
        label: clip.name,
        startTime: region.startTime,
        endTime: region.startTime + region.duration,
        beforeDuration: region.duration,
        afterDuration: region.duration,
        status: unchanged ? 'unchanged' : 'available',
        reason: null,
        region,
      },
    ];
  });
}

function buildSuggestions(
  project: VideoProject,
  request: AutoProcessingRequest,
  telemetry: (RecordingTelemetryEntry | undefined)[]
) {
  const suggestions: AutoProcessingSuggestion[] = [];
  const linkedKeys = new Set<string>();
  const choices = getAutoProcessingClipChoices(project);
  for (const target of request.targets) {
    const clip = project.clips.find((item) => item.id === target.clipId);
    const choice = choices.find(
      (item) =>
        item.clipId === target.clipId &&
        item.recordingId === target.recordingId &&
        item.sourceInstanceId === target.sourceInstanceId
    );
    const entry = telemetry.find((item) => item?.recordingId === target.recordingId);
    if (clip?.type !== 'VIDEO' || !choice || !target.sourceInstanceId || !entry) {
      suggestions.push(
        unavailable(target, clip?.name ?? '', clip?.startTime ?? 0, 'missing-source')
      );
      continue;
    }
    const key =
      clip.linkMode === 'LINKED' && clip.groupId
        ? JSON.stringify([clip.groupId, clip.startTime, clip.sourceStart, clip.sourceDuration])
        : clip.id;
    if (linkedKeys.has(key)) continue;
    linkedKeys.add(key);
    suggestions.push(
      ...buildTimingSuggestions(
        project,
        target,
        clip,
        buildAutoTransformCandidates(entry, request.settings.stableSegments)
      )
    );
    if (request.camera) suggestions.push(...buildCameraSuggestions(project, target, clip, entry));
  }
  return suggestions;
}

/** Attach selected framing before time edits so the common mutation preserves exact lineage. */
function bindSelectedCameraRegions(
  project: VideoProject,
  selected: AutoProcessingSuggestion[]
): VideoProject {
  const camera = selected.flatMap((row) => (row.region ? [row.region] : []));
  if (!camera.length) return project;
  return {
    ...project,
    motionRegions: [
      ...(project.motionRegions ?? []).filter(
        (region) =>
          !camera.some(
            (next) =>
              region.id === next.id ||
              (region.id.startsWith('auto-motion:') &&
                region.targetAction?.eventId === next.targetAction?.eventId &&
                region.targetAction?.clipId === next.targetAction?.clipId)
          )
      ),
      ...camera,
    ],
  };
}

export async function prepareAutoProcessing(
  project: VideoProject,
  request: AutoProcessingRequest,
  selectedIds?: readonly string[]
): Promise<AutoProcessingPreview> {
  if (!request.settings.enabled || !request.targets.length)
    return {
      status: 'unchanged',
      sourceProject: project,
      project,
      request,
      suggestions: [],
      selectedIds: [],
      telemetry: [],
      summary: {
        beforeDuration: project.duration,
        afterDuration: project.duration,
        shiftedCount: 0,
        affectedCount: 0,
        removedDuration: 0,
      },
    };
  const recordingIds = [
    ...new Set(request.targets.map((target) => target.recordingId).filter(Boolean)),
  ];
  const telemetry = await Promise.all(recordingIds.map((id) => getRecordingTelemetry(id)));
  const suggestions = buildSuggestions(project, request, telemetry);
  const chosen = new Set(
    selectedIds ?? suggestions.filter((row) => row.status === 'available').map((row) => row.id)
  );
  const selected = suggestions.filter((row) => chosen.has(row.id));
  const missingSelectedId = [...chosen].find((id) => !suggestions.some((row) => row.id === id));
  const blocked = selected.find((row) => row.status !== 'available');
  const candidate = bindSelectedCameraRegions(project, selected);
  const timing = blocked
    ? null
    : applyAutoProcessingTiming(
        candidate,
        selected.flatMap((row) => (row.timing ? [row.timing] : []))
      );
  const failedId =
    missingSelectedId ?? blocked?.id ?? (timing?.status === 'blocked' ? timing.id : undefined);
  const next = timing?.status === 'ready' ? timing.project : null;
  return {
    status: failedId ? 'blocked' : next === project ? 'unchanged' : 'ready',
    sourceProject: project,
    project: failedId ? null : next,
    request,
    suggestions,
    selectedIds: selected.map((row) => row.id),
    telemetry,
    summary: {
      beforeDuration: project.duration,
      afterDuration: next?.duration ?? project.duration,
      shiftedCount: timing?.status === 'ready' ? timing.shiftedClipIds.length : 0,
      affectedCount: timing?.status === 'ready' ? timing.affectedClipIds.length : 0,
      removedDuration: timing?.status === 'ready' ? timing.removedDuration : 0,
    },
    ...(failedId ? { blockedId: failedId } : {}),
  };
}

export async function isAutoProcessingTelemetryCurrent(preview: AutoProcessingPreview) {
  const ids = [
    ...new Set(preview.request.targets.map((target) => target.recordingId).filter(Boolean)),
  ];
  const current = await Promise.all(ids.map((id) => getRecordingTelemetry(id)));
  return JSON.stringify(current) === JSON.stringify(preview.telemetry);
}
