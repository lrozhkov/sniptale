import { isCameraMotionRegion } from '../../project/motion/normalization';
import { cameraSourceGeometryBreaks } from './camera-source-geometry';
import type { CameraOutputViewport } from '../../project/export/output-dimensions';
import {
  resolveProjectCursorFocusPath,
  resolveProjectCursorFocus,
  resolveProjectCursorFocusSamples,
} from '../../project/cursor-focus-path/projection';
import { resolveMotionConnectionSource } from '../../project/motion';
import type { VideoProject, VideoProjectMotionRegion } from '../../project/types';
import { VideoCursorCaptureMode } from '../../project/types';
import { cursorFocusPreferenceWeight } from '../../project/cursor-focus-path/evaluator';
import { VideoMotionFocusMode } from '../../project/types';
import { isVideoProjectUtilityLaneVisible } from '../../project/utility-lanes';
import { resolveCameraFollowPolicy } from '../../project/camera/cursor-policy';
import {
  resolveObservedCursorPosition,
  resolveCursorSample,
  resolveVideoCompositionCursor,
} from '../timeline/frame/cursor';
import { createProjectWorkingZoneCameraGeometry } from './camera-geometry';
import type { ProjectCameraSourceBinding } from './camera-geometry';
import {
  planWorkingZoneCamera,
  evaluateWorkingZoneCamera,
  evaluateWorkingZoneCameraBoundary,
} from './follow-cursor';
import { resolveCameraViewportFrame } from './viewport';
import type {
  CameraBoundaryState,
  WorkingZoneCameraBoundaries,
  FollowCursorFrame,
  WorkingZoneCameraPlan,
  WorkingZoneCameraGeometry,
} from './follow-cursor';

interface ProjectCameraPlanEntry {
  signature: string;
  plan: WorkingZoneCameraPlan;
  geometry: WorkingZoneCameraGeometry;
  input: Parameters<typeof planWorkingZoneCamera>[0];
}
const plans = new WeakMap<VideoProject, Map<string, ProjectCameraPlanEntry>>();

/** Split animation parts share the existing camera-connection topology. */
export function resolveProjectCameraEdges(project: VideoProject, region: VideoProjectMotionRegion) {
  const group = region.sourceBinding?.animationGroupId;
  const parts = group
    ? (project.motionRegions ?? [])
        .filter(isCameraMotionRegion)
        .filter((item) => item.duration > 0 && item.sourceBinding?.animationGroupId === group)
        .toSorted((a, b) => (a.animation?.start ?? 0) - (b.animation?.start ?? 0))
    : [region];
  const first = parts[0] ?? region,
    last = parts.at(-1) ?? region;
  return {
    connectedIn: resolveMotionConnectionSource(project, first) !== null,
    connectedOut: (project.motionRegions ?? [])
      .filter(isCameraMotionRegion)
      .some((item) => resolveMotionConnectionSource(project, item)?.id === last.id),
  };
}

type ProjectCameraPreference = { x: number; y: number; segmentId: string; sourceClipId?: string };
function projectCameraFrameAtTime(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  path: ReturnType<typeof resolveProjectCursorFocusPath>,
  time: number,
  previousFocus: ProjectCameraPreference | undefined
) {
  const focus = resolveProjectCursorFocus(project, time, path, region.sourceBinding?.clipId);
  const rendered = project.cursorTrack?.captureMode === VideoCursorCaptureMode.SEPARATE;
  const cursor = rendered ? resolveVideoCompositionCursor(project, time, []) : null;
  const renderedSample = rendered ? resolveCursorSample(project, time) : null;
  const nativeCursor = renderedSample?.sourceAnchor !== undefined;
  const sample = rendered
    ? renderedSample
    : resolveObservedCursorPosition(project, time, region.sourceBinding?.clipId);
  const actual =
    rendered && nativeCursor
      ? cursor && sample?.recordingPoint
        ? sample.recordingPoint
        : undefined
      : cursor
        ? { x: cursor.x / project.width, y: cursor.y / project.height }
        : !rendered && sample
          ? (sample.recordingPoint ?? { x: sample.x / project.width, y: sample.y / project.height })
          : undefined;
  const heldClipId = previousFocus?.sourceClipId;
  const owner = heldClipId && project.clips.find((clip) => clip.id === heldClipId);
  const held =
    previousFocus &&
    (!owner || (time >= owner.startTime && time < owner.startTime + owner.duration))
      ? previousFocus
      : undefined;
  const preferred = focus
    ? {
        x: focus.x / project.width,
        y: focus.y / project.height,
        segmentId: focus.segmentId,
        ...(focus.sourceClipId ? { sourceClipId: focus.sourceClipId } : {}),
      }
    : held;
  if (!preferred && !actual) return null;
  const point = preferred ?? { ...actual!, segmentId: 'rendered' };
  const actualClipId = sample?.sourceAnchor?.sourceClipId;
  const sourceSegment = `${actualClipId ?? 'canvas'}:${sample?.captureSegment ?? ''}`;
  const observation = actual ? 'observed' : 'unobserved';
  const segmentId = `${point.segmentId}:${sourceSegment}:${observation}`;
  const binding: ProjectCameraSourceBinding = {
    ...('sourceClipId' in point && point.sourceClipId ? { focusClipId: point.sourceClipId } : {}),
    ...((!rendered || nativeCursor) && actualClipId ? { actualClipId } : {}),
    ...(rendered && !nativeCursor ? { renderedCursor: true } : {}),
    ...(rendered && nativeCursor ? { sourceCursor: true } : {}),
  };
  const authoredSegment = focus && path.segments.find((segment) => segment.id === focus.id);
  const frame: FollowCursorFrame = {
    x: point.x,
    y: point.y,
    time,
    segmentId,
    ...(authoredSegment && focus
      ? { preferenceWeight: cursorFocusPreferenceWeight(authoredSegment, focus.sourceTime) }
      : {}),
    ...(actual ? { actual } : {}),
  };
  return { frame, binding, preferred };
}

function retainClosingProjectFrames(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  frames: readonly FollowCursorFrame[],
  bindings: Map<string, ProjectCameraSourceBinding>
) {
  const closingFrames: FollowCursorFrame[] = [];
  {
    for (const clip of project.clips) {
      const time = clip.startTime + clip.duration;
      if (time <= region.startTime || time > region.startTime + region.duration) continue;
      const previous = frames.findLast(
        (frame) => frame.time < time && bindings.get(frame.segmentId)?.actualClipId === clip.id
      );
      if (!previous) continue;
      const separate = project.cursorTrack?.captureMode === VideoCursorCaptureMode.SEPARATE;
      const sample = separate
        ? resolveCursorSample(project, time, clip.id, { includeSourceEnd: true })
        : resolveObservedCursorPosition(project, time, clip.id, { includeSourceEnd: true });
      if (
        !sample?.visible ||
        (sample.observation && sample.observation !== 'observed') ||
        !sample.recordingPoint
      )
        continue;
      const precedingSample = separate
        ? resolveCursorSample(project, previous.time, clip.id)
        : resolveObservedCursorPosition(project, previous.time, clip.id);
      const segmentId =
        precedingSample?.captureSegment === sample.captureSegment
          ? previous.segmentId
          : `${previous.segmentId}:closing:${clip.id}:${sample.captureSegment ?? ''}`;
      bindings.set(segmentId, bindings.get(previous.segmentId)!);
      closingFrames.push({
        ...previous,
        time,
        segmentId,
        actual: sample.recordingPoint ?? {
          x: sample.x / project.width,
          y: sample.y / project.height,
        },
      });
    }
  }
  // Preserve both one-sided observations at a cut. A missing right observation cannot replace the closing fact.
  const retained = frames.filter(
    (frame) => frame.actual || !closingFrames.some((closing) => closing.time === frame.time)
  );
  return [...closingFrames, ...retained].sort((a, b) => a.time - b.time);
}

function collectProjectCameraFrames(project: VideoProject, region: VideoProjectMotionRegion) {
  const path = resolveProjectCursorFocusPath(project);
  const end = region.startTime + region.duration;
  const times = new Set([region.startTime, end]);
  const step = Math.max(1 / 30, region.duration / 18000);
  for (let time = region.startTime + step; time < end; time += step) times.add(time);
  for (const time of [
    ...(project.cursorTrack?.samples ?? []).map((sample) => sample.time),
    ...resolveProjectCursorFocusSamples(project, true).map((sample) => sample.time),
    ...project.clips.flatMap((clip) => [
      clip.startTime,
      clip.startTime + clip.duration,
      ...(clip.type === 'VIDEO' &&
      project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
        ? cameraSourceGeometryBreaks(clip, project)
        : []),
    ]),
  ])
    if (time >= region.startTime && time <= end) times.add(time);
  const frames: FollowCursorFrame[] = [];
  const bindings = new Map<string, ProjectCameraSourceBinding>();
  let previousFocus: { x: number; y: number; segmentId: string; sourceClipId?: string } | undefined;
  for (const time of [...times].sort((a, b) => a - b)) {
    const result = projectCameraFrameAtTime(project, region, path, time, previousFocus);
    if (!result) continue;
    if (result.preferred) previousFocus = result.preferred;
    frames.push(result.frame);
    bindings.set(result.frame.segmentId, result.binding);
  }
  return { frames: retainClosingProjectFrames(project, region, frames, bindings), bindings, path };
}

function resolveProvisionalPlanEntry(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  output?: CameraOutputViewport
) {
  const viewport = output ?? { width: project.width, height: project.height };
  const key = `${region.id}:${viewport.width}:${viewport.height}:${output?.resolution ?? 'SOURCE'}`;
  const signature = JSON.stringify({
    region,
    defaults: project.cameraFollowDefaults,
    path: project.cursorFocusPath,
    captureMode: project.cursorTrack?.captureMode,
  });
  let cached = plans.get(project);
  if (!cached) {
    cached = new Map();
    plans.set(project, cached);
  }
  const previous = cached.get(key);
  if (previous?.signature === signature) return previous;
  const { frames, bindings, path } = collectProjectCameraFrames(project, region);
  const policy = resolveCameraFollowPolicy({
    legacySensitivity: path.sensitivity,
    ...(project.cameraFollowDefaults ? { defaults: project.cameraFollowDefaults } : {}),
    ...(region.cameraFollow ? { override: region.cameraFollow } : {}),
  });
  const geometry = createProjectWorkingZoneCameraGeometry({
    project,
    region,
    bindings,
    policy,
    ...resolveProjectCameraEdges(project, region),
    ...(output ? { output } : {}),
  });
  const center = region.focusPoint ?? { x: project.width / 2, y: project.height / 2 };
  const input = {
    frames,
    geometry,
    policy,
    start: region.startTime,
    end: region.startTime + region.duration,
    targetScale: region.scale,
    fallback: {
      x: ((center.x / project.width) * region.scale - 0.5) * geometry.window.width,
      y: ((center.y / project.height) * region.scale - 0.5) * geometry.window.height,
    },
  };
  const plan = planWorkingZoneCamera(input);
  const entry = { signature, plan, geometry, input };
  cached.set(key, entry);
  return entry;
}

function projectCameraTargetScale(project: VideoProject, item: VideoProjectMotionRegion) {
  return item.focusMode === VideoMotionFocusMode.MANUAL_AREA && item.focusArea
    ? Math.min(
        4,
        Math.max(
          1,
          Math.min(
            project.width / Math.max(1, item.focusArea.width),
            project.height / Math.max(1, item.focusArea.height)
          )
        )
      )
    : item.scale;
}

function compatibleProjectCameraPhases(
  project: VideoProject,
  left: VideoProjectMotionRegion,
  right: VideoProjectMotionRegion,
  targetScale: number
) {
  if (left.incomingConnection || right.incomingConnection) return false;
  if (
    projectCameraTargetScale(project, left) !== projectCameraTargetScale(project, right) ||
    projectCameraTargetScale(project, left) !== targetScale
  )
    return false;
  if (left.animation && right.animation) {
    return (
      left.animation.duration === right.animation.duration &&
      Math.abs(left.animation.end - right.animation.start) <= 1e-9 &&
      Math.abs(
        (left.animation.end - left.animation.start) / left.duration -
          (right.animation.end - right.animation.start) / right.duration
      ) <= 1e-9 &&
      left.easing === right.easing &&
      JSON.stringify(left.phaseTransitions) === JSON.stringify(right.phaseTransitions) &&
      left.zoomInDuration === right.zoomInDuration &&
      left.zoomOutDuration === right.zoomOutDuration
    );
  }
  return (
    !left.animation && !right.animation && left.zoomOutDuration === 0 && right.zoomInDuration === 0
  );
}

function continuousProjectCameraSource(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  time: number
) {
  const binding = region.sourceBinding?.clipId;
  if (
    !project.clips.some(
      (clip) =>
        (!binding || clip.id === binding) &&
        clip.startTime < time &&
        clip.startTime + clip.duration > time
    )
  )
    return false;
  const coverage = collectProjectCameraFrames(project, {
    ...region,
    startTime: time - 1e-5,
    duration: 2e-5,
  }).frames;
  if (
    coverage.length &&
    (coverage[0]!.time >= time ||
      coverage.at(-1)!.time <= time ||
      coverage[0]!.segmentId !== coverage.at(-1)!.segmentId)
  )
    return false;
  return true;
}

function sharedProjectCameraBoundary(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  left: VideoProjectMotionRegion,
  right: VideoProjectMotionRegion,
  geometry: WorkingZoneCameraGeometry,
  output?: CameraOutputViewport
): CameraBoundaryState | Extract<WorkingZoneCameraPlan, { status: 'conflict' }> | undefined {
  if (!compatibleProjectCameraPhases(project, left, right, region.scale)) return undefined;
  const time = right.startTime;
  if (!continuousProjectCameraSource(project, region, time)) return undefined;
  const owner =
    left.focusMode !== VideoMotionFocusMode.CURSOR
      ? left
      : right.focusMode !== VideoMotionFocusMode.CURSOR
        ? right
        : left;
  if (owner.focusMode === VideoMotionFocusMode.CURSOR) {
    const plan = resolveProvisionalPlanEntry(project, owner, output).plan;
    if (plan.status === 'conflict')
      return {
        ...plan,
        interval: { start: region.startTime, end: region.startTime + region.duration },
        time,
      };
    return plan.targetScale === region.scale
      ? evaluateWorkingZoneCameraBoundary(plan, time)
      : undefined;
  }
  if (
    owner.focusMode !== VideoMotionFocusMode.MANUAL &&
    owner.focusMode !== VideoMotionFocusMode.MANUAL_AREA
  )
    return undefined;
  const point =
    owner.focusMode === VideoMotionFocusMode.MANUAL_AREA && owner.focusArea
      ? {
          x: owner.focusArea.x + owner.focusArea.width / 2,
          y: owner.focusArea.y + owner.focusArea.height / 2,
        }
      : (owner.focusPoint ?? { x: project.width / 2, y: project.height / 2 });
  const viewport = resolveCameraViewportFrame(project, point, region.scale);
  return {
    pan: {
      x: (viewport.viewportX / project.width) * region.scale * geometry.window.width,
      y: (viewport.viewportY / project.height) * region.scale * geometry.window.height,
    },
    velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 },
  };
}

function resolvePlanEntry(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  output?: CameraOutputViewport
) {
  const provisional = resolveProvisionalPlanEntry(project, region, output);
  const boundaries: WorkingZoneCameraBoundaries = {};
  const neighbors = (project.motionRegions ?? [])
    .filter(isCameraMotionRegion)
    .filter((item) => item.duration > 0 && item.id !== region.id);
  const previous = neighbors.find((item) => item.startTime + item.duration === region.startTime);
  const next = neighbors.find((item) => item.startTime === region.startTime + region.duration);
  const key = [
    region.id,
    provisional.geometry.viewport.width,
    provisional.geometry.viewport.height,
    output?.resolution ?? 'SOURCE',
    'final',
  ].join(':');
  const signature = JSON.stringify([provisional.signature, previous, next]);
  const cache = plans.get(project)!;
  const previousPlan = cache.get(key);
  if (previousPlan?.signature === signature) return previousPlan;
  const incoming =
      previous &&
      sharedProjectCameraBoundary(project, region, previous, region, provisional.geometry, output),
    outgoing =
      next &&
      sharedProjectCameraBoundary(project, region, region, next, provisional.geometry, output);
  const inheritedConflict =
    incoming && 'status' in incoming
      ? incoming
      : outgoing && 'status' in outgoing
        ? outgoing
        : undefined;
  if (inheritedConflict) {
    const entry = { ...provisional, signature, plan: inheritedConflict };
    cache.set(key, entry);
    return entry;
  }
  if (incoming && !('status' in incoming)) boundaries.incoming = incoming;
  if (outgoing && !('status' in outgoing)) boundaries.outgoing = outgoing;
  const entry = {
    ...provisional,
    signature,
    plan:
      boundaries.incoming || boundaries.outgoing
        ? planWorkingZoneCamera({ ...provisional.input, ...boundaries })
        : provisional.plan,
  };
  cache.set(key, entry);
  return entry;
}

/** Preview, seek, and export share one disposable admission result for the same immutable project and geometry. */
export function resolveProjectCursorCameraPlan(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  output?: CameraOutputViewport
) {
  return resolvePlanEntry(project, region, output).plan;
}

interface ProjectCameraConflict {
  regionId: string;
  time: number;
  interval: { start: number; end: number };
  reason: Extract<WorkingZoneCameraPlan, { status: 'conflict' }>['reason'];
}

/** Preserve admission diagnostics locally; runtime responses retain the stable message code. */
export class ProjectCameraConflictError extends Error {
  readonly conflicts: readonly ProjectCameraConflict[];

  constructor(conflicts: readonly ProjectCameraConflict[]) {
    super('PROJECT_EXPORT_CAMERA_CONFLICT');
    this.name = 'ProjectCameraConflictError';
    this.conflicts = structuredClone(conflicts);
  }
}

/** Refuse only exports that use an unresolved active follow camera. This check acquires no resources. */
export function resolveProjectCameraConflicts(
  project: VideoProject,
  output?: CameraOutputViewport,
  interval = { start: 0, end: project.duration }
): ProjectCameraConflict[] {
  if (!isVideoProjectUtilityLaneVisible(project, 'camera')) return [];
  return (project.motionRegions ?? []).filter(isCameraMotionRegion).flatMap((region) => {
    if (
      region.focusMode !== VideoMotionFocusMode.CURSOR ||
      region.duration <= 0 ||
      region.startTime >= interval.end ||
      region.startTime + region.duration <= interval.start
    )
      return [];
    const plan = resolveProjectCursorCameraPlan(project, region, output);
    return plan.status === 'conflict'
      ? [{ regionId: region.id, time: plan.time, interval: plan.interval, reason: plan.reason }]
      : [];
  });
}

/** Convert admitted output-pixel pan to the existing project-space camera contract without late clamps. */
export function resolveProjectFollowingCamera(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  time: number,
  output?: CameraOutputViewport
) {
  const { plan, geometry } = resolvePlanEntry(project, region, output);
  const pan = evaluateWorkingZoneCamera(plan, time);
  const targetScale = plan.status === 'ready' ? plan.targetScale : region.scale;
  return {
    plan,
    pan,
    targetScale,
    geometry,
    focusPoint: {
      x: ((pan.x / geometry.window.width + 0.5) / targetScale) * project.width,
      y: ((pan.y / geometry.window.height + 0.5) / targetScale) * project.height,
    },
  };
}
