import { parseQuickEditBorder, parseQuickEditSpotlight } from '../scene/focus-appearance';
import { isCameraMotionRegion } from './normalization';
import { parseCameraPerspective, parseCameraDepth, parseMotionSpatialReference } from './spatial';
import { parseMotionPhaseTransitions } from './transitions';
import type { MotionPhaseTransitions } from './transitions';
import { motionTransitionSettings } from './timing';
import { parseMotionBlurPhases } from './blur';
import { parseMotionSourceBinding, projectMotionSourceBinding } from './source-binding';
import {
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoTemporalEasing,
  type VideoProject,
  type VideoProjectMotionArea,
  type VideoProjectMotionRegion,
  type VideoProjectVideoClip,
} from '../types/index';
import {
  clampFocusAreaOrigin,
  clampFocusAreaSize,
  clampNumber,
  getProjectCenter,
  normalizeMotionFocusArea,
  motionFocusAreaPoint,
  MAX_MOTION_AREA_COORDINATE,
} from './focus-area';
import {
  resolveMotionBlurAmount,
  resolveMotionFocusMode,
  resolveMotionScale,
  resolveMotionStartTime,
} from './normalization';
import { isMotionAnimation } from './timing';
import { parseCameraFollowSettings } from '../camera/cursor-policy';

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
  project: Pick<VideoProject, 'motionRegions' | 'clips'>,
  destination: VideoProjectMotionRegion
): VideoProjectMotionRegion | null {
  if (!destination.incomingConnection) return null;
  const previous = resolveMotionConnectionCandidate(project, destination);
  const authoredSource = project.motionRegions?.find(
    (region) => region.id === destination.incomingConnection?.fromRegionId
  );
  const sourceGroup = authoredSource?.sourceBinding?.animationGroupId;
  const matchesSource =
    previous &&
    (previous.id === destination.incomingConnection.fromRegionId ||
      (sourceGroup && previous.sourceBinding?.animationGroupId === sourceGroup));
  return previous && matchesSource ? previous : null;
}

/** Nearest compatible held state; the UI can offer it before a connection is authored. */
export function resolveMotionConnectionCandidate(
  project: Pick<VideoProject, 'motionRegions' | 'clips'>,
  destination: VideoProjectMotionRegion
): VideoProjectMotionRegion | null {
  if (destination.duration <= 0 || !isConnectableMotionState(destination)) return null;
  let previous: VideoProjectMotionRegion | null = null;
  for (const region of project.motionRegions ?? []) {
    if (
      !hasSameMotionConnectionTarget(project, region, destination) ||
      region.duration <= 0 ||
      region.id === destination.id ||
      region.startTime > destination.startTime
    )
      continue;
    if (!previous || region.startTime > previous.startTime) previous = region;
  }
  return previous &&
    previous.startTime + previous.duration <= destination.startTime &&
    isConnectableMotionState(previous)
    ? previous
    : null;
}

function hasSameMotionConnectionTarget(
  project: Pick<VideoProject, 'clips'>,
  source: VideoProjectMotionRegion,
  destination: VideoProjectMotionRegion
): boolean {
  if (source.spotlight && destination.spotlight) {
    return (
      source.spotlightTarget === destination.spotlightTarget &&
      (source.spotlightTarget === 'viewport' ||
        (source.sourceBinding?.coordinateSpace === 'source-window' ||
        destination.sourceBinding?.coordinateSpace === 'source-window'
          ? motionWindowConnectionClips(project, source, destination) !== null
          : source.sourceBinding !== undefined &&
            source.sourceBinding.clipId === destination.sourceBinding?.clipId))
    );
  }
  if (!isCameraMotionRegion(source) || !isCameraMotionRegion(destination)) return false;
  const sourceWindow = source.sourceBinding?.coordinateSpace === 'source-window';
  const targetWindow = destination.sourceBinding?.coordinateSpace === 'source-window';
  return sourceWindow || targetWindow
    ? sourceWindow &&
        targetWindow &&
        motionWindowConnectionClips(project, source, destination) !== null
    : true;
}

/** Split authoring parts share only their own compatible incoming and outgoing connections. */
export function resolveMotionConnectionEdges(
  project: Pick<VideoProject, 'clips' | 'motionRegions'>,
  region: VideoProjectMotionRegion
) {
  const group = region.sourceBinding?.animationGroupId;
  const sameKind = (item: VideoProjectMotionRegion) =>
    region.spotlight
      ? item.spotlight !== undefined && item.spotlightTarget === region.spotlightTarget
      : isCameraMotionRegion(item);
  const parts = group
    ? (project.motionRegions ?? [])
        .filter(sameKind)
        .filter((item) => item.duration > 0 && item.sourceBinding?.animationGroupId === group)
        .toSorted((a, b) => (a.animation?.start ?? 0) - (b.animation?.start ?? 0))
    : [region];
  const first = parts[0] ?? region,
    last = parts.at(-1) ?? region;
  return {
    connectedIn: resolveMotionConnectionSource(project, first) !== null,
    connectedOut: (project.motionRegions ?? [])
      .filter(sameKind)
      .some((item) => resolveMotionConnectionSource(project, item)?.id === last.id),
  };
}

/** Resolve the visible clip without crossing an independent instance, timeline gap, overlap, or layout change. */
export function resolveMotionConnectionVideo(
  project: Pick<VideoProject, 'clips'>,
  source: VideoProjectMotionRegion,
  destination: VideoProjectMotionRegion,
  time: number
): VideoProjectVideoClip | null {
  return (
    motionWindowConnectionClips(project, source, destination)?.find(
      (clip) => time >= clip.startTime && time < clip.startTime + clip.duration
    ) ?? null
  );
}

function motionWindowConnectionClips(
  project: Pick<VideoProject, 'clips'>,
  source: VideoProjectMotionRegion,
  destination: VideoProjectMotionRegion
): VideoProjectVideoClip[] | null {
  if (
    source.sourceBinding?.coordinateSpace !== 'source-window' ||
    destination.sourceBinding?.coordinateSpace !== 'source-window'
  )
    return null;
  const first = project.clips.find((clip) => clip.id === source.sourceBinding?.clipId);
  const last = project.clips.find((clip) => clip.id === destination.sourceBinding?.clipId);
  if (first?.type !== 'VIDEO' || last?.type !== 'VIDEO') return null;
  if (first.id === last.id) return [first];
  if (
    !first.sourceInstanceId ||
    first.sourceInstanceId !== last.sourceInstanceId ||
    first.trackId !== last.trackId ||
    first.assetId !== last.assetId
  )
    return null;
  const geometry = (clip: VideoProjectVideoClip) =>
    JSON.stringify({
      transform: clip.transform,
      crop: clip.sourceCrop,
      fit: clip.fitMode,
      header: clip.windowHeader,
      corner: clip.windowCornerRadius,
    });
  const expected = geometry(first);
  const chain = project.clips
    .filter(
      (clip): clip is VideoProjectVideoClip =>
        clip.type === 'VIDEO' &&
        clip.duration > 0 &&
        clip.trackId === first.trackId &&
        clip.assetId === first.assetId &&
        clip.sourceInstanceId === first.sourceInstanceId &&
        clip.startTime < last.startTime + last.duration &&
        clip.startTime + clip.duration > first.startTime
    )
    .toSorted((a, b) => a.startTime - b.startTime);
  if (
    chain[0]?.id !== first.id ||
    chain.at(-1)?.id !== last.id ||
    chain.some((clip) => geometry(clip) !== expected)
  )
    return null;
  for (let index = 1; index < chain.length; index++) {
    const previous = chain[index - 1]!,
      current = chain[index]!;
    if (Math.abs(previous.startTime + previous.duration - current.startTime) > 1e-6) return null;
  }
  return chain;
}

function isConnectableMotionState(region: VideoProjectMotionRegion): boolean {
  return (
    Boolean(region.spotlight) ||
    (isCameraMotionRegion(region) &&
      (region.focusMode === VideoMotionFocusMode.MANUAL ||
        region.focusMode === VideoMotionFocusMode.MANUAL_AREA ||
        region.focusMode === VideoMotionFocusMode.ACTION ||
        (region.focusMode === VideoMotionFocusMode.CURSOR &&
          region.sourceBinding?.coordinateSpace === 'source-window')))
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
  return motionFocusAreaPoint(area, 0.5, 0.5);
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
        x: clampNumber(
          region.focusPoint.x,
          region.focusArea?.axes ? -MAX_MOTION_AREA_COORDINATE : 0,
          region.focusArea?.axes ? MAX_MOTION_AREA_COORDINATE : project.width
        ),
        y: clampNumber(
          region.focusPoint.y,
          region.focusArea?.axes ? -MAX_MOTION_AREA_COORDINATE : 0,
          region.focusArea?.axes ? MAX_MOTION_AREA_COORDINATE : project.height
        ),
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
  project: Pick<VideoProject, 'height' | 'width' | 'cursorFocusPath'>,
  startTime: number,
  phaseTransitions?: MotionPhaseTransitions
): VideoProjectMotionRegion {
  return {
    ...(phaseTransitions ? { phaseTransitions: { ...phaseTransitions } } : {}),
    duration: 2.8,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    focusArea: null,
    focusMode:
      project.cursorFocusPath?.mode === 'follow'
        ? VideoMotionFocusMode.CURSOR
        : VideoMotionFocusMode.MANUAL,
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
  const border = parseQuickEditBorder(region.border);
  const borderTarget = region.borderTarget;
  const spotlight = border ? null : parseQuickEditSpotlight(region.spotlight);
  const spotlightTarget = region.spotlightTarget;
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
  const cameraFollow = parseCameraFollowSettings(region.cameraFollow);
  const motionBlur = parseMotionBlurPhases(region.motionBlur);
  const perspective = parseCameraPerspective(region.perspective);
  const depthOfField = parseCameraDepth(region.depthOfField);
  const spatialReference = parseMotionSpatialReference(region.spatialReference);
  const phaseTransitions = parseMotionPhaseTransitions(region.phaseTransitions);
  const phaseRegion = phaseTransitions ? { ...region, phaseTransitions } : region;
  const enter = motionTransitionSettings(phaseRegion, 'enter');
  const exit = motionTransitionSettings(phaseRegion, 'exit');
  const retainedPhases = sourceBinding?.coordinateSpace === 'source-window';
  const enterDuration =
    retainedPhases || enter.type === 'none' ? region.zoomInDuration : enter.duration;
  const exitDuration =
    retainedPhases || exit.type === 'none' ? region.zoomOutDuration : exit.duration;

  return projectMotionSourceBinding(project, {
    ...(border && (borderTarget === 'viewport' || (borderTarget === 'window' && sourceBinding))
      ? { border, borderTarget }
      : {}),
    ...(spotlight &&
    (spotlightTarget === 'viewport' ||
      ((spotlightTarget === 'window' || spotlightTarget === 'scene') && sourceBinding))
      ? { spotlight, spotlightTarget }
      : {}),
    ...(cameraFollow ? { cameraFollow } : {}),
    ...(motionBlur ? { motionBlur } : {}),
    ...(perspective ? { perspective } : {}),
    ...(depthOfField ? { depthOfField } : {}),
    ...(spatialReference ? { spatialReference } : {}),
    ...(phaseTransitions ? { phaseTransitions } : {}),
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
      Number.isFinite(enterDuration) ? enterDuration : 0,
      0,
      enter.type === 'none' || (retainedPhases && phaseTransitions?.enter !== undefined)
        ? 60
        : animationDuration
    ),
    zoomOutDuration: clampNumber(
      Number.isFinite(exitDuration) ? exitDuration : 0,
      0,
      exit.type === 'none' || (retainedPhases && phaseTransitions?.exit !== undefined)
        ? 60
        : animationDuration
    ),
  });
}
