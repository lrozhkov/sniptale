import { parseMotionSourceBinding, projectMotionSourceBinding } from './source-binding';
import {
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoTemporalEasing,
  type VideoProject,
  type VideoProjectMotionArea,
  type VideoProjectMotionRegion,
} from '../types/index';
import {
  clampFocusAreaOrigin,
  clampFocusAreaSize,
  clampNumber,
  getProjectCenter,
  normalizeMotionFocusArea,
} from './focus-area';
import {
  resolveMotionBlurAmount,
  resolveMotionFocusMode,
  resolveMotionScale,
  resolveMotionStartTime,
} from './normalization';
import { isMotionAnimation } from './timing';

export const DEFAULT_VIDEO_MOTION_OVERLAY_ZOOM_MODE = VideoMotionOverlayZoomMode.LOCK_OVERLAYS;

function normalizeMotionConnection(value: unknown): VideoProjectMotionRegion['incomingConnection'] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('fromRegionId' in value) ||
    typeof value.fromRegionId !== 'string' ||
    !value.fromRegionId ||
    !('easing' in value)
  )
    return undefined;
  const easing = Object.values(VideoTemporalEasing).find((candidate) => candidate === value.easing);
  return easing ? { fromRegionId: value.fromRegionId, easing } : undefined;
}

/** Resolves a connection against current neighbours, never a second persisted timeline. */
export function resolveMotionConnectionSource(
  project: Pick<VideoProject, 'motionRegions'>,
  destination: VideoProjectMotionRegion
): VideoProjectMotionRegion | null {
  if (
    destination.duration <= 0 ||
    !destination.incomingConnection ||
    !isConnectableMotionState(destination)
  )
    return null;
  let previous: VideoProjectMotionRegion | null = null;
  for (const region of project.motionRegions ?? []) {
    if (
      region.duration <= 0 ||
      region.id === destination.id ||
      region.startTime > destination.startTime
    )
      continue;
    if (!previous || region.startTime > previous.startTime) previous = region;
  }
  const authoredSource = project.motionRegions?.find(
    (region) => region.id === destination.incomingConnection?.fromRegionId
  );
  const sourceGroup = authoredSource?.sourceBinding?.animationGroupId;
  const matchesSource =
    previous &&
    (previous.id === destination.incomingConnection.fromRegionId ||
      (sourceGroup && previous.sourceBinding?.animationGroupId === sourceGroup));
  return previous &&
    matchesSource &&
    previous.startTime + previous.duration <= destination.startTime &&
    isConnectableMotionState(previous)
    ? previous
    : null;
}

function isConnectableMotionState(region: VideoProjectMotionRegion): boolean {
  return (
    region.focusMode === VideoMotionFocusMode.MANUAL ||
    region.focusMode === VideoMotionFocusMode.MANUAL_AREA ||
    region.focusMode === VideoMotionFocusMode.ACTION
  );
}

export function createMotionFocusAreaFromPointScale(
  project: Pick<VideoProject, 'height' | 'width'>,
  focusPoint: { x: number; y: number },
  scale: number
): VideoProjectMotionArea {
  const safeScale = clampNumber(Number.isFinite(scale) ? scale : 1, 1, 4);
  const width = clampFocusAreaSize(project.width, project.width / safeScale);
  const height = clampFocusAreaSize(project.height, project.height / safeScale);

  return (
    normalizeMotionFocusArea(project, {
      height,
      width,
      x: focusPoint.x - width / 2,
      y: focusPoint.y - height / 2,
    }) ?? {
      height,
      width,
      x: clampFocusAreaOrigin(focusPoint.x - width / 2, width, project.width),
      y: clampFocusAreaOrigin(focusPoint.y - height / 2, height, project.height),
    }
  );
}

export function getMotionFocusAreaCenter(area: VideoProjectMotionArea) {
  return {
    x: area.x + area.width / 2,
    y: area.y + area.height / 2,
  };
}

function resolveMotionDuration(project: Pick<VideoProject, 'duration'>, duration: number): number {
  return clampNumber(
    Number.isFinite(duration) ? duration : 0,
    0.1,
    Math.max(0.1, project.duration || 0.1)
  );
}

function resolveMotionFocusPoint(
  project: Pick<VideoProject, 'height' | 'width'>,
  region: VideoProjectMotionRegion
) {
  return region.focusPoint &&
    Number.isFinite(region.focusPoint.x) &&
    Number.isFinite(region.focusPoint.y)
    ? {
        x: clampNumber(region.focusPoint.x, 0, project.width),
        y: clampNumber(region.focusPoint.y, 0, project.height),
      }
    : getProjectCenter(project);
}

function resolveMotionTargetAction(
  project: Pick<VideoProject, 'actionEvents' | 'clips'>,
  target: VideoProjectMotionRegion['targetAction']
) {
  if (!target) return null;
  const event = project.actionEvents.find((item) => item.id === target.eventId);
  if (!event) return null;
  const anchor = event.anchor;
  if (anchor.kind === 'project') return target.clipId === null ? target : null;
  return project.clips.some(
    (clip) =>
      clip.type === 'VIDEO' &&
      clip.id === target.clipId &&
      clip.sourceInstanceId === anchor.sourceInstanceId &&
      anchor.sourceTime >= clip.sourceStart &&
      anchor.sourceTime < clip.sourceStart + clip.sourceDuration
  )
    ? target
    : null;
}

export function resolveMotionOverlayZoomMode(
  overlayZoomMode: VideoProjectMotionRegion['overlayZoomMode']
): VideoMotionOverlayZoomMode {
  return Object.values(VideoMotionOverlayZoomMode).includes(
    overlayZoomMode as VideoMotionOverlayZoomMode
  )
    ? (overlayZoomMode as VideoMotionOverlayZoomMode)
    : DEFAULT_VIDEO_MOTION_OVERLAY_ZOOM_MODE;
}

export function createVideoProjectMotionRegion(
  project: Pick<VideoProject, 'height' | 'width'>,
  startTime: number
): VideoProjectMotionRegion {
  return {
    duration: 2.8,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    focusArea: null,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: getProjectCenter(project),
    id: crypto.randomUUID(),
    motionBlurAmount: 0,
    overlayZoomMode: DEFAULT_VIDEO_MOTION_OVERLAY_ZOOM_MODE,

    scale: 1.35,
    startTime: Math.max(0, startTime),
    targetAction: null,
    zoomInDuration: 0.35,
    zoomOutDuration: 0.35,
  };
}

export function normalizeVideoProjectMotionRegion(
  project: Pick<VideoProject, 'actionEvents' | 'clips' | 'duration' | 'height' | 'width'>,
  region: VideoProjectMotionRegion
): VideoProjectMotionRegion {
  const sourceBinding = parseMotionSourceBinding(region.sourceBinding);
  const duration = resolveMotionDuration(project, region.duration);
  const animation = isMotionAnimation(region.animation) ? region.animation : undefined;
  const animationDuration = sourceBinding?.animation.duration ?? animation?.duration ?? duration;
  const focusArea = normalizeMotionFocusArea(project, region.focusArea);
  const focusPoint = resolveMotionFocusPoint(project, region);
  const targetAction = resolveMotionTargetAction(project, region.targetAction);
  const focusMode = resolveMotionFocusMode(region.focusMode);
  const scale = resolveMotionScale(region.scale);
  const incomingConnection = normalizeMotionConnection(region.incomingConnection);
  const startTime = resolveMotionStartTime(project.duration, region.startTime, duration);

  return projectMotionSourceBinding(project, {
    ...(sourceBinding ? { sourceBinding } : {}),
    ...(animation ? { animation } : {}),
    ...(incomingConnection ? { incomingConnection } : {}),

    duration,
    easing: Object.values(VideoTemporalEasing).includes(region.easing)
      ? region.easing
      : VideoTemporalEasing.EASE_IN_OUT,
    focusArea,
    focusMode,
    focusPoint,
    id: region.id,
    motionBlurAmount: resolveMotionBlurAmount(region.motionBlurAmount),
    overlayZoomMode: resolveMotionOverlayZoomMode(region.overlayZoomMode),

    scale,
    startTime,
    targetAction,
    zoomInDuration: clampNumber(
      Number.isFinite(region.zoomInDuration) ? region.zoomInDuration : 0,
      0,
      animationDuration
    ),
    zoomOutDuration: clampNumber(
      Number.isFinite(region.zoomOutDuration) ? region.zoomOutDuration : 0,
      0,
      animationDuration
    ),
  });
}
