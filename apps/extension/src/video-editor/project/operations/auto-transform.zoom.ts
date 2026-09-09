import {
  constrainMotionTiming,
  getMotionInsertionRange,
} from '../../../features/video/project/motion/placement';
import { bindMotionRegionToClip } from '../../../features/video/project/motion/source-binding';
import { getVideoProjectUtilityLanes } from '../../../features/video/project/utility-lanes';
import { resolveVideoProjectActionOccurrences } from '../../../features/video/project/action-occurrences';
import { resolveVideoCompositionActionSourceMapping } from '../../../features/video/composition/timeline/frame/actions';
import { mapSourceNormalizedPointToVisualLayer } from '../../../features/video/composition/draw/fitted-media';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import {
  createVideoProjectMotionRegion,
  normalizeVideoProjectMotionRegion,
} from '../../../features/video/project/motion';
import type {
  VideoProject,
  VideoProjectActionPoint as ActionPoint,
  VideoProjectMotionRegion as MotionRegion,
} from '../../../features/video/project/types';
import type { RecordingTelemetrySignal as TelemetrySignal } from '../../../features/video/project/types/interaction';
import {
  RecordingTelemetrySignalKind,
  VideoMotionFocusMode,
  VideoProjectActionEventKind,
} from '../../../features/video/project/types/interaction';
import {
  resolveAutoZoomProfileVariant,
  type AutoZoomProfile,
} from './auto-transform.zoom-profiles';

const AUTO_ZOOM_THROTTLE = 4;
const AUTO_ZOOM_MIN_DURATION = 3;
const AUTO_ZOOM_MIN_RAMP = 0.45;
const AUTO_ZOOM_REUSE_DISTANCE = 160;
const AUTO_ZOOM_REUSE_WINDOW = 1.8;

type Click = {
  id: string;
  eventId: string;
  clipId: string;
  recordingId: string;
  runId: string;
  runEnd: number;
  point: ActionPoint;
  sourceTime: number;
  time: number;
};

type BuildParams = {
  scale?: number;
  project: VideoProject;
  recordingId: string;
  telemetry: RecordingTelemetryEntry;
  clipIds?: ReadonlySet<string>;
};

function getTelemetryTypingSignals(signals: TelemetrySignal[]) {
  return signals.filter((signal) => signal.kind === RecordingTelemetrySignalKind.TYPING);
}

function isClickNearTyping(typingSignals: TelemetrySignal[], sourceTime: number): boolean {
  return typingSignals.some(
    (signal) => sourceTime >= signal.startTime - 0.3 && sourceTime <= signal.endTime + 0.6
  );
}

function getPointDistance(left: ActionPoint, right: ActionPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function resolveAutoZoomProfile(
  click: Click,
  typingSignals: TelemetrySignal[],
  previousClick: Click | null,
  nextClick: Click | null
): AutoZoomProfile {
  const nearTyping = isClickNearTyping(typingSignals, click.sourceTime);
  const previousGap = previousClick ? click.time - previousClick.time : Number.POSITIVE_INFINITY;
  const nextGap = nextClick ? nextClick.time - click.time : Number.POSITIVE_INFINITY;
  const isIsolated = !nearTyping && previousGap > 3.5 && nextGap > 3.5;

  if (isIsolated) {
    return resolveAutoZoomProfileVariant('isolated', click.id);
  }

  if (nearTyping) {
    return resolveAutoZoomProfileVariant('typing', click.id);
  }

  return resolveAutoZoomProfileVariant('default', click.id);
}

function buildNormalizedRecordingClicks(params: {
  project: VideoProject;
  recordingId: string;
  clipIds?: ReadonlySet<string>;
}): Click[] {
  return resolveVideoProjectActionOccurrences(params.project)
    .flatMap<Click>((occurrence) => {
      if (params.clipIds && (!occurrence.clipId || !params.clipIds.has(occurrence.clipId)))
        return [];
      const event = occurrence.event;
      const point = event.presentation?.point ?? event.point;
      if (
        event.kind !== VideoProjectActionEventKind.CLICK ||
        !point ||
        !occurrence.clipId ||
        event.anchor.kind !== 'recording-source' ||
        event.anchor.recordingId !== params.recordingId
      )
        return [];
      const sourceClip = params.project.clips.find((clip) => clip.id === occurrence.clipId);
      if (
        params.project.tracks.find((track) => track.id === sourceClip?.trackId)?.role === 'CAMERA'
      )
        return [];
      const mapping = resolveVideoCompositionActionSourceMapping(
        params.project,
        occurrence,
        occurrence.time
      );
      const scenePoint = mapping && mapSourceNormalizedPointToVisualLayer({ ...mapping, point });
      if (!scenePoint) return [];
      return [
        {
          id: JSON.stringify([occurrence.eventId, occurrence.clipId]),
          eventId: occurrence.eventId,
          clipId: occurrence.clipId,
          recordingId: params.recordingId,
          runId: occurrence.playbackRun?.id ?? occurrence.clipId,
          runEnd: Math.max(
            ...params.project.clips
              .filter((clip) =>
                (occurrence.playbackRun?.clipIds ?? [occurrence.clipId]).includes(clip.id)
              )
              .map((clip) => clip.startTime + clip.duration)
          ),
          point: scenePoint,
          sourceTime: event.anchor.sourceTime,
          time: occurrence.time,
        },
      ];
    })
    .sort((left, right) => left.time - right.time || left.id.localeCompare(right.id));
}

function hasEquivalentManualRegion(region: MotionRegion, click: Click): boolean {
  if (region.targetAction?.eventId === click.eventId && region.targetAction.clipId === click.clipId)
    return true;
  if (region.focusPoint === null) return false;

  if (click.time < region.startTime || click.time > region.startTime + region.duration) {
    return false;
  }

  return getPointDistance(region.focusPoint, click.point) <= AUTO_ZOOM_REUSE_DISTANCE;
}

function findReusableAutoRegion(autoRegions: MotionRegion[], click: Click): MotionRegion | null {
  const activeRegion = autoRegions.at(-1);
  if (!activeRegion || activeRegion.focusPoint === null) {
    return null;
  }

  const activeEndTime = activeRegion.startTime + activeRegion.duration;
  if (
    click.time > activeEndTime ||
    click.time < activeRegion.startTime ||
    getPointDistance(activeRegion.focusPoint, click.point) > AUTO_ZOOM_REUSE_DISTANCE
  ) {
    return null;
  }

  return activeRegion;
}

function extendAutoRegion(
  region: MotionRegion,
  project: VideoProject,
  click: Click,
  profile: AutoZoomProfile
): MotionRegion {
  const nextDuration = Math.max(
    region.duration,
    click.time - region.startTime + AUTO_ZOOM_MIN_DURATION
  );
  const clampedDuration = Math.min(
    nextDuration,
    project.duration - region.startTime,
    click.runEnd - region.startTime
  );

  const normalized = normalizeVideoProjectMotionRegion(project, {
    ...region,
    ...constrainMotionTiming(
      project,
      region,
      { startTime: region.startTime, duration: clampedDuration },
      false
    ),
    motionBlurAmount: Math.max(region.motionBlurAmount ?? 0, profile.motionBlurAmount),
    scale: Math.max(region.scale, profile.scale),
    zoomInDuration: Math.max(region.zoomInDuration, profile.zoomInDuration),
    zoomOutDuration: Math.max(region.zoomOutDuration, profile.zoomOutDuration),
  });
  const clip = project.clips.find((item) => item.id === region.targetAction?.clipId);
  return clip?.type === 'VIDEO' ? bindMotionRegionToClip(normalized, clip) : region;
}

function createAutoRegion(
  project: VideoProject,
  click: Click,
  profile: AutoZoomProfile
): MotionRegion | null {
  const free = getMotionInsertionRange(project, click.time);
  if (!free) return null;
  const duration = Math.min(
    free.duration,
    profile.duration,
    project.duration - click.time,
    click.runEnd - click.time
  );
  if (duration < AUTO_ZOOM_MIN_DURATION) {
    return null;
  }

  const normalized = normalizeVideoProjectMotionRegion(project, {
    ...createVideoProjectMotionRegion(project, click.time),
    id: `auto-motion:${click.id}`,
    duration,
    focusMode: VideoMotionFocusMode.ACTION,
    focusPoint: click.point,
    motionBlurAmount: profile.motionBlurAmount,
    scale: profile.scale,
    targetAction: { eventId: click.eventId, clipId: click.clipId },
    zoomInDuration: Math.max(AUTO_ZOOM_MIN_RAMP, profile.zoomInDuration),
    zoomOutDuration: Math.max(AUTO_ZOOM_MIN_RAMP, profile.zoomOutDuration),
  });
  const clip = project.clips.find((item) => item.id === click.clipId);
  return clip?.type === 'VIDEO' ? bindMotionRegionToClip(normalized, clip) : null;
}

export function buildAutoZoomRegions(params: BuildParams): MotionRegion[] {
  if (getVideoProjectUtilityLanes(params.project).camera.locked)
    return params.project.motionRegions ?? [];
  const clicks = buildNormalizedRecordingClicks(params);
  const typingSignals = getTelemetryTypingSignals(params.telemetry.signals);
  const project = params.project;
  // Once added to the montage, framing is authored content, regardless of how it was created.
  const manualRegions = project.motionRegions ?? [];
  const autoRegions: MotionRegion[] = [];
  const lastAutoZoomTimes = new Map<string, number>();

  for (const [index, click] of clicks.entries()) {
    if (manualRegions.some((region) => hasEquivalentManualRegion(region, click))) {
      lastAutoZoomTimes.set(click.runId, click.time);
      continue;
    }

    const previousClick =
      clicks.slice(0, index).findLast((item) => item.runId === click.runId) ?? null;
    const profile = {
      ...resolveAutoZoomProfile(
        click,
        typingSignals,
        previousClick,
        clicks.slice(index + 1).find((item) => item.runId === click.runId) ?? null
      ),
    };
    profile.scale = params.scale ?? 1.4;
    profile.motionBlurAmount = 0;
    const sameRunIds = new Set(
      clicks.filter((item) => item.runId === click.runId).map((item) => item.id)
    );
    const reusableRegion = findReusableAutoRegion(
      autoRegions.filter((region) => sameRunIds.has(region.id.slice('auto-motion:'.length))),
      click
    );
    const isRepeatedNearby =
      previousClick !== null &&
      click.time - previousClick.time <= AUTO_ZOOM_REUSE_WINDOW &&
      getPointDistance(previousClick.point, click.point) <= AUTO_ZOOM_REUSE_DISTANCE;

    if (reusableRegion && isRepeatedNearby) {
      autoRegions[autoRegions.indexOf(reusableRegion)] = extendAutoRegion(
        reusableRegion,
        { ...project, motionRegions: [...manualRegions, ...autoRegions] },
        click,
        profile
      );
      continue;
    }

    if (click.time - (lastAutoZoomTimes.get(click.runId) ?? -Infinity) < AUTO_ZOOM_THROTTLE) {
      continue;
    }

    const region = createAutoRegion(
      { ...project, motionRegions: [...manualRegions, ...autoRegions] },
      click,
      profile
    );
    if (region) {
      autoRegions.push(region);
      lastAutoZoomTimes.set(click.runId, click.time);
    }
  }

  return [...manualRegions, ...autoRegions];
}
