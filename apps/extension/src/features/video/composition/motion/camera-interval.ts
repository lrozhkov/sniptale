import { resolveMotionConnectionSource } from '../../project/motion';
import { getMotionAnimationTime } from '../../project/motion/timing';
import type { VideoProject, VideoProjectMotionRegion } from '../../project/types';
import { motionRegionBlurPhase } from './blur';
import { resolveProjectCameraEdges } from './project-follow';

type RegionSpan = { kind: 'region'; region: VideoProjectMotionRegion };
type LinkSpan = {
  kind: 'link';
  source: VideoProjectMotionRegion;
  destination: VideoProjectMotionRegion;
};
type CameraSpan = RegionSpan | LinkSpan;

/** The latest started visible region owns an overlap, in the camera and exposure paths. */
export function resolveActiveMotionRegion(
  project: VideoProject,
  time: number
): VideoProjectMotionRegion | null {
  let active: VideoProjectMotionRegion | null = null;
  for (const region of project.motionRegions ?? []) {
    if (time < region.startTime || time >= region.startTime + region.duration) continue;
    if (!active || region.startTime > active.startTime) active = region;
  }
  return active;
}

/** Connections fill only the explicit gap between their validated source and destination. */
export function resolveConnectingMotionRegions(project: VideoProject, time: number) {
  for (const destination of project.motionRegions ?? []) {
    if (time >= destination.startTime || !destination.incomingConnection) continue;
    const source = resolveMotionConnectionSource(project, destination);
    if (source && time >= source.startTime + source.duration) return { source, destination };
  }
  return null;
}

function cameraSpan(project: VideoProject, time: number): CameraSpan | null {
  const region = resolveActiveMotionRegion(project, time);
  if (region) return { kind: 'region', region };
  const link = resolveConnectingMotionRegions(project, time);
  return link ? { kind: 'link', ...link } : null;
}

function phaseKey(project: VideoProject, span: CameraSpan, time: number) {
  const owner = span.kind === 'region' ? span.region : span.source;
  if (span.kind === 'link' && span.destination.incomingConnection?.easing === 'INSTANT')
    return 'instant-link';
  if (owner.motionBlur === undefined) {
    if (span.kind === 'link' || owner.easing !== 'INSTANT') return 'legacy';
    const edges = resolveProjectCameraEdges(project, owner);
    const local = getMotionAnimationTime(owner, time - owner.startTime);
    const phase = motionRegionBlurPhase(owner, time, edges);
    if (phase === 'enter' && local <= 0) return 'instant-start';
    const exit = Math.max(0, (owner.animation?.duration ?? owner.duration) - owner.zoomOutDuration);
    return phase === 'exit' && local > exit ? 'instant-exit' : 'legacy';
  }
  return span.kind === 'link'
    ? 'link'
    : motionRegionBlurPhase(owner, time, resolveProjectCameraEdges(project, owner));
}

function cameraControlKey(region: VideoProjectMotionRegion) {
  return JSON.stringify({
    focusMode: region.focusMode,
    focusPoint: region.focusPoint,
    focusArea: region.focusArea,
    scale: region.scale,
    easing: region.easing,
    targetAction: region.targetAction,
    cameraFollow: region.cameraFollow,
    zoomInDuration: region.zoomInDuration,
    zoomOutDuration: region.zoomOutDuration,
    overlayZoomMode: region.overlayZoomMode,
  });
}

function sameSourceGeometry(
  project: VideoProject,
  left: VideoProjectMotionRegion,
  right: VideoProjectMotionRegion,
  time: number
) {
  const a = project.clips.find((clip) => clip.id === left.sourceBinding?.clipId);
  const b = project.clips.find((clip) => clip.id === right.sourceBinding?.clipId);
  if (a?.type !== 'VIDEO' || b?.type !== 'VIDEO') return false;
  const sourceTime = (clip: typeof a) =>
    clip.sourceStart + (time - clip.startTime) * (clip.playbackRate ?? 1);
  const geometry = (clip: typeof a) =>
    JSON.stringify({
      assetId: clip.assetId,
      transform: clip.transform,
      crop: clip.sourceCrop,
      header: clip.windowHeader,
      fit: clip.fitMode,
    });
  return Math.abs(sourceTime(a) - sourceTime(b)) <= 1e-9 && geometry(a) === geometry(b);
}

function continuousSplit(
  project: VideoProject,
  left: VideoProjectMotionRegion,
  right: VideoProjectMotionRegion,
  time: number
) {
  const group = left.sourceBinding?.animationGroupId;
  return (
    !!group &&
    group === right.sourceBinding?.animationGroupId &&
    Math.abs(left.startTime + left.duration - time) <= 1e-9 &&
    Math.abs(right.startTime - time) <= 1e-9 &&
    Math.abs(getMotionAnimationTime(left, left.duration) - getMotionAnimationTime(right, 0)) <=
      1e-9 &&
    (left.animation?.duration ?? left.duration) === (right.animation?.duration ?? right.duration) &&
    cameraControlKey(left) === cameraControlKey(right) &&
    sameSourceGeometry(project, left, right, time)
  );
}

function canCrossBoundary(
  project: VideoProject,
  left: CameraSpan | null,
  right: CameraSpan | null,
  time: number,
  leftTime: number,
  rightTime: number
) {
  if (!left || !right) return left === right;
  const phase = phaseKey(project, left, leftTime);
  if (phase !== phaseKey(project, right, rightTime)) return false;
  if (left.kind === 'region' && right.kind === 'region')
    return (
      left.region.id === right.region.id ||
      continuousSplit(project, left.region, right.region, time)
    );
  if (left.kind === 'link' && right.kind === 'link')
    return left.source.id === right.source.id && left.destination.id === right.destination.id;
  if (phase !== 'legacy') return false;
  return left.kind === 'region' && right.kind === 'link'
    ? left.region.id === right.source.id
    : left.kind === 'link' && right.kind === 'region' && left.destination.id === right.region.id;
}

function cameraBoundaries(project: VideoProject) {
  const result = [0, project.duration];
  for (const region of project.motionRegions ?? []) {
    if (region.duration <= 0) continue;
    result.push(region.startTime, region.startTime + region.duration);
    const start = region.animation?.start ?? 0;
    const end = region.animation?.end ?? region.duration;
    const duration = region.animation?.duration ?? region.duration;
    for (const edge of [
      Math.min(region.zoomInDuration, duration),
      Math.max(0, duration - region.zoomOutDuration),
    ]) {
      if (edge > start && edge < end)
        result.push(region.startTime + ((edge - start) * region.duration) / (end - start));
    }
  }
  return [...new Set(result)].filter(Number.isFinite).toSorted((a, b) => a - b);
}

/** Clamp exposure at ownership and phase jumps; contiguous retained split parts remain one animation. */
export function motionBlurSampleBounds(project: VideoProject, time: number, strength: number) {
  let start = 0,
    end = Math.max(project.duration, time);
  const exposure = Math.max(0, Math.min(1, strength)) / 60;
  const boundaries = cameraBoundaries(project);
  for (let i = 0; i < boundaries.length; i++) {
    const edge = boundaries[i]!;
    if (edge < time - exposure || edge > time + exposure) continue;
    const leftTime = ((boundaries[i - 1] ?? edge - 1) + edge) / 2;
    const rightTime = (edge + (boundaries[i + 1] ?? edge + 1)) / 2;
    if (
      canCrossBoundary(
        project,
        cameraSpan(project, leftTime),
        cameraSpan(project, rightTime),
        edge,
        leftTime,
        rightTime
      )
    )
      continue;
    if (edge === time) {
      const center = cameraSpan(project, time);
      const ownsLeft = canCrossBoundary(
        project,
        cameraSpan(project, leftTime),
        center,
        edge,
        leftTime,
        time
      );
      const ownsRight = canCrossBoundary(
        project,
        center,
        cameraSpan(project, rightTime),
        edge,
        time,
        rightTime
      );
      if (!ownsLeft && !ownsRight) return { start: time, end: time };
      if (ownsLeft) {
        end = Math.min(end, edge);
        continue;
      }
    }
    if (edge <= time) {
      const includesEdge = canCrossBoundary(
        project,
        cameraSpan(project, edge),
        cameraSpan(project, rightTime),
        edge,
        edge,
        rightTime
      );
      start = Math.max(start, Math.min(time, edge + (includesEdge ? 0 : 1e-9)));
    } else end = Math.min(end, edge);
  }
  // Keep upper samples inside the selected interval without moving its center.
  return { start, end: Math.max(time, end - 1e-9) };
}
