import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import {
  createVideoProjectMotionRegion,
  normalizeVideoProjectMotionRegion,
} from '../../../features/video/project/motion';
import type {
  VideoProject,
  VideoProjectActionEvent as ActionEvent,
  VideoProjectActionPoint as ActionPoint,
  VideoProjectMotionRegion as MotionRegion,
} from '../../../features/video/project/types';
import type { RecordingTelemetrySignal as TelemetrySignal } from '../../../features/video/project/types/interaction';
import {
  RecordingTelemetrySignalKind,
  VideoMotionFocusMode,
  VideoProjectActionEventKind,
} from '../../../features/video/project/types/interaction';
import { mapSourceTimeToProjectTime } from './auto-transform.clip-timeline';
import {
  resolveAutoZoomProfileVariant,
  type AutoZoomProfile,
} from './auto-transform.zoom-profiles';
import {
  createRecordingTelemetryNormalizationParams,
  normalizeRecordingActionEventsToProjectSpace,
} from './telemetry';

const AUTO_ZOOM_THROTTLE = 4;
const AUTO_ZOOM_MIN_DURATION = 3;
const AUTO_ZOOM_MIN_RAMP = 0.45;
const AUTO_ZOOM_REUSE_DISTANCE = 160;
const AUTO_ZOOM_REUSE_WINDOW = 1.8;

type Click = {
  id: string;
  point: ActionPoint;
  sourceTime: number;
  time: number;
};

type BuildParams = {
  project: VideoProject;
  recordingId: string;
  telemetry: RecordingTelemetryEntry;
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
  telemetry: RecordingTelemetryEntry;
}): Click[] {
  return normalizeRecordingActionEventsToProjectSpace(
    params.telemetry.actionEvents,
    createRecordingTelemetryNormalizationParams(params.telemetry, params.project)
  )
    .filter(
      (event): event is ActionEvent & { point: ActionPoint } =>
        event.kind === VideoProjectActionEventKind.CLICK && event.point !== null
    )
    .map((event) => {
      const time = mapSourceTimeToProjectTime(params.project, params.recordingId, event.time);
      if (time === null) {
        return null;
      }

      return {
        id: event.id,
        point: event.point,
        sourceTime: event.time,
        time,
      };
    })
    .filter((event): event is Click => event !== null)
    .sort((left, right) => left.time - right.time);
}

function hasEquivalentManualRegion(region: MotionRegion, click: Click): boolean {
  if (region.focusPoint === null) {
    return false;
  }

  if (region.targetActionEventId === click.id) {
    return true;
  }

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
  const clampedDuration = Math.min(nextDuration, project.duration - region.startTime);

  return normalizeVideoProjectMotionRegion(project, {
    ...region,
    duration: clampedDuration,
    motionBlurAmount: Math.max(region.motionBlurAmount ?? 0, profile.motionBlurAmount),
    scale: Math.max(region.scale, profile.scale),
    zoomInDuration: Math.max(region.zoomInDuration, profile.zoomInDuration),
    zoomOutDuration: Math.max(region.zoomOutDuration, profile.zoomOutDuration),
  });
}

function createAutoRegion(
  project: VideoProject,
  click: Click,
  profile: AutoZoomProfile
): MotionRegion | null {
  const duration = Math.min(profile.duration, project.duration - click.time);
  if (duration < AUTO_ZOOM_MIN_DURATION) {
    return null;
  }

  return normalizeVideoProjectMotionRegion(project, {
    ...createVideoProjectMotionRegion(project, click.time),
    id: `auto-motion:${click.id}`,
    duration,
    focusMode: VideoMotionFocusMode.ACTION,
    focusPoint: click.point,
    motionBlurAmount: profile.motionBlurAmount,
    scale: profile.scale,
    targetActionEventId: click.id,
    zoomInDuration: Math.max(AUTO_ZOOM_MIN_RAMP, profile.zoomInDuration),
    zoomOutDuration: Math.max(AUTO_ZOOM_MIN_RAMP, profile.zoomOutDuration),
  });
}

export function buildAutoZoomRegions(params: BuildParams): MotionRegion[] {
  const clicks = buildNormalizedRecordingClicks(params);
  const typingSignals = getTelemetryTypingSignals(params.telemetry.signals);
  const project = params.project;
  const baseRegions = project.motionRegions ?? [];
  const manualRegions = baseRegions.filter((region) => !region.id.startsWith('auto-motion:'));
  const autoRegions: MotionRegion[] = [];
  let lastAutoZoomTime = -Infinity;

  for (const [index, click] of clicks.entries()) {
    if (manualRegions.some((region) => hasEquivalentManualRegion(region, click))) {
      continue;
    }

    const previousClick = index > 0 ? clicks[index - 1]! : null;
    const profile = resolveAutoZoomProfile(
      click,
      typingSignals,
      previousClick,
      clicks[index + 1] ?? null
    );
    const reusableRegion = findReusableAutoRegion(autoRegions, click);
    const isRepeatedNearby =
      previousClick !== null &&
      click.time - previousClick.time <= AUTO_ZOOM_REUSE_WINDOW &&
      getPointDistance(previousClick.point, click.point) <= AUTO_ZOOM_REUSE_DISTANCE;

    if (reusableRegion && isRepeatedNearby) {
      autoRegions[autoRegions.length - 1] = extendAutoRegion(
        reusableRegion,
        project,
        click,
        profile
      );
      continue;
    }

    if (click.time - lastAutoZoomTime < AUTO_ZOOM_THROTTLE) {
      continue;
    }

    const region = createAutoRegion(project, click, profile);
    if (region) {
      autoRegions.push(region);
      lastAutoZoomTime = click.time;
    }
  }

  return [...manualRegions, ...autoRegions];
}
